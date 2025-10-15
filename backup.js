(function(){
  const DB_NAME = 'punchbuggy-backup';
  const DB_VERSION = 1;
  const STORE_NAME = 'settings';
  const HANDLE_KEY = 'directory';
  const META_KEY = 'meta';
  const LOCAL_META_KEY = 'punchbuggy-backup-meta';

  const Backup = {
    AUTO_DELAY_MS: 4000,
    MAX_DAILY_FILES: 14,
    MAX_ENTRY_SNAPSHOTS: 120,
    DAILY_PREFIX: 'punchbuggy-daily-',
    LATEST_FILE: 'punchbuggy-latest.json',
    SUPPORTED: typeof window !== 'undefined' && 'showDirectoryPicker' in window,
    _status: { code: 'idle', message: 'Backups idle' },
    _handle: null,
    _meta: null,
    _dbPromise: null,
    _pendingTimer: null,
    _busy: false,
    _latestHash: null,
    _callbacks: new Set(),
    _getState: null,

    init(options = {}) {
      this._getState = options.getState || null;
      if (options.onStatusChange) {
        this.onStatusChange(options.onStatusChange);
      }
      this._meta = this._loadMeta();
      this._latestHash = this._meta.latestHash || null;
      if (!this.SUPPORTED) {
        this._updateStatus({ code: 'unsupported', message: 'Backups require a compatible browser.' });
        return;
      }
      this._updateStatus({ code: 'initializing', message: 'Checking backup folder…' });
      this._restoreHandle().catch(err => {
        console.error('[Backup] Failed to restore handle', err);
        this._updateStatus({ code: 'error', message: 'Backup initialization failed', error: err });
      });
    },

    onStatusChange(cb) {
      if (typeof cb === 'function') {
        this._callbacks.add(cb);
        if (this._status) {
          cb(this._status);
        }
      }
      return () => this._callbacks.delete(cb);
    },

    getStatus() {
      return this._status;
    },

    async chooseDirectory() {
      if (!this.SUPPORTED) {
        return this._updateStatus({ code: 'unsupported', message: 'Backups require a compatible browser.' });
      }
      try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await this._persistHandle(handle);
        this._handle = handle;
        this._updateStatus({ code: 'ready', message: `Connected to “${handle.name}”`, handleName: handle.name });
        await this.performBackup('initial-setup');
      } catch (err) {
        if (err && err.name === 'AbortError') {
          this._updateStatus({ code: 'cancelled', message: 'Backup folder selection cancelled.' });
          return;
        }
        console.error('[Backup] chooseDirectory error', err);
        this._updateStatus({ code: 'error', message: 'Unable to select folder', error: err });
      }
    },

    async clearBackupData() {
      try {
        const db = await this._openDb();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(HANDLE_KEY);
        tx.objectStore(STORE_NAME).delete(META_KEY);
        await this._txDone(tx);
      } catch (err) {
        console.error('[Backup] clearBackupData error', err);
      }
      this._handle = null;
      this._meta = { lastBackupAt: null, lastDailyDate: null, latestHash: null };
      this._latestHash = null;
      localStorage.removeItem(LOCAL_META_KEY);
      this._updateStatus({ code: 'disconnected', message: 'Backup folder disconnected.', handleName: null });
    },

    async triggerManualBackup(reason = 'manual') {
      if (!this._handle) {
        this._updateStatus({ code: 'no-handle', message: 'Connect a backup folder first.' });
        return;
      }
      await this.performBackup(reason);
    },

    handleStoreSave(reason = 'state-change') {
      if (!this._handle || !this.SUPPORTED) return;
      if (this._pendingTimer) {
        clearTimeout(this._pendingTimer);
      }
      this._pendingTimer = setTimeout(() => {
        this.performBackup(reason).catch(err => console.error('[Backup] auto-backup failed', err));
      }, this.AUTO_DELAY_MS);
    },

    async performBackup(reason = 'auto') {
      if (!this._handle) {
        this._updateStatus({ code: 'no-handle', message: 'Connect a backup folder to enable automatic saves.' });
        return;
      }
      if (!this._getState) {
        console.warn('[Backup] Missing getState function');
        return;
      }
      if (this._busy) {
        return;
      }
      this._busy = true;
      try {
        const hasPermission = await this._ensurePermission(this._handle, 'readwrite', reason !== 'auto');
        if (!hasPermission) {
          this._updateStatus({ code: 'needs-permission', message: 'Backup folder needs permission.', handleName: this._handle ? this._handle.name : null });
          this._busy = false;
          return;
        }
        this._updateStatus({ code: 'busy', message: 'Writing backup…', handleName: this._handle ? this._handle.name : null });
        const payload = this._buildPayload();
        const json = JSON.stringify(payload);
        const hash = await this._hash(json);
        if (hash && this._latestHash && hash === this._latestHash) {
          this._updateStatus({ code: 'up-to-date', message: 'Backup already current.', lastBackupAt: this._meta.lastBackupAt || Date.now(), handleName: this._handle ? this._handle.name : null });
          this._busy = false;
          return;
        }
        await this._writeFile(this.LATEST_FILE, json);
        const today = new Date().toISOString().slice(0, 10);
        if (this._meta.lastDailyDate !== today) {
          const dailyName = `${this.DAILY_PREFIX}${today}.json`;
          await this._writeFile(dailyName, json);
          this._meta.lastDailyDate = today;
        }
        await this._pruneDailyBackups();
        const now = Date.now();
        this._meta.lastBackupAt = now;
        this._meta.latestHash = hash;
        this._latestHash = hash;
        await this._saveMeta();
        this._updateStatus({ code: 'success', message: 'Backup saved.', lastBackupAt: now, handleName: this._handle ? this._handle.name : null });
      } catch (err) {
        console.error('[Backup] performBackup error', err);
        this._updateStatus({ code: 'error', message: 'Backup failed', error: err, handleName: this._handle ? this._handle.name : null });
      } finally {
        this._busy = false;
      }
    },

    async _restoreHandle() {
      try {
        const db = await this._openDb();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
        const handle = await this._requestToPromise(req);
        if (!handle) {
          this._updateStatus({ code: 'no-handle', message: 'No backup folder connected.' });
          return;
        }
        const hasPermission = await this._ensurePermission(handle, 'readwrite', false);
        if (!hasPermission) {
          this._handle = handle;
          this._updateStatus({ code: 'needs-permission', message: `Re-authorize access to “${handle.name}”.`, handleName: handle.name });
          return;
        }
        this._handle = handle;
        this._updateStatus({ code: 'ready', message: `Connected to “${handle.name}”.`, lastBackupAt: this._meta.lastBackupAt, handleName: handle.name });
      } catch (err) {
        console.error('[Backup] restoreHandle error', err);
        this._updateStatus({ code: 'error', message: 'Unable to restore backup folder', error: err });
      }
    },

    async _ensurePermission(handle, mode = 'readwrite', request = false) {
      if (!handle) return false;
      try {
        if (!handle.queryPermission) {
          return true;
        }
        const query = await handle.queryPermission({ mode });
        if (query === 'granted') return true;
        if (query === 'denied' && !request) return false;
        if (request && handle.requestPermission) {
          const perm = await handle.requestPermission({ mode });
          return perm === 'granted';
        }
        return false;
      } catch (err) {
        console.error('[Backup] ensurePermission error', err);
        return false;
      }
    },

    _buildPayload() {
      const source = typeof this._getState === 'function' ? this._getState() : null;
      if (!source) return {};
      const clone = JSON.parse(JSON.stringify(source));
      if (Array.isArray(clone.history) && clone.history.length > this.MAX_ENTRY_SNAPSHOTS) {
        clone.history = clone.history.slice(-this.MAX_ENTRY_SNAPSHOTS);
      }
      if (Array.isArray(clone.roundWinners) && clone.roundWinners.length > this.MAX_ENTRY_SNAPSHOTS) {
        clone.roundWinners = clone.roundWinners.slice(-this.MAX_ENTRY_SNAPSHOTS);
      }
      return {
        timestamp: new Date().toISOString(),
        appVersion: (typeof window !== 'undefined' && window.PUNCHBUGGY_APP_VERSION) || 'dev',
        reason: 'punchbuggy-state',
        payload: clone
      };
    },

    async _writeFile(fileName, contents) {
      const fileHandle = await this._handle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(contents);
      await writable.close();
    },

    async _pruneDailyBackups() {
      const entries = [];
      for await (const entry of this._handle.values()) {
        if (entry.kind === 'file' && entry.name.startsWith(this.DAILY_PREFIX)) {
          entries.push(entry.name);
        }
      }
      entries.sort();
      while (entries.length > this.MAX_DAILY_FILES) {
        const oldest = entries.shift();
        try {
          await this._handle.removeEntry(oldest);
        } catch (err) {
          console.warn('[Backup] Failed to remove old backup', oldest, err);
          break;
        }
      }
    },

    async _hash(text) {
      try {
        if (window.crypto && window.crypto.subtle) {
          const enc = new TextEncoder();
          const buf = enc.encode(text);
          const digest = await window.crypto.subtle.digest('SHA-256', buf);
          return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
        }
      } catch (err) {
        console.warn('[Backup] crypto.subtle unavailable', err);
      }
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash |= 0;
      }
      return `fallback-${hash}`;
    },

    _loadMeta() {
      try {
        const stored = localStorage.getItem(LOCAL_META_KEY);
        if (stored) {
          return JSON.parse(stored);
        }
      } catch (err) {
        console.warn('[Backup] failed to read local meta', err);
      }
      return { lastBackupAt: null, lastDailyDate: null, latestHash: null };
    },

    async _saveMeta() {
      try {
        const db = await this._openDb();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({
          lastBackupAt: this._meta.lastBackupAt || null,
          lastDailyDate: this._meta.lastDailyDate || null,
          latestHash: this._meta.latestHash || null
        }, META_KEY);
        await this._txDone(tx);
      } catch (err) {
        console.warn('[Backup] failed to persist meta to IDB', err);
      }
      try {
        localStorage.setItem(LOCAL_META_KEY, JSON.stringify(this._meta));
      } catch (err) {
        console.warn('[Backup] failed to persist meta to localStorage', err);
      }
    },

    async _persistHandle(handle) {
      const db = await this._openDb();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
      await this._txDone(tx);
    },

    async _openDb() {
      if (this._dbPromise) return this._dbPromise;
      this._dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return this._dbPromise;
    },

    async _txDone(tx) {
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
      });
    },

    async _requestToPromise(req) {
      return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },

    async hydrateMetaFromDb() {
      try {
        const db = await this._openDb();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(META_KEY);
        const meta = await this._requestToPromise(req);
        if (meta) {
          this._meta = Object.assign({ lastBackupAt: null, lastDailyDate: null, latestHash: null }, meta);
          this._latestHash = this._meta.latestHash;
          localStorage.setItem(LOCAL_META_KEY, JSON.stringify(this._meta));
        }
      } catch (err) {
        console.warn('[Backup] hydrate meta error', err);
      }
    },

    _updateStatus(status) {
      const handleName = this._handle ? this._handle.name : null;
      this._status = Object.assign({ code: 'idle', message: '', handleName }, status);
      if (!('handleName' in this._status) && handleName) {
        this._status.handleName = handleName;
      }
      if (!this._status.lastBackupAt && this._meta && this._meta.lastBackupAt) {
        this._status.lastBackupAt = this._meta.lastBackupAt;
      }
      this._callbacks.forEach(cb => {
        try { cb(this._status); } catch (err) { console.error('[Backup] callback error', err); }
      });
    }
  };

  if (typeof window !== 'undefined') {
    window.PunchBuggyBackup = Backup;
  }
})();
