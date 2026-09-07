/* ===========================================================================
 * Auction Draft Tracker
 *
 * A single-page, no-server, no-account tracker for a live $200 auction draft.
 * Everything is kept in the browser's local storage and written on every
 * change, so a refresh, a closed tab or a dead battery does not lose the room.
 *
 * Sections below, in order:
 *   1. Utilities and name matching
 *   2. Historical data (2018-2025) and the player pool
 *   3. State, persistence, undo/redo
 *   4. Derived values (budgets, lineups, market)
 *   5. Rendering
 *   6. Actions and events
 * ======================================================================== */
(function () {
'use strict';

/* =========================================================================
 * 1. UTILITIES
 * ====================================================================== */

var $  = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function money(n) { return '$' + (n == null || isNaN(n) ? '—' : Math.round(n)); }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

var POSITIONS = ['QB', 'RB', 'WR', 'TE', 'DST', 'K'];
var FLEX_OK = { RB: 1, WR: 1, TE: 1 };

/* --- name normalization ------------------------------------------------ */

/* The spreadsheet is full of nicknames and typos ("Zeke", "McCaffery",
 * "Nakua"). Everything is reduced to a canonical key so a player typed today
 * finds their own price history from eight years of inconsistent spelling. */
var ALIASES = {
  'zeke': 'ezekiel elliott', 'zeke elliot': 'ezekiel elliott', 'ezekiel elliot': 'ezekiel elliott',
  'cmc': 'christian mccaffrey', 'mccaffery': 'christian mccaffrey', 'christian mccaffery': 'christian mccaffrey',
  'obj': 'odell beckham', 'odell': 'odell beckham', 'odell beckham jr': 'odell beckham',
  'ab': 'antonio brown', 'juju': 'juju smith schuster', 'juju smith schuster': 'juju smith schuster',
  'jsn': 'jaxon smith njigba', 'jse': 'jaxon smith njigba', 'jaxon smith-njigba': 'jaxon smith njigba',
  'ceh': 'clyde edwards helaire', 'gronk': 'rob gronkowski',
  'mahomes': 'patrick mahomes', 'pat mahomes': 'patrick mahomes',
  'kelce': 'travis kelce', 'kittle': 'george kittle', 'geroge kittle': 'george kittle',
  'hopkins': 'deandre hopkins', 'barkley': 'saquon barkley', 'saquan barkley': 'saquon barkley',
  'kamara': 'alvin kamara', 'amari': 'amari cooper', 'kyren': 'kyren williams',
  'connor': 'james conner', 'james connor': 'james conner',
  'danny dimes': 'daniel jones', 'ar 15': 'anthony richardson', 'big ben': 'ben roethlisberger',
  'ben roethlisburger': 'ben roethlisberger', 'jimmy g': 'jimmy garoppolo',
  'rhamodre': 'rhamondre stevenson', 'r stevenson': 'rhamondre stevenson',
  'rhamodre stephenson': 'rhamondre stevenson', 'rhamondre stephenson': 'rhamondre stevenson',
  'lindsay': 'phillip lindsay', 'philip lindsay': 'phillip lindsay',
  'duke': 'duke johnson', 'kerryon': 'kerryon johnson', 'mixon': 'joe mixon',
  'mayfield': 'baker mayfield', 'watson': 'deshaun watson', 'fournette': 'leonard fournette',
  'howard': 'jordan howard', 'robinson': 'allen robinson', 'kaeem': 'kareem hunt',
  'jarvis': 'jarvis landry', 'godwin': 'chris godwin', 'waller': 'darren waller',
  'aiyuk': 'brandon aiyuk', 'friermuth': 'pat freiermuth', 'rodgers4': 'aaron rodgers',
  'aaronrodgers': 'aaron rodgers', 'aaron rodger': 'aaron rodgers',
  'kyler': 'kyler murray', 'zuerlein': 'greg zuerlein', 'gostkowski': 'stephen gostkowski',
  'jamarr chase': 'jamarr chase', 'jamar chase': 'jamarr chase',
  'mike thomas': 'michael thomas', 'micheal thomas': 'michael thomas',
  'ken walker': 'kenneth walker', 'kenneth walker iii': 'kenneth walker',
  'devon achane': 'devon achane', 'devonne achane': 'devon achane',
  'travis ettiene': 'travis etienne', 'travis etienne jr': 'travis etienne',
  'dandre swift': 'dandre swift', 'deandre swift': 'dandre swift',
  'brian thomas jr': 'brian thomas', 'marvin harrison jr': 'marvin harrison',
  'michael pittman jr': 'michael pittman', 'tyrone tracy jr': 'tyrone tracy',
  'hollywood brown': 'marquise brown', 'shooter mcpherson': 'evan mcpherson',
  'evan mcphereson': 'evan mcpherson', 'evan mcphereson jr': 'evan mcpherson'
};

var SUFFIX_RE = /\s+(jr|sr|ii|iii|iv|v)$/;

function normName(raw) {
  var s = String(raw == null ? '' : raw).toLowerCase().trim();
  s = s.replace(/[.'`’]/g, '');           // punctuation inside names
  s = s.replace(/[-_/]/g, ' ');           // hyphens act as spaces
  s = s.replace(/\([^)]*\)/g, ' ');       // "New York (A)"
  s = s.replace(/[^a-z0-9 ]/g, ' ');
  s = s.replace(/(\D)\d+$/, '$1');        // trailing typo digits: "Justin Fields1"
  s = s.replace(/\s+/g, ' ').trim();
  var prev = null;
  while (prev !== s) { prev = s; s = s.replace(SUFFIX_RE, ''); }
  return s;
}

function canonKey(raw) {
  var n = normName(raw);
  if (ALIASES[n]) return ALIASES[n];
  return n;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 3) return 99;
  var prev = [], cur = [], i, j;
  for (j = 0; j <= b.length; j++) prev[j] = j;
  for (i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
                        prev[j - 1] + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1));
    }
    for (j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/* Progressive match: exact key, then last name + first initial, then a small
 * edit distance. Returns the matching key from `keys` or null. */
function fuzzyKey(raw, keys) {
  var k = canonKey(raw);
  if (!k) return null;
  if (keys[k]) return k;

  var parts = k.split(' ');
  var last = parts[parts.length - 1], first = parts[0].charAt(0);
  var name, cand, cparts, best = null, bestD = 3;

  for (name in keys) {
    cparts = name.split(' ');
    if (cparts[cparts.length - 1] === last && cparts[0].charAt(0) === first) return name;
  }
  if (k.length < 7) return null;
  for (name in keys) {
    var d = levenshtein(k, name);
    if (d < bestD) { bestD = d; best = name; }
  }
  return best;
}

/* =========================================================================
 * 2. HISTORY + PLAYER POOL
 * ====================================================================== */

/* HISTORY.seasons: [{year, teams:[{name, left, picks:[{slot,name,price}]}]}]
 * HISTORY.byPlayer: canonical key -> [{year, team, price, slot, raw}] */
var HISTORY = (function () {
  var seasons = [], byYear = Object.create(null), byPlayer = Object.create(null);
  var lines = String(window.DRAFT_HISTORY_RAW || '').trim().split('\n');

  lines.forEach(function (line) {
    if (!line.trim()) return;
    var f = line.split('|');
    var year = parseInt(f[0], 10);
    var team = { name: f[1], left: f[2] === '' ? null : parseInt(f[2], 10), picks: [] };

    for (var i = 3; i < f.length; i++) {
      var p = f[i].split(',');
      if (!p[1]) continue;
      var price = p[2] === '' || p[2] == null ? null : parseInt(p[2], 10);
      var rec = { slot: p[0], name: p[1], price: price };
      team.picks.push(rec);

      var key = canonKey(p[1]);
      if (!byPlayer[key]) byPlayer[key] = [];
      byPlayer[key].push({ year: year, team: f[1], price: price, slot: p[0], raw: p[1] });
    }

    if (!byYear[year]) { byYear[year] = { year: year, teams: [] }; seasons.push(byYear[year]); }
    byYear[year].teams.push(team);
  });

  seasons.sort(function (a, b) { return a.year - b.year; });
  Object.keys(byPlayer).forEach(function (k) {
    byPlayer[k].sort(function (a, b) { return b.year - a.year; });
  });
  return { seasons: seasons, byYear: byYear, byPlayer: byPlayer };
})();

/* Summary stats for one player's price history. */
function histStats(key) {
  var rows = HISTORY.byPlayer[key];
  if (!rows || !rows.length) return null;
  var priced = rows.filter(function (r) { return r.price != null; });
  var recent = priced.slice(0, 3);
  var sum = 0, max = 0, i;
  for (i = 0; i < priced.length; i++) { sum += priced[i].price; if (priced[i].price > max) max = priced[i].price; }
  var rsum = 0;
  for (i = 0; i < recent.length; i++) rsum += recent[i].price;
  return {
    rows: rows,
    n: priced.length,
    avg: priced.length ? sum / priced.length : null,
    recentAvg: recent.length ? rsum / recent.length : null,
    max: max,
    last: priced.length ? priced[0] : null
  };
}
function histLookup(name) {
  var k = fuzzyKey(name, HISTORY.byPlayer);
  return k ? { key: k, stats: histStats(k) } : null;
}

/* The autocomplete pool: the bundled current list, plus every name that has
 * ever been drafted in this league, plus anything imported from CSV. */
function buildPool() {
  var seen = Object.create(null), out = [];

  function add(name, pos, source, value) {
    var key = canonKey(name);
    if (!key) return;
    if (seen[key]) {
      // Prefer a real position over an inferred one.
      if (seen[key].pos === '?' && pos && pos !== '?') seen[key].pos = pos;
      if (value != null && seen[key].value == null) seen[key].value = value;
      return;
    }
    var rec = { name: name, pos: pos || '?', key: key, source: source, value: value == null ? null : value };
    seen[key] = rec; out.push(rec);
  }

  var custom = STATE && STATE.customPool;
  if (custom && custom.length) custom.forEach(function (p) { add(p.name, p.pos, 'import', p.value); });

  String(window.PLAYER_POOL_RAW || '').trim().split('\n').forEach(function (line) {
    var f = line.split('|');
    if (f.length >= 2) add(f[1].trim(), f[0].trim(), 'pool', null);
  });

  // Historical names, newest season first so recent spellings win.
  for (var s = HISTORY.seasons.length - 1; s >= 0; s--) {
    HISTORY.seasons[s].teams.forEach(function (t) {
      t.picks.forEach(function (p) {
        add(p.name, p.slot === 'FLEX' || p.slot === 'BE' ? '?' : p.slot, 'history', null);
      });
    });
  }

  out.forEach(function (r) {
    var st = histStats(r.key);
    r.hist = st;
    r.sort = st && st.recentAvg != null ? st.recentAvg : -1;
  });
  return out;
}
var POOL = [];
var POOL_BY_KEY = Object.create(null);
function refreshPool() {
  POOL = buildPool();
  POOL_BY_KEY = Object.create(null);
  POOL.forEach(function (p) { POOL_BY_KEY[p.key] = p; });
}

/* =========================================================================
 * 3. STATE, PERSISTENCE, UNDO
 * ====================================================================== */

var LS_KEY = 'ffauction.state.v1';
var LS_BACKUP = 'ffauction.backup.v1';
var SCHEMA = 1;

var DEFAULT_TEAMS = ['Mitchell', 'Randy', 'Rob', 'Jay', 'Andy', 'Cody', 'Tyler', 'Ryan'];
var SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'DST', 'K', 'BE'];

function defaultState() {
  return {
    v: SCHEMA,
    season: new Date().getFullYear(),
    budget: 200,
    slots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DST: 1, K: 1, BE: 8 },
    teams: DEFAULT_TEAMS.map(function (n, i) {
      return { id: 't' + (i + 1), name: n, mine: n === 'Mitchell' };
    }),
    picks: [],
    nomIndex: 0,
    timerSec: 30,
    customPool: null
  };
}

var STATE = defaultState();
var UNDO = [], REDO = [], UNDO_MAX = 250;
var storageOK = true;

function snapshot() { return JSON.stringify(STATE); }

function saveNow() {
  try {
    localStorage.setItem(LS_KEY, snapshot());
    if (STATE.picks.length && STATE.picks.length % 10 === 0) {
      localStorage.setItem(LS_BACKUP, snapshot());
    }
    setSaveState('Saved', '');
    storageOK = true;
  } catch (e) {
    storageOK = false;
    setSaveState('Not saved', 'is-error');
    showBanner('This browser is blocking local storage, so the draft cannot be saved automatically. ' +
               'Use Setup → Download backup regularly, and do not close this tab.');
  }
}

function loadSaved() {
  var raw;
  try { raw = localStorage.getItem(LS_KEY); } catch (e) { storageOK = false; return false; }
  if (!raw) return false;
  try {
    var s = JSON.parse(raw);
    if (!s || typeof s !== 'object' || !Array.isArray(s.teams)) return false;
    STATE = migrate(s);
    return true;
  } catch (e) { return false; }
}

/* Tolerate older/partial saves rather than throwing away someone's draft. */
function migrate(s) {
  var d = defaultState();
  s.v = SCHEMA;
  s.season = s.season || d.season;
  s.budget = typeof s.budget === 'number' && s.budget > 0 ? s.budget : d.budget;
  s.slots = Object.assign({}, d.slots, s.slots || {});
  SLOT_ORDER.forEach(function (k) {
    s.slots[k] = Math.max(0, parseInt(s.slots[k], 10) || 0);
  });
  s.teams = (s.teams || []).filter(Boolean).map(function (t, i) {
    return { id: t.id || 't' + (i + 1), name: String(t.name || 'Team ' + (i + 1)), mine: !!t.mine };
  });
  if (!s.teams.length) s.teams = d.teams;
  var ids = {};
  s.teams.forEach(function (t) { ids[t.id] = 1; });
  s.picks = (s.picks || []).filter(function (p) {
    return p && p.player && ids[p.teamId];
  }).map(function (p) {
    return {
      id: p.id || uid(),
      player: String(p.player),
      pos: POSITIONS.indexOf(p.pos) >= 0 ? p.pos : 'RB',
      teamId: p.teamId,
      price: Math.max(0, parseInt(p.price, 10) || 0),
      ts: p.ts || Date.now()
    };
  });
  s.nomIndex = clamp(parseInt(s.nomIndex, 10) || 0, 0, Math.max(0, s.teams.length - 1));
  s.timerSec = clamp(parseInt(s.timerSec, 10), 0, 600) || (s.timerSec === 0 ? 0 : 30);
  s.customPool = Array.isArray(s.customPool) ? s.customPool : null;
  return s;
}

/* Every change goes through here: snapshot for undo, persist, re-render. */
function mutate(fn) {
  var before = snapshot();
  fn();
  UNDO.push(before);
  if (UNDO.length > UNDO_MAX) UNDO.shift();
  REDO.length = 0;
  afterChange();
}

function afterChange() {
  saveNow();
  refreshPool();
  renderAll();
  broadcast();
}

function undo() {
  if (!UNDO.length) return;
  REDO.push(snapshot());
  STATE = migrate(JSON.parse(UNDO.pop()));
  afterChange();
  toast('Undone');
}
function redo() {
  if (!REDO.length) return;
  UNDO.push(snapshot());
  STATE = migrate(JSON.parse(REDO.pop()));
  afterChange();
  toast('Redone');
}

/* Other tabs of the same browser stay in step. */
var channel = null;
var muteBroadcast = false;
try {
  channel = new BroadcastChannel('ffauction');
  channel.onmessage = function (ev) {
    if (!ev.data || ev.data.type !== 'state') return;
    muteBroadcast = true;
    STATE = migrate(ev.data.state);
    refreshPool();
    renderAll();
    muteBroadcast = false;
  };
} catch (e) { channel = null; }

function broadcast() {
  if (!channel || muteBroadcast) return;
  try { channel.postMessage({ type: 'state', state: JSON.parse(snapshot()) }); } catch (e) {}
}

/* =========================================================================
 * 4. DERIVED VALUES
 * ====================================================================== */

/* The roster as an ordered list of slot labels, e.g.
 * ['QB','RB','RB','WR','WR','TE','FLEX','DST','K','BE','BE', ...] */
function slotList() {
  var out = [];
  SLOT_ORDER.forEach(function (k) {
    for (var i = 0; i < (STATE.slots[k] || 0); i++) out.push(k);
  });
  return out;
}
function rosterSize() { return slotList().length; }
function startingSlots() { return slotList().filter(function (s) { return s !== 'BE'; }); }

function eligible(pos, slot) {
  if (slot === 'BE') return true;
  if (slot === 'FLEX') return !!FLEX_OK[pos];
  return slot === pos;
}

function teamById(id) {
  for (var i = 0; i < STATE.teams.length; i++) if (STATE.teams[i].id === id) return STATE.teams[i];
  return null;
}
function picksFor(id) {
  return STATE.picks.filter(function (p) { return p.teamId === id; });
}

/* Assign each pick to a slot, in draft order: best matching starter first,
 * then FLEX, then the bench. Anything past the roster limit is 'OVER'. */
function buildLineup(picks) {
  var slots = slotList();
  var filled = slots.map(function () { return null; });
  var overflow = [];

  picks.forEach(function (pick) {
    var i;
    for (i = 0; i < slots.length; i++) {
      if (filled[i] === null && slots[i] !== 'BE' && slots[i] !== 'FLEX' && eligible(pick.pos, slots[i])) {
        filled[i] = pick; return;
      }
    }
    for (i = 0; i < slots.length; i++) {
      if (filled[i] === null && slots[i] === 'FLEX' && eligible(pick.pos, slots[i])) { filled[i] = pick; return; }
    }
    for (i = 0; i < slots.length; i++) {
      if (filled[i] === null && slots[i] === 'BE') { filled[i] = pick; return; }
    }
    overflow.push(pick);
  });

  return { slots: slots, filled: filled, overflow: overflow };
}

function teamInfo(team) {
  var picks = picksFor(team.id);
  var spent = picks.reduce(function (a, p) { return a + p.price; }, 0);
  var size = rosterSize();
  var count = picks.length;
  var open = Math.max(0, size - count);
  var left = STATE.budget - spent;
  var lineup = buildLineup(picks);

  var needs = [];
  lineup.slots.forEach(function (s, i) {
    if (s !== 'BE' && lineup.filled[i] === null) needs.push(s);
  });

  return {
    team: team, picks: picks, spent: spent, left: left, count: count, size: size, open: open,
    maxBid: open > 0 ? Math.max(0, left - (open - 1)) : 0,
    lineup: lineup, needs: needs,
    full: open === 0,
    broke: left <= 0 && open > 0
  };
}

function allTeamInfo() { return STATE.teams.map(teamInfo); }

function leagueInfo() {
  var infos = allTeamInfo();
  var totalBudget = STATE.budget * STATE.teams.length;
  var spent = infos.reduce(function (a, t) { return a + t.spent; }, 0);
  var openSlots = infos.reduce(function (a, t) { return a + t.open; }, 0);
  var totalSlots = rosterSize() * STATE.teams.length;
  var filledPct = totalSlots ? (totalSlots - openSlots) / totalSlots : 0;
  var spentPct = totalBudget ? spent / totalBudget : 0;

  return {
    infos: infos,
    totalBudget: totalBudget,
    spent: spent,
    left: totalBudget - spent,
    openSlots: openSlots,
    totalSlots: totalSlots,
    perSlot: openSlots ? (totalBudget - spent) / openSlots : 0,
    filledPct: filledPct,
    spentPct: spentPct,
    /* >1 means money is leaving the room faster than roster spots, i.e. the
     * players still on the board will go cheaper than their sticker price.
     * Meaningless off a handful of picks, so it stays null until the room has
     * filled about an eighth of its roster spots. */
    heat: filledPct >= 0.12 ? spentPct / filledPct : null,
    topBid: infos.reduce(function (a, t) { return Math.max(a, t.maxBid); }, 0)
  };
}

/* How many teams still need each starting position. */
function scarcity(infos) {
  var need = {};
  startingSlots().forEach(function (s) { need[s] = 0; });
  infos.forEach(function (t) {
    var seen = {};
    t.needs.forEach(function (s) { need[s] = (need[s] || 0) + 1; seen[s] = 1; });
  });
  return need;
}

function isDrafted(name) {
  var k = canonKey(name);
  for (var i = 0; i < STATE.picks.length; i++) {
    if (canonKey(STATE.picks[i].player) === k) return STATE.picks[i];
  }
  return null;
}

/* =========================================================================
 * 5. RENDERING
 * ====================================================================== */

function setSaveState(text, cls) {
  var el = $('#saveState');
  if (!el) return;
  el.textContent = text;
  el.className = 'save-state ' + (cls || '');
}
function showBanner(html) {
  var el = $('#banner');
  el.innerHTML = html;
  el.hidden = false;
}
function toast(msg, opts) {
  opts = opts || {};
  var wrap = $('#toasts');
  var el = document.createElement('div');
  el.className = 'toast' + (opts.bad ? ' bad' : '');
  el.innerHTML = '<span>' + esc(msg) + '</span>';
  if (opts.action) {
    var b = document.createElement('button');
    b.textContent = opts.action;
    b.onclick = function () { opts.onAction(); el.remove(); };
    el.appendChild(b);
  }
  wrap.appendChild(el);
  setTimeout(function () { el.remove(); }, opts.ms || 4200);
}
function openModal(html) {
  $('#modalBody').innerHTML = html;
  $('#modal').hidden = false;
}
function closeModal() { $('#modal').hidden = true; }

function posTag(pos) { return '<span class="pos pos-' + esc(pos) + '">' + esc(pos) + '</span>'; }

function renderAll() {
  $('#brandYear').textContent = STATE.season;
  renderScoreboard();
  renderTeamSelect();
  renderChips();
  renderTeams();
  renderFeed();
  renderMarket();
  renderNomination();
  renderBoard();
  renderPool();
  renderHistory();
  renderSetup();
  $('#btnUndo').disabled = !UNDO.length;
  $('#btnRedo').disabled = !REDO.length;
  updateEntryNote();
}

function renderScoreboard() {
  var L = leagueInfo();
  var mine = STATE.teams.filter(function (t) { return t.mine; })[0];
  var mineInfo = mine ? teamInfo(mine) : null;
  var cells = [
    ['Pick', STATE.picks.length + ' / ' + L.totalSlots],
    ['Spent', money(L.spent) + ' of ' + money(L.totalBudget)],
    ['$ / open spot', L.openSlots ? '$' + L.perSlot.toFixed(1) : '—'],
    ['Market', L.heat == null ? '<span class="muted">early</span>'
             : L.heat > 1.06 ? 'Hot +' + Math.round((L.heat - 1) * 100) + '%'
             : L.heat < 0.94 ? 'Cold −' + Math.round((1 - L.heat) * 100) + '%'
             : 'Even'],
    ['Top bid left', money(L.topBid)]
  ];
  if (mineInfo) cells.unshift([esc(mine.name) + "'s max", money(mineInfo.maxBid)]);

  $('#scoreboard').innerHTML = cells.map(function (c) {
    return '<div class="sb"><span class="sb-v">' + c[1] + '</span><span class="sb-l">' + c[0] + '</span></div>';
  }).join('');
}

function renderTeamSelect() {
  var sel = $('#inTeam');
  var keep = sel.value;
  sel.innerHTML = STATE.teams.map(function (t) {
    return '<option value="' + esc(t.id) + '">' + esc(t.name) + (t.mine ? ' (me)' : '') + '</option>';
  }).join('');
  if (keep && teamById(keep)) sel.value = keep;
}

function renderChips() {
  var cur = $('#inTeam').value;
  $('#teamChips').innerHTML = STATE.teams.map(function (t) {
    var info = teamInfo(t);
    return '<button type="button" class="chip' + (t.id === cur ? ' is-active' : '') +
      (t.mine ? ' is-mine' : '') + '" data-team="' + esc(t.id) + '" ' +
      (info.full ? 'disabled title="Roster full"' : 'title="Max bid ' + money(info.maxBid) + '"') + '>' +
      esc(t.name) + ' <span style="opacity:.7">' + money(info.maxBid) + '</span></button>';
  }).join('');
}

var teamSort = 'order';

function renderTeams() {
  var infos = allTeamInfo();
  if (teamSort === 'left') infos.sort(function (a, b) { return b.left - a.left; });
  if (teamSort === 'max') infos.sort(function (a, b) { return b.maxBid - a.maxBid; });

  $('#teamGrid').innerHTML = infos.map(function (t) {
    var pct = Math.round(100 * t.spent / Math.max(1, STATE.budget));
    var leftCls = t.left <= 0 ? ' is-out' : (t.maxBid <= 5 && t.open > 0 ? ' is-low' : '');

    var needs = t.needs.length
      ? t.needs.map(function (s) { return '<span class="need">' + esc(s) + '</span>'; }).join('')
      : '<span class="need ok">Starters set</span>';

    var rows = t.lineup.slots.map(function (slot, i) {
      var p = t.lineup.filled[i];
      if (!p) return '<div class="tc-row empty"><span class="slot">' + esc(slot) +
        '</span><span class="nm">—</span><span class="pr"></span></div>';
      return '<div class="tc-row"><span class="slot">' + esc(slot) + '</span>' +
        '<span class="nm" title="' + esc(p.player) + '">' + esc(p.player) + '</span>' +
        '<span class="pr">' + money(p.price) + '</span></div>';
    }).join('');

    var over = t.lineup.overflow.map(function (p) {
      return '<div class="tc-row"><span class="slot" style="color:var(--bad)">OVER</span>' +
        '<span class="nm">' + esc(p.player) + '</span><span class="pr">' + money(p.price) + '</span></div>';
    }).join('');

    return '<div class="team-card' + (t.team.mine ? ' is-mine' : '') + (t.full ? ' is-full' : '') + '">' +
      '<div class="tc-head"><span class="tc-name">' + esc(t.team.name) + '</span>' +
      '<span class="tc-left' + leftCls + '">' + money(t.left) + '</span></div>' +
      '<div class="tc-sub"><span>' + t.count + '/' + t.size + ' spots</span>' +
      '<span>max ' + money(t.maxBid) + '</span></div>' +
      '<div class="tc-bar' + (t.team.mine ? ' tc-mine' : '') + '"><i style="width:' + clamp(pct, 0, 100) + '%"></i></div>' +
      '<div class="tc-needs">' + needs + '</div>' +
      '<div class="tc-roster">' + rows + over + '</div>' +
      '</div>';
  }).join('');
}

function renderFeed() {
  var el = $('#pickFeed');
  $('#pickCountLabel').textContent = STATE.picks.length ? '(' + STATE.picks.length + ')' : '';
  if (!STATE.picks.length) {
    el.innerHTML = '<div class="empty-state">No picks yet. Record the first one on the left — ' +
      'or open <strong>Setup</strong> first to check the teams and budget.</div>';
    return;
  }
  var list = STATE.picks.slice().reverse();
  el.innerHTML = list.map(function (p, idx) {
    var t = teamById(p.teamId);
    var n = STATE.picks.length - idx;
    return '<div class="feed-item' + (idx === 0 ? ' is-new' : '') + '">' +
      '<span class="fi-n">' + n + '</span>' + posTag(p.pos) +
      '<span class="fi-name">' + esc(p.player) + '</span>' +
      '<span class="fi-team">' + esc(t ? t.name : '?') + '</span>' +
      '<span class="fi-price">' + money(p.price) + '</span>' +
      '<button class="fi-x" data-del="' + esc(p.id) + '" title="Remove this pick">✕</button>' +
      '</div>';
  }).join('');
}

function renderMarket() {
  var L = leagueInfo();
  var need = scarcity(L.infos);
  var cells = [
    ['Money left in room', money(L.left)],
    ['Roster spots left', L.openSlots],
    ['Avg per spot', L.openSlots ? '$' + L.perSlot.toFixed(1) : '—'],
    ['Spent', Math.round(L.spentPct * 100) + '%']
  ];
  var scarceHtml = Object.keys(need).filter(function (k) { return need[k] > 0; })
    .sort(function (a, b) { return need[b] - need[a]; })
    .map(function (k) { return '<span>' + esc(k) + ' ×' + need[k] + '</span>'; }).join('');

  $('#marketBody').innerHTML =
    '<div class="mkt">' + cells.map(function (c) {
      return '<div class="mkt-cell"><div class="mkt-v">' + c[1] + '</div><div class="mkt-l">' + c[0] + '</div></div>';
    }).join('') + '</div>' +
    (scarceHtml ? '<div class="scarce"><span style="background:none;color:var(--ink-3)">Starters still needed:</span>' +
      scarceHtml + '</div>' : '');
}

function renderNomination() {
  if (!STATE.teams.length) { $('#nomBody').innerHTML = ''; return; }
  var i = clamp(STATE.nomIndex, 0, STATE.teams.length - 1);
  var now = STATE.teams[i];
  var next = STATE.teams[(i + 1) % STATE.teams.length];
  var info = teamInfo(now);
  $('#nomBody').innerHTML =
    '<div class="nom-now">' + esc(now.name) + '</div>' +
    '<div class="nom-next">nominates · ' + money(info.maxBid) + ' max · then ' + esc(next.name) + '</div>';
}

function renderBoard() {
  var infos = allTeamInfo();
  var slots = slotList();
  var html = '<thead><tr><th></th>' + infos.map(function (t) {
    return '<th colspan="2">' + esc(t.team.name) + '</th>';
  }).join('') + '</tr></thead><tbody>';

  slots.forEach(function (slot, i) {
    var isFirstBench = slot === 'BE' && slots[i - 1] !== 'BE';
    html += '<tr' + (isFirstBench ? ' class="bench-start"' : '') + '><td class="slot-cell">' + esc(slot) + '</td>';
    infos.forEach(function (t) {
      var p = t.lineup.filled[i];
      html += '<td>' + (p ? esc(p.player) : '<span class="muted">—</span>') + '</td>' +
              '<td class="money">' + (p ? money(p.price) : '') + '</td>';
    });
    html += '</tr>';
  });

  var maxOver = infos.reduce(function (a, t) { return Math.max(a, t.lineup.overflow.length); }, 0);
  for (var k = 0; k < maxOver; k++) {
    html += '<tr><td class="slot-cell" style="color:var(--bad)">OVER</td>';
    infos.forEach(function (t) {
      var p = t.lineup.overflow[k];
      html += '<td>' + (p ? esc(p.player) : '') + '</td><td class="money">' + (p ? money(p.price) : '') + '</td>';
    });
    html += '</tr>';
  }

  html += '<tr class="total-row"><td class="slot-cell">SPENT</td>' + infos.map(function (t) {
    return '<td></td><td class="money">' + money(t.spent) + '</td>';
  }).join('') + '</tr>';
  html += '<tr class="total-row"><td class="slot-cell">LEFT</td>' + infos.map(function (t) {
    return '<td></td><td class="money">' + money(t.left) + '</td>';
  }).join('') + '</tr></tbody>';

  $('#boardTable').innerHTML = html;
}

var poolFilter = { q: '', pos: 'ALL', hideDrafted: true };

function sparkline(stats) {
  if (!stats || !stats.rows.length) return '';
  var rows = stats.rows.slice(0, 6).reverse();
  var max = Math.max.apply(null, rows.map(function (r) { return r.price || 0; })) || 1;
  return '<span class="spark" title="' + esc(rows.map(function (r) {
    return r.year + ': ' + (r.price == null ? '—' : '$' + r.price);
  }).join('  ')) + '">' + rows.map(function (r) {
    return '<i style="height:' + Math.max(2, Math.round(16 * (r.price || 0) / max)) + 'px"></i>';
  }).join('') + '</span>';
}

function renderPool() {
  var q = normName(poolFilter.q);
  var rows = POOL.filter(function (p) {
    if (poolFilter.pos !== 'ALL' && p.pos !== poolFilter.pos) return false;
    if (q && p.key.indexOf(q) === -1) return false;
    if (poolFilter.hideDrafted && isDrafted(p.name)) return false;
    return true;
  });
  rows.sort(function (a, b) { return b.sort - a.sort || a.name.localeCompare(b.name); });
  var shown = rows.slice(0, 400);

  $('#poolCount').textContent = rows.length + ' shown of ' + POOL.length +
    ' · ' + STATE.picks.length + ' drafted';

  var html = '<thead><tr><th>Pos</th><th>Player</th><th>Last</th><th>3yr avg</th><th>High</th>' +
             '<th>Trend</th><th>Status</th></tr></thead><tbody>';
  html += shown.map(function (p) {
    var d = isDrafted(p.name);
    var s = p.hist;
    var t = d ? teamById(d.teamId) : null;
    return '<tr class="' + (d ? 'is-drafted' : '') + '" data-pick="' + esc(p.name) + '" data-pos="' + esc(p.pos) + '">' +
      '<td>' + posTag(p.pos === '?' ? '—' : p.pos) + '</td>' +
      '<td class="p-name">' + esc(p.name) + '</td>' +
      '<td class="money">' + (s && s.last ? '$' + s.last.price + ' <span class="muted">' + s.last.year + '</span>' : '') + '</td>' +
      '<td class="money">' + (s && s.recentAvg != null ? '$' + s.recentAvg.toFixed(0) : '') + '</td>' +
      '<td class="money">' + (s && s.max ? '$' + s.max : '') + '</td>' +
      '<td>' + sparkline(s) + '</td>' +
      '<td>' + (d ? esc(t ? t.name : '?') + ' · ' + money(d.price) : '<span class="muted">available</span>') + '</td>' +
      '</tr>';
  }).join('');
  if (!shown.length) html += '<tr><td colspan="7" class="muted" style="padding:20px">No players match.</td></tr>';
  html += '</tbody>';
  $('#poolTable').innerHTML = html;
}

var histYear = null;

function renderHistory() {
  var seg = $('#histYearSeg');
  if (histYear == null && HISTORY.seasons.length) {
    histYear = HISTORY.seasons[HISTORY.seasons.length - 1].year;
  }
  seg.innerHTML = HISTORY.seasons.map(function (s) {
    return '<button data-year="' + s.year + '"' + (s.year === histYear ? ' class="is-active"' : '') + '>' + s.year + '</button>';
  }).join('');

  var season = HISTORY.byYear[histYear];
  if (!season) { $('#histTable').innerHTML = ''; return; }

  var maxRows = season.teams.reduce(function (a, t) { return Math.max(a, t.picks.length); }, 0);
  var html = '<thead><tr><th>#</th>' + season.teams.map(function (t) {
    return '<th colspan="2">' + esc(t.name) + '</th>';
  }).join('') + '</tr></thead><tbody>';
  for (var i = 0; i < maxRows; i++) {
    html += '<tr><td class="slot-cell">' + (season.teams[0].picks[i] ? esc(season.teams[0].picks[i].slot) : '') + '</td>';
    season.teams.forEach(function (t) {
      var p = t.picks[i];
      html += '<td>' + (p ? esc(p.name) : '') + '</td><td class="money">' +
              (p && p.price != null ? '$' + p.price : '') + '</td>';
    });
    html += '</tr>';
  }
  html += '<tr class="total-row"><td class="slot-cell">LEFT</td>' + season.teams.map(function (t) {
    return '<td></td><td class="money">' + (t.left == null ? '—' : '$' + t.left) + '</td>';
  }).join('') + '</tr></tbody>';
  $('#histTable').innerHTML = html;
}

function renderHistSearch(q) {
  var el = $('#histResult');
  if (!q || !q.trim()) { el.innerHTML = ''; return; }
  var found = histLookup(q);
  if (!found || !found.stats) {
    el.innerHTML = '<div class="card"><strong>' + esc(q) + '</strong> has never been drafted in this league.</div>';
    return;
  }
  var s = found.stats;
  el.innerHTML = '<div class="card">' +
    '<div class="card-head"><h2>' + esc(s.rows[0].raw) + '</h2>' +
    '<span class="muted">' + s.n + ' drafts · avg ' + (s.avg != null ? '$' + s.avg.toFixed(1) : '—') +
    ' · high $' + s.max + '</span></div>' +
    s.rows.map(function (r) {
      return '<div class="hist-line"><span><span class="hist-yr">' + r.year + '</span> ' +
        esc(r.team) + ' <span class="muted">· ' + esc(r.slot) + '</span></span>' +
        '<strong>' + (r.price == null ? '—' : '$' + r.price) + '</strong></div>';
    }).join('') + '</div>';
}

function renderSetup() {
  $('#setBudget').value = STATE.budget;
  $('#setYear').value = STATE.season;
  $('#setTimer').value = STATE.timerSec;

  var mine = STATE.teams.filter(function (t) { return t.mine; })[0];
  $('#setMyTeam').innerHTML = '<option value="">(none)</option>' + STATE.teams.map(function (t) {
    return '<option value="' + esc(t.id) + '"' + (mine && mine.id === t.id ? ' selected' : '') + '>' + esc(t.name) + '</option>';
  }).join('');

  $('#slotsGrid').innerHTML = SLOT_ORDER.map(function (k) {
    return '<div class="slot-in"><label>' + k + '</label>' +
      '<input type="number" min="0" max="30" step="1" data-slot="' + k + '" value="' + (STATE.slots[k] || 0) + '"></div>';
  }).join('');
  $('#slotTotal').textContent = rosterSize();

  $('#teamEditor').innerHTML = STATE.teams.map(function (t, i) {
    var info = teamInfo(t);
    return '<div class="team-edit-row"><span class="tno">' + (i + 1) + '</span>' +
      '<input type="text" data-team-name="' + esc(t.id) + '" value="' + esc(t.name) + '">' +
      '<button class="btn btn-sm btn-ghost" data-team-up="' + esc(t.id) + '" title="Move up"' +
      (i === 0 ? ' disabled' : '') + '>↑</button>' +
      '<button class="btn btn-sm btn-danger" data-team-del="' + esc(t.id) + '" title="' +
      (info.picks.length ? 'Has ' + info.picks.length + ' picks' : 'Remove') + '">✕</button></div>';
  }).join('');

  var src = STATE.customPool ? STATE.customPool.length + ' players imported from CSV (in use).'
                             : 'Using the bundled list plus every name from 2018-2025.';
  $('#importNote').innerHTML = esc(src) +
    ' CSV columns: <code>name,pos</code> — optional <code>team</code>, <code>value</code>.';
}

/* =========================================================================
 * 6. ACTIONS AND EVENTS
 * ====================================================================== */

/* --- autocomplete ------------------------------------------------------ */

var acMatches = [], acSel = -1;
var posTouched = false;

/* A name typed straight through (no dropdown click) should still land in the
 * right slot. Resolve the position from the pool unless it was chosen by hand. */
function autoPos(name) {
  if (posTouched || !name || !name.trim()) return;
  var k = fuzzyKey(name, POOL_BY_KEY);
  var p = k ? POOL_BY_KEY[k] : null;
  if (p && p.pos && p.pos !== '?') $('#inPos').value = p.pos;
}

function acSearch(q) {
  var n = normName(q);
  if (!n) return [];
  var starts = [], contains = [], i, p;
  for (i = 0; i < POOL.length; i++) {
    p = POOL[i];
    if (p.key.indexOf(n) === 0) starts.push(p);
    else if (p.key.indexOf(n) > -1) contains.push(p);
    else {
      // also match on last name beginning
      var parts = p.key.split(' ');
      if (parts.length > 1 && parts[parts.length - 1].indexOf(n) === 0) contains.push(p);
    }
  }
  function rank(a, b) { return b.sort - a.sort || a.name.length - b.name.length; }
  starts.sort(rank); contains.sort(rank);
  return starts.concat(contains).slice(0, 9);
}

function renderAc() {
  var box = $('#acList');
  if (!acMatches.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.innerHTML = acMatches.map(function (p, i) {
    var d = isDrafted(p.name);
    var s = p.hist;
    var meta = d ? 'drafted ' + money(d.price)
                 : (s && s.recentAvg != null ? 'avg $' + s.recentAvg.toFixed(0) + ' · hi $' + s.max : 'no history');
    return '<div class="ac-item' + (i === acSel ? ' is-sel' : '') + (d ? ' is-drafted' : '') + '" data-i="' + i + '">' +
      posTag(p.pos === '?' ? '—' : p.pos) +
      '<span class="ac-name">' + esc(p.name) + '</span>' +
      '<span class="ac-meta">' + esc(meta) + '</span></div>';
  }).join('');
  box.hidden = false;
}
function acClose() { acMatches = []; acSel = -1; $('#acList').hidden = true; }

function acChoose(i) {
  var p = acMatches[i];
  if (!p) return;
  $('#inPlayer').value = p.name;
  if (p.pos && p.pos !== '?') { $('#inPos').value = p.pos; posTouched = false; }
  acClose();
  updateEntryNote();
  $('#inPrice').focus();
  $('#inPrice').select();
}

/* --- entry validation / guidance --------------------------------------- */

function updateEntryNote() {
  var el = $('#entryNote');
  var name = $('#inPlayer').value.trim();
  var price = parseInt($('#inPrice').value, 10);
  var team = teamById($('#inTeam').value);
  var bits = [], cls = 'ok';

  if (name) {
    var d = isDrafted(name);
    if (d) {
      cls = 'bad';
      bits.push('<strong>' + esc(name) + '</strong> is already on ' +
        esc((teamById(d.teamId) || {}).name) + ' for ' + money(d.price) + '.');
    } else {
      var h = histLookup(name);
      if (h && h.stats && h.stats.recentAvg != null) {
        bits.push('Last ' + h.stats.n + ': avg <strong>$' + h.stats.recentAvg.toFixed(0) +
          '</strong>, high $' + h.stats.max +
          (h.stats.last ? ' (' + h.stats.last.year + ': $' + h.stats.last.price + ' to ' + esc(h.stats.last.team) + ')' : ''));
      }
    }
  }

  if (team) {
    var info = teamInfo(team);
    if (info.full) {
      cls = 'bad';
      bits.push('<strong>' + esc(team.name) + '</strong> has a full roster.');
    } else if (!isNaN(price) && price > info.maxBid) {
      cls = 'bad';
      bits.push('<strong>' + esc(team.name) + '</strong> can only bid ' + money(info.maxBid) +
        ' (' + money(info.left) + ' left, ' + info.open + ' spots to fill).');
    } else if (!isNaN(price) && price > 0 && price > info.maxBid * 0.6 && info.open > 3) {
      if (cls === 'ok') cls = 'warn';
      bits.push('Leaves ' + esc(team.name) + ' ' + money(info.left - price) +
        ' for ' + (info.open - 1) + ' more spots.');
    }
  }

  if (!bits.length) { el.hidden = true; return; }
  el.className = 'entry-note ' + cls;
  el.innerHTML = bits.join('<br>');
  el.hidden = false;
}

/* --- adding and removing picks ----------------------------------------- */

function addPick() {
  var name = $('#inPlayer').value.trim();
  autoPos(name);
  var pos = $('#inPos').value;
  var price = parseInt($('#inPrice').value, 10);
  var team = teamById($('#inTeam').value);

  if (!name) { $('#inPlayer').focus(); return toast('Enter a player name', { bad: true }); }
  if (isNaN(price) || price < 0) { $('#inPrice').focus(); return toast('Enter a price', { bad: true }); }
  if (!team) return toast('Pick a team', { bad: true });

  var info = teamInfo(team);
  if (info.full) return toast(team.name + "'s roster is already full", { bad: true });

  var dup = isDrafted(name);
  if (dup) {
    var owner = teamById(dup.teamId);
    if (!confirm(name + ' is already on ' + (owner ? owner.name : '?') + ' for $' + dup.price +
                 '.\n\nAdd them again anyway?')) return;
  }
  if (price > info.maxBid) {
    if (!confirm(team.name + ' can only bid $' + info.maxBid + ' and still fill ' + info.open +
                 ' spots at $1.\n\nRecord $' + price + ' anyway?')) return;
  }

  mutate(function () {
    STATE.picks.push({ id: uid(), player: name, pos: pos, teamId: team.id, price: price, ts: Date.now() });
    STATE.nomIndex = (STATE.nomIndex + 1) % Math.max(1, STATE.teams.length);
  });

  $('#inPlayer').value = '';
  $('#inPrice').value = '';
  posTouched = false;
  acClose();
  resetTimer();
  $('#inPlayer').focus();
  toast(name + ' → ' + team.name + ' for ' + money(price));
}

function removePick(id) {
  var p = STATE.picks.filter(function (x) { return x.id === id; })[0];
  if (!p) return;
  mutate(function () {
    STATE.picks = STATE.picks.filter(function (x) { return x.id !== id; });
  });
  toast('Removed ' + p.player, { action: 'Undo', onAction: undo });
}

/* --- timer ------------------------------------------------------------- */

var timerLeft = 0, timerHandle = null;

function paintTimer() {
  var m = Math.floor(timerLeft / 60), s = timerLeft % 60;
  var el = $('#timerDisplay');
  el.textContent = m + ':' + (s < 10 ? '0' : '') + s;
  el.className = 'timer' + (timerLeft <= 5 && timerLeft > 0 ? ' is-low' : '');
}
function resetTimer() {
  stopTimer();
  timerLeft = STATE.timerSec || 0;
  paintTimer();
}
function stopTimer() {
  if (timerHandle) clearInterval(timerHandle);
  timerHandle = null;
  $('#btnTimerStart').textContent = 'Start';
}
function startTimer() {
  if (!STATE.timerSec) return toast('Set a bid clock in Setup first');
  if (timerHandle) { stopTimer(); return; }
  if (timerLeft <= 0) timerLeft = STATE.timerSec;
  $('#btnTimerStart').textContent = 'Pause';
  timerHandle = setInterval(function () {
    timerLeft--;
    paintTimer();
    if (timerLeft <= 0) { stopTimer(); beep(); toast('Time!'); }
  }, 1000);
}
function beep() {
  try {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    var ctx = new Ctx(), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.18, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    o.connect(g); g.connect(ctx.destination); o.start();
    o.stop(ctx.currentTime + 0.62);
    setTimeout(function () { try { ctx.close(); } catch (e) {} }, 900);
  } catch (e) {}
}

/* --- import / export --------------------------------------------------- */

function download(filename, text, mime) {
  var blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
}

function csvCell(v) {
  var s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/* Wide layout that mirrors the league spreadsheet: one pos/player/price trio
 * per team with a blank spacer column between teams, so it pastes straight in. */
function boardCsv() {
  var infos = allTeamInfo();
  var slots = slotList();
  var rows = [];

  var head = [''];
  infos.forEach(function (t, i) {
    head.push(t.team.name, t.team.name, t.team.name);
    if (i < infos.length - 1) head.push('');
  });
  rows.push(head);

  var maxOver = infos.reduce(function (a, t) { return Math.max(a, t.lineup.overflow.length); }, 0);

  function line(label, cell) {
    var r = [label];
    infos.forEach(function (t, i) {
      var c = cell(t);
      r.push(c[0], c[1], c[2]);
      if (i < infos.length - 1) r.push('');
    });
    rows.push(r);
  }

  slots.forEach(function (slot, i) {
    line('', function (t) {
      var p = t.lineup.filled[i];
      return [slot, p ? p.player : '', p ? p.price : ''];
    });
  });
  for (var k = 0; k < maxOver; k++) {
    (function (k) {
      line('', function (t) {
        var p = t.lineup.overflow[k];
        return ['OVER', p ? p.player : '', p ? p.price : ''];
      });
    })(k);
  }
  line('', function (t) { return ['SPENT', '', t.spent]; });
  line('', function (t) { return ['LEFT', '', t.left]; });

  return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n');
}

function pickLogCsv() {
  var rows = [['#', 'player', 'pos', 'team', 'price', 'time']];
  STATE.picks.forEach(function (p, i) {
    var t = teamById(p.teamId);
    rows.push([i + 1, p.player, p.pos, t ? t.name : '', p.price, new Date(p.ts).toISOString()]);
  });
  return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n');
}

function parseCsv(text) {
  var rows = [], row = [], cur = '', q = false, i, c;
  text = String(text).replace(/\r\n?/g, '\n');
  for (i = 0; i < text.length; i++) {
    c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(function (r) { return r.some(function (x) { return String(x).trim(); }); });
}

function importPlayersCsv(text) {
  var rows = parseCsv(text);
  if (!rows.length) return toast('That CSV looked empty', { bad: true });

  var head = rows[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var looksLikeHeader = head.some(function (h) {
    return ['name', 'player', 'player name', 'pos', 'position'].indexOf(h) > -1;
  });
  var idx = { name: 0, pos: 1, team: -1, value: -1 };
  if (looksLikeHeader) {
    head.forEach(function (h, i) {
      if (h === 'name' || h === 'player' || h === 'player name') idx.name = i;
      else if (h === 'pos' || h === 'position') idx.pos = i;
      else if (h === 'team' || h === 'nfl team' || h === 'tm') idx.team = i;
      else if (['value', 'auction', 'auction value', 'price', 'adp', 'rank'].indexOf(h) > -1) idx.value = i;
    });
    rows = rows.slice(1);
  }

  var out = [], bad = 0;
  rows.forEach(function (r) {
    var name = String(r[idx.name] || '').trim();
    if (!name) { bad++; return; }
    var pos = String(r[idx.pos] || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (pos === 'D' || pos === 'DEF' || pos === 'DST' || pos === 'DEFENSE') pos = 'DST';
    if (pos === 'PK') pos = 'K';
    if (POSITIONS.indexOf(pos) === -1) pos = '?';
    var val = idx.value > -1 ? parseFloat(String(r[idx.value]).replace(/[^0-9.]/g, '')) : NaN;
    out.push({ name: name, pos: pos, team: idx.team > -1 ? String(r[idx.team] || '').trim() : '',
               value: isNaN(val) ? null : val });
  });

  if (!out.length) return toast('No player names found in that CSV', { bad: true });
  mutate(function () { STATE.customPool = out; });
  toast('Imported ' + out.length + ' players' + (bad ? ' (' + bad + ' rows skipped)' : ''));
}

function exportJson() {
  var payload = {
    exportedAt: new Date().toISOString(),
    app: 'auction-draft-tracker',
    state: JSON.parse(snapshot())
  };
  download('draft-' + STATE.season + '-' + new Date().toISOString().slice(0, 10) + '.json',
           JSON.stringify(payload, null, 2), 'application/json');
  toast('Backup downloaded');
}

function importJson(text) {
  var data;
  try { data = JSON.parse(text); } catch (e) { return toast('That file is not valid JSON', { bad: true }); }
  var s = data && data.state ? data.state : data;
  if (!s || !Array.isArray(s.teams)) return toast('That file is not a draft backup', { bad: true });
  if (STATE.picks.length && !confirm('Replace the current draft (' + STATE.picks.length +
      ' picks) with this backup (' + ((s.picks || []).length) + ' picks)?')) return;
  mutate(function () { STATE = migrate(s); });
  toast('Backup restored');
}

/* --- events ------------------------------------------------------------ */

function switchTab(name) {
  $$('.tab').forEach(function (b) { b.classList.toggle('is-active', b.dataset.tab === name); });
  $$('.panel').forEach(function (p) { p.hidden = p.dataset.panel !== name; });
  try { localStorage.setItem('ffauction.tab', name); } catch (e) {}
}

function wire() {
  $$('.tab').forEach(function (b) {
    b.onclick = function () { switchTab(b.dataset.tab); };
  });

  /* entry form */
  var inPlayer = $('#inPlayer');
  inPlayer.addEventListener('input', function () {
    acMatches = acSearch(inPlayer.value);
    acSel = acMatches.length ? 0 : -1;
    renderAc();
    autoPos(inPlayer.value);
    updateEntryNote();
  });
  inPlayer.addEventListener('keydown', function (e) {
    if (!acMatches.length) return;
    if (e.key === 'ArrowDown') { acSel = (acSel + 1) % acMatches.length; renderAc(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { acSel = (acSel - 1 + acMatches.length) % acMatches.length; renderAc(); e.preventDefault(); }
    else if (e.key === 'Enter' && acSel > -1) { acChoose(acSel); e.preventDefault(); }
    else if (e.key === 'Escape') acClose();
  });
  inPlayer.addEventListener('blur', function () {
    autoPos(inPlayer.value);
    updateEntryNote();
    setTimeout(acClose, 160);
  });
  $('#acList').addEventListener('mousedown', function (e) {
    var it = e.target.closest('.ac-item');
    if (it) { e.preventDefault(); acChoose(parseInt(it.dataset.i, 10)); }
  });

  $('#inPrice').addEventListener('input', updateEntryNote);
  $('#inTeam').addEventListener('change', function () { renderChips(); updateEntryNote(); });
  $('#inPos').addEventListener('change', function () { posTouched = true; updateEntryNote(); });
  $('#pickForm').addEventListener('submit', function (e) { e.preventDefault(); addPick(); });

  $('#teamChips').addEventListener('click', function (e) {
    var c = e.target.closest('.chip');
    if (!c) return;
    $('#inTeam').value = c.dataset.team;
    renderChips();
    updateEntryNote();
  });

  $('#pickFeed').addEventListener('click', function (e) {
    var b = e.target.closest('[data-del]');
    if (b) removePick(b.dataset.del);
  });

  $('#teamSortSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    teamSort = b.dataset.sort;
    $$('#teamSortSeg button').forEach(function (x) { x.classList.toggle('is-active', x === b); });
    renderTeams();
  });

  /* nomination + timer */
  $('#btnNomSkip').onclick = function () {
    mutate(function () { STATE.nomIndex = (STATE.nomIndex + 1) % Math.max(1, STATE.teams.length); });
    resetTimer();
  };
  $('#btnTimerStart').onclick = startTimer;
  $('#btnTimerReset').onclick = resetTimer;

  /* undo / redo */
  $('#btnUndo').onclick = undo;
  $('#btnRedo').onclick = redo;

  /* pool */
  $('#poolSearch').addEventListener('input', function () { poolFilter.q = this.value; renderPool(); });
  $('#poolHideDrafted').addEventListener('change', function () { poolFilter.hideDrafted = this.checked; renderPool(); });
  $('#poolPosSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    poolFilter.pos = b.dataset.pos;
    $$('#poolPosSeg button').forEach(function (x) { x.classList.toggle('is-active', x === b); });
    renderPool();
  });
  $('#poolTable').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-pick]');
    if (!tr) return;
    switchTab('draft');
    $('#inPlayer').value = tr.dataset.pick;
    if (tr.dataset.pos && tr.dataset.pos !== '?') { $('#inPos').value = tr.dataset.pos; posTouched = false; }
    updateEntryNote();
    $('#inPrice').focus();
  });

  /* history */
  $('#histSearch').addEventListener('input', function () { renderHistSearch(this.value); });
  $('#histYearSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    histYear = parseInt(b.dataset.year, 10);
    renderHistory();
  });

  /* setup */
  $('#setBudget').addEventListener('change', function () {
    var v = parseInt(this.value, 10);
    if (isNaN(v) || v < 1) { this.value = STATE.budget; return; }
    mutate(function () { STATE.budget = v; });
  });
  $('#setYear').addEventListener('change', function () {
    var v = parseInt(this.value, 10);
    if (isNaN(v)) { this.value = STATE.season; return; }
    mutate(function () { STATE.season = v; });
  });
  $('#setTimer').addEventListener('change', function () {
    var v = clamp(parseInt(this.value, 10) || 0, 0, 600);
    mutate(function () { STATE.timerSec = v; });
    resetTimer();
  });
  $('#setMyTeam').addEventListener('change', function () {
    var id = this.value;
    mutate(function () { STATE.teams.forEach(function (t) { t.mine = t.id === id; }); });
  });
  $('#slotsGrid').addEventListener('change', function (e) {
    var inp = e.target.closest('[data-slot]');
    if (!inp) return;
    var k = inp.dataset.slot, v = clamp(parseInt(inp.value, 10) || 0, 0, 30);
    mutate(function () { STATE.slots[k] = v; });
  });
  $('#teamEditor').addEventListener('change', function (e) {
    var inp = e.target.closest('[data-team-name]');
    if (!inp) return;
    var id = inp.dataset.teamName, v = inp.value.trim() || 'Team';
    mutate(function () { var t = teamById(id); if (t) t.name = v; });
  });
  $('#teamEditor').addEventListener('click', function (e) {
    var up = e.target.closest('[data-team-up]');
    if (up) {
      var i = STATE.teams.findIndex(function (t) { return t.id === up.dataset.teamUp; });
      if (i > 0) mutate(function () {
        var tmp = STATE.teams[i - 1]; STATE.teams[i - 1] = STATE.teams[i]; STATE.teams[i] = tmp;
      });
      return;
    }
    var del = e.target.closest('[data-team-del]');
    if (del) {
      var id = del.dataset.teamDel, t = teamById(id);
      var n = picksFor(id).length;
      if (STATE.teams.length <= 1) return toast('Keep at least one team', { bad: true });
      if (n && !confirm('Remove ' + t.name + ' and their ' + n + ' picks?')) return;
      mutate(function () {
        STATE.teams = STATE.teams.filter(function (x) { return x.id !== id; });
        STATE.picks = STATE.picks.filter(function (p) { return p.teamId !== id; });
        STATE.nomIndex = clamp(STATE.nomIndex, 0, STATE.teams.length - 1);
      });
    }
  });
  $('#btnAddTeam').onclick = function () {
    mutate(function () {
      STATE.teams.push({ id: 't' + uid(), name: 'Team ' + (STATE.teams.length + 1), mine: false });
    });
  };

  /* data */
  $('#btnExportJson').onclick = exportJson;
  $('#btnExportCsv').onclick = $('#btnExportCsv2').onclick = function () {
    download('draft-board-' + STATE.season + '.csv', boardCsv(), 'text/csv');
    download('draft-picks-' + STATE.season + '.csv', pickLogCsv(), 'text/csv');
    toast('Board and pick log downloaded');
  };
  $('#btnPrint').onclick = function () { window.print(); };
  $('#fileJson').addEventListener('change', function () {
    var f = this.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () { importJson(r.result); };
    r.readAsText(f);
    this.value = '';
  });
  $('#filePlayersCsv').addEventListener('change', function () {
    var f = this.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () { importPlayersCsv(r.result); };
    r.readAsText(f);
    this.value = '';
  });
  $('#btnResetPicks').onclick = function () {
    if (!STATE.picks.length) return toast('Nothing to clear');
    if (!confirm('Delete all ' + STATE.picks.length + ' picks? Teams and settings stay.')) return;
    mutate(function () { STATE.picks = []; STATE.nomIndex = 0; });
    toast('Picks cleared', { action: 'Undo', onAction: undo });
  };
  $('#btnResetAll').onclick = function () {
    if (!confirm('Reset teams, settings and every pick back to defaults?')) return;
    mutate(function () { STATE = defaultState(); });
    toast('Reset', { action: 'Undo', onAction: undo });
  };

  /* modal */
  $('#modalClose').onclick = closeModal;
  $('#modal').addEventListener('click', function (e) { if (e.target === this) closeModal(); });

  /* keyboard */
  document.addEventListener('keydown', function (e) {
    var mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if (e.key === 'Escape') { closeModal(); acClose(); return; }
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (e.key === '/') { e.preventDefault(); switchTab('draft'); $('#inPlayer').focus(); }
  });

  /* do not let a stray tab close take the draft with it */
  window.addEventListener('beforeunload', function (e) {
    if (!STATE.picks.length || storageOK) return;
    e.preventDefault();
    e.returnValue = '';
  });
}

/* --- boot -------------------------------------------------------------- */

function init() {
  var had = loadSaved();
  refreshPool();
  wire();
  renderAll();
  resetTimer();

  var tab = 'draft';
  try { tab = localStorage.getItem('ffauction.tab') || 'draft'; } catch (e) {}
  if ($$('.panel[data-panel="' + tab + '"]').length) switchTab(tab);

  if (!had) {
    setSaveState('Saved', '');
    toast('New draft ready — check Setup if your teams or budget have changed', { ms: 6000 });
  } else {
    toast('Restored ' + STATE.picks.length + ' picks from this browser', { ms: 3000 });
  }
  $('#inPlayer').focus();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
