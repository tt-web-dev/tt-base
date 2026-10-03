// localStorage helper for scouted players — all seasons, per-device, no backend.
const KEY = 'tt-kickbase-scouted-v1';

function load() {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch { return []; }
}

function save(arr) {
    try {
        localStorage.setItem(KEY, JSON.stringify(arr));
        window.dispatchEvent(new CustomEvent('scouted:changed', { detail: arr }));
    } catch (e) { console.error('scouted save failed', e); }
}

export function getScouted() { return load(); }
export function isScouted(personId) { return load().some(p => String(p.personId) === String(personId)); }
export function addScouted(player) {
    const arr = load();
    const id = String(player.personId);
    if (arr.some(p => String(p.personId) === id)) return arr;
    arr.push({
        personId: id,
        firstName: player.firstName || '',
        lastName: player.lastName || '',
        clubId: player.clubId || '',
        season: player.season || '',
        groupId: player.groupId || '',
        addedAt: Date.now()
    });
    save(arr);
    return arr;
}
export function removeScouted(personId) {
    const arr = load().filter(p => String(p.personId) !== String(personId));
    save(arr);
    return arr;
}
export function toggleScouted(player) {
    return isScouted(player.personId) ? removeScouted(player.personId) : addScouted(player);
}
export function subscribe(cb) {
    const h = () => cb(load());
    window.addEventListener('scouted:changed', h);
    window.addEventListener('storage', (e) => { if (e.key === KEY) h(); });
    return () => { window.removeEventListener('scouted:changed', h); window.removeEventListener('storage', h); };
}
