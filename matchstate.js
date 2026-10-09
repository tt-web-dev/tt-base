// Shared match-state knowledge: same-day truth without extra warm cycles.
//
// - "Today" means yesterday + today by Europe/Berlin calendar date, so matches
//   played in the evening still count at 1am (before the next nightly warm).
// - Only DONE upgrades are remembered (meetingId -> scores/clubs/time).
//   Schedule data always wins conflicts: a schedule 'done' beats any memory
//   (a played match cannot un-happen; corrections arrive via the next warm),
//   and memories expire after 3 days. The warm can therefore never be
//   overridden stale.

export const TSV_CLUB_ID = '22107';
const STORE_KEY = 'tt-known-done-v1';
const OVERRIDE_TTL_MS = 3 * 24 * 3600 * 1000;

function loadStore() {
    try {
        const raw = localStorage.getItem(STORE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || !parsed.items) return {};
        const now = Date.now();
        const items = {};
        for (const [id, v] of Object.entries(parsed.items)) {
            if (v && typeof v.hw === 'number' && typeof v.aw === 'number' && now - (v.at || 0) < OVERRIDE_TTL_MS) {
                items[id] = v;
            }
        }
        return items;
    } catch { return {}; }
}

function saveStore(items) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, items })); } catch { /* private mode etc. */ }
}

// Stored done-override or null. Never contradicts schedule 'done' by design
// (callers check schedule state first).
export function getKnownDone(meetingId) {
    if (meetingId == null) return null;
    return loadStore()[String(meetingId)] || null;
}

// Remember a proven-played meeting. Dispatches 'matchday-known-done' so
// calendar/liga restyle immediately; renderers re-read the store.
export function rememberDone(meetingId, { hw, aw, hc, ac } = {}) {
    if (meetingId == null) return null;
    // Explicit null guard: Number(null) === 0, but a missing score means
    // "unknown" (e.g. match in progress) — never remember it as 0:X.
    const h = (hw === null || hw === undefined || hw === '') ? NaN : Number(hw);
    const a = (aw === null || aw === undefined || aw === '') ? NaN : Number(aw);
    if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
    const items = loadStore();
    const entry = {
        hw: h, aw: a,
        hc: hc != null ? String(hc) : null,
        ac: ac != null ? String(ac) : null,
        at: Date.now()
    };
    items[String(meetingId)] = entry;
    saveStore(items);
    try {
        document.dispatchEvent(new CustomEvent('matchday-known-done', {
            detail: { meetingId: String(meetingId), ...entry }
        }));
    } catch { /* non-DOM context */ }
    return entry;
}

// TSV-relative result state, mirroring server getMatchState for done matches
// (draws are 'r' regardless of side; neutral games fall through to 'l' but
// calendar cells always involve a TSV team by construction).
export function tsvState(hw, aw, homeClubId, awayClubId) {
    const h = Number(hw), a = Number(aw);
    const tsvHome = String(homeClubId) === TSV_CLUB_ID;
    const tsvAway = String(awayClubId) === TSV_CLUB_ID;
    if ((h > a && tsvHome) || (h < a && tsvAway)) return 'w';
    if (h === a) return 'r';
    return 'l';
}

// Berlin calendar days: today + yesterday (covers post-midnight stragglers
// before the next nightly warm). Game dates ('YYYY-MM-DD…') are compared by
// calendar day, same as everywhere else in the app.
export function berlinDay(offsetDays = 0) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date(Date.now() + offsetDays * 86400000));
}

export function fixtureDays() {
    return [berlinDay(-1), berlinDay(0)];
}

export function isFixtureDay(dateString) {
    const day = String(dateString || '').slice(0, 10);
    const [yesterday, today] = fixtureDays();
    return day === yesterday || day === today;
}

// Shared entry point for full (non-scheduled) modal payloads: remembers the
// proven result, returns the stored entry or null (e.g. for scheduled cards
// or incomplete live data). Used by modal renders and today-refresh fetches.
export function noteFullResult(info) {
    if (!info || info.scheduled) return null;
    return rememberDone(info.meetingId, {
        hw: info.home_matches_won, aw: info.away_matches_won,
        hc: info.home_clubId, ac: info.away_clubId
    });
}
