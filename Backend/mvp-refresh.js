// Manual/backfill weekly MVP snapshots. Zero myTT calls (Supabase only).
// Usage:
//   node mvp-refresh.js --week=2026-10-12 [--season=26/27]  -> refresh one CEST week
//   node mvp-refresh.js --all [--season=26/27]              -> refresh every week with appearances
//   append --dry-run to preview only (ALWAYS review first, same discipline as rescore)
// Only snapshots change - raw myTT JSONs and appearances stay untouched.

const db = require('./db');
const mvp = require('./mvp');

function args() {
  const out = { week: '', all: false, dryRun: false, season: '' };
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)(=(.*))?$/);
    if (!m) continue;
    const k = m[1], v = m[3] ?? '';
    if (k === 'week') out.week = v.slice(0, 10);
    else if (k === 'all') out.all = true;
    else if (k === 'dry-run') out.dryRun = true;
    else if (k === 'season') out.season = v;
  }
  return out;
}

function fmtWinner(w) {
  if (!w) return '(none)';
  return `${w.firstName} ${w.lastName} (${w.playerScore}, ${w.wins}W/${w.losses}L, ${w.teamName}, ${w.date})`.trim();
}

async function previewWeek(weekStart, season) {
  const padFrom = mvp.addDays(weekStart, -1);
  const padTo = mvp.addDays(weekStart, 8);
  const rows = await db.getAppearancesInRange(padFrom, padTo, { season, competition: 'league' });
  const cand = rows.filter(r => mvp.inWeek(r, weekStart));
  if (!cand.length) return { live: null, stored: await db.getWeeklyMvp(weekStart).catch(() => null) };
  const groups = await db.getMeetingGroups(cand.map(r => r.meeting_id)).catch(() => ({}));
  const live = mvp.enrichRow(mvp.rankRows(cand)[0], groups);
  const stored = await db.getWeeklyMvp(weekStart).catch(() => null);
  return { live, stored };
}

async function main() {
  const opt = args();
  if (!db.available()) {
    console.error('[mvp-refresh] Supabase not configured - set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  let weeks = [];
  if (opt.week) {
    const mon = mvp.mondayOf(opt.week);
    if (!mon) {
      console.error('[mvp-refresh] invalid --week (expected YYYY-MM-DD).');
      process.exit(1);
    }
    weeks = [mon];
  } else if (opt.all) {
    const dates = await db.getAppearanceDates(opt.season, 'league').catch(() => []);
    weeks = [...new Set(dates.map(d => mvp.weekStartOf(d)).filter(Boolean))].sort();
  } else {
    console.error('[mvp-refresh] pass --week=YYYY-MM-DD or --all.');
    process.exit(1);
  }
  console.log(`[mvp-refresh] ${opt.dryRun ? 'DRY RUN - ' : ''}${weeks.length} week(s), season=${opt.season || '(all)'}, score_version=${mvp.scoreVersion()}`);

  let refreshed = 0;
  for (const ws of weeks) {
    if (opt.dryRun) {
      const { live, stored } = await previewWeek(ws, opt.season);
      const same = stored && live && String(stored.person_id) === String(live.personId)
        && stored.player_score === live.playerScore && stored.score_version === mvp.scoreVersion();
      console.log(`[mvp-refresh] ${ws}: live ${fmtWinner(live)} | stored ${stored ? fmtWinner({ firstName: stored.first_name, lastName: stored.last_name, playerScore: stored.player_score, wins: stored.wins, losses: stored.losses, teamName: stored.team_name, date: '' }) + ` [${stored.score_version}]` : '(none)'} ${same ? '(unchanged)' : '(WOULD refresh)'}`);
      if (!same && live) refreshed++;
    } else {
      const w = await mvp.refreshWeek(ws, { season: opt.season, competition: 'league' });
      console.log(`[mvp-refresh] ${ws}: ${w ? fmtWinner(w) : '(empty week, snapshot cleared)'}`);
      refreshed++;
    }
  }
  console.log(`[mvp-refresh] done. ${opt.dryRun ? 'would refresh' : 'refreshed'} ${refreshed}/${weeks.length} week(s).`);
}

main().catch(e => { console.error('[mvp-refresh] fatal:', e.stack || e.message); process.exit(1); });
