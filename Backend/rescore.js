// Standalone offline rescore: recomputes appearances.player_score from stored
// meetings.raw_json in Supabase using the current Backend/scoring.js (Punkte).
// Rating fill (official<=60d -> fed_rank -> Q-TTR) comes from the store only:
// zero myTT calls. Records ttr_source per appearance.
// Usage: npm run rescore         -> overwrites scores in-place
//        node rescore.js --dry-run -> preview only (ALWAYS review first)
// Only the scoring changed — raw myTT JSONs stay untouched.

const db = require('./db');
const { computePlayerMeeting, resolveMatchRatings } = require('./mytt-player');

const dryRun = process.argv.includes('--dry-run');

function distinctPersons(match) {
  const set = new Set();
  for (const g of match || []) {
    for (const s of ['mm_player11', 'mm_player12', 'mm_player21', 'mm_player22']) {
      if (g[s] && g[s].person_id) set.add(g[s].person_id);
    }
  }
  return [...set];
}

async function main() {
  if (!db.available()) {
    console.error('[rescore] Supabase not configured - set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const before = await db.stats();
  console.log(`[rescore] ${dryRun ? 'DRY RUN - ' : ''}starting. db: ${before.appearances} appearances, ${before.meetings} meetings (${before.meetingsDone} done), ${before.players} players`);

  // Snapshot one sample player total to prove the delta (if DB has data).
  let sampleId = null;
  let sampleBefore = null;
  try {
    const first = await db.getAppearancesPage(1, 0);
    if (first.length) {
      sampleId = first[0].person_id;
      const career = await db.getCareer(sampleId, first[0].season);
      sampleBefore = career ? career.total : null;
    }
  } catch { /* ignore */ }

  let meetingsOk = 0, meetingsSkipped = 0, appearancesWritten = 0, appearancesChanged = 0;
  // Cache current scores to count changes without extra queries.
  const curScore = new Map();
  try {
    for (let off = 0; ; off += 500) {
      const page = await db.getAppearancesPage(500, off);
      if (!page.length) break;
      for (const r of page) curScore.set(`${r.person_id}|${r.meeting_id}`, r.player_score);
      if (page.length < 500) break;
    }
  } catch { /* ignore */ }

  for (let off = 0; ; off += 100) {
    const rows = await db.getMeetingsWithRaw(100, off);
    if (!rows.length) break;
    for (const m of rows) {
      let raw = m.raw;
      if (!raw || !Array.isArray(raw.match)) { meetingsSkipped++; continue; }
      const { match: filledMatch, sources } = await resolveMatchRatings(raw.match, raw.start_date).catch(() => ({ match: raw.match, sources: {} }));
      const filledRaw = { ...raw, match: filledMatch };
      const persons = distinctPersons(filledMatch);
      if (!persons.length) { meetingsSkipped++; continue; }
      const batch = [];
      for (const pid of persons) {
        const pm = computePlayerMeeting(filledRaw, pid);
        if (!pm) continue;
        const key = `${pid}|${m.meeting_id}`;
        const prev = curScore.get(key);
        // Preserve the meeting's season/competition as warm.js does (not pm.season).
        const season = m.season || pm.season || '';
        const competition = m.competition || 'league';
        const src = sources[pid] || {};
        batch.push({
          person_id: pid, meeting_id: String(m.meeting_id), side: pm.side,
          player_score: pm.playerScore, wins: pm.wins, losses: pm.losses,
          single_wins: pm.singleWins, single_losses: pm.singleLosses,
          double_wins: pm.doubleWins, double_losses: pm.doubleLosses,
          first_name: pm.firstName, last_name: pm.lastName,
          club_id: pm.clubId ? String(pm.clubId) : null,
          team_name: pm.teamName, opponent_name: pm.opponentName,
          opponent_club: pm.opponentClubId ? String(pm.opponentClubId) : null,
          date: pm.date, season, competition,
          ttr_source: src.source || 'none',
          rating_value: src.value ?? null,
          rating_vintage: src.vintage || null
        });
        appearancesWritten++;
        if (prev !== pm.playerScore) appearancesChanged++;
        curScore.set(key, pm.playerScore);
      }
      if (!dryRun && batch.length) await db.upsertAppearances(batch);
      meetingsOk++;
    }
    if (rows.length < 100) break;
  }

  console.log(`[rescore] ${dryRun ? 'would write' : 'wrote'} ${appearancesWritten} appearances from ${meetingsOk} meetings (${meetingsSkipped} skipped), ${appearancesChanged} scores changed vs before`);

  if (sampleId !== null) {
    try {
      const first = await db.getAppearancesPage(1, 0);
      const row = first.find(r => r.person_id === sampleId) || first[0];
      if (row) {
        const career = await db.getCareer(row.person_id, row.season);
        const after = career ? career.total : null;
        console.log(`[rescore] sample ${sampleId}: total ${sampleBefore} -> ${after} ${sampleBefore !== after ? '(changed)' : '(unchanged)'}`);
      }
    } catch { /* ignore */ }
  }

  if (!dryRun) {
    // Invalidate single-league fallback file caches which store old totals too.
    const fs = require('fs');
    const path = require('path');
    try {
      const dir = path.join(__dirname, 'cache');
      const files = fs.readdirSync(dir);
      let removed = 0;
      for (const f of files) {
        if (f.startsWith('player-') && f.endsWith('.json')) {
          try { fs.unlinkSync(path.join(dir, f)); removed++; } catch { /* ignore */ }
        }
      }
      if (removed) console.log(`[rescore] cleared ${removed} stale cache/player-*.json files`);
    } catch { /* no cache dir on CI, ignore */ }
  } else {
    console.log('[rescore] dry-run: caches untouched');
  }

  const after = await db.stats();
  console.log(`[rescore] done. db: ${after.appearances} appearances, ${after.players} players`);
}

main().catch(e => { console.error('[rescore] fatal:', e.stack || e.message); process.exit(1); });
