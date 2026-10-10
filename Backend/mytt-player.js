// myTT player backend: auth cookie handling, file cache, TTR profile, season aggregation.
// Cross-league (+Pokal) careers come from the SQLite DB filled by warm.js;
// single-league live aggregation stays as fallback for unwarm leagues.
// Auth: single shared Premium cookie (sb-10-auth-token), server-side only, auto-refreshed by
// visiting myTT (no password/captcha needed). Never send the cookie to the frontend.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getScore, pickRating } = require('./scoring');
const db = require('./db');

const BACKEND_DIR = __dirname;
const ENV_PATH = path.join(BACKEND_DIR, '.env');
const COOKIE_FILE = path.join(BACKEND_DIR, 'sb-10-auth-token');
const CACHE_DIR = path.join(BACKEND_DIR, 'cache');

const UA_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'de-DE,de;q=0.9'
};

// Lightweight authed probe that answers with a fresh Set-Cookie (observed in browser Network tab).
const REFRESH_URLS = [
  'https://www.mytischtennis.de/api/statistics/self/ttr-summary?_data=routes%2Fapi%2B%2Fstatistics%2B%2F%24player_id.ttr-summary',
  'https://www.mytischtennis.de/community?show=everything'
];
const REFRESH_INTERVAL_MS = 50 * 60 * 1000;
const TTR_CACHE_MS = 12 * 60 * 60 * 1000;
const LEAGUE_CACHE_MS = 60 * 60 * 1000;
const PLAYER_CACHE_MS = 30 * 60 * 1000;

// ---------- .env handling (no extra dependency) ----------
function loadEnvFile() {
  try {
    const text = fs.readFileSync(ENV_PATH, 'utf-8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  } catch { /* no .env yet */ }
}

function persistCookieToEnv(cookie) {
  try {
    let text = '';
    try { text = fs.readFileSync(ENV_PATH, 'utf-8'); } catch { /* create */ }
    if (/^MYTT_COOKIE=/m.test(text)) {
      text = text.replace(/^MYTT_COOKIE=.*/m, 'MYTT_COOKIE=' + cookie);
    } else {
      if (text && !text.endsWith('\n')) text += '\n';
      text += 'MYTT_COOKIE=' + cookie + '\n';
    }
    fs.writeFileSync(ENV_PATH, text, 'utf-8');
  } catch (e) {
    console.error('[mytt] could not persist cookie to .env:', e.message);
  }
}

// ---------- cookie jar (memory, seeded from .env or legacy file) ----------
loadEnvFile();
// Defensive: users paste with prefixes/quotes/whitespace. Never log the value itself.
function cleanCookie(v) {
  return String(v || '').trim()
    .replace(/^sb-10-auth-token=/i, '')
    .replace(/^"+|"+$/g, '')
    .replace(/^'+|'+$/g, '')
    .trim();
}

let cookieJar = cleanCookie(process.env.MYTT_COOKIE || '');
if (!cookieJar) {
  try { cookieJar = cleanCookie(fs.readFileSync(COOKIE_FILE, 'utf-8')); } catch { /* none */ }
}
let lastRefresh = 0;
let refreshTimer = null;

function hasCookie() {
  return !!cookieJar;
}

function setCookieJar(cookie, persist = true) {
  cookie = cleanCookie(cookie);
  if (!cookie || cookie === cookieJar) return false;
  // Persist-guard: never adopt (or store) implausible values. A real session
  // blob is ~2KB; anything much shorter is a fragment or garbage and would
  // permanently poison .env + the shared store if persisted.
  if (cookie.length < 500) {
    console.log(`[mytt] refusing to adopt implausible cookie (len ${cookie.length}, need >= 500) - keeping current session.`);
    return false;
  }
  if (!cookie.startsWith('base64-')) {
    console.log('[mytt] note: adopted cookie has unexpected shape (no base64- prefix).');
  }
  const prevLen = (cookieJar || '').length;
  cookieJar = cookie;
  process.env.MYTT_COOKIE = cookie;
  if (persist) {
    persistCookieToEnv(cookie);
    persistSessionToDb(cookie); // shared store (Supabase meta), best-effort
  }
  lastRefresh = Date.now();
  console.log(`[mytt] session adopted (len ${prevLen} -> ${cookie.length}).`);
  return true;
}

// Best-effort mirror of the live session into the shared Supabase store so
// restarts/redeploys (and the single-instance rule) never fall back to a
// stale config-file copy. Never throws.
function persistSessionToDb(cookie) {
  try {
    if (!db.available()) return;
    db.metaSet('mytt-session', JSON.stringify({ v: cookie, at: Date.now() })).catch(() => {});
  } catch { /* best-effort */ }
}

function sessionHash(v) {
  return crypto.createHash('sha256').update(String(v)).digest('hex').slice(0, 16);
}

// Newest-wins sync between the config-file cookie (operator paste = newest by
// definition) and the shared store (holds newer rotations). Rules:
// - env/file value differs from the last env-sourced push -> fresh paste: wins, pushes.
// - env/file value unchanged since last push (stale dashboard copy) -> shared store wins.
// - no env/file value -> shared store wins if present.
// Only hashes are compared/logged, never cookie bytes.
async function syncSessionWithDb() {
  try {
    if (!db.available()) return;
    const [storedRaw, lastEnvHash] = await Promise.all([
      db.metaGet('mytt-session').catch(() => null),
      db.metaGet('mytt-session-env-hash').catch(() => null)
    ]);
    let stored = null;
    try { stored = storedRaw ? JSON.parse(storedRaw) : null; } catch { stored = null; }
    const envHash = cookieJar ? sessionHash(cookieJar) : '';
    if (cookieJar && envHash !== lastEnvHash) {
      await db.metaSet('mytt-session', JSON.stringify({ v: cookieJar, at: Date.now() })).catch(() => {});
      await db.metaSet('mytt-session-env-hash', envHash).catch(() => {});
      console.log('[mytt] session: operator cookie adopted as newest, shared.');
    } else if (stored && stored.v && stored.v !== cookieJar) {
      cookieJar = stored.v;
      process.env.MYTT_COOKIE = stored.v;
      console.log('[mytt] session: restored newer shared session from Supabase.');
    }
  } catch (e) {
    console.log('[mytt] session sync skipped:', e.message);
  }
}

function cookieHeader() {
  return `sb-10-auth-token=${cookieJar}`;
}

// Cookie names seen in a response's Set-Cookie headers (names only, never values).
function setCookieNames(res) {
  try {
    let raw = [];
    if (typeof res.headers.getSetCookie === 'function') raw = res.headers.getSetCookie();
    else if (typeof res.headers.raw === 'function') raw = res.headers.raw()['set-cookie'] || [];
    else { const s = res.headers.get('set-cookie'); if (s) raw = [s]; }
    return raw.map(e => String(e).split('=')[0]);
  } catch { return []; }
}

// Classify a redirect destination into myTT's known gates (read from their
// route manifest: /verify = bot/captcha check, /blocked = block,
// /login = dead-session bounce). Substring match on purpose (relative or
// absolute Location values both work).
function classifyRedirect(location) {
  const loc = String(location || '');
  if (!loc) return 'redirect-no-location';
  if (loc.includes('/blocked')) return 'redirect-blocked';
  if (loc.includes('/verify')) return 'redirect-verify(challenge)';
  if (loc.includes('/login')) return 'redirect-login(dead-session)';
  let path = loc;
  try { path = new URL(loc, 'https://www.mytischtennis.de').pathname; } catch { /* keep raw */ }
  return `redirect:${path.slice(0, 60)}`;
}

// Final URL info for followed redirects (fetch follows by default here, so a
// dead session or challenge arrives as HTML at a different path).
function followedRedirectInfo(res) {
  try {
    if (res && res.redirected && res.url) {
      return { redirected: true, finalPath: new URL(res.url).pathname, shape: classifyRedirect(res.url) };
    }
  } catch { /* ignore */ }
  return { redirected: !!(res && res.redirected), finalPath: null, shape: null };
}

// Body shape for diagnostics (no user data, no secret values).
function bodyShape(body, text) {
  if (body && typeof body === 'object') {
    if (body.error) {
      const e = typeof body.error === 'object' ? (body.error.code || 'object') : String(body.error).slice(0, 40);
      return `json-error:${e}`;
    }
    return `json-keys:${Object.keys(body).slice(0, 4).join(',') || '(empty-object)'}`;
  }
  if (!text) return 'empty';
  if (/^\s*</.test(text)) {
    return /captcha|challenge|turnstile/i.test(text.slice(0, 2000)) ? 'html-challenge-ish' : 'html';
  }
  return 'non-json';
}

// Last refresh diagnostics (metadata only). Powers /admin/mytt-status and the
// startup/scheduled logs so the next failure is a one-line read.
let lastRefreshDiag = null;

function updateCookieFromResponse(res) {
  try {
    let raw = [];
    if (typeof res.headers.getSetCookie === 'function') {
      raw = res.headers.getSetCookie();
    } else if (typeof res.headers.raw === 'function') {
      raw = res.headers.raw()['set-cookie'] || [];
    } else {
      const single = res.headers.get('set-cookie');
      if (single) raw = [single];
    }
    for (const entry of raw) {
      const m = String(entry).match(/sb-10-auth-token=([^;]+)/);
      if (m && m[1] && m[1] !== cookieJar) {
        // Empty values (cookie-clearing responses like `sb-10-auth-token=; Max-Age=0`)
        // never match [^;]+, so a logout can never poison the jar here.
        setCookieJar(m[1]);
        console.log('[mytt] auth cookie refreshed via set-cookie.');
        return 'rotated';
      }
    }
    // Re-issued unchanged value still proves liveness (but never adopts empties).
    const same = raw.some(e => {
      const mm = String(e).match(/sb-10-auth-token=([^;]*)/);
      return mm && mm[1] && mm[1] === cookieJar;
    });
    if (same) {
      lastRefresh = Date.now();
      return 'same';
    }
  } catch (e) {
    console.error('[mytt] set-cookie parse failed:', e.message);
  }
  return false;
}

// One-line failure reason for logs (no secrets, no bodies). Attached to every
// myttFetchJson failure return so callers (warm, status) can name the cause.
function fetchFailureReason(r) {
  if (!r) return 'no-result';
  if (r.rateLimited) return 'rate-limited';
  if (r.authError) return 'auth-error';
  if (r.networkError) return `network-error:${(r.message || '').slice(0, 80)}`;
  if (r.badJson) return `bad-json(status=${r.status ?? '?'})`;
  if (r.empty) return `empty(status=${r.status ?? '?'})`;
  if (r.status) return `http-${r.status}`;
  return 'unknown-shape';
}

// Retryable without human help (blips, myTT hiccups). Auth errors are fatal
// instead: retrying a dead session is pointless by definition.
function isTransientFailure(r) {
  if (!r || r.ok) return false;
  if (r.authError) return false;
  if (r.rateLimited || r.networkError || r.empty || r.badJson) return true;
  return Number(r.status) >= 500;
}

// ---------- myTT fetch wrapper ----------
function isAuthErrorBody(body) {
  if (!body || typeof body !== 'object') return false;
  if (body.error === 'Not authorized') return true;
  if (body.error && typeof body.error === 'object' && body.error.code === 'PT403') return true;
  return false;
}

async function myttFetchJson(url, { auth = false, timeoutMs = 20000 } = {}) {
  const headers = { ...UA_HEADERS };
  if (auth && cookieJar) headers['Cookie'] = cookieHeader();
  let res;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    console.log(`[mytt] fetch network error (${(e && e.name) || 'unknown'}): ${url}`);
    return { ok: false, networkError: true, shape: 'fetch-failed', reason: `network-error:${((e && e.message) || '').slice(0, 80)}`, message: e.message };
  }
  updateCookieFromResponse(res);
  const redir = followedRedirectInfo(res);
  const redirSuffix = redir.redirected && redir.finalPath ? ` -> ${redir.finalPath}` : '';
  if (res.status === 204) {
    console.log(`[mytt] fetch 204 empty: ${url}`);
    return { ok: false, empty: true, shape: 'empty-204', reason: 'empty-204', status: 204 };
  }
  if (res.status === 429) {
    console.log(`[mytt] fetch 429 rate-limited: ${url}`);
    return { ok: false, rateLimited: true, shape: 'rate-limited', reason: 'rate-limited', status: 429, redirected: redir.redirected, finalPath: redir.finalPath };
  }
  const text = await res.text().catch(() => '');
  if (!text) {
    console.log(`[mytt] fetch empty body status=${res.status}: ${url}${redirSuffix}`);
    return { ok: false, empty: true, shape: redir.shape || 'empty', reason: `empty(status=${res.status})`, status: res.status, redirected: redir.redirected, finalPath: redir.finalPath };
  }
  let body = null;
  try { body = JSON.parse(text); } catch {
    const shape = redir.shape || bodyShape(null, text);
    console.log(`[mytt] fetch non-JSON body status=${res.status} shape=${shape}: ${url}${redirSuffix}`);
    return { ok: false, badJson: true, shape, reason: `bad-json(status=${res.status})`, status: res.status, redirected: redir.redirected, finalPath: redir.finalPath };
  }
  if (!res.ok) {
    const shape = (body == null && redir.shape) || bodyShape(body, text);
    console.log(`[mytt] fetch !ok status=${res.status} shape=${shape}: ${url}${redirSuffix}`);
    return { ok: false, status: res.status, shape, reason: `http-${res.status}`, body, redirected: redir.redirected, finalPath: redir.finalPath };
  }
  if (isAuthErrorBody(body)) {
    console.log(`[mytt] fetch auth-error: ${url}`);
    return { ok: false, authError: true, shape: 'auth-error', reason: 'auth-error', status: res.status, body };
  }
  return { ok: true, status: res.status, body };
}

// True only if the body proves an authenticated session: no error object and
// user-specific data present. Fails closed on unknown shapes (reports dead while
// working, never ok while dead) - HTTP status alone proves nothing with myTT.
function looksAuthed(body) {
  if (!body || typeof body !== 'object') return false;
  if (body.error) return false;
  return body.data !== undefined || body.ttr !== undefined;
}

async function refreshProbe(url, idx = 0) {
  // Raw probe: a Set-Cookie rotation counts even when the body isn't JSON
  // (e.g. the community HTML page).
  // Redirects are NOT followed here (redirect:'manual'): the Location header
  // tells us exactly which gate fired (/verify = challenge, /blocked = block,
  // /login = dead session) instead of all three arriving as anonymous HTML.
  const diag = { urlIndex: idx, fetchError: null, status: null, setCookieNames: [], redirectTo: null, bodyShape: null, decision: 'failed' };
  const headers = { ...UA_HEADERS };
  if (cookieJar) headers['Cookie'] = cookieHeader();
  let res;
  try {
    res = await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(20000) });
  } catch (e) {
    diag.fetchError = (e && e.name) || 'fetch-failed';
    diag.decision = 'failed-fetch';
    pushProbeDiag(diag);
    return { rotated: false, authed: false, diag };
  }
  diag.status = res.status;
  diag.setCookieNames = setCookieNames(res);
  const rotation = updateCookieFromResponse(res);
  if (rotation) {
    diag.decision = rotation === 'same' ? 'reissued-same' : 'rotated';
    pushProbeDiag(diag);
    return { rotated: true, authed: true, diag };
  }
  if (res.status >= 300 && res.status < 400) {
    diag.redirectTo = classifyRedirect(res.headers.get('location'));
    diag.decision = 'redirected';
    pushProbeDiag(diag);
    return { rotated: false, authed: false, diag };
  }
  const text = await res.text().catch(() => '');
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  diag.bodyShape = bodyShape(body, text);
  if (isAuthErrorBody(body)) {
    diag.decision = 'auth-error';
    pushProbeDiag(diag);
    return { rotated: false, authed: false, authError: true, diag };
  }
  if (res.ok && looksAuthed(body)) {
    diag.decision = 'authed';
    pushProbeDiag(diag);
    return { rotated: false, authed: true, diag };
  }
  pushProbeDiag(diag);
  return { rotated: false, authed: false, diag };
}

function pushProbeDiag(diag) {
  try {
    if (!lastRefreshDiag || !Array.isArray(lastRefreshDiag.probes)) {
      lastRefreshDiag = { at: new Date().toISOString(), probes: [] };
    }
    lastRefreshDiag.probes.push(diag);
  } catch { /* diagnostics must never break auth */ }
}

function logRefreshSummary(ok) {
  const parts = (lastRefreshDiag && lastRefreshDiag.probes || []).map(p =>
    `url${p.urlIndex}:status=${p.status ?? '-'}:shape=${p.bodyShape ?? '-'}${p.redirectTo ? `:to=${p.redirectTo}` : ''}:cookies=[${(p.setCookieNames || []).join('|') || '-'}]:${p.decision}${p.fetchError ? `:fetch=${p.fetchError}` : ''}`);
  console.log(`[mytt] cookie refresh ${ok ? 'ok' : 'FAILED - manual cookie needed'} (${parts.join(' ') || 'no probes'})`);
}

// Single-flight: overlapping triggers (startup + timer + TTR retry) share one
// run instead of racing each other into refresh-token conflicts.
let refreshInFlight = null;
function refreshMyttCookie() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    if (!cookieJar) return false;
    lastRefreshDiag = { at: new Date().toISOString(), probes: [] };
    for (let i = 0; i < REFRESH_URLS.length; i++) {
      const r = await refreshProbe(REFRESH_URLS[i], i);
      if (r.rotated || r.authed) {
        lastRefresh = Date.now();
        logRefreshSummary(true);
        return true;
      }
      // No premature break: an auth-looking answer on the first URL can be
      // endpoint-specific; the second URL may still rotate. A truly dead
      // session fails both probes anyway.
    }
    logRefreshSummary(false);
    return false;
  })().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

function ensureAutoRefresh() {
  if (refreshTimer || !cookieJar) return;
  refreshTimer = setInterval(async () => {
    try {
      const ok = await refreshMyttCookie();
      console.log(`[mytt] scheduled cookie refresh: ${ok ? 'ok' : 'FAILED - manual cookie needed'}`);
    } catch (e) {
      console.error('[mytt] scheduled refresh error:', e.message);
    }
  }, REFRESH_INTERVAL_MS);
  if (typeof refreshTimer.unref === 'function') refreshTimer.unref();
}

// ---------- file cache ----------
function ensureCacheDir() {
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch { /* exists */ }
}

function cachePath(name) {
  return path.join(CACHE_DIR, name.replace(/[^A-Za-z0-9_.-]/g, '_') + '.json');
}

function readCache(name, maxAgeMs) {
  try {
    const raw = JSON.parse(fs.readFileSync(cachePath(name), 'utf-8'));
    if (maxAgeMs !== Infinity && Date.now() - raw.savedAt > maxAgeMs) return null;
    return raw.data;
  } catch { return null; }
}

function writeCache(name, data) {
  try {
    ensureCacheDir();
    fs.writeFileSync(cachePath(name), JSON.stringify({ savedAt: Date.now(), data }), 'utf-8');
  } catch (e) {
    console.error('[mytt] cache write failed:', e.message);
  }
}

// ---------- public meeting data (no auth needed) ----------
async function fetchMeetingRaw(meetingId, { forceLive = false } = {}) {
  const key = `meeting-${meetingId}`;
  if (!forceLive) {
    const cached = readCache(key, Infinity);
    // Finished meetings are immutable -> cache forever. Open ones revalidate after 10 min.
    if (cached && cached.is_completed) return { data: cached, fromCache: true };
    if (cached) {
      try {
        const age = Date.now() - JSON.parse(fs.readFileSync(cachePath(key), 'utf-8')).savedAt;
        if (age < 10 * 60 * 1000) return { data: cached, fromCache: true };
      } catch { /* refetch */ }
    }
  }
  const r = await myttFetchJson(`https://www.mytischtennis.de/api/meeting/${meetingId}/live`);
  if (!r.ok || !r.body || !r.body.data) {
    const reason = r.reason || fetchFailureReason(r);
    return { data: null, rateLimited: !!r.rateLimited, reason, transient: isTransientFailure(r), fatal: !!r.authError };
  }
  writeCache(key, r.body.data);
  return { data: r.body.data, fromCache: false };
}

// League schedule (same source as GET /liga). Flat game list for aggregation.
function normalizeLeagueMeetings(rawMeetings, headInfos) {
  return rawMeetings.flatMap(dayObject => {
    const [[, matchesArray]] = Object.entries(dayObject);
    if (!Array.isArray(matchesArray)) return [];
    return matchesArray.map(m => ({
      meetingId: m.meeting_id,
      date: m.date,
      state: m.state === 'done' ? 'done' : 'scheduled',
      homeName: m.team_home,
      awayName: m.team_away,
      homeTeamId: m.team_home_id,
      awayTeamId: m.team_away_id,
      homeClubId: m.team_home_club_id,
      awayClubId: m.team_away_club_id,
      homeScore: m.matches_won,
      awayScore: m.matches_lost
    }));
  }).sort((a, b) => new Date(a.date) - new Date(b.date));
}

async function fetchLeagueGames(team, { forceLive = false } = {}) {
  const filter = team.filter || 'gesamt';
  const key = `league-${team.groupId}-${filter}`;
  if (!forceLive) {
    const cached = readCache(key, LEAGUE_CACHE_MS);
    if (cached) return { games: cached.games, leagueName: cached.leagueName, fromCache: true };
  }
  const url = `https://www.mytischtennis.de/click-tt/${team.association}/${team.season}/ligen/${team.league_slug}/gruppe/${team.groupId}/spielplan/${filter}?_data=routes%2Fclick-tt%2B%2F%24association%2B%2F%24season%2B%2F%24type%2B%2F%24groupname.gruppe.%24urlid%2B%2Fspielplan.%24filter`;
  const r = await myttFetchJson(url);
  if (!r.ok || !r.body || !r.body.data) {
    const reason = r.reason || fetchFailureReason(r);
    return { games: null, rateLimited: !!r.rateLimited, reason, transient: isTransientFailure(r), fatal: !!r.authError };
  }
  const games = normalizeLeagueMeetings(r.body.data.meetings || [], r.body.data.head_infos || {});
  const leagueName = (r.body.data.head_infos || {}).league_name || '';
  writeCache(key, { games, leagueName });
  return { games, leagueName, fromCache: false };
}

// ---------- player computation ----------
function findParticipation(match, personId) {
  let side = null;
  let playerId = null;
  let firstName = '', lastName = '';
  for (const g of match) {
    for (const slot of ['mm_player11', 'mm_player12']) {
      const p = g[slot];
      if (p && p.person_id === personId) {
        side = 'home'; playerId = p.player_id; firstName = p.firstname; lastName = p.lastname;
      }
    }
    for (const slot of ['mm_player21', 'mm_player22']) {
      const p = g[slot];
      if (p && p.person_id === personId) {
        side = 'away'; playerId = p.player_id; firstName = p.firstname; lastName = p.lastname;
      }
    }
    if (side) break;
  }
  return side ? { side, playerId, firstName, lastName } : null;
}

function countGames(match, personId, side) {
  // Siege/Niederlagen count EVERY game (Einzel + Doppel), win from the player's side.
  let wins = 0, losses = 0, singleWins = 0, singleLosses = 0, doubleWins = 0, doubleLosses = 0;
  for (const g of match) {
    const slots = side === 'home'
      ? [g.mm_player11, g.mm_player12]
      : [g.mm_player21, g.mm_player22];
    const ids = slots.filter(Boolean).map(p => p.person_id);
    if (!ids.includes(personId)) continue;
    const homeWon = (g.matches_home || 0) > (g.matches_guest || 0);
    const won = side === 'home' ? homeWon : !homeWon;
    if (g.game_type === 'double') { won ? doubleWins++ : doubleLosses++; }
    else { won ? singleWins++ : singleLosses++; }
    won ? wins++ : losses++;
  }
  return { wins, losses, singleWins, singleLosses, doubleWins, doubleLosses };
}

function computePlayerMeeting(data, personId) {
  const part = findParticipation(data.match || [], personId);
  if (!part) return null;
  const score = getScore(data.match, { player_id: part.playerId }, part.side);
  const cnt = countGames(data.match, personId, part.side);
  const home = part.side === 'home';
  return {
    meetingId: data.meeting_id,
    date: data.start_date || data.scheduled,
    season: data.season_nickname || '',
    league: data.group_name || '',
    side: part.side,
    firstName: part.firstName,
    lastName: part.lastName,
    clubId: home ? data.team_home_club_nr : data.team_guest_club_nr,
    teamName: home ? data.team_home : data.team_guest,
    opponentName: home ? data.team_guest : data.team_home,
    opponentClubId: home ? data.team_guest_club_nr : data.team_home_club_nr,
    teamHome: data.matches_home,
    teamAway: data.matches_guest,
    playerScore: score,
    ...cnt
  };
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      try { results[idx] = await fn(items[idx], idx); }
      catch (e) { results[idx] = { __error: e.message }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function getPlayerSeason(personId, team) {
  const key = `player-${team.groupId}-${personId}`;
  const cached = readCache(key, PLAYER_CACHE_MS);
  if (cached) return { ...cached, fromCache: true };

  const league = await fetchLeagueGames(team);
  if (!league.games) return { error: league.rateLimited ? 'rate-limited' : 'league-unavailable' };
  const done = league.games.filter(g => g.state === 'done');
  const raws = await mapPool(done, 4, g => fetchMeetingRaw(g.meetingId));

  const played = [];
  for (let k = 0; k < done.length; k++) {
    const raw = raws[k] && raws[k].data;
    if (!raw || !Array.isArray(raw.match)) continue;
    const pm = computePlayerMeeting(raw, personId);
    if (pm) played.push(pm);
  }
  played.sort((a, b) => new Date(a.date) - new Date(b.date));

  const total = played.reduce((s, m) => s + m.playerScore, 0);
  const siege = played.reduce((s, m) => s + m.wins, 0);
  const niederlagen = played.reduce((s, m) => s + m.losses, 0);
  const result = {
    personId,
    groupId: String(team.groupId),
    leagueName: league.leagueName,
    matchesPlayed: played.length,
    teamMeetingsDone: done.length,
    total,
    avg: played.length ? Math.round(total / played.length) : 0,
    best: played.length ? Math.max(...played.map(m => m.playerScore)) : 0,
    siege,
    niederlagen,
    matches: played
  };
  writeCache(key, result);
  return { ...result, fromCache: false };
}

// ---------- TTR profile (auth required) ----------
function splitName(personName, fallbackFirst, fallbackLast) {
  if (personName && personName.includes(',')) {
    const [last, first] = personName.split(',').map(s => s.trim());
    return { firstName: first || fallbackFirst || '', lastName: last || fallbackLast || '' };
  }
  return { firstName: fallbackFirst || '', lastName: fallbackLast || personName || '' };
}

async function getPlayerProfile(nuid) {
  // TTR rule (team decision): a stored TTR is fresh if it was saved after the
  // last 05:00 UTC (= 07:00 CEST). Supabase first, then the ephemeral file
  // cache with the same cutoff. Only a viewed player's TTR is ever fetched.
  if (db.available()) {
    try {
      const dbCached = await db.getTtr(nuid);
      if (dbCached && db.ttrIsFresh(dbCached.updatedAt)) return { ...dbCached, fromCache: true };
    } catch { /* fall through to live */ }
  }
  const key = `ttr-${nuid}`;
  try {
    const raw = JSON.parse(require('fs').readFileSync(cachePath(key), 'utf-8'));
    if (raw && raw.data && db.ttrIsFresh(raw.savedAt)) return { ...raw.data, fromCache: true };
  } catch { /* refetch */ }
  if (!cookieJar) return { ok: false, needLogin: true, reason: 'no-cookie' };

  async function load() {
    const [h, d] = await Promise.all([
      myttFetchJson(`https://www.mytischtennis.de/api/ttr/history/${nuid}`, { auth: true }),
      myttFetchJson(`https://www.mytischtennis.de/api/statistics/${nuid}/ttr/last_3_months`, { auth: true })
    ]);
    return { h, d };
  }

  let { h, d } = await load();
  if ((h && h.authError) || (d && d.authError)) {
    // Session expired -> one silent refresh via normal page visit, then retry once.
    await refreshMyttCookie();
    ({ h, d } = await load());
  }
  if ((h && h.authError) || (d && d.authError) || (h && h.rateLimited)) {
    return { ok: false, needLogin: !!(h && h.authError), rateLimited: !!(h && h.rateLimited) };
  }
  if (!h || !h.ok || !h.body) return { ok: false, reason: 'history-unavailable' };

  const hb = h.body;
  let lastGame = null;
  for (let i = (hb.event || []).length - 1; i >= 0; i--) {
    const e = hb.event[i];
    if ((e.match_count || 0) > 0 && e.type !== 'correction') {
      lastGame = { delta: e.ttr_delta, name: e.event_name, date: e.event_date_time };
      break;
    }
  }
  const delta = d && d.ok && d.body && d.body.data ? d.body.data : null;
  const { firstName, lastName } = splitName(hb.person_name);
  const profile = {
    ok: true,
    ttrAuth: true,
    personId: hb.person_id || nuid,
    firstName,
    lastName,
    clubName: hb.club_name || '',
    ttr: hb.ttr ?? null,
    maxTtr: hb.max_ttr ?? null,
    ttrDate: hb.ttr_date || null,
    lastGame,
    delta3m: delta ? { start: delta.start, end: delta.end, delta: delta.delta } : null
  };
  writeCache(key, profile);
  if (db.available()) {
    try { await db.setTtr(nuid, profile); } catch { /* ephemeral, ignore */ }
    // Append-only snapshot for point-in-time scoring (history, not latest).
    try { if (profile.ttr != null) await db.recordTtrSnapshot(nuid, profile.ttr); } catch { /* ignore */ }
  }
  return { ...profile, fromCache: false };
}

// ---------- Q-TTR fallback (public, no login) ----------
// The player popup answers Q-TTR (but TTR:null) without a session. Q-TTR is
// published quarterly (Feb/May/Aug/Dec 11th + 1 grace day, see qttrCutoffMs);
// a stored value is kept until the next cutoff, then refilled lazily.
const QTTR_FILE_TTL_MS = 90 * 24 * 3600 * 1000;

async function fetchQttr(nuid) {
  if (db.available()) {
    try {
      const stored = await db.getQttr(nuid);
      if (stored && db.qttrIsFresh(stored.updatedAt)) return { qttr: stored.qttr, fromCache: true };
    } catch { /* fall through to live */ }
  }
  const key = `qttr-${nuid}`;
  const cached = readCache(key, QTTR_FILE_TTL_MS);
  if (cached && cached.qttr != null) return { qttr: cached.qttr, fromCache: true };
  const r = await myttFetchJson(`https://www.mytischtennis.de/api/player-popup/${encodeURIComponent(nuid)}`);
  const qttr = r.ok && r.body && r.body.player ? r.body.player.qttr : null;
  if (qttr == null) {
    // Live failed: serve stale stored value if any (better than nothing).
    try {
      const stored = db.available() ? await db.getQttr(nuid) : null;
      if (stored) return { qttr: stored.qttr, fromCache: true, stale: true };
    } catch { /* ignore */ }
    // Classify so batch runs can report WHY players stay unknown:
    // unpublished Q-TTR (new players), myTT backend errors on the profile,
    // throttling, or transport failures. No secrets or bodies in reasons.
    let reason;
    if (r.rateLimited) reason = 'rate-limited';
    else if (r.ok && r.body && r.body.player && r.body.player.qttr == null) reason = 'no-qttr-published';
    else if (r.body && r.body.error) reason = `backend-error:${String(r.body.error).slice(0, 60)}`;
    else reason = r.reason || 'fetch-failed';
    return { qttr: null, rateLimited: !!r.rateLimited, reason };
  }
  writeCache(key, { qttr });
  if (db.available()) {
    try { await db.setQttr(nuid, qttr); } catch { /* ephemeral, ignore */ }
  }
  return { qttr, fromCache: false };
}

// person_ids appearing anywhere in a match's four player slots.
function distinctPersonIds(match) {
  const set = new Set();
  for (const g of match || []) {
    for (const s of ['mm_player11', 'mm_player12', 'mm_player21', 'mm_player22']) {
      if (g[s] && g[s].person_id) set.add(g[s].person_id);
    }
  }
  return [...set];
}

// Fill missing fed_rank slots from point-in-time ratings so getScore sees
// values. Chain per match date (team decision): match-time fed_rank first,
// then the stored official snapshot nearest the date (±45d), then the Q-TTR
// valid at the date (history, current stored as fallback), else none.
// Returns a copied match plus per-person {source, value, vintage} for
// ttr_source bookkeeping. scoring.js itself stays pure I/O-free.
async function resolveMatchRatings(match, matchDate) {
  const sources = {};
  const filled = (match || []).map(g => {
    const copy = { ...g };
    for (const s of ['mm_player11', 'mm_player12', 'mm_player21', 'mm_player22']) {
      if (copy[s]) copy[s] = { ...copy[s] };
    }
    return copy;
  });
  const ids = distinctPersonIds(match);
  let tHist = {}, qHist = {}, qCur = {};
  if (db.available() && ids.length) {
    try {
      const [th, qh, qc] = await Promise.all([
        db.getTtrHistoryNear(ids, matchDate),
        db.getQttrHistoryAt(ids, matchDate),
        db.getQttrs(ids)
      ]);
      tHist = th; qHist = qh; qCur = qc;
    } catch { tHist = {}; qHist = {}; qCur = {}; }
  }
  const fedOf = (pid) => {
    for (const g of match || []) {
      for (const s of ['mm_player11', 'mm_player12', 'mm_player21', 'mm_player22']) {
        if (g[s] && g[s].person_id === pid) return g[s].fed_rank;
      }
    }
    return null;
  };
  const picked = {};
  for (const pid of ids) {
    const t = tHist[pid];
    const qh = qHist[pid];
    const qc = qCur[pid];
    // History vintage first (qh is an OBJECT — extract its number; passing
    // the object itself yields NaN and silently kills the branch); current
    // stored Q-TTR only as flagged fallback.
    let q = (qh && qh.qttr != null) ? qh.qttr : null;
    let qVintage = (qh && qh.qttr != null) ? qh.vintage : null;
    if (q == null && qc && qc.qttr != null) {
      const ts = Number(qc.updatedAt);
      q = qc.qttr;
      qVintage = Number.isFinite(ts) ? new Date(ts).toISOString().slice(0, 10) : null;
    }
    picked[pid] = pickRating({
      fedRank: fedOf(pid),
      matchDate,
      official: t ? t.ttr : null, officialAt: t ? t.fetchedAt : 0,
      qttr: q, qttrVintage: qVintage
    });
    sources[pid] = picked[pid];
  }
  for (const g of filled) {
    for (const s of ['mm_player11', 'mm_player12', 'mm_player21', 'mm_player22']) {
      const p = g[s];
      if (p && p.person_id && picked[p.person_id] && picked[p.person_id].value !== null) {
        p.fed_rank = picked[p.person_id].value;
      }
    }
  }
  return { match: filled, sources };
}

// Background Q-TTR fill for a set of players (meeting modal / player view):
// fetch whatever is missing or past-cutoff, store it. Never throws, never
// blocks a response (scoring consumes only stored values; the correction
// window heals recent matches retroactively).
async function fillQttrsBackground(personIds) {
  try {
    const ids = [...new Set((personIds || []).map(String))].filter(Boolean);
    if (!ids.length) return { filled: 0 };
    let qttrs = {};
    try { qttrs = db.available() ? await db.getQttrs(ids) : {}; } catch { qttrs = {}; }
    const missing = ids.filter(pid => {
      const q = qttrs[pid];
      return !q || !db.qttrIsFresh(q.updatedAt);
    });
    let filled = 0;
    for (const pid of missing) {
      try {
        const r = await fetchQttr(pid);
        if (r && r.qttr != null) filled++;
      } catch { /* ignore single-player failures */ }
    }
    if (missing.length) console.log(`[mytt] qttr background fill: ${filled}/${missing.length} stored.`);
    return { filled };
  } catch { return { filled: 0 }; }
}

function validNuid(nuid) {
  return typeof nuid === 'string' && /^[A-Za-z0-9-]{2,20}$/.test(nuid);
}

// Shown only in the player statistics when myTT blocks us.
const RATE_LIMIT_MSG = 'Error 429: you have reached your limit of updating statistics. Try again in one hour.';

// Minimal fill for a career miss: fetch only the schedules of the club's
// leagues known to the server, diff against stored meetings, and fetch +
// store just the missing done meetings (all persons, so everyone's bars
// benefit). Returns the career or { rateLimited: true }.
async function fillMissingCareer(nuid, clubId, season, getTeams) {
  const teams = getTeams().filter(t => db.normalizeSeason(t.season).season === season);
  if (!teams.length) return null;
  let filled = false;
  for (const team of teams) {
    const league = await fetchLeagueGames(team);
    if (!league.games) {
      if (league.rateLimited) return { rateLimited: true };
      continue;
    }
    try { await db.upsertLeague(String(team.groupId), league.leagueName || '', season, 'league', league.games, team.filter || 'gesamt'); } catch { /* ignore */ }
    const doneIds = league.games.filter(g => g.state === 'done').map(g => String(g.meetingId));
    let existing = new Set();
    try { existing = await db.getExistingRawMeetingIds(doneIds); } catch { /* refetch all */ }
    const missing = league.games.filter(g => g.state === 'done' && !existing.has(String(g.meetingId)));
    for (const g of missing) {
      const fetched = await fetchMeetingRaw(g.meetingId);
      if (!fetched.data || !Array.isArray(fetched.data.match)) {
        if (fetched.rateLimited) return { rateLimited: true };
        continue;
      }
      const raw = fetched.data;
      try {
        await db.upsertMeeting({
          meeting_id: String(g.meetingId), group_id: String(team.groupId),
          date: raw.start_date || g.date, state: 'done',
          home_club: raw.team_home_club_nr ? String(raw.team_home_club_nr) : null,
          away_club: raw.team_guest_club_nr ? String(raw.team_guest_club_nr) : null,
          home_name: raw.team_home || g.homeName || '', away_name: raw.team_guest || g.awayName || '',
          team_home_score: raw.matches_home ?? g.homeScore ?? null,
          team_away_score: raw.matches_guest ?? g.awayScore ?? null,
          season, competition: 'league', raw, frozen: false
        });
        const persons = distinctPersonIds(raw.match);
        const { match: filledMatch, sources } = await resolveMatchRatings(raw.match, raw.start_date || g.date).catch(() => ({ match: raw.match, sources: {} }));
        const filledRaw = { ...raw, match: filledMatch };
        const rows = [];
        for (const pid of persons) {
          const pm = computePlayerMeeting(filledRaw, pid);
          if (!pm) continue;
          const src = sources[pid] || {};
          rows.push({
            person_id: pid, meeting_id: String(g.meetingId), side: pm.side,
            player_score: pm.playerScore, wins: pm.wins, losses: pm.losses,
            single_wins: pm.singleWins, single_losses: pm.singleLosses,
            double_wins: pm.doubleWins, double_losses: pm.doubleLosses,
            first_name: pm.firstName, last_name: pm.lastName,
            club_id: pm.clubId ? String(pm.clubId) : null, team_name: pm.teamName,
            opponent_name: pm.opponentName, opponent_club: pm.opponentClubId ? String(pm.opponentClubId) : null,
            date: pm.date, season, competition: 'league',
            ttr_source: src.source || 'none',
            rating_value: src.value ?? null,
            rating_vintage: src.vintage || null
          });
        }
        await db.upsertAppearances(rows);
        filled = true;
      } catch { /* ignore single-meeting failures */ }
    }
  }
  if (!filled) return null;
  try {
    const includePokal = true;
    return await db.attachTeamScores(await db.getCareer(nuid, season, includePokal));
  } catch { return null; }
}

// ---------- routes ----------
function registerPlayerRoutes(app, getTeams) {
  ensureAutoRefresh();
  // Shared session first (Supabase newest-wins), then refresh on top, so a
  // redeployed/restarted server resumes rotations instead of a stale file copy.
  syncSessionWithDb().catch(() => {}).finally(() => {
    // fire-and-forget refresh on startup so an expired access token heals itself
    if (cookieJar) refreshMyttCookie().catch(() => {}).then(ok => {
      if (ok !== undefined) console.log(`[mytt] startup cookie refresh: ${ok ? 'ok' : 'failed'}`);
    });
  });

  app.get('/player/:nuid/profile', async (req, res) => {
    const nuid = String(req.params.nuid || '');
    if (!validNuid(nuid)) return res.status(400).send({ error: 'Invalid player id.' });
    try {
      const p = await getPlayerProfile(nuid);
      if (p.needLogin) return res.status(401).send({ error: 'myTT login required (cookie expired).', needLogin: true });
      if (p.rateLimited) return res.status(429).send({ error: RATE_LIMIT_MSG });
      if (!p.ok) return res.status(502).send({ error: 'Failed to load TTR profile.' });
      res.send(p);
    } catch (e) {
      console.error(`Error player profile ${nuid}:`, e);
      res.status(500).send({ error: `Failed to load profile ${nuid}` });
    }
  });

  app.get('/player/:nuid/season', async (req, res) => {
    const nuid = String(req.params.nuid || '');
    const groupId = String(req.query.groupId || '');
    if (!validNuid(nuid)) return res.status(400).send({ error: 'Invalid player id.' });
    if (!groupId) return res.status(400).send({ error: 'Missing groupId query param.' });
    const team = getTeams().find(t => String(t.groupId) === groupId);
    if (!team) return res.status(404).send({ error: `No league with groupId ${groupId} in teams[].` });
    try {
      const s = await getPlayerSeason(nuid, team);
      if (s.error === 'rate-limited') return res.status(429).send({ error: RATE_LIMIT_MSG });
      if (s.error) return res.status(502).send({ error: 'Failed to load league data.' });
      res.send(s);
    } catch (e) {
      console.error(`Error player season ${nuid}:`, e);
      res.status(500).send({ error: `Failed to load season ${nuid}` });
    }
  });

  // Whole-season career across all warmed teams of a club (leagues + Pokal).
  // Supabase-first, zero myTT calls when warmed. On a miss, only the missing
  // done meetings are fetched (minimal fill). 429 is surfaced with the
  // user-facing message; everything else degrades silently.
  app.get('/player/:nuid/career', async (req, res) => {
    const nuid = String(req.params.nuid || '');
    if (!validNuid(nuid)) return res.status(400).send({ error: 'Invalid player id.' });
    if (!db.available()) return res.status(404).send({ error: 'Career store unavailable.', notWarmed: true });
    const { season } = db.normalizeSeason(req.query.season || '');
    if (!season) return res.status(400).send({ error: 'Missing season query param.' });
    const includePokal = req.query.includePokal !== '0';
    const clubId = String(req.query.clubId || '');
    try {
      const [profile, stored, qttr] = await Promise.all([
        getPlayerProfile(nuid).catch(() => ({ ok: false, reason: 'profile-error' })),
        db.attachTeamScores(await db.getCareer(nuid, season, includePokal)).catch(() => null),
        fetchQttr(nuid).catch(() => ({ qttr: null }))
      ]);
      let career = stored;
      if (!career && clubId) {
        const filled = await fillMissingCareer(nuid, clubId, season, getTeams).catch(() => null);
        if (filled && filled.rateLimited) return res.status(429).send({ error: RATE_LIMIT_MSG });
        career = filled || null;
      }
      if (!career) return res.status(404).send({ error: 'Player not in warmed data yet.', notWarmed: true });
      const profileRateLimited = profile && profile.rateLimited;
      res.send({
        personId: nuid,
        season,
        leagueName: `Saison ${season} · alle Teams`,
        ttrAuth: !!(profile && profile.ok),
        profile: profile && profile.ok ? profile : null,
        profileError: profile && !profile.ok
          ? (profile.needLogin ? 'needLogin' : (profile.rateLimited ? 'rateLimited' : (profile.reason || 'unavailable')))
          : null,
        // Public Q-TTR fallback for display (bare 'Q-TTR' label in frontend
        // when no official profile.ttr exists). Null when unknown.
        qttr: qttr && qttr.qttr != null ? qttr.qttr : null,
        season: {
          ...career,
          leagueName: '',
          teamMeetingsDone: undefined,
          fromCache: true,
          fromDb: true
        }
      });
    } catch (e) {
      console.error(`Error player career ${nuid}:`, e);
      res.status(500).send({ error: `Failed to load career ${nuid}` });
    }
  });

  // Combined call for the player view: scores always work, TTR part degrades gracefully.
  app.get('/player/:nuid/full', async (req, res) => {
    const nuid = String(req.params.nuid || '');
    const groupId = String(req.query.groupId || '');
    if (!validNuid(nuid)) return res.status(400).send({ error: 'Invalid player id.' });
    if (!groupId) return res.status(400).send({ error: 'Missing groupId query param.' });
    const team = getTeams().find(t => String(t.groupId) === groupId);
    if (!team) return res.status(404).send({ error: `No league with groupId ${groupId} in teams[].` });
    try {
      const [profile, season, qttr] = await Promise.all([
        getPlayerProfile(nuid).catch(() => ({ ok: false, reason: 'profile-error' })),
        getPlayerSeason(nuid, team),
        fetchQttr(nuid).catch(() => ({ qttr: null }))
      ]);
      if (season.error === 'rate-limited') return res.status(429).send({ error: RATE_LIMIT_MSG });
      if (season.error) return res.status(502).send({ error: 'Failed to load league data.' });
      res.send({
        personId: nuid,
        groupId,
        leagueName: season.leagueName || '',
        ttrAuth: !!(profile && profile.ok),
        profile: profile && profile.ok ? profile : null,
        profileError: profile && !profile.ok ? (profile.needLogin ? 'needLogin' : (profile.reason || 'unavailable')) : null,
        qttr: qttr && qttr.qttr != null ? qttr.qttr : null,
        season
      });
    } catch (e) {
      console.error(`Error player full ${nuid}:`, e);
      res.status(500).send({ error: `Failed to load player ${nuid}` });
    }
  });

  app.get('/admin/mytt-status', async (req, res) => {
    if (!cookieJar) return res.send({ configured: false });
    const r = await myttFetchJson(REFRESH_URLS[0], { auth: true, timeoutMs: 15000 });
    res.send({
      configured: true,
      probeOk: !!r.ok,
      authError: !!r.authError,
      rateLimited: !!r.rateLimited,
      status: r.status || null,
      networkError: !!r.networkError,
      bodyShape: r.shape || null,
      redirected: !!r.redirected,
      finalPath: r.finalPath || null,
      cookieLen: (cookieJar || '').length,
      lastRefresh: lastRefresh ? new Date(lastRefresh).toISOString() : null,
      lastRefreshDiag
    });
  });

  // Trusted-users only (same trust level as the whole app): paste a fresh cookie without restart.
  // Note: express.json() is already applied globally in server.js.
  app.post('/admin/mytt-cookie', async (req, res) => {
    const c = cleanCookie(req.body && req.body.cookie);
    if (!c || c.length < 50) return res.status(400).send({ error: 'Invalid cookie.' });
    setCookieJar(c);
    ensureAutoRefresh();
    const ok = await refreshMyttCookie();
    res.send({ success: true, probeOk: !!ok });
  });

  // Stops THIS server process (lets you kill a stale instance holding the port).
  app.post('/admin/shutdown', (req, res) => {
    res.send({ shuttingDown: true });
    console.log('[mytt] shutdown requested via /admin/shutdown, exiting.');
    setTimeout(() => process.exit(0), 300);
  });
}

module.exports = {
  registerPlayerRoutes,
  getPlayerProfile,
  getPlayerSeason,
  fetchMeetingRaw,
  fetchLeagueGames,
  fetchQttr,
  distinctPersonIds,
  resolveMatchRatings,
  fillQttrsBackground,
  computePlayerMeeting,
  myttFetchJson,
  refreshMyttCookie,
  hasCookie
};
