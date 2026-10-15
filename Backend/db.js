// Must run before process.env is read below (SUPABASE_URL / KEY).
require('./env');

// Supabase/Postgres store for cross-league (+Pokal) player data.
// Replaces the local SQLite file: every read/write goes over the web to
// Supabase via @supabase/supabase-js using the service_role key (server-side
// only — never expose it to the browser).
//
// Local runs pick up Backend/.env (see env.js); hosting uses real env vars.
//
// Conventions (fixed by team decision):
// * "German time" means fixed CEST = UTC+2, so TTR values expire at 05:00 UTC
//   daily (07:00 CEST) and the nightly warm runs at 01:00 UTC (03:00 CEST).
// * updated_at stores milliseconds since epoch (BIGINT in Postgres).
// * Done meetings are re-fetched for 2 days to catch myTT corrections, then
//   frozen forever (see `frozen` flag on meetings).

let createClient = null;
try {
  ({ createClient } = require('@supabase/supabase-js'));
} catch {
  createClient = null; // dependency not installed -> callers fall back
}

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

let client = null;

function getClient() {
  if (!available()) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return client;
}

function available() {
  return !!(createClient && SUPABASE_URL && SUPABASE_KEY);
}

// Central write path: Supabase errors are logged with table + operation so a
// failing nightly warm goes red with the real reason (missing table, RLS
// denial, bad key) instead of silently storing nothing.
async function write(op, table, query) {
  try {
    const { error } = await query;
    if (error) {
      console.error(`[db] ${op} "${table}" failed: ${error.message || error}`);
      return { ok: false, error: error.message || String(error) };
    }
    return { ok: true };
  } catch (e) {
    console.error(`[db] ${op} "${table}" threw: ${e.message || e}`);
    return { ok: false, error: e.message || String(e) };
  }
}

// Probe used by warm.js preflight and smoke tests: verifies the schema exists
// AND this key may write. Returns { ok, error }.
async function preflightWrite() {
  const sb = getClient();
  if (!sb) return { ok: false, error: 'Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing).' };
  const probeKey = 'preflight-write-probe';
  const w = await write('upsert', 'meta', sb.from('meta').upsert({ k: probeKey, v: 'ok' }, { onConflict: 'k' }));
  if (!w.ok) return w;
  const { data, error } = await sb.from('meta').select('v').eq('k', probeKey).maybeSingle();
  if (error || !data) {
    const msg = error ? error.message : 'probe row missing after write';
    console.error(`[db] preflight read-back "meta" failed: ${msg}`);
    return { ok: false, error: msg };
  }
  await sb.from('meta').delete().eq('k', probeKey);
  return { ok: true };
}

// Last 05:00 UTC (07:00 CEST). A TTR stored after this is still fresh.
function ttrCutoffMs(nowMs = Date.now()) {
  const d = new Date(nowMs);
  const cutoff = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 5, 0, 0, 0);
  return nowMs >= cutoff ? cutoff : cutoff - 24 * 3600 * 1000;
}

function ttrIsFresh(updatedAtMs, nowMs = Date.now()) {
  return Number(updatedAtMs || 0) > ttrCutoffMs(nowMs);
}

// Q-TTR publication dates (day after the official 11th = 1 grace day for
// late publishing on myTT side), fixed UTC. A stored Q-TTR is valid until
// the next cutoff passes.
const QTTR_CUTOFFS = [[2, 12], [5, 12], [8, 12], [12, 12]];

function qttrCutoffMs(nowMs = Date.now()) {
  const d = new Date(nowMs);
  const y = d.getUTCFullYear();
  const cuts = QTTR_CUTOFFS.map(([mo, day]) => Date.UTC(y, mo - 1, day));
  let last = Date.UTC(y - 1, 11, 12);
  for (const c of cuts) {
    if (nowMs >= c) last = c;
  }
  return last;
}

function qttrIsFresh(updatedAtMs, nowMs = Date.now()) {
  return Number(updatedAtMs || 0) > qttrCutoffMs(nowMs);
}

// Done meetings older than this are frozen and never re-fetched.
const CORRECTION_WINDOW_MS = 2 * 24 * 3600 * 1000;

// season normalization: "26--27" -> "26/27", "P 26/27" -> {season:"26/27", competition:"pokal"}
function normalizeSeason(input) {
  const s = String(input || '').trim();
  const competition = /^p\s/i.test(s) ? 'pokal' : 'league';
  const m = s.replace(/^p\s+/i, '').replace('--', '/');
  return { season: m, competition };
}

function now() {
  return Date.now();
}

function asObject(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}

async function metaGet(key) {
  const sb = getClient();
  if (!sb) return null;
  const { data, error } = await sb.from('meta').select('v').eq('k', key).maybeSingle();
  if (error || !data) return null;
  return data.v;
}

async function metaSet(key, value) {
  const sb = getClient();
  if (!sb) return;
  await write('upsert', 'meta', sb.from('meta').upsert({ k: key, v: String(value) }, { onConflict: 'k' }));
}

async function upsertClub(clubId, name, org) {
  const sb = getClient();
  if (!sb) return;
  await write('upsert', 'clubs', sb.from('clubs').upsert(
    { club_id: String(clubId), name: name || '', org: org || '', updated_at: now() },
    { onConflict: 'club_id' }
  ));
}

async function upsertTeam(t) {
  const sb = getClient();
  if (!sb) return;
  await write('upsert', 'teams', sb.from('teams').upsert(
    {
      team_id: t.team_id, club_id: t.club_id, group_id: t.group_id,
      team_name: t.team_name || '', league_name: t.league_name || '',
      season: t.season || '', competition: t.competition || 'league', updated_at: now()
    },
    { onConflict: 'team_id' }
  ));
}

async function upsertLeague(groupId, leagueName, season, competition, schedule, filter = 'gesamt') {
  const sb = getClient();
  if (!sb) return;
  await write('upsert', 'leagues', sb.from('leagues').upsert(
    {
      group_id: String(groupId), filter: filter || 'gesamt',
      league_name: leagueName || '', season: season || '',
      competition: competition || 'league', schedule_json: schedule || null, updated_at: now()
    },
    { onConflict: 'group_id,filter' }
  ));
}

// Updates only the schedule payload of a league (used by live refresh in server.js).
async function updateLeagueSchedule(groupId, schedule, leagueName, filter = 'gesamt') {
  const sb = getClient();
  if (!sb) return;
  const patch = { schedule_json: schedule || null, updated_at: now() };
  if (leagueName) patch.league_name = leagueName;
  await write('update', 'leagues', sb.from('leagues').update(patch)
    .eq('group_id', String(groupId)).eq('filter', filter || 'gesamt'));
}

async function getLeague(groupId, filter = 'gesamt') {
  const sb = getClient();
  if (!sb) return null;
  const { data, error } = await sb.from('leagues')
    .select('*').eq('group_id', String(groupId)).eq('filter', filter || 'gesamt').maybeSingle();
  if (error || !data) return null;
  return { ...data, schedule: asObject(data.schedule_json) };
}

// Batch schedules for several leagues (one round trip). Used by /matchdays + /liga.
async function getSchedulesByGroups(groupIds, filter = 'gesamt') {
  const sb = getClient();
  if (!sb) return {};
  const ids = [...new Set((groupIds || []).map(String))].filter(Boolean);
  if (!ids.length) return {};
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const { data, error } = await sb.from('leagues')
      .select('group_id, league_name, season, competition, schedule_json, updated_at')
      .in('group_id', chunk).eq('filter', filter || 'gesamt');
    if (error) continue;
    for (const row of data || []) {
      out[row.group_id] = { ...row, schedule: asObject(row.schedule_json) };
    }
  }
  return out;
}

async function upsertMeeting(m) {
  const sb = getClient();
  if (!sb) return;
  await write('upsert', 'meetings', sb.from('meetings').upsert(
    {
      meeting_id: String(m.meeting_id), group_id: m.group_id ? String(m.group_id) : null,
      date: m.date || null, state: m.state || null,
      home_club: m.home_club != null ? String(m.home_club) : null,
      away_club: m.away_club != null ? String(m.away_club) : null,
      home_name: m.home_name || '', away_name: m.away_name || '',
      team_home_score: m.team_home_score ?? null, team_away_score: m.team_away_score ?? null,
      season: m.season || '', competition: m.competition || 'league',
      raw_json: m.raw || null,
      frozen: !!m.frozen,
      updated_at: now()
    },
    { onConflict: 'meeting_id' }
  ));
}

async function getMeeting(meetingId) {
  const sb = getClient();
  if (!sb) return null;
  const { data, error } = await sb.from('meetings').select('*').eq('meeting_id', String(meetingId)).maybeSingle();
  if (error || !data) return null;
  return { ...data, raw: asObject(data.raw_json) };
}

function appearanceRow(a) {
  const source = ['ttr', 'fed', 'qttr'].includes(a.ttr_source) ? a.ttr_source : 'none';
  return {
    person_id: String(a.person_id), meeting_id: String(a.meeting_id), side: a.side || null,
    player_score: a.player_score ?? null,
    wins: a.wins || 0, losses: a.losses || 0,
    single_wins: a.single_wins || 0, single_losses: a.single_losses || 0,
    double_wins: a.double_wins || 0, double_losses: a.double_losses || 0,
    first_name: a.first_name || '', last_name: a.last_name || '',
    club_id: a.club_id != null ? String(a.club_id) : null,
    team_name: a.team_name || '', opponent_name: a.opponent_name || '',
    opponent_club: a.opponent_club != null ? String(a.opponent_club) : null,
    date: a.date || null, season: a.season || '', competition: a.competition || 'league',
    ttr_source: source,
    rating_value: a.rating_value ?? null,
    rating_vintage: a.rating_vintage || null
  };
}

async function upsertAppearance(a) {
  const sb = getClient();
  if (!sb) return;
  await write('upsert', 'appearances', sb.from('appearances').upsert(appearanceRow(a), { onConflict: 'person_id,meeting_id' }));
}

async function upsertAppearances(list) {
  const sb = getClient();
  if (!sb || !list.length) return;
  for (let i = 0; i < list.length; i += 200) {
    const chunk = list.slice(i, i + 200).map(appearanceRow);
    await write('upsert', 'appearances', sb.from('appearances').upsert(chunk, { onConflict: 'person_id,meeting_id' }));
  }
}

// Whole-season career across all warmed teams of a season (league + Pokal).
async function getCareer(personId, season, includePokal = true) {
  const sb = getClient();
  if (!sb) return null;
  let q = sb.from('appearances').select('*').eq('person_id', String(personId)).eq('season', String(season));
  if (!includePokal) q = q.eq('competition', 'league');
  const { data, error } = await q;
  if (error || !data || !data.length) return null;
  const rows = [...data].sort((a, b) => new Date(a.date) - new Date(b.date));
  const total = rows.reduce((s, r) => s + (r.player_score || 0), 0);
  return {
    personId: String(personId),
    season: String(season),
    matchesPlayed: rows.length,
    total,
    avg: Math.round(total / rows.length),
    best: Math.max(...rows.map(r => r.player_score || 0)),
    siege: rows.reduce((s, r) => s + (r.wins || 0), 0),
    niederlagen: rows.reduce((s, r) => s + (r.losses || 0), 0),
    matches: rows.map(r => ({
      meetingId: r.meeting_id,
      date: r.date,
      season,
      competition: r.competition,
      league: '', // filled by attachTeamScores from leagues table
      side: r.side,
      firstName: r.first_name,
      lastName: r.last_name,
      clubId: r.club_id,
      teamName: r.team_name,
      opponentName: r.opponent_name,
      opponentClubId: r.opponent_club,
      teamHome: null, // filled from meetings row when needed
      teamAway: null,
      playerScore: r.player_score,
      wins: r.wins,
      losses: r.losses,
      singleWins: r.single_wins,
      singleLosses: r.single_losses,
      doubleWins: r.double_wins,
      doubleLosses: r.double_losses
    }))
  };
}

// Two batched queries (meetings + leagues) instead of N+1 per match.
async function attachTeamScores(career) {
  const sb = getClient();
  if (!sb || !career) return career;
  const ids = [...new Set((career.matches || []).map(m => String(m.meetingId)).filter(Boolean))];
  if (!ids.length) return career;
  const meetById = {};
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await sb.from('meetings')
      .select('meeting_id, team_home_score, team_away_score, home_name, away_name, group_id')
      .in('meeting_id', ids.slice(i, i + 100));
    for (const row of data || []) meetById[row.meeting_id] = row;
  }
  const groupIds = [...new Set(Object.values(meetById).map(r => r.group_id).filter(Boolean))];
  const leagueByGroup = {};
  for (let i = 0; i < groupIds.length; i += 50) {
    // No .limit(): one group can have several rows (schedule filters
    // 'gesamt'/'vr'/'rr'). Limiting by group count truncated rows and left
    // some matches with league '' (visible as cryptic 'Liga' pills).
    // A 50-group chunk yields at most ~150 rows, safely below the default 1000.
    const { data } = await sb.from('leagues').select('group_id, league_name')
      .in('group_id', groupIds.slice(i, i + 50));
    for (const row of data || []) {
      if (!leagueByGroup[row.group_id]) leagueByGroup[row.group_id] = row.league_name;
    }
  }
  for (const m of career.matches) {
    const row = meetById[String(m.meetingId)];
    if (!row) continue;
    m.teamHome = row.team_home_score;
    m.teamAway = row.team_away_score;
    if (row.home_name) m.homeName = row.home_name;
    if (row.away_name) m.awayName = row.away_name;
    if (row.group_id && leagueByGroup[row.group_id]) m.league = leagueByGroup[row.group_id];
  }
  return career;
}

// Returns { profile, updatedAt } or null. Freshness is decided by the caller
// via ttrIsFresh (05:00 UTC daily cutoff), not by a rolling TTL.
async function getTtr(personId) {
  const sb = getClient();
  if (!sb) return null;
  const { data, error } = await sb.from('ttr').select('profile_json, updated_at').eq('person_id', String(personId)).maybeSingle();
  if (error || !data) return null;
  const profile = asObject(data.profile_json);
  if (!profile) return null;
  return { ...profile, fromDb: true, updatedAt: data.updated_at };
}

async function setTtr(personId, profile) {
  const sb = getClient();
  if (!sb) return;
  await write('upsert', 'ttr', sb.from('ttr').upsert(
    { person_id: String(personId), profile_json: profile, updated_at: now() },
    { onConflict: 'person_id' }
  ));
}

// Append-only official snapshot (called on every successful profile fetch).
// Scoring uses the snapshot nearest the match date, not today's value.
async function recordTtrSnapshot(personId, ttr) {
  const sb = getClient();
  if (!sb || ttr == null) return;
  await write('upsert', 'ttr_history', sb.from('ttr_history').upsert(
    { person_id: String(personId), fetched_at: now(), ttr: Math.round(ttr) },
    { onConflict: 'person_id,fetched_at' }
  ));
}

// Batch: nearest official snapshot per person within ±tolerance of dateStr
// ('YYYY-MM-DD'). Returns map person_id -> { ttr, fetchedAt }.
async function getTtrHistoryNear(personIds, dateStr, toleranceMs = 45 * 24 * 3600 * 1000) {
  const sb = getClient();
  const out = {};
  if (!sb) return out;
  const ref = Date.parse(String(dateStr || '').slice(0, 10) + 'T12:00:00Z');
  if (!Number.isFinite(ref)) return out;
  const ids = [...new Set((personIds || []).map(String))].filter(Boolean);
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const { data } = await sb.from('ttr_history').select('person_id, fetched_at, ttr').in('person_id', chunk).limit(5000);
    const best = {};
    for (const row of data || []) {
      if (row.ttr == null) continue;
      const dist = Math.abs(Number(row.fetched_at) - ref);
      if (dist <= toleranceMs && (!best[row.person_id] || dist < best[row.person_id].dist)) {
        best[row.person_id] = { dist, ttr: row.ttr, fetchedAt: Number(row.fetched_at) };
      }
    }
    for (const [pid, b] of Object.entries(best)) {
      if (!out[pid] || b.dist < out[pid].dist) out[pid] = { ttr: b.ttr, fetchedAt: b.fetchedAt };
    }
  }
  return out;
}

// Validity-start (quarter cutoff date 'YYYY-MM-DD') in effect at nowMs.
function qttrValidFrom(nowMs = Date.now()) {
  return new Date(qttrCutoffMs(nowMs)).toISOString().slice(0, 10);
}

// Record a Q-TTR snapshot for the currently valid quarter (called on every
// successful Q-TTR fetch: lazy fills and quarterly passes build history).
async function recordQttrSnapshot(personId, qttr, nowMs = Date.now()) {
  const sb = getClient();
  if (!sb || qttr == null) return;
  await write('upsert', 'qttr_history', sb.from('qttr_history').upsert(
    { person_id: String(personId), valid_from: qttrValidFrom(nowMs), qttr: Math.round(qttr), updated_at: now() },
    { onConflict: 'person_id,valid_from' }
  ));
}

// One-time seed: carry already-stored latest Q-TTR values into history,
// stamped with the cutoff in effect when each was stored. Idempotent.
async function seedQttrHistory() {
  const sb = getClient();
  if (!sb) return { seeded: 0 };
  const { data } = await sb.from('qttr').select('person_id, qttr, updated_at').limit(20000);
  let seeded = 0;
  const rows = (data || []).filter(r => r.qttr != null);
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map(r => ({
      person_id: r.person_id,
      valid_from: qttrValidFrom(Number(r.updated_at) || Date.now()),
      qttr: r.qttr,
      updated_at: Number(r.updated_at) || now()
    }));
    const res = await write('upsert', 'qttr_history', sb.from('qttr_history').upsert(chunk, { onConflict: 'person_id,valid_from' }));
    if (res.ok) seeded += chunk.length;
  }
  return { seeded };
}
// Batch: Q-TTR valid at dateStr per person (latest valid_from <= date).
// Returns map person_id -> { qttr, vintage } (vintage = valid_from).
async function getQttrHistoryAt(personIds, dateStr) {
  const sb = getClient();
  const out = {};
  if (!sb) return out;
  const day = String(dateStr || '').slice(0, 10);
  if (!day) return out;
  const ids = [...new Set((personIds || []).map(String))].filter(Boolean);
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const { data } = await sb.from('qttr_history')
      .select('person_id, valid_from, qttr')
      .in('person_id', chunk).lte('valid_from', day)
      .order('valid_from', { ascending: false }).limit(5000);
    const seen = new Set();
    for (const row of data || []) {
      if (seen.has(row.person_id) || row.qttr == null) continue;
      seen.add(row.person_id);
      out[row.person_id] = { qttr: row.qttr, vintage: row.valid_from };
    }
  }
  return out;
}

// Quarterly TTR fallback (public, no login). Returns { qttr, updatedAt } or null.
async function getQttr(personId) {
  const sb = getClient();
  if (!sb) return null;
  const { data, error } = await sb.from('qttr').select('qttr, updated_at').eq('person_id', String(personId)).maybeSingle();
  if (error || !data || data.qttr == null) return null;
  return { qttr: data.qttr, updatedAt: data.updated_at };
}

async function setQttr(personId, qttr) {
  const sb = getClient();
  if (!sb || qttr == null) return;
  const value = Math.round(qttr);
  await write('upsert', 'qttr', sb.from('qttr').upsert(
    { person_id: String(personId), qttr: value, updated_at: now() },
    { onConflict: 'person_id' }
  ));
  // Every stored value also snapshots its quarter, so history accumulates
  // through lazy fills and quarterly passes alike.
  await recordQttrSnapshot(personId, value).catch(() => {});
}

// Batch maps person_id -> { qttr, updatedAt } (one round trip per 100 ids).
async function getQttrs(personIds) {
  const sb = getClient();
  const out = {};
  if (!sb) return out;
  const ids = [...new Set((personIds || []).map(String))].filter(Boolean);
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await sb.from('qttr').select('person_id, qttr, updated_at').in('person_id', ids.slice(i, i + 100));
    for (const row of data || []) {
      if (row.qttr != null) out[row.person_id] = { qttr: row.qttr, updatedAt: row.updated_at };
    }
  }
  return out;
}

// Batch maps person_id -> { profile, updatedAt } for the scoring chain's
// official-TTR-first branch (one round trip per 100 ids).
async function getTtrs(personIds) {
  const sb = getClient();
  const out = {};
  if (!sb) return out;
  const ids = [...new Set((personIds || []).map(String))].filter(Boolean);
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await sb.from('ttr').select('person_id, profile_json, updated_at').in('person_id', ids.slice(i, i + 100));
    for (const row of data || []) {
      const profile = asObject(row.profile_json);
      if (profile && profile.ttr != null) out[row.person_id] = { ttr: profile.ttr, updatedAt: row.updated_at };
    }
  }
  return out;
}

// person_ids (from appearances) whose Q-TTR is missing or older than the
// current quarterly cutoff. Used by the nightly/quarterly refresh pass.
async function getStaleQttrPersonIds(limit = 100, nowMs = Date.now()) {
  const sb = getClient();
  if (!sb) return [];
  const cutoff = qttrCutoffMs(nowMs);
  const { data: app } = await sb.from('appearances').select('person_id').limit(20000);
  const persons = [...new Set((app || []).map(r => r.person_id).filter(Boolean))];
  const fresh = new Set();
  for (let i = 0; i < persons.length; i += 200) {
    const { data } = await sb.from('qttr').select('person_id, updated_at').in('person_id', persons.slice(i, i + 200));
    for (const row of data || []) {
      if (Number(row.updated_at || 0) > cutoff) fresh.add(row.person_id);
    }
  }
  return persons.filter(p => !fresh.has(p)).slice(0, limit);
}

// Set of meeting ids that already have raw JSON stored (one round trip).
async function getExistingRawMeetingIds(ids) {
  const sb = getClient();
  const out = new Set();
  if (!sb) return out;
  const list = [...new Set((ids || []).map(String))].filter(Boolean);
  for (let i = 0; i < list.length; i += 100) {
    const { data } = await sb.from('meetings').select('meeting_id').in('meeting_id', list.slice(i, i + 100)).not('raw_json', 'is', null);
    for (const row of data || []) out.add(row.meeting_id);
  }
  return out;
}

// Paginated raw meetings (for rescore.js). Ordered for stable paging.
async function getMeetingsWithRaw(limit = 100, offset = 0) {
  const sb = getClient();
  if (!sb) return [];
  const { data, error } = await sb.from('meetings')
    .select('meeting_id, raw_json, season, competition')
    .not('raw_json', 'is', null)
    .order('meeting_id', { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) return [];
  return (data || []).map(r => ({ ...r, raw: asObject(r.raw_json) }));
}

async function getAppearancesPage(limit = 500, offset = 0) {
  const sb = getClient();
  if (!sb) return [];
  const { data, error } = await sb.from('appearances')
    .select('person_id, meeting_id, player_score')
    .order('person_id', { ascending: true })
    .order('meeting_id', { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) return [];
  return data || [];
}

async function countTable(table, filter) {
  const sb = getClient();
  if (!sb) return 0;
  let q = sb.from(table).select('*', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count, error } = await q;
  return error ? 0 : (count || 0);
}

async function stats() {
  if (!available()) return { available: false };
  const sb0 = getClient();
  let leagues = 0;
  try {
    const { data } = await sb0.from('leagues').select('group_id').limit(5000);
    leagues = new Set((data || []).map(r => r.group_id)).size;
  } catch { /* ignore */ }
  const [clubs, teams, meetings, meetingsDone, appearances, qttrRows] = await Promise.all([
    countTable('clubs'),
    countTable('teams'),
    countTable('meetings'),
    countTable('meetings', q => q.eq('state', 'done')),
    countTable('appearances'),
    countTable('qttr')
  ]);
  let players = 0;
  try {
    const sb = getClient();
    const { data } = await sb.from('appearances').select('person_id').limit(20000);
    players = new Set((data || []).map(r => r.person_id)).size;
  } catch { /* approximate */ }
  return { available: true, clubs, teams, leagues, meetings, meetingsDone, appearances, players, qttrRows };
}

// ---------- weekly MVP (derived cache over appearances, winner only) ----------
// Appearances carry full ISO timestamps ('...+00:00'), so day-granularity
// string comparison works when every bound uses the same shape. Callers pad
// +-1 day and bucket exactly in code (see mvp.js cestDay).
const APPEAR_MVP_COLS = 'person_id, meeting_id, player_score, wins, losses, single_wins, single_losses, first_name, last_name, club_id, team_name, opponent_name, opponent_club, date, season, competition';

async function getAppearancesInRange(fromDay, toDayExclusive, { season = '', competition = 'league' } = {}) {
  const sb = getClient();
  if (!sb) return [];
  let q = sb.from('appearances').select(APPEAR_MVP_COLS)
    .gte('date', String(fromDay)).lt('date', String(toDayExclusive))
    .eq('competition', competition || 'league')
    .limit(5000);
  if (season) q = q.eq('season', String(season));
  const { data, error } = await q;
  if (error) {
    console.error(`[db] select "appearances" range failed: ${error.message || error}`);
    return [];
  }
  return data || [];
}

// Batch map meeting_id -> { group_id, league_name, frozen, date } plus one
// batched leagues lookup (prefer the 'gesamt' schedule row for the name).
async function getMeetingGroups(ids) {
  const sb = getClient();
  const out = {};
  if (!sb) return out;
  const list = [...new Set((ids || []).map(String))].filter(Boolean);
  if (!list.length) return out;
  const meetById = {};
  for (let i = 0; i < list.length; i += 100) {
    const { data } = await sb.from('meetings')
      .select('meeting_id, group_id, frozen, date')
      .in('meeting_id', list.slice(i, i + 100));
    for (const row of data || []) meetById[row.meeting_id] = row;
  }
  const groupIds = [...new Set(Object.values(meetById).map(r => r.group_id).filter(Boolean))];
  const leagueByGroup = {};
  for (let i = 0; i < groupIds.length; i += 50) {
    const { data } = await sb.from('leagues').select('group_id, filter, league_name')
      .in('group_id', groupIds.slice(i, i + 50));
    for (const row of data || []) {
      if (!leagueByGroup[row.group_id] || row.filter === 'gesamt') leagueByGroup[row.group_id] = row.league_name;
    }
  }
  for (const [mid, m] of Object.entries(meetById)) {
    out[mid] = {
      group_id: m.group_id || '',
      league_name: (m.group_id && leagueByGroup[m.group_id]) || '',
      frozen: !!m.frozen,
      date: m.date || null
    };
  }
  return out;
}

// Highest single-meeting score of a season (league scope) with the MVP proxy
// tiebreak. Returns the raw appearance row or null.
async function getSeasonBest(season, competition = 'league') {
  const sb = getClient();
  if (!sb) return null;
  const { data, error } = await sb.from('appearances').select(APPEAR_MVP_COLS)
    .eq('season', String(season)).eq('competition', competition || 'league')
    .order('player_score', { ascending: false })
    .order('losses', { ascending: true })
    .order('wins', { ascending: false })
    .order('single_wins', { ascending: false })
    .order('person_id', { ascending: true })
    .limit(1).maybeSingle();
  if (error || !data) return null;
  return data;
}

async function getWeeklyMvp(weekStart) {
  const sb = getClient();
  if (!sb) return null;
  const { data, error } = await sb.from('weekly_mvps').select('*')
    .eq('week_start', String(weekStart).slice(0, 10)).maybeSingle();
  if (error || !data || !data.person_id) return null;
  return data;
}

async function upsertWeeklyMvp(row) {
  const sb = getClient();
  if (!sb) return;
  await write('upsert', 'weekly_mvps', sb.from('weekly_mvps').upsert(
    {
      week_start: String(row.week_start).slice(0, 10),
      season: row.season || '',
      competition: row.competition || 'league',
      person_id: row.person_id != null ? String(row.person_id) : null,
      meeting_id: row.meeting_id != null ? String(row.meeting_id) : null,
      player_score: row.player_score ?? null,
      wins: row.wins || 0,
      losses: row.losses || 0,
      first_name: row.first_name || '',
      last_name: row.last_name || '',
      club_id: row.club_id != null ? String(row.club_id) : null,
      team_name: row.team_name || '',
      computed_at: row.computed_at || now(),
      score_version: row.score_version || ''
    },
    { onConflict: 'week_start' }
  ));
}

async function deleteWeeklyMvp(weekStart) {
  const sb = getClient();
  if (!sb) return;
  await write('delete', 'weekly_mvps', sb.from('weekly_mvps')
    .delete().eq('week_start', String(weekStart).slice(0, 10)));
}

// All appearance dates of a season/competition (for mvp-refresh --all week
// discovery). Date column only, small scale like the stats() player scan.
async function getAppearanceDates(season, competition = 'league', limit = 20000) {
  const sb = getClient();
  if (!sb) return [];
  let q = sb.from('appearances').select('date').eq('competition', competition || 'league').limit(limit);
  if (season) q = q.eq('season', String(season));
  const { data, error } = await q;
  if (error) {
    console.error(`[db] select "appearances" dates failed: ${error.message || error}`);
    return [];
  }
  return (data || []).map(r => r.date).filter(Boolean);
}

// All snapshot weeks (for rescore dirty-version refresh). Small table.
async function getWeeklyMvpWeeks() {
  const sb = getClient();
  if (!sb) return [];
  const { data, error } = await sb.from('weekly_mvps')
    .select('week_start, season, competition, score_version').limit(1000);
  if (error) return [];
  return data || [];
}

module.exports = {
  available,
  preflightWrite,
  ttrCutoffMs,
  ttrIsFresh,
  CORRECTION_WINDOW_MS,
  normalizeSeason,
  metaGet,
  metaSet,
  upsertClub,
  upsertTeam,
  upsertLeague,
  updateLeagueSchedule,
  getLeague,
  getSchedulesByGroups,
  upsertMeeting,
  getMeeting,
  upsertAppearance,
  upsertAppearances,
  getCareer,
  attachTeamScores,
  getTtr,
  setTtr,
  qttrCutoffMs,
  qttrIsFresh,
  getQttr,
  setQttr,
  getQttrs,
  getTtrs,
  qttrValidFrom,
  recordQttrSnapshot,
  getQttrHistoryAt,
  recordTtrSnapshot,
  getTtrHistoryNear,
  seedQttrHistory,
  getStaleQttrPersonIds,
  getExistingRawMeetingIds,
  getMeetingsWithRaw,
  getAppearancesPage,
  getAppearancesInRange,
  getAppearanceDates,
  getMeetingGroups,
  getSeasonBest,
  getWeeklyMvp,
  upsertWeeklyMvp,
  deleteWeeklyMvp,
  getWeeklyMvpWeeks,
  stats
};
