// Supabase connection smoke test. Zero myTT calls, ~10 seconds.
// Verifies, in order: env vars present -> key is service_role (not anon) ->
// all 7 tables exist -> write + read-back + delete works -> stats readable.
//
// Run locally from the Backend/ directory (node_modules already installed):
//   SUPABASE_URL=https://xyz.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... node smoke.js
// Or put both values in Backend/.env (gitignored) and run: node smoke.js
//
// "CONNECTION WORKING" at the end means the nightly warm can store data.
// Anything else prints the exact Supabase error message telling you why not.

// Pick up Backend/.env for local runs (GitHub Actions / Render use real env).
require('./env');

const URL = process.env.SUPABASE_URL || '';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function maskKey(k) {
  if (!k) return '(missing)';
  if (k.length < 12) return '(too short to be valid)';
  return k.slice(0, 6) + '...' + k.slice(-4) + ` (length ${k.length})`;
}

// Read the JWT role claim without verifying (diagnostic only).
function jwtRole(k) {
  try {
    const parts = k.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
    return payload.role || null;
  } catch { return null; }
}

let failures = 0;
function ok(label) { console.log(`  [ok] ${label}`); }
function fail(label, detail) {
  failures++;
  console.log(`  [FAIL] ${label}`);
  if (detail) console.log(`         -> ${detail}`);
}

async function main() {
  console.log('[smoke] 1) env vars');
  console.log(`  SUPABASE_URL = ${URL || '(missing)'}`);
  console.log(`  SUPABASE_SERVICE_ROLE_KEY = ${maskKey(KEY)}`);
  if (!URL || !KEY) {
    fail('env vars present', 'Set both values (see .env.example) and re-run.');
    return done();
  }
  ok('env vars present');

  console.log('[smoke] 2) key type (must be service_role, NOT anon)');
  const role = jwtRole(KEY);
  console.log(`  JWT role claim = ${role === null ? '(unreadable - not a JWT?)' : role}`);
  if (role !== 'service_role') {
    fail('service_role key', role === 'anon'
      ? 'This is the anon key. RLS with no policies denies it everything, so all writes fail silently. Copy the service_role key from Supabase Settings -> API.'
      : 'Key is not a service_role JWT. Copy the service_role key from Supabase Settings -> API.');
  } else {
    ok('service_role key');
  }

  let createClient;
  try {
    ({ createClient } = require('@supabase/supabase-js'));
  } catch (e) {
    fail('supabase-js installed', 'Run: npm install (in Backend/)');
    return done();
  }
  const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  console.log('[smoke] 3) tables exist');
  const tables = ['clubs', 'teams', 'leagues', 'meetings', 'appearances', 'ttr', 'qttr', 'meta'];
  for (const t of tables) {
    const { error } = await sb.from(t).select('*', { count: 'exact', head: true });
    if (error) fail(`table "${t}"`, error.message);
    else ok(`table "${t}"`);
  }

  console.log('[smoke] 4) write + read-back + delete (test row, cleaned up afterwards)');
  const testId = 'smoke-test-club';
  const up = await sb.from('clubs').upsert(
    { club_id: testId, name: 'smoke', org: 'TEST', updated_at: Date.now() },
    { onConflict: 'club_id' }
  );
  if (up.error) {
    fail('write test row', up.error.message);
  } else {
    ok('write test row');
    const rd = await sb.from('clubs').select('club_id,name').eq('club_id', testId).maybeSingle();
    if (rd.error || !rd.data) fail('read test row back', rd.error ? rd.error.message : 'row missing after write');
    else ok('read test row back');
    const del = await sb.from('clubs').delete().eq('club_id', testId);
    if (del.error) fail('delete test row', del.error.message);
    else ok('delete test row (dashboard stays clean)');
  }

  console.log('[smoke] 5) meta + stats (what the warm uses for checkpoints)');
  const mw = await sb.from('meta').upsert({ k: 'smoke-test', v: 'ok' }, { onConflict: 'k' });
  if (mw.error) fail('meta write', mw.error.message);
  else {
    ok('meta write');
    await sb.from('meta').delete().eq('k', 'smoke-test');
  }
  try {
    const db = require('./db');
    const s = await db.stats();
    console.log(`  stats = ${JSON.stringify(s)}`);
    if (s.available) ok('stats readable');
    else fail('stats readable', 'db.available() is false');
  } catch (e) {
    fail('stats readable', e.message);
  }

  done();
}

function done() {
  console.log('');
  if (failures === 0) console.log('[smoke] CONNECTION WORKING - the nightly warm can store data.');
  else console.log(`[smoke] CONNECTION BROKEN (${failures} check${failures === 1 ? '' : 's'} failed) - fix the FAIL lines above, then re-run.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => {
  console.error('[smoke] fatal:', e.message);
  process.exit(1);
});
