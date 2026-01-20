import './styles/app.css';
import '../migrations/migrate-to-v2.js';

const $ = (sel) => document.querySelector(sel);
const state = {
  round: 1,
  players: {
    A: { name: 'Player A', score: 0, streak: 0, avatar: '' },
    B: { name: 'Player B', score: 0, streak: 0, avatar: '' },
  },
  // track rounds: {winner:'A'|'B'|'T', scoreA: number, scoreB: number}
  roundWinners: [],
  history: [],
  undoStack: [],
};

// Version display: show the *running* version (persisted in localStorage on first load)
// rather than the newly-fetched version from app-version.js, so users see the current version
// until they explicitly click Refresh to apply the update.
const versionEl = $('#appVersion');
if (versionEl) {
  const storedVersion = localStorage.getItem('punchBuggy_running_version');
  const appVersion = window.PUNCHBUGGY_APP_VERSION || 'unknown';
  const currentVersion = storedVersion || appVersion || '—';
  versionEl.textContent = currentVersion;
  // Persist or sync the running version so the UI reflects the active build.
  if (!storedVersion || (appVersion && storedVersion !== appVersion)) {
    localStorage.setItem('punchBuggy_running_version', appVersion);
    versionEl.textContent = appVersion;
  }
}

// Console logging: print version details on page load for debugging
console.log('[PunchBuggy] Version info:', {
  runningVersion: localStorage.getItem('punchBuggy_running_version'),
  fetchedVersion: window.PUNCHBUGGY_APP_VERSION,
  autoApplyEnabled: window.PUNCHBUGGY_AUTO_APPLY_UPDATES,
});

function render() {
  $('#scoreA').textContent = state.players.A.score;
  $('#scoreB').textContent = state.players.B.score;
  updateStreakBadge($('#streakA'), state.players.A.streak);
  updateStreakBadge($('#streakB'), state.players.B.streak);
  $('#nameA').value = state.players.A.name;
  $('#nameB').value = state.players.B.name;
  if (state.players.A.avatar) $('#avatarA').src = state.players.A.avatar;
  if (state.players.B.avatar) $('#avatarB').src = state.players.B.avatar;
  $('#round').textContent = state.round;
  const diff = state.players.A.score - state.players.B.score;
  $('#lead').textContent =
    diff === 0
      ? 'Tied'
      : diff > 0
        ? `${state.players.A.name} +${diff}`
        : `${state.players.B.name} +${Math.abs(diff)}`;
  renderLeaderboard();
  // show crown on current leader avatar
  const leader =
    state.players.A.score === state.players.B.score
      ? null
      : state.players.A.score > state.players.B.score
        ? 'A'
        : 'B';
  if (leader === 'A') {
    $('#crownA').style.display = 'flex';
    $('#crownB').style.display = 'none';
  } else if (leader === 'B') {
    $('#crownB').style.display = 'flex';
    $('#crownA').style.display = 'none';
  } else {
    $('#crownA').style.display = 'none';
    $('#crownB').style.display = 'none';
  }
  renderModalLog();
  save();
}

const STREAK_CLASSES = ['smolder', 'burning', 'inferno'];

function updateStreakBadge(el, streak) {
  if (!el) return;
  el.classList.remove(...STREAK_CLASSES);
  el.innerHTML = `<span class="fire-icon">🔥</span> ${streak} Streak`;
  if (streak >= 10) {
    el.classList.add('inferno');
  } else if (streak >= 5) {
    el.classList.add('burning');
  } else if (streak >= 3) {
    el.classList.add('smolder');
  }
}

function renderModalLog() {
  const list = $('#modalLog');
  if (!list) return;
  list.innerHTML = state.history
    .slice()
    .reverse()
    .map(
      (e) => `<li style="padding:8px;border-radius:8px;background:rgba(255,255,255,0.03)">${e}</li>`
    )
    .join('');
}

function renderLeaderboard() {
  // normalize legacy entries (strings) into objects
  const rounds = state.roundWinners
    .map((r) => {
      if (!r) return null;
      if (typeof r === 'string') {
        // legacy: 'A'|'B'|'T' - we don't have scores, use 0-0 placeholder
        if (r === 'A') return { winner: 'A', scoreA: 0, scoreB: 0 };
        if (r === 'B') return { winner: 'B', scoreA: 0, scoreB: 0 };
        return { winner: 'T', scoreA: 0, scoreB: 0 };
      }
      return r;
    })
    .filter(Boolean);

  // small card: compact per-round rows
  const mini = $('#miniList');
  mini.innerHTML = '';
  rounds.forEach((r, idx) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.gap = '12px';
    row.style.padding = '8px';
    row.style.borderRadius = '10px';
    row.style.background =
      'linear-gradient(90deg, rgba(255,255,255,0.01), rgba(255,255,255,0.005))';
    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.alignItems = 'center';
    left.style.gap = '10px';
    const badge = document.createElement('div');
    badge.className = 'token';
    badge.textContent = idx + 1;
    badge.style.width = '34px';
    badge.style.height = '34px';
    badge.style.fontSize = '14px';
    const title = document.createElement('div');
    title.style.fontWeight = '700';
    title.textContent =
      r.winner === 'T' ? 'Tie' : r.winner === 'A' ? state.players.A.name : state.players.B.name;
    left.appendChild(badge);
    left.appendChild(title);
    const score = document.createElement('div');
    score.style.fontWeight = '800';
    score.textContent = `${r.scoreA} — ${r.scoreB}`;
    if (r.winner === 'A') row.style.borderLeft = '4px solid rgba(93,212,162,0.9)';
    else if (r.winner === 'B') row.style.borderLeft = '4px solid rgba(138,168,255,0.9)';
    mini.appendChild(row);
    row.appendChild(left);
    row.appendChild(score);
  });

  // totals and stats
  let totalA = 0;
  let totalB = 0;
  let winsA = 0;
  let winsB = 0;
  let ties = 0;
  rounds.forEach((r) => {
    totalA += r.scoreA;
    totalB += r.scoreB;
    if (r.winner === 'A') winsA++;
    else if (r.winner === 'B') winsB++;
    else ties++;
  });

  const totalPunches = totalA + totalB;
  const winTotal = winsA + winsB;
  const percentA = winTotal ? Math.round((winsA / winTotal) * 100) : 50;
  const percentB = 100 - percentA;

  const avatarA = state.players.A.avatar || $('#avatarA').src;
  const avatarB = state.players.B.avatar || $('#avatarB').src;

  if ($('#lbAvatarA')) $('#lbAvatarA').src = avatarA;
  if ($('#lbAvatarB')) $('#lbAvatarB').src = avatarB;
  if ($('#lbNameA')) $('#lbNameA').textContent = state.players.A.name;
  if ($('#lbNameB')) $('#lbNameB').textContent = state.players.B.name;
  if ($('#lbWinsA')) $('#lbWinsA').textContent = winsA;
  if ($('#lbWinsB')) $('#lbWinsB').textContent = winsB;
  if ($('#lbPercentA')) $('#lbPercentA').textContent = `${percentA}%`;
  if ($('#lbPercentB')) $('#lbPercentB').textContent = `${percentB}%`;
  if ($('#lbMeterA')) $('#lbMeterA').style.width = `${percentA}%`;
  if ($('#lbMeterB')) $('#lbMeterB').style.width = `${percentB}%`;
  if ($('#lbTotalRounds')) $('#lbTotalRounds').textContent = rounds.length;
  if ($('#lbTotalTies')) $('#lbTotalTies').textContent = ties;
  if ($('#lbTotalPunches')) $('#lbTotalPunches').textContent = totalPunches;
  if ($('#lbHistoryCount')) $('#lbHistoryCount').textContent = rounds.length;

  const playerAEl = $('#lbPlayerA');
  const playerBEl = $('#lbPlayerB');
  if (playerAEl) playerAEl.classList.toggle('winner', winsA > winsB);
  if (playerBEl) playerBEl.classList.toggle('winner', winsB > winsA);
  if ($('#lbCrownA')) $('#lbCrownA').style.display = winsA > winsB ? 'block' : 'none';
  if ($('#lbCrownB')) $('#lbCrownB').style.display = winsB > winsA ? 'block' : 'none';

  const roundList = $('#roundList');
  if (roundList) {
    roundList.innerHTML = '';
    rounds
      .slice()
      .reverse()
      .forEach((r, idx) => {
        const roundNumber = rounds.length - idx;
        const item = document.createElement('div');
        const winClass = r.winner === 'A' ? 'win-a' : r.winner === 'B' ? 'win-b' : 'tie';
        item.className = `round-item ${winClass}`;

        const roundNum = document.createElement('div');
        roundNum.className = 'round-num';
        roundNum.textContent = `#${roundNumber}`;

        const scores = document.createElement('div');
        scores.className = 'round-scores';

        const scoreA = document.createElement('span');
        scoreA.className = `score-val p1 ${r.scoreA > r.scoreB ? 'winner' : 'dim'}`;
        scoreA.textContent = r.scoreA;

        const divider = document.createElement('span');
        divider.className = 'round-divider';
        divider.textContent = '—';

        const scoreB = document.createElement('span');
        scoreB.className = `score-val p2 ${r.scoreB > r.scoreA ? 'winner' : 'dim'}`;
        scoreB.textContent = r.scoreB;

        scores.appendChild(scoreA);
        scores.appendChild(divider);
        scores.appendChild(scoreB);

        const badge = document.createElement('div');
        badge.className = 'round-badge';
        const badgeLabel = document.createElement('span');
        badgeLabel.className =
          r.winner === 'A' ? 'badge-a' : r.winner === 'B' ? 'badge-b' : 'badge-tie';
        badgeLabel.textContent = r.winner === 'T' ? 'TIE' : 'WIN';
        badge.appendChild(badgeLabel);

        item.appendChild(roundNum);
        item.appendChild(scores);
        item.appendChild(badge);
        roundList.appendChild(item);
      });
  }
}

function save() {
  const { undoStack, ...persisted } = state;
  localStorage.setItem('punchBuggy', JSON.stringify(persisted));
}
function load() {
  const s = localStorage.getItem('punchBuggy');
  if (s) {
    const parsed = JSON.parse(s);
    // migrate roundWinners legacy strings to objects
    if (parsed.roundWinners && Array.isArray(parsed.roundWinners)) {
      parsed.roundWinners = parsed.roundWinners.map((r) => {
        if (typeof r === 'string') {
          if (r === 'A') return { winner: 'A', scoreA: 0, scoreB: 0 };
          if (r === 'B') return { winner: 'B', scoreA: 0, scoreB: 0 };
          return { winner: 'T', scoreA: 0, scoreB: 0 };
        }
        return r;
      });
    }
    Object.assign(state, parsed);
  }
  state.undoStack = [];
  render();
}

function log(msg) {
  state.history.push(msg);
  render();
}

function score(p, d = 1) {
  pushUndoState();
  const other = p === 'A' ? 'B' : 'A';
  state.players[p].score = Math.max(0, state.players[p].score + d);

  if (d > 0) {
    state.players[p].streak++;
    state.players[other].streak = 0;

    // Winner animation
    $(`.card[data-player="${p}"]`).classList.add('winner');
    setTimeout(() => $(`.card[data-player="${p}"]`).classList.remove('winner'), 600);

    // Loser animation
    $(`.card[data-player="${other}"]`).classList.add('loser');
    setTimeout(() => $(`.card[data-player="${other}"]`).classList.remove('loser'), 500);

    // Score bump
    $(`#score${p}`).classList.add('bump');
    setTimeout(() => $(`#score${p}`).classList.remove('bump'), 500);

    log(`${state.players[p].name} spotted a bug! +1`);
  } else {
    state.players[p].streak = 0;
    log(`${state.players[p].name} correction: -1`);
  }

  render();
}

function pushUndoState() {
  const { undoStack, ...snapshot } = state;
  undoStack.push(JSON.parse(JSON.stringify(snapshot)));
  if (undoStack.length > 50) undoStack.shift();
}

function reset() {
  if (confirm('Reset entire game? This will also clear round history.')) {
    state.round = 1;
    Object.values(state.players).forEach((p) => {
      p.score = 0;
      p.streak = 0;
    });
    state.history = [];
    state.roundWinners = [];
    render();
  }
}

function undo() {
  if (!state.undoStack.length) return;
  const prev = state.undoStack.pop();
  const { undoStack, ...rest } = state;
  Object.assign(state, prev);
  state.undoStack = undoStack;
  render();
}
function recordRoundWinner() {
  const a = state.players.A.score;
  const b = state.players.B.score;
  let win = 'T';
  if (a > b) win = 'A';
  else if (b > a) win = 'B';
  state.roundWinners.push({ winner: win, scoreA: a, scoreB: b });
  if (win === 'T') log(`🤝 Round ${state.round} tied ${a}-${b}`);
  else if (win === 'A') log(`🏆 ${state.players.A.name} won Round ${state.round} ${a}-${b}`);
  else log(`🏆 ${state.players.B.name} won Round ${state.round} ${b}-${a}`);
}

function nextRound() {
  // record current winner, then bump round and reset scores
  recordRoundWinner();
  state.round++;
  Object.values(state.players).forEach((p) => {
    p.score = 0;
    p.streak = 0;
  });
  log(`🏁 Round ${state.round} started!`);
  render();
}

function handleImageUpload(player, file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    state.players[player].avatar = e.target.result;
    render();
  };
  reader.readAsDataURL(file);
}

$('#btnA').onclick = () => score('A', 1);
$('#btnB').onclick = () => score('B', 1);
$('#minusA').onclick = () => score('A', -1);
$('#minusB').onclick = () => score('B', -1);
$('#resetBtn').onclick = reset;
$('#undoBtn').onclick = undo;
$('#nextRound').onclick = nextRound;
// bottom nav and leaderboard controls
function toggleLeaderboard(show) {
  const wrap = $('#leaderboardWrap');
  wrap.style.display = show ? 'block' : 'none';
}

$('#clearBoard').onclick = () => {
  if (confirm('Clear round history?')) {
    state.roundWinners = [];
    render();
  }
};
$('#closeBoard').onclick = () => toggleLeaderboard(false);
// fullscreen leaderboard controls
function openFullLeaderboard() {
  document.body.style.overflow = 'hidden';
  $('#leaderboardView').style.display = 'block';
  renderLeaderboard();
}
function closeFullLeaderboard() {
  document.body.style.overflow = '';
  $('#leaderboardView').style.display = 'none';
}
$('#leaderboardBtn').onclick = () => openFullLeaderboard();
$('#closeFull').onclick = () => closeFullLeaderboard();
const menuPanel = $('#menuPanel');
const menuBtn = $('#menuBtn');
function toggleMenu(force) {
  if (!menuPanel) return;
  const shouldOpen = typeof force === 'boolean' ? force : !menuPanel.classList.contains('open');
  menuPanel.classList.toggle('open', shouldOpen);
  menuPanel.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
  menuPanel.inert = !shouldOpen;
  if (!shouldOpen && menuBtn && menuPanel.contains(document.activeElement)) {
    menuBtn.focus();
  }
}
if (menuBtn) {
  menuBtn.onclick = () => toggleMenu();
}
// Rules content (concise, comprehensive)
const rules = [
  'Objective: Spot the VW Beetle (or other agreed target) first to score a point.',
  'Scoring: First player to call it gets +1. Use the correction (-1) for false calls.',
  'Rounds: Press Next Round to record the round winner and start fresh scores for the next round.',
  'Streaks: Consecutive correct calls increase your streak but do not change round scoring.',
  'Safety: Keep your eyes on the road. No taking photos or reaching for phones while driving.',
  'Fair Play: Disputes are resolved by mutual agreement; use -1 for honest corrections.',
  'Tie Rounds: If both players have equal scores when Next Round is pressed, the round is recorded as a tie.',
  'Customization: Change player names or avatars before/after rounds. Avatars are local only.',
];
$('#rulesBtn').onclick = () => {
  toggleMenu(false);
  const el = $('#rulesContent');
  el.innerHTML =
    '<ol style="margin:0;padding-left:18px">' +
    rules.map((r) => `<li style="margin-bottom:8px">${r}</li>`).join('') +
    '</ol>';
  $('#rulesModal').style.display = 'flex';
};

// Data modal handlers (export/import/log/clear)
$('#dataBtn').onclick = () => {
  toggleMenu(false);
  $('#dataModal').style.display = 'flex';
  renderModalLog();
};
$('#closeData').onclick = () => {
  $('#dataModal').style.display = 'none';
};
async function clearAllAppData() {
  // Reset in-memory state first so UI clears immediately.
  state.round = 1;
  state.players.A = { name: 'Player A', score: 0, streak: 0, avatar: '' };
  state.players.B = { name: 'Player B', score: 0, streak: 0, avatar: '' };
  state.history = [];
  state.roundWinners = [];
  render();

  // Remove localStorage data.
  try {
    localStorage.removeItem('punchBuggy');
  } catch (err) {
    console.warn('Failed to clear localStorage', err);
  }
}

$('#clearData').onclick = () => {
  if (confirm('Delete all game data (rounds, scores, history, names, avatars)?')) {
    clearAllAppData();
  }
};

// Export state as JSON file
$('#exportData').onclick = () => {
  const payload = JSON.stringify(state, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `punchbuggy-export-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// Import - parse file and normalize various export shapes (supports older shape and `rounds`-style exports)
function normalizeImportedState(parsed) {
  if (!parsed || typeof parsed !== 'object') return { error: 'invalid' };
  // Support wrapped export shape: { app, createdAt, version, data }
  const source = parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;

  const out = {};
  // Players: support both flat {players.A.score} and nested {players.A.current.score}
  out.players = {
    A: { name: 'Player A', score: 0, streak: 0, avatar: '' },
    B: { name: 'Player B', score: 0, streak: 0, avatar: '' },
  };

  if (source.players && typeof source.players === 'object') {
    ['A', 'B'].forEach((k) => {
      const p = source.players[k] || {};
      const name =
        typeof p.name === 'string' && p.name.trim() ? p.name.trim() : out.players[k].name;
      const avatar = typeof p.avatar === 'string' ? p.avatar : '';
      let score = 0,
        streak = 0;
      if (p.current && typeof p.current === 'object') {
        score = Number(p.current.score) || 0;
        streak = Number(p.current.streak) || 0;
      } else {
        score = Number(p.score) || 0;
        streak = Number(p.streak) || 0;
      }
      out.players[k] = { name, score, streak, avatar };
    });
  }

  // Round number: prefer top-level `round`, fallback to `rounds.current.number`
  if (Number.isFinite(Number(source.round)))
    out.round = Math.max(1, Math.round(Number(source.round)));
  else if (
    source.rounds &&
    source.rounds.current &&
    Number.isFinite(Number(source.rounds.current.number))
  )
    out.round = Math.max(1, Math.round(Number(source.rounds.current.number)));
  else out.round = 1;

  // Round winners: try to map from `rounds.history` if present, otherwise use roundWinners if available
  out.roundWinners = [];
  if (source.rounds && Array.isArray(source.rounds.history)) {
    out.roundWinners = source.rounds.history.map((r) => {
      const winner = r && r.winner ? r.winner : 'T';
      const scoreA = r && r.scores && Number.isFinite(Number(r.scores.A)) ? Number(r.scores.A) : 0;
      const scoreB = r && r.scores && Number.isFinite(Number(r.scores.B)) ? Number(r.scores.B) : 0;
      return { winner, scoreA, scoreB };
    });
  } else if (Array.isArray(source.roundWinners)) {
    out.roundWinners = source.roundWinners
      .map((r) => {
        if (typeof r === 'string') {
          if (r === 'A') return { winner: 'A', scoreA: 0, scoreB: 0 };
          if (r === 'B') return { winner: 'B', scoreA: 0, scoreB: 0 };
          return { winner: 'T', scoreA: 0, scoreB: 0 };
        }
        return r;
      })
      .filter(Boolean);
  }

  // History: accept array of log objects or strings
  if (Array.isArray(source.history)) {
    out.history = source.history.map((h) => {
      if (typeof h === 'string') return h;
      if (h && h.message) return h.message;
      try {
        return JSON.stringify(h);
      } catch (e) {
        return String(h);
      }
    });
  } else {
    out.history = [];
  }

  // optional: preserve schemaVersion if present
  const schemaVersion = source.schemaVersion || parsed.schemaVersion;
  if (schemaVersion) out.schemaVersion = schemaVersion;

  return out;
}

$('#importBtn').onclick = () => $('#importFile').click();
$('#importFile').onchange = async (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  try {
    const text = await f.text();
    const parsed = JSON.parse(text);
    const normalized = normalizeImportedState(parsed);
    if (normalized && normalized.error) {
      alert('Invalid file: could not parse import');
      e.target.value = '';
      return;
    }
    if (!confirm('Importing will replace your current game state. Continue?')) {
      e.target.value = '';
      return;
    }
    Object.assign(state, normalized);
    render();
    alert('Import successful');
  } catch (err) {
    alert('Failed to import: ' + (err && err.message ? err.message : String(err)));
  }
  e.target.value = '';
};

$('#closeRules').onclick = () => {
  $('#rulesModal').style.display = 'none';
};
$('#nameA').onchange = (e) => {
  state.players.A.name = e.target.value;
  render();
};
$('#nameB').onchange = (e) => {
  state.players.B.name = e.target.value;
  render();
};
$('#uploadA').onchange = (e) => handleImageUpload('A', e.target.files[0]);
$('#uploadB').onchange = (e) => handleImageUpload('B', e.target.files[0]);

function setupServiceWorkerUpdates() {
  if (!('serviceWorker' in navigator)) return;
  // Dev flag: set to `false` to require manual refresh. Set to `true` to re-enable auto-apply.
  // Default intentionally `false` so users must click Refresh to apply updates.
  window.PUNCHBUGGY_AUTO_APPLY_UPDATES =
    window.PUNCHBUGGY_AUTO_APPLY_UPDATES === undefined
      ? false
      : !!window.PUNCHBUGGY_AUTO_APPLY_UPDATES;

  const banner = $('#updateBanner');
  const bannerText = $('#updateBannerText');
  const refreshBtn = $('#refreshUpdate');
  const dismissBtn = $('#dismissUpdate');
  const root = document.documentElement;
  let waitingWorker = null;
  let autoReloadTimer = null;
  let refreshing = false;

  function applyBannerOffset() {
    if (!banner || banner.style.display === 'none') return;
    const update = () => {
      const height = banner.getBoundingClientRect().height || 0;
      if (root) root.style.setProperty('--update-banner-offset', `${Math.ceil(height + 16)}px`);
    };
    if (window.requestAnimationFrame) {
      requestAnimationFrame(() => requestAnimationFrame(update));
    } else {
      setTimeout(update, 0);
    }
  }

  function hideBanner() {
    if (autoReloadTimer) clearTimeout(autoReloadTimer);
    autoReloadTimer = null;
    if (banner) banner.style.display = 'none';
    waitingWorker = null;
    if (root) root.style.setProperty('--update-banner-offset', '0px');
  }

  function requestRefresh() {
    if (waitingWorker) {
      const worker = waitingWorker;
      // mark that a refresh was explicitly requested so controllerchange will reload
      refreshing = true;
      // Update the running version in localStorage so after reload the UI shows the new version
      localStorage.setItem(
        'punchBuggy_running_version',
        window.PUNCHBUGGY_APP_VERSION || 'unknown'
      );
      console.log(
        '[PunchBuggy] Update requested, new version will be:',
        window.PUNCHBUGGY_APP_VERSION
      );
      hideBanner();
      worker.postMessage({ type: 'SKIP_WAITING' });
    }
  }

  function showBanner(worker) {
    waitingWorker = worker;
    if (!banner) return;
    if (bannerText) {
      const version = window.PUNCHBUGGY_APP_VERSION || 'latest';
      bannerText.textContent = `Version ${version} is ready. Refresh to load the latest updates.`;
    }
    banner.style.display = 'flex';
    applyBannerOffset();
    if (autoReloadTimer) clearTimeout(autoReloadTimer);
    // Only schedule auto-apply when explicitly enabled.
    if (window.PUNCHBUGGY_AUTO_APPLY_UPDATES) {
      autoReloadTimer = setTimeout(() => {
        if (waitingWorker) {
          requestRefresh();
        }
      }, 30000);
    } else {
      autoReloadTimer = null;
    }
  }

  if (refreshBtn) refreshBtn.onclick = () => requestRefresh();
  if (dismissBtn) dismissBtn.onclick = () => hideBanner();
  window.addEventListener('resize', applyBannerOffset);

  // Debug helper: allow manual banner show from console during testing.
  // Usage: window.DEBUG_showUpdateBanner('Optional message');
  window.DEBUG_showUpdateBanner = function (versionText) {
    try {
      if (!banner) return;
      if (bannerText)
        bannerText.textContent =
          versionText ||
          `Version ${window.PUNCHBUGGY_APP_VERSION || 'latest'} is ready. Refresh to load the latest updates.`;
      banner.style.display = 'flex';
      applyBannerOffset();
    } catch (err) {
      console.warn('DEBUG_showUpdateBanner failed', err);
    }
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Only reload the page when we explicitly requested the refresh (refreshing === true).
    if (!refreshing) return;
    // proceed with reload
    window.location.reload();
  });

  navigator.serviceWorker
    .register('/service-worker.js')
    .then((reg) => {
      if (reg.waiting) {
        showBanner(reg.waiting);
      }
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showBanner(newWorker);
          }
        });
      });
      setInterval(
        () => {
          if (document.visibilityState === 'visible') {
            reg.update();
          }
        },
        5 * 60 * 1000
      );
    })
    .catch((err) => {
      console.error('Service worker registration failed:', err);
    });
}

// Run in-app migration if needed
try {
  if (
    window.PunchBuggyMigrations &&
    typeof window.PunchBuggyMigrations.migrateIfNeeded === 'function'
  ) {
    const result = window.PunchBuggyMigrations.migrateIfNeeded();
    if (result && result.migrated) {
      // notify user in data modal log
      const logEl = document.getElementById('modalLog');
      if (logEl)
        logEl.insertAdjacentHTML('beforeend', '<li>Migrated local data to schema v2.0.0.</li>');
    }
  }
} catch (err) {
  console.error('Migration call failed', err);
}

load();
setupServiceWorkerUpdates();
