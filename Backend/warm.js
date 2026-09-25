// Nightly warmer: fills the Supabase DB with a club's whole season (leagues + Pokal).
// Runs on GitHub Actions at 01:00 UTC (= 03:00 CEST, fixed UTC+2) via
// .github/workflows/warm-nightly.yml. Manual use:
//   node warm.js [--club=22107] [--org=WTTV] [--season=26--27] [--rqph=40] [--retries=3] [--no-pokal]
//
// Rate behavior (team decision): paced at --rqph (default 40, clamp 10-90),
// on a 429 the run sleeps 60 min and resumes from Supabase state, up to
// --retries times, then exits 0 with a rate-limited checkpoint (next night
// resumes automatically — finished meetings are skipped forever).
// Done meetings are re-fetched while younger than 2 days to catch myTT
// corrections, then frozen. TTR is never bulk-fetched (lazy per player view).

const db = require('./db');
const {
  myttFetchJson,
  fetchLeagueGames,
  fetchMeetingRaw,
  computePlayerMeeting
} = require('./mytt-player');

function args() {
  const out = { club: '22107', org: 'WTTV', season: '26--27', rqph: 40, retries: 3, retryWaitMin: 60, pokal: true };
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)(=(.*))?$/);
    if (!m) continue;
    const k = m[1], v = m[3] ?? '';
    if (k === 'club') out.club = v;
    else if (k === 'org') out.org = v;
    else if (k === 'season') out.season = v;
    else if (k === 'rqph') out.rqph = Math.max(10, Math.min(90, parseInt(v, 10) || 40));
    else if (k === 'retries') out.retries = Math.max(0, Math.min(10, parseInt(v, 10) || 0));
    else if (k === 'retry-wait-min') out.retryWaitMin = Math.max(5, parseInt(v, 10) || 60);
    else if (k === 'no-pokal') out.pokal = false;
  }
  return out;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

class RatePaused extends Error {}

async function main() {
  const opt = args();
  if (!db.available()) {
    console.error('[warm] Supabase not configured - set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  const { season: target } = db.normalizeSeason(opt.season);
  const slugSeason = target.replace('/', '--');

  // Preflight: verify Supabase schema + write permission BEFORE spending any
  // of the ~108 myTT calls. A failing DB used to burn the whole budget green.
  const probe = await db.preflightWrite().catch(e => ({ ok: false, error: e.message }));
  if (!probe.ok) {
    console.error(`[warm] Supabase preflight failed: ${probe.error}`);
    console.error('[warm] Fix: run supabase-schema.sql, use the service_role key (not anon), check SUPABASE_URL. Aborting with zero myTT calls spent.');
    process.exit(1);
  }
  console.log('[warm] Supabase preflight ok (schema + write permission).');

  const intervalMs = Math.round(3600000 / opt.rqph);
  let pausesLeft = opt.retries;
  console.log(`[warm] club=${opt.club} org=${opt.org} season=${target} pokal=${opt.pokal} cap=${opt.rqph}/h retries=${opt.retries}`);

  await db.metaSet(`warm-${opt.club}-${target}`, JSON.stringify({ startedAt: new Date().toISOString() }));

  // Sleep before every real network call so the hourly budget holds on a
  // fresh runner (no file cache survives between GitHub Actions runs).
  async function paced(fn) {
    await sleep(intervalMs);
    return fn();
  }

  async function guarded(fn) {
    const r = await paced(fn);
    if (r && r.rateLimited) {
      await db.metaSet(`warm-${opt.club}-${target}`, JSON.stringify({ stopped: 'rate-limited', at: new Date().toISOString() }));
      if (pausesLeft <= 0) {
        console.log('[warm] rate-limited with no retries left - stopping, next night resumes.');
        throw new RatePaused();
      }
      pausesLeft--;
      console.log(`[warm] rate-limited - sleeping ${opt.retryWaitMin} min, then resuming (${pausesLeft} retries left).`);
      await sleep(opt.retryWaitMin * 60 * 1000);
      return guarded(fn);
    }
    return r;
  }

  let reqCount = 0;
  const progress = { teamsDone: 0, teamsTotal: 0, meetingsDone: 0, meetingsNew: 0, meetingsCorrected: 0, players: new Set() };

  try {
    // 1) club teams (1 public request)
    const tr = await guarded(() => myttFetchJson(
      `https://www.mytischtennis.de/api/ttr/teams?clubNumber=${encodeURIComponent(opt.club)}&organization=${encodeURIComponent(opt.org)}`));
    reqCount++;
    if (!tr.ok || !tr.body || !Array.isArray(tr.body.data)) {
      console.error('[warm] club teams unavailable, aborting.');
      process.exit(1);
    }
    const rows = tr.body.data.filter(r =>
      String(r.season) === target || (opt.pokal && String(r.season) === `P ${target}`));
    console.log(`[warm] ${rows.length} teams in scope (${rows.filter(r => String(r.season).startsWith('P')).length} Pokal)`);
    progress.teamsTotal = rows.length;
    await db.upsertClub(opt.club, '', opt.org);
    for (const r of rows) {
      await db.upsertTeam({
        team_id: String(r.team_id),
        club_id: String(opt.club),
        group_id: String(r.group_id),
        team_name: r.team_name || '',
        league_name: r.league_name || '',
        season: target,
        competition: String(r.season).startsWith('P') ? 'pokal' : 'league'
      });
    }

    // 2) per team: schedule -> meetings -> done details + appearances
    const freshSince = Date.now() - db.CORRECTION_WINDOW_MS;
    for (const r of rows) {
      const competition = String(r.season).startsWith('P') ? 'pokal' : 'league';
      const pseudo = {
        association: r.team_organisation_short || opt.org,
        season: slugSeason,
        league_slug: 'x', // myTT ignores the slug, IDs carry the request
        groupId: String(r.group_id),
        filter: 'gesamt'
      };
      const league = await guarded(() => fetchLeagueGames(pseudo, { forceLive: true }));
      if (!league.fromCache) reqCount++;
      if (!league.games) {
        console.log(`[warm] schedule unavailable for group ${r.group_id} (${r.league_name}), skipped`);
        continue;
      }
      await db.upsertLeague(String(r.group_id), league.leagueName || r.league_name, target, competition, league.games);
      for (const g of league.games) {
        await db.upsertMeeting({
          meeting_id: String(g.meetingId),
          group_id: String(r.group_id),
          date: g.date,
          state: g.state,
          home_club: g.homeClubId ? String(g.homeClubId) : null,
          away_club: g.awayClubId ? String(g.awayClubId) : null,
          home_name: g.homeName || '',
          away_name: g.awayName || '',
          team_home_score: g.homeScore ?? null,
          team_away_score: g.awayScore ?? null,
          season: target,
          competition,
          raw: null,
          frozen: false
        });
      }
      const doneGames = league.games.filter(g => g.state === 'done');
      console.log(`[warm] ${r.league_name || r.group_id}: ${doneGames.length} done meetings`);
      const doneIds = doneGames.map(g => String(g.meetingId));
      const existing = await db.getExistingRawMeetingIds(doneIds).catch(() => new Set());
      for (const g of doneGames) {
        const stored = await db.getMeeting(String(g.meetingId)).catch(() => null);
        const inWindow = new Date(g.date).getTime() >= freshSince;
        // Frozen + stored -> never touch again. In-window done games are
        // always re-fetched to catch myTT corrections.
        if (stored && stored.raw && (stored.frozen || (!inWindow && stored.state === 'done'))) continue;
        const fetched = await guarded(() => fetchMeetingRaw(g.meetingId, { forceLive: true }));
        if (!fetched.fromCache) reqCount++;
        progress.meetingsDone++;
        if (!fetched.data || !Array.isArray(fetched.data.match)) {
          console.log(`[warm]   meeting ${g.meetingId}: unavailable, skipped`);
          continue;
        }
        const raw = fetched.data;
        const isOld = new Date(raw.start_date || g.date).getTime() < freshSince;
        await db.upsertMeeting({
          meeting_id: String(g.meetingId),
          group_id: String(r.group_id),
          date: raw.start_date || g.date,
          state: 'done',
          home_club: raw.team_home_club_nr ? String(raw.team_home_club_nr) : (g.homeClubId ? String(g.homeClubId) : null),
          away_club: raw.team_guest_club_nr ? String(raw.team_guest_club_nr) : (g.awayClubId ? String(g.awayClubId) : null),
          home_name: raw.team_home || g.homeName || '',
          away_name: raw.team_guest || g.awayName || '',
          team_home_score: raw.matches_home ?? g.homeScore ?? null,
          team_away_score: raw.matches_guest ?? g.awayScore ?? null,
          season: target,
          competition,
          raw,
          frozen: isOld
        });
        if (stored && stored.raw) progress.meetingsCorrected++;
        else progress.meetingsNew++;
        const rows2 = [];
        for (const personId of distinctPersons(raw.match)) {
          const pm = computePlayerMeeting(raw, personId);
          if (!pm) continue;
          progress.players.add(personId);
          rows2.push({
            person_id: personId,
            meeting_id: String(g.meetingId),
            side: pm.side,
            player_score: pm.playerScore,
            wins: pm.wins,
            losses: pm.losses,
            single_wins: pm.singleWins,
            single_losses: pm.singleLosses,
            double_wins: pm.doubleWins,
            double_losses: pm.doubleLosses,
            first_name: pm.firstName,
            last_name: pm.lastName,
            club_id: pm.clubId ? String(pm.clubId) : null,
            team_name: pm.teamName,
            opponent_name: pm.opponentName,
            opponent_club: pm.opponentClubId ? String(pm.opponentClubId) : null,
            date: pm.date,
            season: target,
            competition
          });
        }
        await db.upsertAppearances(rows2);
      }
      progress.teamsDone++;
      await db.metaSet(`warm-${opt.club}-${target}`, JSON.stringify({
        teamsDone: progress.teamsDone, teamsTotal: progress.teamsTotal,
        meetingsFetched: progress.meetingsDone, at: new Date().toISOString()
      }));
    }

    console.log(`[warm] done. ~${reqCount} myTT requests used. computed in memory: ${progress.players.size} players (new: ${progress.meetingsNew}, corrected: ${progress.meetingsCorrected}).`);
    const donePayload = JSON.stringify({
      teamsDone: progress.teamsDone, teamsTotal: progress.teamsTotal,
      meetingsFetched: progress.meetingsDone, meetingsNew: progress.meetingsNew,
      meetingsCorrected: progress.meetingsCorrected, at: new Date().toISOString(), status: 'ok'
    });
    await db.metaSet(`warm-${opt.club}-${target}`, donePayload);
    await db.metaSet('warm-last-run', donePayload);
    const s = await db.stats();
    console.log('[warm] verified stored in Supabase:', JSON.stringify(s));
  } catch (e) {
    if (e instanceof RatePaused) {
      console.log('[warm] paused by rate limit - next night resumes automatically.');
      process.exit(0);
    }
    throw e;
  }
}

function distinctPersons(match) {
  const set = new Set();
  for (const g of match) {
    for (const s of ['mm_player11', 'mm_player12', 'mm_player21', 'mm_player22']) {
      if (g[s] && g[s].person_id) set.add(g[s].person_id);
    }
  }
  return [...set];
}

main().catch(e => {
  console.error('[warm] fatal:', e.message);
  process.exit(1);
});
