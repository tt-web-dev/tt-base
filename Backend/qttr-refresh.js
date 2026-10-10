// One-shot Q-TTR backfill (public popup, no login): fills qttr for every
// person_id known from appearances that is missing or past the quarterly
// cutoff. Run once after the migration, then quarterly (or rely on the
// nightly warm's capped pass + lazy fills).
// Usage: node qttr-refresh.js [--limit=5000] [--pace-ms=3000] [--dry-run]
// Zero cookie needed. Dry-run only counts.

const db = require('./db');
const { fetchQttr } = require('./mytt-player');

function arg(name, fallback) {
  const m = process.argv.find(a => a.startsWith(`--${name}=`));
  if (!m) return fallback;
  const v = parseInt(m.split('=')[1], 10);
  return Number.isNaN(v) ? fallback : v;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const limit = arg('limit', 5000);
  const paceMs = arg('pace-ms', 3000);
  const dryRun = process.argv.includes('--dry-run');
  if (!db.available()) {
    console.error('[qttr] Supabase not configured - set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  const stale = await db.getStaleQttrPersonIds(limit);
  console.log(`[qttr] ${stale.length} persons need Q-TTR (missing or past quarterly cutoff).${dryRun ? ' DRY RUN - no fetches.' : ''}`);
  if (dryRun) return;
  // Seed history from already-stored latest values first (no fetches):
  // past quarters become resolvable for vintage-correct scoring immediately.
  try {
    const { seeded } = await db.seedQttrHistory();
    if (seeded) console.log(`[qttr] seeded ${seeded} history rows from stored values.`);
  } catch (e) {
    console.log('[qttr] history seed skipped:', e.message);
  }
  let ok = 0, failed = 0, limited = false;
  for (const pid of stale) {
    await sleep(paceMs);
    try {
      const r = await fetchQttr(pid);
      if (r && r.qttr != null) ok++;
      else if (r && r.rateLimited) { limited = true; break; }
      else failed++;
    } catch { failed++; }
  }
  const s = await db.stats().catch(() => ({}));
  console.log(`[qttr] done. stored: ${ok}, failed: ${failed}${limited ? ' (rate-limited, stopped early)' : ''}. qttr rows: ${s.qttrRows ?? '?'}.`);
}

main().catch(e => { console.error('[qttr] fatal:', e.message); process.exit(1); });
