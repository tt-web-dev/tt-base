// Shared weekly-MVP helpers: fixed-CEST (UTC+2) week math, ranking and the
// stored-snapshot refresh. Pure Supabase reads + writes, zero myTT calls.
// Single source of truth for what "week", "winner" and "provisional" mean -
// required by server.js, warm.js, rescore.js and mvp-refresh.js.

const crypto = require('crypto');
const { Punkte } = require('./scoring');
const db = require('./db');
const { clubNameFor } = require('./club-names');

// "German time" = fixed CEST = UTC+2 (same convention as db.js).
const CEST_MS = 2 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

// CEST calendar day ('YYYY-MM-DD') of an ISO timestamp. myTT ships UTC wall
// time, venue time is +2h, so a late Sunday-night game buckets to Monday.
function cestDay(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t + CEST_MS).toISOString().slice(0, 10);
}

function addDays(dayStr, n) {
  const t = Date.parse(String(dayStr).slice(0, 10) + 'T12:00:00Z');
  if (!Number.isFinite(t)) return null;
  return new Date(t + n * DAY_MS).toISOString().slice(0, 10);
}

// Monday ('YYYY-MM-DD') of the CEST week containing dayStr.
function mondayOf(dayStr) {
  const t = Date.parse(String(dayStr).slice(0, 10) + 'T12:00:00Z');
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const diff = (d.getUTCDay() + 6) % 7; // days since Monday
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff))
    .toISOString().slice(0, 10);
}

// Monday of the CEST week containing an ISO timestamp (or null).
function weekStartOf(iso) {
  const day = cestDay(iso);
  return day ? mondayOf(day) : null;
}

// ISO-8601 week number + week-numbering year of a Monday week_start.
function isoWeekOf(weekStart) {
  const thu = addDays(weekStart, 3);
  const y = Number(String(thu).slice(0, 4));
  const jan4Mon = mondayOf(`${y}-01-04`);
  const week = Math.round((Date.parse(thu + 'T12:00:00Z') - Date.parse(jan4Mon + 'T12:00:00Z')) / (7 * DAY_MS)) + 1;
  return { week, year: y };
}

// ms epoch of Monday 00:00 CEST (week gate comparisons).
function monday00CEST(dayStr) {
  const t = Date.parse(String(dayStr).slice(0, 10) + 'T00:00:00+02:00');
  return Number.isFinite(t) ? t : null;
}

// Default week for the MVP cards: the just-ended Mon-Sun week, but only once
// Sunday night's warm (Mon 01:00 UTC = 03:00 CEST, possibly later after
// 60-min retries) has landed. Gated on warm-last-run, never on wall-clock
// alone, so late warms stay correct. Before the gate opens the previous week
// stays default; arrows can always step into the pending week manually.
function defaultWeekStart(lastWarmAtMs, nowMs = Date.now()) {
  const todayCEST = new Date(nowMs + CEST_MS).toISOString().slice(0, 10);
  const thisMonday = mondayOf(todayCEST);
  const lastCompleted = addDays(thisMonday, -7);
  const gate = monday00CEST(thisMonday);
  if (Number.isFinite(lastWarmAtMs) && gate !== null && lastWarmAtMs >= gate) {
    return { weekStart: lastCompleted, warmed: true };
  }
  return { weekStart: addDays(lastCompleted, -7), warmed: false };
}

// Short hash of the scoring table: rescore staleness detector for snapshots.
function scoreVersion() {
  return crypto.createHash('sha256').update(JSON.stringify(Punkte)).digest('hex').slice(0, 12);
}

// Proxy tiebreak (appearances store no sets): score DESC, fewer losses,
// more wins, more single wins, deterministic person_id fallback.
function rankRows(rows) {
  return [...(rows || [])].sort((a, b) =>
    (b.player_score || 0) - (a.player_score || 0)
    || (a.losses || 0) - (b.losses || 0)
    || (b.wins || 0) - (a.wins || 0)
    || (b.single_wins || 0) - (a.single_wins || 0)
    || String(a.person_id).localeCompare(String(b.person_id))
  );
}

// Exact CEST-week membership (fetch with +-1d padding, then filter here).
function inWeek(row, weekStart) {
  const day = row && row.date ? cestDay(row.date) : null;
  if (!day || !weekStart) return false;
  return day >= weekStart && day < addDays(weekStart, 7);
}

// Player-view context + display names for a ranked appearance row.
// meetingGroups: map from db.getMeetingGroups (group_id, league_name, frozen).
function enrichRow(row, meetingGroups) {
  if (!row) return null;
  const g = (meetingGroups || {})[String(row.meeting_id)] || {};
  return {
    personId: String(row.person_id),
    meetingId: String(row.meeting_id),
    groupId: g.group_id || '',
    league: g.league_name || '',
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    clubId: row.club_id != null ? String(row.club_id) : '',
    clubName: clubNameFor(row.club_id, row.team_name),
    teamName: row.team_name || '',
    opponentName: row.opponent_name || '',
    date: row.date || null,
    season: row.season || '',
    playerScore: row.player_score ?? 0,
    wins: row.wins || 0,
    losses: row.losses || 0
  };
}

// Recompute + store the overall winner snapshot of one CEST week (league
// competition). Empty weeks delete a stale snapshot. Returns the enriched
// winner or null. Zero myTT calls.
async function refreshWeek(weekStart, { season = '', competition = 'league' } = {}) {
  const ws = String(weekStart || '').slice(0, 10);
  if (!ws) return null;
  const padFrom = addDays(ws, -1);
  const padTo = addDays(ws, 8);
  const rows = await db.getAppearancesInRange(padFrom, padTo, { season, competition });
  const cand = rows.filter(r => inWeek(r, ws));
  if (!cand.length) {
    await db.deleteWeeklyMvp(ws).catch(() => {});
    return null;
  }
  const top = rankRows(cand)[0];
  const groups = await db.getMeetingGroups([top.meeting_id]).catch(() => ({}));
  // group_id is resolved at read time via getMeetingGroups (no column for it:
  // one row per week must stay competition-agnostic and tiny).
  await db.upsertWeeklyMvp({
    week_start: ws,
    season: top.season || season || '',
    competition: competition || 'league',
    person_id: String(top.person_id),
    meeting_id: String(top.meeting_id),
    player_score: top.player_score ?? 0,
    wins: top.wins || 0,
    losses: top.losses || 0,
    first_name: top.first_name || '',
    last_name: top.last_name || '',
    club_id: top.club_id != null ? String(top.club_id) : null,
    team_name: top.team_name || '',
    computed_at: Date.now(),
    score_version: scoreVersion()
  }).catch(() => {});
  return enrichRow(top, groups);
}

module.exports = {
  CEST_MS,
  cestDay,
  addDays,
  mondayOf,
  weekStartOf,
  isoWeekOf,
  monday00CEST,
  defaultWeekStart,
  scoreVersion,
  rankRows,
  inWeek,
  enrichRow,
  refreshWeek
};
