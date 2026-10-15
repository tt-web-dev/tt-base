// Weekly MVP sections on home: main MVP (week nav) + Advanced MVP
// (club/league filters) + Season Highscore. Badge only, Supabase reads via
// the backend (zero myTT on read). Player cards open the player view.
import { openPlayerView } from './player-view.js';
import { spinnerEl } from './loading.js';

const API = (typeof window !== 'undefined' && window.TT_API_BASE) || '';
const STORE_CLUB = 'mvp-adv-club';
const STORE_LEAGUE = 'mvp-adv-group';
const DEFAULT_CLUB = '22107';
const DAY_MS = 24 * 3600 * 1000;

// CEST week helpers (mirror Backend/mvp.js, fixed UTC+2).
function mondayOf(dayStr) {
    const t = Date.parse(String(dayStr).slice(0, 10) + 'T12:00:00Z');
    if (!Number.isFinite(t)) return null;
    const d = new Date(t);
    const diff = (d.getUTCDay() + 6) % 7;
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff))
        .toISOString().slice(0, 10);
}

function addDays(dayStr, n) {
    const t = Date.parse(String(dayStr).slice(0, 10) + 'T12:00:00Z');
    if (!Number.isFinite(t)) return null;
    return new Date(t + n * DAY_MS).toISOString().slice(0, 10);
}

function cestToday() {
    return new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
}

function urlWeek() {
    try {
        const p = new URLSearchParams(window.location.search).get('mvp-week');
        return p ? mondayOf(p) : null;
    } catch { return null; }
}

// Read-only URL (same philosophy as the calendar's ?date=): deep links with
// ?mvp-week= open that week on load, but week navigation never writes back.

const state = {
    season: '',
    mainWeek: '',
    advWeek: '', // independent from mainWeek; in-memory only, never in the URL
    currentMonday: mondayOf(cestToday()),
    meta: null, // week-scoped { leagues, clubs, pairs, leagueMeetings, clubMeetings }
    advClub: DEFAULT_CLUB,
    advGroup: ''
};

document.addEventListener('DOMContentLoaded', () => {
    initMvp();
});

async function apiJson(path) {
    let res;
    try {
        res = await fetch(`${API}${path}`);
    } catch (e) {
        throw new Error('Netzwerkfehler. Läuft der Server?');
    }
    if (!res.ok) {
        let notWarmed = false;
        let msg = `Server Error: ${res.status}`;
        try {
            const body = await res.clone().json();
            if (body && body.notWarmed) notWarmed = true;
            if (body && typeof body.error === 'string' && body.error) msg = body.error;
        } catch { /* non-JSON */ }
        const err = new Error(msg);
        err.status = res.status;
        err.notWarmed = notWarmed;
        throw err;
    }
    return res.json();
}

function errKind(e) {
    if (e && e.notWarmed) return 'nodata';
    return 'error';
}

// Score tiers, same as meeting-modal.js and player-view.js scoreClass().
function scoreClass(score) {
    if (score == 0) return 'six';
    if (score < 0) return 'one';
    if (score < 100) return 'two';
    if (score < 200) return 'three';
    if (score < 300) return 'four';
    return 'five';
}

function logoImg(clubId) {
    const img = document.createElement('img');
    img.src = `./logos/${clubId || 'x'}.png`;
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = () => {
        if (!img.dataset.fallback) {
            img.dataset.fallback = 'true';
            img.src = 'imgs/table-tennis.png';
        } else {
            img.style.display = 'none';
        }
    };
    return img;
}

function statusEl(text) {
    const el = document.createElement('div');
    el.className = 'mvp-status';
    el.textContent = text;
    return el;
}

function loadingInto(el, label) {
    el.replaceChildren();
    const holder = document.createElement('div');
    holder.className = 'mvp-status';
    holder.appendChild(spinnerEl(label));
    el.appendChild(holder);
}

// Winner row: logo + names + value. Whole row opens the player view.
// display = shown value, tier = scoreClass tier or '' (white), caption =
// optional small grey line under the names (e.g. games count).
function playerCard(winner, withLogo, display, tier, caption) {
    const wrap = document.createElement('div');
    wrap.className = 'mvp-winner';
    if (withLogo) {
        const logo = document.createElement('span');
        logo.className = 'mvp-logo';
        logo.appendChild(logoImg(winner.clubId));
        wrap.appendChild(logo);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mvp-player';
    const names = document.createElement('span');
    names.className = 'mvp-names';
    const first = document.createElement('span');
    first.className = 'first';
    first.textContent = winner.firstName || '';
    const last = document.createElement('span');
    last.className = 'last';
    last.textContent = winner.lastName || '—';
    names.append(first, last);
    if (caption) {
        const games = document.createElement('span');
        games.className = 'mvp-games';
        games.textContent = caption;
        names.appendChild(games);
    }
    const score = document.createElement('span');
    score.className = tier ? `mvp-score ${tier}` : 'mvp-score';
    score.textContent = display ?? winner.playerScore;
    btn.append(names, score);
    btn.title = `${winner.firstName} ${winner.lastName} — Spieler öffnen`;
    btn.addEventListener('click', () => openPlayerView(winner.personId, {
        groupId: winner.groupId || '',
        clubId: winner.clubId || '',
        season: winner.season || state.season,
        firstName: winner.firstName || '',
        lastName: winner.lastName || '',
        meetingId: winner.meetingId || ''
    }));
    wrap.appendChild(btn);
    return wrap;
}

function closeModalEl(modal) {
    if (!modal) return;
    modal.classList.remove('active');
    if (!document.querySelector('.modal.active')) {
        document.getElementById('modal-overlay')?.classList.remove('active');
    }
}

async function initMvp() {
    if (!document.getElementById('mvp-main-card')) return; // not on home
    try {
        state.advClub = localStorage.getItem(STORE_CLUB) ?? DEFAULT_CLUB;
        state.advGroup = localStorage.getItem(STORE_LEAGUE) ?? '';
    } catch { /* storage unavailable */ }
    // Single meta call: gated default week + pinned-week filter matrix.
    try {
        const meta = await apiJson('/mvp/meta');
        state.season = meta.season || '';
        state.mainWeek = urlWeek() || meta.defaultWeekStart;
        state.advWeek = meta.defaultWeekStart;
        state.meta = await loadAdvMeta();
        validateAdvFilters(true);
        loadHighscore();
    } catch (e) {
        // Meta down (DB unavailable): every section shows its error state.
        state.mainWeek = urlWeek() || mondayOf(cestToday()) || '';
        renderMainError(e);
        renderAdvError(e);
        renderHighError(e);
        return;
    }
    loadMain();
    loadAdv();
}

function renderMainError(e) {
    const el = document.getElementById('mvp-main-card');
    if (!el) return;
    el.replaceChildren(statusEl(errKind(e) === 'nodata' ? 'Keine Daten' : `Error: ${e.message}`));
    paintWeekLabel(null);
}

function renderAdvError(e) {
    const el = document.getElementById('mvp-adv-card');
    if (!el) return;
    el.replaceChildren(statusEl(errKind(e) === 'nodata' ? 'Keine Daten' : `Error: ${e.message}`));
    paintAdvFilters();
}

function renderHighError(e) {
    const el = document.getElementById('mvp-high-card');
    if (!el) return;
    el.replaceChildren(statusEl(errKind(e) === 'nodata' ? 'Keine Daten' : `Error: ${e.message}`));
}

// ---------- main MVP (week navigation) ----------
function paintWeekLabel(data) {
    const label = document.getElementById('mvp-weeklabel');
    if (!label) return;
    label.replaceChildren();
    if (!data) {
        label.textContent = 'MVP';
        return;
    }
    label.textContent = `Woche ${data.isoWeek} · ${data.year}`;
    if (data.provisional) {
        const sub = document.createElement('span');
        sub.className = 'mvp-prov';
        sub.textContent = 'provisorisch';
        label.appendChild(sub);
    }
    const next = document.getElementById('mvp-next');
    if (next) next.disabled = state.mainWeek >= state.currentMonday;
}

let mainReq = 0;

async function loadMain() {
    const el = document.getElementById('mvp-main-card');
    if (!el || !state.mainWeek) return;
    const id = ++mainReq;
    loadingInto(el, 'Lade MVP …');
    try {
        const data = await apiJson(`/mvp?weekStart=${encodeURIComponent(state.mainWeek)}`);
        if (id !== mainReq) return;
        el.replaceChildren();
        paintWeekLabel(data);
        if (data.winner) {
            el.appendChild(playerCard(data.winner, true, data.winner.playerScore, scoreClass(data.winner.playerScore)));
        } else {
            el.appendChild(statusEl('Keine Spiele in dieser Woche'));
        }
    } catch (e) {
        if (id !== mainReq) return;
        el.replaceChildren(statusEl(errKind(e) === 'nodata' ? 'Keine Daten' : `Error: ${e.message}`));
        paintWeekLabel(null);
    }
}

function stepWeek(delta) {
    const next = addDays(state.mainWeek, delta);
    if (!next) return;
    if (delta > 0 && next > state.currentMonday) return; // no future weeks
    state.mainWeek = next;
    loadMain();
}

// Wire nav buttons once (loadMain re-renders the card, not the buttons).
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('mvp-prev')?.addEventListener('click', () => stepWeek(-7));
    document.getElementById('mvp-next')?.addEventListener('click', () => stepWeek(7));
    document.getElementById('mvp-adv-prev')?.addEventListener('click', () => stepAdvWeek(-7));
    document.getElementById('mvp-adv-next')?.addEventListener('click', () => stepAdvWeek(7));
});

// ---------- advanced MVP (week navigation + filters) ----------
function paintAdvWeekLabel(data) {
    const label = document.getElementById('mvp-adv-label');
    if (!label) return;
    label.replaceChildren();
    if (!data) {
        label.textContent = 'Advanced MVP';
        return;
    }
    label.textContent = `Woche ${data.isoWeek} · ${data.year}`;
    if (data.provisional) {
        const sub = document.createElement('span');
        sub.className = 'mvp-prov';
        sub.textContent = 'provisorisch';
        label.appendChild(sub);
    }
    const next = document.getElementById('mvp-adv-next');
    if (next) next.disabled = state.advWeek >= state.currentMonday;
}

async function stepAdvWeek(delta) {
    const next = addDays(state.advWeek, delta);
    if (!next) return;
    if (delta > 0 && next > state.currentMonday) return; // no future weeks
    state.advWeek = next;
    setAdvHint('');
    const nextBtn = document.getElementById('mvp-adv-next');
    if (nextBtn) nextBtn.disabled = next >= state.currentMonday;
    const mid = ++advMetaReq;
    let fresh;
    try {
        fresh = await loadAdvMeta();
    } catch (e) {
        if (mid !== advMetaReq) return; // superseded by newer nav
        renderAdvError(e);
        paintAdvWeekLabel(null);
        return;
    }
    if (mid !== advMetaReq) return; // superseded by newer nav
    state.meta = fresh;
    validateAdvFilters(true);
    loadAdv();
}
function overlap(clubId, groupId) {
    const pairs = state.meta?.pairs || [];
    if (!clubId || !groupId) return true; // 'Alle' is compatible with everything
    return pairs.some(p => String(p.clubId) === String(clubId) && String(p.groupId) === String(groupId));
}

async function loadAdvMeta() {
    return apiJson(`/mvp/meta?weekStart=${encodeURIComponent(state.advWeek)}`);
}

let advMetaReq = 0;

// Week change (arrows) / Monday rollover / first load: keep club, reset
// league on mismatch; reset both to default when the club has no games at
// all in the new week.
function validateAdvFilters(silent) {
    const clubs = state.meta?.clubs || [];
    const hasClub = !state.advClub || clubs.some(c => String(c.clubId) === String(state.advClub));
    if (!hasClub) {
        state.advClub = clubs.some(c => String(c.clubId) === DEFAULT_CLUB) ? DEFAULT_CLUB : '';
        state.advGroup = '';
        persistAdv();
        return;
    }
    if (state.advGroup && !overlap(state.advClub, state.advGroup)) {
        state.advGroup = '';
        persistAdv();
        if (!silent) setAdvHint('Liga zurückgesetzt — keine Spiele für diesen Filter');
    }
}

function persistAdv() {
    try {
        localStorage.setItem(STORE_CLUB, state.advClub);
        localStorage.setItem(STORE_LEAGUE, state.advGroup);
    } catch { /* ignore */ }
}

function setAdvHint(text) {
    const el = document.getElementById('mvp-adv-hint');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
}

function clubLabel(clubId) {
    if (!clubId) return 'Alle Clubs';
    const c = (state.meta?.clubs || []).find(x => String(x.clubId) === String(clubId));
    return c ? c.name : `Club ${clubId}`;
}

function leagueLabel(groupId) {
    if (!groupId) return 'Alle Ligen';
    const l = (state.meta?.leagues || []).find(x => String(x.groupId) === String(groupId));
    return l ? l.league : groupId;
}

function paintAdvFilters() {
    const clubBtn = document.getElementById('mvp-club-btn');
    const leagueBtn = document.getElementById('mvp-league-btn');
    if (clubBtn) {
        clubBtn.replaceChildren();
        if (state.advClub) clubBtn.appendChild(logoImg(state.advClub));
        const s = document.createElement('span');
        s.textContent = clubLabel(state.advClub);
        clubBtn.appendChild(s);
        clubBtn.title = 'Club wählen';
    }
    if (leagueBtn) {
        leagueBtn.replaceChildren();
        const s = document.createElement('span');
        s.textContent = leagueLabel(state.advGroup);
        s.title = leagueLabel(state.advGroup);
        leagueBtn.appendChild(s);
        leagueBtn.title = 'Liga wählen';
    }
}

let advReq = 0;

async function loadAdv() {
    const el = document.getElementById('mvp-adv-card');
    if (!el || !state.advWeek) return;
    const id = ++advReq;
    loadingInto(el, 'Lade Advanced MVP …');
    paintAdvFilters();
    const q = `/mvp?weekStart=${encodeURIComponent(state.advWeek)}`
        + (state.advClub ? `&clubId=${encodeURIComponent(state.advClub)}` : '')
        + (state.advGroup ? `&groupId=${encodeURIComponent(state.advGroup)}` : '');
    try {
        const data = await apiJson(q);
        if (id !== advReq) return;
        el.replaceChildren();
        paintAdvWeekLabel(data);
        if (data.winner) {
            el.appendChild(playerCard(data.winner, false, data.winner.playerScore, scoreClass(data.winner.playerScore)));
        } else {
            el.appendChild(statusEl('Keine Spiele in dieser Woche'));
        }
        const filters = document.createElement('div');
        filters.className = 'mvp-filters';
        const clubBtn = document.createElement('button');
        clubBtn.type = 'button';
        clubBtn.id = 'mvp-club-btn';
        clubBtn.className = 'mvp-filter';
        clubBtn.setAttribute('data-modal-target', '#mvp-club-modal');
        const leagueBtn = document.createElement('button');
        leagueBtn.type = 'button';
        leagueBtn.id = 'mvp-league-btn';
        leagueBtn.className = 'mvp-filter';
        leagueBtn.setAttribute('data-modal-target', '#mvp-league-modal');
        filters.append(clubBtn, leagueBtn);
        el.appendChild(filters);
        paintAdvFilters();
    } catch (e) {
        if (id !== advReq) return;
        el.replaceChildren(statusEl(errKind(e) === 'nodata' ? 'Keine Daten' : `Error: ${e.message}`));
        paintAdvWeekLabel(null);
        paintAdvFilters();
    }
}

function gamesLabel(n) {
    return n === 1 ? '1 Spiel' : `${n} Spiele`;
}

function buildLeagueRows() {
    const list = document.getElementById('mvp-league-list');
    if (!list) return;
    list.replaceChildren();
    const leagues = state.meta?.leagues || [];
    const counts = state.meta?.leagueMeetings || {};
    const mk = (groupId, label, games, incompatible, active) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'mvp-select-row' + (active ? ' active' : '') + (incompatible ? ' is-incompatible' : '');
        if (incompatible) b.setAttribute('aria-disabled', 'true');
        const s = document.createElement('span');
        s.textContent = label;
        s.title = label;
        b.appendChild(s);
        if (games != null) {
            const c = document.createElement('span');
            c.className = 'mvp-count';
            c.textContent = gamesLabel(games);
            b.appendChild(c);
        }
        b.addEventListener('click', () => {
            setAdvHint('');
            state.advGroup = groupId;
            if (groupId && state.advClub && !overlap(state.advClub, groupId)) {
                state.advClub = '';
                setAdvHint('Club zurückgesetzt — keine Spiele in dieser Liga');
            }
            persistAdv();
            closeModalEl(document.getElementById('mvp-league-modal'));
            loadAdv();
        });
        return b;
    };
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    list.appendChild(mk('', 'Alle Ligen', total, false, !state.advGroup));
    for (const l of leagues) {
        list.appendChild(mk(
            l.groupId, l.league, counts[l.groupId] ?? 0,
            !!state.advClub && !overlap(state.advClub, l.groupId),
            String(state.advGroup) === String(l.groupId)
        ));
    }
}

function buildClubRows() {
    const list = document.getElementById('mvp-club-list');
    if (!list) return;
    list.replaceChildren();
    const clubs = state.meta?.clubs || [];
    const counts = state.meta?.clubMeetings || {};
    const mk = (clubId, label, games, incompatible, active, withLogo) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'mvp-select-row' + (active ? ' active' : '') + (incompatible ? ' is-incompatible' : '');
        if (incompatible) b.setAttribute('aria-disabled', 'true');
        if (withLogo) b.appendChild(logoImg(clubId));
        const s = document.createElement('span');
        s.textContent = label;
        s.title = label;
        b.appendChild(s);
        if (games != null) {
            const c = document.createElement('span');
            c.className = 'mvp-count';
            c.textContent = gamesLabel(games);
            b.appendChild(c);
        }
        b.addEventListener('click', () => {
            setAdvHint('');
            state.advClub = clubId;
            if (clubId && state.advGroup && !overlap(clubId, state.advGroup)) {
                state.advGroup = '';
                setAdvHint('Liga zurückgesetzt — keine Spiele für diesen Club');
            }
            persistAdv();
            closeModalEl(document.getElementById('mvp-club-modal'));
            loadAdv();
        });
        return b;
    };
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    list.appendChild(mk('', 'Alle Clubs', total, false, !state.advClub, false));
    for (const c of clubs) {
        list.appendChild(mk(
            c.clubId, c.name, counts[c.clubId] ?? 0,
            !!state.advGroup && !overlap(c.clubId, state.advGroup),
            String(state.advClub) === String(c.clubId),
            true
        ));
    }
}

document.addEventListener('click', (event) => {
    const leagueBtn = event.target.closest('#mvp-league-btn');
    if (leagueBtn) buildLeagueRows();
    const clubBtn = event.target.closest('#mvp-club-btn');
    if (clubBtn) buildClubRows();
});

// ---------- season highscores (MVP + Gesamtpunkte + Durchschnitt) ----------
function gamesCaption(games) {
    return games === 1 ? '1 Spiel' : `${games} Spiele`;
}

function subBlock(titleNode, bodyNode) {
    const wrap = document.createElement('div');
    wrap.className = 'mvp-subblock';
    wrap.append(titleNode, bodyNode);
    return wrap;
}

function subTitle(label, icon) {
    const t = document.createElement('div');
    t.className = 'mvp-subtitle';
    if (icon === 'avg') {
        const g = document.createElement('span');
        g.className = 'mvp-avg-glyph';
        g.textContent = '⌀';
        t.appendChild(g);
    } else if (icon) {
        const i = document.createElement('i');
        i.className = icon;
        t.appendChild(i);
    }
    const s = document.createElement('span');
    s.textContent = label;
    t.appendChild(s);
    return t;
}

async function loadHighscore() {
    const el = document.getElementById('mvp-high-card');
    if (!el) return;
    loadingInto(el, 'Lade Highscores …');
    const fail = (e) => {
        const msg = errKind(e) === 'nodata' ? 'Keine Daten' : `Error: ${e.message}`;
        el.replaceChildren();
        for (const [label, icon] of [['MVP', null], ['Gesamtpunkte', 'fa-solid fa-chart-simple'], ['Durchschnitt', 'avg']]) {
            el.appendChild(subBlock(subTitle(label, icon), statusEl(msg)));
        }
    };
    try {
        const data = await apiJson(`/mvp/highscore?season=${encodeURIComponent(state.season)}`);
        el.replaceChildren();
        const empty = statusEl('Noch keine Spiele in dieser Saison');
        el.appendChild(subBlock(
            subTitle('MVP', null),
            data.mvp
                ? playerCard(data.mvp, true, data.mvp.playerScore, scoreClass(data.mvp.playerScore))
                : empty.cloneNode(true)
        ));
        el.appendChild(subBlock(
            subTitle('Gesamtpunkte', 'fa-solid fa-chart-simple'),
            data.total
                ? playerCard(data.total, true, data.total.total, '', gamesCaption(data.total.games))
                : empty.cloneNode(true)
        ));
        el.appendChild(subBlock(
            subTitle('Durchschnitt', 'avg'),
            data.average
                ? playerCard(data.average, true, `⌀ ${data.average.avg}`, scoreClass(data.average.avg), gamesCaption(data.average.games))
                : empty.cloneNode(true)
        ));
    } catch (e) {
        fail(e);
    }
}
