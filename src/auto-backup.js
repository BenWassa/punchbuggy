(function(){
  const SUPPORTED = typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
  const LOCAL_ENABLED_KEY = 'punchbuggy-auto-backup-enabled';
  const LOCAL_META_KEY = 'punchbuggy-auto-backup-meta';

  const AutoBackup = {
    DB_NAME: 'punchbuggy-auto-backup',
    DB_VERSION: 1,
    STORE_NAME: 'backups',
    META_KEY: 'metadata',
    BACKUP_CURRENT_KEY: 'current',
    BACKUP_PREVIOUS_KEY: 'previous',
    BACKUP_OLDEST_KEY: 'oldest',
    AUTO_DELAY_MS: 5000,
    MAX_HISTORY_SNAPSHOTS: 200,
    MAX_ROUND_SNAPSHOTS: 200,
    SUPPORTED,

    _dbPromise: null,
    _callbacks: new Set(),
    _pendingTimer: null,
    _busy: false,
    _getState: null,
    _applyState: null,
    _status: { code: SUPPORTED ? 'idle' : 'unsupported', message: SUPPORTED ? 'Automatic backups ready.' : 'Automatic backups require IndexedDB support.', enabled: SUPPORTED },
    _lastHash: '',
    enabled: true,
    metadata: {
      lastBackupISO: '',
      currentBackupDate: '',
      previousBackupDate: '',
      oldestBackupDate: '',
      backupCount: 0
    }
  };

  AutoBackup.init = async function(options = {}) {
    this._getState = typeof options.getState === 'function' ? options.getState : null;
    this._applyState = typeof options.applyState === 'function' ? options.applyState : null;
    if (options.onStatusChange) {
      this.onStatusChange(options.onStatusChange);
    }

    this.enabled = this._loadEnabledFlag();
    const cachedMeta = this._loadCachedMetadata();
    if (cachedMeta) {
      this.metadata = Object.assign({}, this.metadata, cachedMeta);
      if (cachedMeta.lastHash) {
        this._lastHash = cachedMeta.lastHash;
      }
    }

    if (!this.SUPPORTED) {
      this._updateStatus({
        code: 'unsupported',
        message: 'Automatic backups require IndexedDB support.',
        enabled: false
      });
      return;
    }

    try {
      await this._openDb();
      await this._loadMetadataFromDb();
      if (this.enabled) {
        const message = this.metadata.currentBackupDate ? 'Automatic backups ready.' : 'Automatic backups will start after your next change.';
        this._updateStatus({ code: 'idle', message });
      } else {
        this._updateStatus({ code: 'disabled', message: 'Automatic backups are disabled by the user.', enabled: false });
      }
    } catch (err) {
      console.error('[AutoBackup] init error', err);
      this._updateStatus({ code: 'error', message: 'Automatic backup initialization failed.', error: err, enabled: false });
    }
  };

  AutoBackup.onStatusChange = function(cb) {
    if (typeof cb === 'function') {
      this._callbacks.add(cb);
      cb(this.getStatus());
    }
    return () => this._callbacks.delete(cb);
  };

  AutoBackup.getStatus = function() {
    const status = Object.assign({}, this._status);
    status.enabled = this.enabled && this.SUPPORTED;
    status.pending = !!this._pendingTimer;
    status.metadata = Object.assign({}, this.metadata);
    return status;
  };

  AutoBackup.setEnabled = function(value) {
    const enabled = !!value;
    if (enabled === this.enabled) {
      this._updateStatus(this.getStatus());
      return;
    }
    this.enabled = enabled;
    this._persistEnabledFlag(enabled);
    if (!enabled && this._pendingTimer) {
      clearTimeout(this._pendingTimer);
      this._pendingTimer = null;
    }
    if (!enabled) {
      this._updateStatus({ code: 'disabled', message: 'Automatic backups are disabled by the user.', enabled: false });
    } else {
      const message = this.metadata.currentBackupDate ? 'Automatic backups ready.' : 'Automatic backups will start after your next change.';
      this._updateStatus({ code: 'idle', message, enabled: true });
      this.handleStoreSave('enabled-toggle');
    }
  };

  AutoBackup.handleStoreSave = function(reason = 'auto') {
    if (!this.SUPPORTED || !this.enabled) return;
    if (this._pendingTimer) {
      clearTimeout(this._pendingTimer);
    }
    this._pendingTimer = setTimeout(() => {
      this._pendingTimer = null;
      this.performBackup(reason).catch(err => console.error('[AutoBackup] performBackup failed', err));
    }, this.AUTO_DELAY_MS);
  };

  AutoBackup.performBackup = async function(reason = 'auto') {
    if (!this.SUPPORTED) return;
    if (!this.enabled) {
      this._updateStatus({ code: 'disabled', message: 'Automatic backups are disabled by the user.', enabled: false });
      return;
    }
    if (this._busy) return;
    const entry = this._buildEntry(reason);
    if (!entry) return;
    const json = JSON.stringify(entry.data);
    const hash = await this._hash(json);
    if (hash && this._lastHash && hash === this._lastHash) {
      this._updateStatus({ code: 'no-change', message: 'Backup skipped — no changes detected.' });
      return;
    }
    this._busy = true;
    try {
      this._updateStatus({ code: 'busy', message: 'Saving automatic backup…' });
      const db = await this._openDb();
      const tx = db.transaction(this.STORE_NAME, 'readwrite');
      const store = tx.objectStore(this.STORE_NAME);
      const currentReq = store.get(this.BACKUP_CURRENT_KEY);
      const previousReq = store.get(this.BACKUP_PREVIOUS_KEY);
      const oldestReq = store.get(this.BACKUP_OLDEST_KEY);
      await Promise.all([
        this._requestToPromise(currentReq),
        this._requestToPromise(previousReq),
        this._requestToPromise(oldestReq)
      ]);
      const current = currentReq.result || null;
      const previous = previousReq.result || null;
      const oldest = oldestReq.result || null;
      if (previous) {
        store.put(previous, this.BACKUP_OLDEST_KEY);
      } else if (!oldest) {
        store.delete(this.BACKUP_OLDEST_KEY);
      }
      if (current) {
        store.put(current, this.BACKUP_PREVIOUS_KEY);
      } else {
        store.delete(this.BACKUP_PREVIOUS_KEY);
      }
      store.put({
        savedAt: entry.savedAt,
        hash,
        version: entry.version,
        reason,
        data: entry.data
      }, this.BACKUP_CURRENT_KEY);
      store.put({ lastBackupISO: entry.savedAt, lastHash: hash }, this.META_KEY);
      await this._txDone(tx);
      this._lastHash = hash;
      await this._loadMetadataFromDb();
      this._updateStatus({ code: 'success', message: 'Backup saved successfully.' });
    } catch (err) {
      console.error('[AutoBackup] performBackup error', err);
      this._updateStatus({ code: 'error', message: 'Automatic backup failed.', error: err });
    } finally {
      this._busy = false;
    }
  };

  AutoBackup.manualBackup = async function() {
    if (!this.SUPPORTED) {
      throw new Error('Automatic backups are not supported in this browser.');
    }
    const entry = this._buildEntry('manual-download');
    if (!entry) {
      throw new Error('Unable to collect app state for backup.');
    }
    const payload = {
      app: 'Punch Buggy',
      createdAt: entry.savedAt,
      version: entry.version,
      data: entry.data
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const timestamp = entry.savedAt.replace(/[:]/g, '-');
    const fileName = `punchbuggy-backup-${timestamp}.json`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    this._updateStatus({ code: 'downloaded', message: 'Backup downloaded.' });
  };

  AutoBackup.listBackups = async function() {
    if (!this.SUPPORTED) return [];
    const db = await this._openDb();
    const tx = db.transaction(this.STORE_NAME, 'readonly');
    const store = tx.objectStore(this.STORE_NAME);
    const keys = [this.BACKUP_CURRENT_KEY, this.BACKUP_PREVIOUS_KEY, this.BACKUP_OLDEST_KEY];
    const requests = keys.map(key => this._requestToPromise(store.get(key)).then(result => result ? { key, savedAt: result.savedAt, version: result.version || 'unknown' } : null));
    const results = (await Promise.all(requests)).filter(Boolean);
    await this._txDone(tx).catch(()=>{});
    return results;
  };

  AutoBackup.restoreFromBackup = async function(key) {
    if (!this.SUPPORTED) {
      throw new Error('Automatic backups are not supported in this browser.');
    }
    const validKeys = new Set([this.BACKUP_CURRENT_KEY, this.BACKUP_PREVIOUS_KEY, this.BACKUP_OLDEST_KEY]);
    if (!validKeys.has(key)) {
      throw new Error('Unknown backup slot.');
    }
    const db = await this._openDb();
    const tx = db.transaction(this.STORE_NAME, 'readonly');
    const store = tx.objectStore(this.STORE_NAME);
    const record = await this._requestToPromise(store.get(key));
    await this._txDone(tx).catch(()=>{});
    if (!record || !record.data) {
      throw new Error('Selected backup slot is empty.');
    }
    const clone = JSON.parse(JSON.stringify(record.data));
    if (this._applyState) {
      try {
        this._applyState(clone);
      } catch (err) {
        console.error('[AutoBackup] applyState error', err);
        throw err;
      }
    }
    this._updateStatus({ code: 'restored', message: `Restored ${key} backup from ${record.savedAt || 'unknown time'}.` });
    return clone;
  };

  AutoBackup._buildEntry = function(reason) {
    if (typeof this._getState !== 'function') return null;
    let source;
    try {
      source = this._getState();
    } catch (err) {
      console.error('[AutoBackup] getState error', err);
      return null;
    }
    if (!source || typeof source !== 'object') return null;
    const clone = this._cloneState(source);
    const savedAt = new Date().toISOString();
    return {
      savedAt,
      version: (typeof window !== 'undefined' && window.PUNCHBUGGY_APP_VERSION) || 'dev',
      reason,
      data: clone
    };
  };

  AutoBackup._cloneState = function(source) {
    const clone = JSON.parse(JSON.stringify(source));
    if (Array.isArray(clone.history) && clone.history.length > this.MAX_HISTORY_SNAPSHOTS) {
      clone.history = clone.history.slice(-this.MAX_HISTORY_SNAPSHOTS);
    }
    if (Array.isArray(clone.roundWinners) && clone.roundWinners.length > this.MAX_ROUND_SNAPSHOTS) {
      clone.roundWinners = clone.roundWinners.slice(-this.MAX_ROUND_SNAPSHOTS);
    }
    return clone;
  };

  AutoBackup._openDb = function() {
    if (!this.SUPPORTED) {
      return Promise.reject(new Error('IndexedDB is not available.'));
    }
    if (this._dbPromise) return this._dbPromise;
    this._dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this._dbPromise;
  };

  AutoBackup._loadMetadataFromDb = async function() {
    try {
      const db = await this._openDb();
      const tx = db.transaction(this.STORE_NAME, 'readonly');
      const store = tx.objectStore(this.STORE_NAME);
      const metaReq = store.get(this.META_KEY);
      const currentReq = store.get(this.BACKUP_CURRENT_KEY);
      const previousReq = store.get(this.BACKUP_PREVIOUS_KEY);
      const oldestReq = store.get(this.BACKUP_OLDEST_KEY);
      await Promise.all([
        this._requestToPromise(metaReq),
        this._requestToPromise(currentReq),
        this._requestToPromise(previousReq),
        this._requestToPromise(oldestReq)
      ]);
      const meta = metaReq.result || {};
      const current = currentReq.result || null;
      const previous = previousReq.result || null;
      const oldest = oldestReq.result || null;
      this.metadata.lastBackupISO = meta.lastBackupISO || '';
      this.metadata.currentBackupDate = current && current.savedAt ? current.savedAt : '';
      this.metadata.previousBackupDate = previous && previous.savedAt ? previous.savedAt : '';
      this.metadata.oldestBackupDate = oldest && oldest.savedAt ? oldest.savedAt : '';
      const count = [current, previous, oldest].filter(Boolean).length;
      this.metadata.backupCount = count;
      this._lastHash = meta.lastHash || this._lastHash || '';
      this._persistMetadataCache(Object.assign({}, this.metadata, { lastHash: this._lastHash }));
      await this._txDone(tx).catch(()=>{});
    } catch (err) {
      console.warn('[AutoBackup] load metadata error', err);
    }
  };

  AutoBackup._hash = async function(text) {
    try {
      if (window.crypto && window.crypto.subtle) {
        const enc = new TextEncoder();
        const data = enc.encode(text);
        const digest = await window.crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (err) {
      console.warn('[AutoBackup] crypto.subtle unavailable', err);
    }
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }
    return `fallback-${Math.abs(hash)}`;
  };

  AutoBackup._updateStatus = function(status) {
    if (!status || typeof status !== 'object') {
      status = {};
    }
    const base = {
      code: this.enabled ? 'idle' : 'disabled',
      message: this.enabled ? 'Automatic backups ready.' : 'Automatic backups are disabled by the user.',
      enabled: this.enabled && this.SUPPORTED
    };
    this._status = Object.assign(base, status);
    this._status.metadata = Object.assign({}, this.metadata);
    this._status.enabled = this.enabled && this.SUPPORTED && this._status.enabled !== false;
    this._callbacks.forEach(cb => {
      try {
        cb(this.getStatus());
      } catch (err) {
        console.error('[AutoBackup] status callback error', err);
      }
    });
  };

  AutoBackup._requestToPromise = function(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };

  AutoBackup._txDone = function(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
      tx.onerror = () => reject(tx.error);
    });
  };

  AutoBackup._loadEnabledFlag = function() {
    try {
      const stored = localStorage.getItem(LOCAL_ENABLED_KEY);
      if (stored === null) return true;
      return stored === 'true';
    } catch (err) {
      console.warn('[AutoBackup] unable to read enabled flag', err);
      return true;
    }
  };

  AutoBackup._persistEnabledFlag = function(enabled) {
    try {
      localStorage.setItem(LOCAL_ENABLED_KEY, enabled ? 'true' : 'false');
    } catch (err) {
      console.warn('[AutoBackup] unable to persist enabled flag', err);
    }
  };

  AutoBackup._loadCachedMetadata = function() {
    try {
      const raw = localStorage.getItem(LOCAL_META_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.warn('[AutoBackup] unable to parse cached metadata', err);
      return null;
    }
  };

  AutoBackup._persistMetadataCache = function(meta) {
    try {
      localStorage.setItem(LOCAL_META_KEY, JSON.stringify(meta));
    } catch (err) {
      console.warn('[AutoBackup] unable to persist metadata cache', err);
    }
  };

  if (typeof window !== 'undefined') {
    window.AutoBackup = AutoBackup;
    window.PunchBuggyAutoBackup = AutoBackup;
    window.PunchBuggyBackup = AutoBackup;
  }
})();
