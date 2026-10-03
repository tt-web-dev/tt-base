// Loads Backend/.env into process.env for local runs.
// GitHub Actions / Render / Railway use real environment variables instead,
// which always win: existing vars are never overwritten.
//
// Same file is used by every backend entry point via db.js
// (server.js, warm.js, rescore.js all require db.js first thing).
// smoke.js requires this file directly.
const fs = require('fs');
const path = require('path');

(function loadEnvFile() {
    try {
        const text = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8');
        for (const line of text.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
            if (!m || process.env[m[1]] !== undefined) continue;
            let value = m[2].trim();
            // strip matching surrounding quotes: KEY="a b" or KEY='a b'
            if (value.length >= 2 &&
                ((value.startsWith('"') && value.endsWith('"')) ||
                 (value.startsWith("'") && value.endsWith("'")))) {
                value = value.slice(1, -1);
            }
            process.env[m[1]] = value;
        }
    } catch { /* no .env file, use real env */ }
})();
