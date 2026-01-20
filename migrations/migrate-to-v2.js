// Lightweight in-app migration helper for schema v2.0.0
// - Creates a timestamped backup of the existing `punchBuggy` localStorage key
// - Detects simple legacy shapes and normalizes them
// - Writes migrated state back to localStorage with schemaVersion: '2.0.0'

(function (global) {
  function backupRawState(raw) {
    try {
      const key = 'punchBuggy_backup_' + Date.now();
      localStorage.setItem(key, raw);
      // also keep a pointer to the latest backup for UI/debugging
      localStorage.setItem('punchBuggy_last_backup', key);
      return key;
    } catch (err) {
      console.warn('Backup failed', err);
      return null;
    }
  }

  function migrate(parsed) {
    // Defensive defaults
    if (!parsed || typeof parsed !== 'object') return parsed;

    // Example migration changes for v2:
    // - normalize roundWinners entries from strings to objects (already handled elsewhere)
    // - ensure players have avatar, streak fields
    parsed.players = parsed.players || {};
    parsed.players.A = parsed.players.A || { name: 'Player A', score: 0, streak: 0, avatar: '' };
    parsed.players.B = parsed.players.B || { name: 'Player B', score: 0, streak: 0, avatar: '' };

    ['A', 'B'].forEach((k) => {
      const p = parsed.players[k] || {};
      if (typeof p.score !== 'number') p.score = Number(p.score) || 0;
      if (typeof p.streak !== 'number') p.streak = Number(p.streak) || 0;
      if (typeof p.avatar !== 'string') p.avatar = p.avatar || '';
      parsed.players[k] = p;
    });

    // migrate roundWinners legacy string entries to objects
    if (Array.isArray(parsed.roundWinners)) {
      parsed.roundWinners = parsed.roundWinners
        .map((r) => {
          if (!r) return null;
          if (typeof r === 'string') {
            if (r === 'A') return { winner: 'A', scoreA: 0, scoreB: 0 };
            if (r === 'B') return { winner: 'B', scoreA: 0, scoreB: 0 };
            return { winner: 'T', scoreA: 0, scoreB: 0 };
          }
          return r;
        })
        .filter(Boolean);
    } else {
      parsed.roundWinners = parsed.roundWinners || [];
    }

    // Ensure top-level shape
    parsed.round = parsed.round || 1;
    parsed.history = Array.isArray(parsed.history)
      ? parsed.history
      : parsed.history
        ? [parsed.history]
        : [];

    // Mark schema version
    parsed.schemaVersion = '2.0.0';

    return parsed;
  }

  function migrateIfNeeded() {
    try {
      const raw = localStorage.getItem('punchBuggy');
      if (!raw) return { migrated: false, reason: 'no-state' };
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        return { migrated: false, reason: 'invalid-json', error: err };
      }

      if (parsed && parsed.schemaVersion === '2.0.0')
        return { migrated: false, reason: 'already-v2' };

      // backup raw data
      const backupKey = backupRawState(raw);

      // perform migration
      const next = migrate(parsed);

      // write back
      localStorage.setItem('punchBuggy', JSON.stringify(next));

      return { migrated: true, backupKey: backupKey, nextState: next };
    } catch (err) {
      console.error('Migration failed', err);
      return { migrated: false, reason: 'exception', error: err };
    }
  }

  // expose
  global.PunchBuggyMigrations = global.PunchBuggyMigrations || {};
  global.PunchBuggyMigrations.migrateIfNeeded = migrateIfNeeded;
})(window);
