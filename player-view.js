// Player view: opens from meeting modal player click. Tabs Übersicht / Leistung.
// Data: career across all warmed teams first (GET /player/:nuid/career),
// fallback single league (GET /player/:nuid/full?groupId=).
import { isScouted, toggleScouted } from './scouted.js';
import { playerSkeletonEl, spinnerEl } from './loading.js';

const API = (typeof window !== 'undefined' && window.TT_API_BASE) || '';
let currentTab = 'uebersicht';
let currentLeague = 'alle'; // 'alle' oder exakter Liga-Name aus den Matches
let currentData = null;
let currentMeta = null;
let navStack = []; // infinite chain: {type:'meeting',meetingId} | {type:'player',personId,meta,data,league,tab}

export function openPlayerView(personId, opts = {}) {
    if (!personId) return;
    // push the source meeting onto the stack so back can return infinitely
    if (opts.meetingId) {
        navStack.push({ type: 'meeting', meetingId: String(opts.meetingId) });
    } else if (navStack.length && navStack[navStack.length - 1]?.type === 'player') {
        // meeting opened from a player bar/row already pushed its player — don't clear
    } else if (!document.getElementById('meeting-modal')?.classList.contains('active')) {
        // fresh entry (no meeting context) — keep stack, don't inject garbage
    }
    currentMeta = {
        personId: String(personId),
        groupId: opts.groupId ? String(opts.groupId) : '',
        clubId: opts.clubId || '',
        season: opts.season || '',
        firstName: opts.firstName || '',
        lastName: opts.lastName || ''
    };
    currentTab = 'uebersicht';
    currentLeague = 'alle';
    currentData = null;

    closeModal(document.getElementById('meeting-modal'));
    openModal(document.getElementById('player-modal'));

    const body = document.getElementById('player-modal-body');
    if (body) {
        body.replaceChildren();
        body.appendChild(playerSkeletonEl());
    }
    loadPlayer();
}

function apiRaw(path) {
    return fetch(`${API}${path}`).then(async res => {
        if (!res.ok) {
            const err = new Error(`Server Error: ${res.status}`);
            err.status = res.status;
            try {
                const body = await res.clone().json();
                if (body && typeof body === 'object') {
                    if (body.notWarmed === true) err.notWarmed = true;
                    if (typeof body.error === 'string' && body.error) err.serverError = body.error;
                }
            } catch { /* non-JSON error page — status alone must suffice */ }
            throw err;
        }
        return res.json();
    });
}

async function loadPlayer() {
    const body = document.getElementById('player-modal-body');
    try {
        currentData = await loadCareerOrFull();
        render();
    } catch (e) {
        console.error(e);
        if (body) {
            body.replaceChildren();
            // Team decision: the 429 message appears only in the player
            // statistics; every other view falls back silently.
            if (e && e.status === 429) {
                body.appendChild(statusEl('Error 429: you have reached your limit of updating statistics. Try again in one hour.'));
            } else if (e && e.notWarmed && e.serverError === 'Career store unavailable.') {
                body.appendChild(statusEl('Die Spielerdatenbank ist nicht erreichbar. Lokal: Backend mit Backend/.env starten (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).'));
            } else if (e && e.notWarmed) {
                body.appendChild(statusEl('Dieser Spieler ist noch nicht in den gespeicherten Daten. Öffne ihn einmal aus einem Spiel heraus oder warte auf den nächtlichen Datenlauf.'));
            } else {
                body.appendChild(statusEl('Spielerdaten konnten nicht geladen werden.'));
            }
        }
    }
}

//whole season (all warmed teams incl. Pokal) first, single league as fallback.
//Liga-Filterung passiert clientseitig auf currentData (kein Neuladen nötig).
async function loadCareerOrFull() {
    const nuid = encodeURIComponent(currentMeta.personId);
    if (currentMeta.clubId && currentMeta.season) {
        try {
            return await apiRaw(`/player/${nuid}/career?clubId=${encodeURIComponent(currentMeta.clubId)}&season=${encodeURIComponent(currentMeta.season)}&includePokal=1`);
        } catch (e) {
            if (e.status !== 404) throw e;
            // Ohne groupId kann der /full-Fallback nur mit 400 scheitern —
            // Career-Fehler (inkl. notWarmed-Kennung) direkt weitergeben.
            if (!currentMeta.groupId) throw e;
        }
    }
    return apiRaw(`/player/${nuid}/full?groupId=${encodeURIComponent(currentMeta.groupId)}`);
}

//eindeutige Ligen in chronologischer Reihenfolge
function distinctLeagues(matches) {
    const seen = [];
    for (const m of matches) {
        const name = m.league || 'Liga';
        if (!seen.includes(name)) seen.push(name);
    }
    return seen;
}

//Kurzlabel für Pills, voller Name steht im title-Attribut
function shortLeague(name) {
    return String(name || 'Liga')
        .replace(/Bezirksoberliga/gi, 'BOL')
        .replace(/Bezirksliga/gi, 'BL')
        .replace(/Bezirksklasse/gi, 'BK')
        .replace(/Erwachsene/gi, '')
        .replace(/Jugend\s*/gi, 'J')
        .replace(/\s+/g, ' ')
        .trim();
}

//Team-Pills statt Liga-Pills: Gruppierung bleibt die Liga (1 Gruppe = 1 Team),
//nur das Label zeigt Alter + Rang, z.B. "U19 I" oder "Herren III".
//LEAGUE_LABEL_MODE = 'team' (neu) oder 'league' (alt, shortLeague-Pills).
const LEAGUE_LABEL_MODE = 'team';
const POKAL_KEY = '__pokal';

//Reihenfolge ist wichtig: spezifische Klassen (Mädchen, Seniorinnen) vor den
//allgemeinen (Jugend, Senioren), Damen vor Erwachsene als Fallback.
const AGE_CLASS_TABLE = [
    [/mädchen\s*15/i, 'U15 Mädchen'],
    [/mädchen\s*13/i, 'U13 Mädchen'],
    [/seniorinnen\s*70/i, 'Ü70'],
    [/seniorinnen\s*60/i, 'Ü60'],
    [/seniorinnen\s*50/i, 'Ü50'],
    [/seniorinnen\s*40/i, 'Ü40'],
    [/senioren\s*70/i, 'Ü70'],
    [/senioren\s*60/i, 'Ü60'],
    [/senioren\s*50/i, 'Ü50'],
    [/senioren\s*40/i, 'Ü40'],
    [/jugend\s*19|\bj\s*19\b/i, 'U19'],
    [/jugend\s*15|\bj\s*15\b/i, 'U15'],
    [/jugend\s*13|\bj\s*13\b/i, 'U13'],
    [/jugend\s*11|\bj\s*11\b/i, 'U11'],
    [/damen/i, 'Damen'],
    [/erwachsene/i, 'Herren'],
];

function matchAgeClass(league) {
    const s = String(league || '');
    for (const [re, label] of AGE_CLASS_TABLE) {
        if (re.test(s)) return label;
    }
    return '';
}

//Dynamische Arabisch -> Römisch Umwandlung, funktioniert für jede Teamanzahl
//(1=I, 2=II, 3=III, 4=IV, 5=V, 6=VI, 9=IX, 10=X, ...).
function toRoman(num) {
    num = Math.floor(Number(num));
    if (!Number.isFinite(num) || num < 1) return '';
    const table = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let out = '';
    for (const [value, symbol] of table) {
        while (num >= value) {
            out += symbol;
            num -= value;
        }
    }
    return out;
}

//Rang aus dem eigenen teamName, z.B. "TSV Bonn rrh. III" -> "III".
//Erste Mannschaften haben kein Suffix ("TSV Bonn rrh.") -> "I".
//Römisch wird übernommen, Arabisch wird dynamisch umgewandelt.
function parseTeamRank(teamName) {
    const clean = String(teamName || '').replace(/[\s.]+$/, '').trim();
    const m = clean.match(/[\s.]+(\d{1,2}|[IVXLCDM]{1,4})$/i);
    if (!m) return 'I';
    const token = m[1].toUpperCase();
    if (/^\d{1,2}$/.test(token)) {
        const n = parseInt(token, 10);
        if (n >= 1 && n <= 99) return toRoman(n);
        return 'I';
    }
    if (/^(X{0,3})(IX|IV|V?I{0,3})$/.test(token)) return token;
    return 'I';
}

function shortTeamLabel(league, teamName) {
    const age = matchAgeClass(league);
    if (age) return `${age} ${parseTeamRank(teamName)}`;
    return shortLeague(league);
}

function isPokalMatch(m) {
    return String(m?.competition || '').toLowerCase() === 'pokal';
}

//Filter-Key: Pokal wird zu genau einer "POKAL"-Pille zusammengefasst,
//alle anderen Spiele behalten ihren Liga-Namen als Key (1 Gruppe = 1 Team).
function filterKey(m) {
    if (isPokalMatch(m)) return POKAL_KEY;
    return m.league || 'Liga';
}

//Eindeutige Filter in chronologischer Reihenfolge, mit erstem teamName als Label-Basis.
function distinctFilterKeys(matches) {
    const seen = [];
    const rep = new Map();
    for (const m of matches) {
        const key = filterKey(m);
        if (!seen.includes(key)) {
            seen.push(key);
            rep.set(key, { key, league: m.league || '', teamName: m.teamName || '' });
        }
    }
    return seen.map(k => rep.get(k));
}

function filterMatchesByKey(allMatches, key) {
    if (key === 'alle') return allMatches;
    if (key === POKAL_KEY) return allMatches.filter(isPokalMatch);
    return allMatches.filter(m => (m.league || 'Liga') === key);
}

function labelForMatch(m) {
    if (LEAGUE_LABEL_MODE !== 'team') return m.league ? shortLeague(m.league) : '';
    if (isPokalMatch(m)) return 'POKAL';
    return shortTeamLabel(m.league, m.teamName);
}

//Aggregate über eine (ggf. gefilterte) Matchliste
function aggregate(matches) {
    const total = matches.reduce((s, m) => s + (m.playerScore || 0), 0);
    return {
        total,
        avg: matches.length ? Math.round(total / matches.length) : 0,
        siege: matches.reduce((s, m) => s + (m.wins || 0), 0),
        niederlagen: matches.reduce((s, m) => s + (m.losses || 0), 0)
    };
}

//average thresholds, same as meeting modal
function scoreClass(score) {
    if (score == 0) return 'six';
    if (score < 0) return 'one';
    if (score < 100) return 'two';
    if (score < 200) return 'three';
    if (score < 300) return 'four';
    return 'five';
}

function barHeight(score, maxPos) {
    if (score > 0) return Math.max(6, Math.round((100 * score) / Math.max(1, maxPos)));
    if (score < 0) return 7;
    return 5;
}

function fmtDate(iso) {
    if (!iso) return '';
    const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    let d;
    if (m) {
        const shifted = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) + 2 * 3600 * 1000);
        d = new Date(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
    } else {
        d = new Date(iso);
    }
    if (isNaN(d)) return String(iso).slice(0, 10);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' }).toUpperCase();
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
    el.className = 'player-status';
    el.textContent = text;
    return el;
}

function hasModalOpen(id) { const el = document.getElementById(id); return !!(el && el.classList.contains('active')); }

function clearStackIfAllClosed() {
    if (!hasModalOpen('player-modal') && !hasModalOpen('meeting-modal')) navStack = [];
}

function ensurePlayerHeader() {
    const header = document.querySelector('#player-modal .modal-header');
    if (!header) return null;
    let back = header.querySelector('[data-player-back]');
    if (!back) {
        back = document.createElement('button');
        back.type = 'button';
        back.setAttribute('data-player-back', '');
        back.className = 'modal-back-btn';
        back.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
        back.title = 'Zurück zum Spiel';
        back.addEventListener('click', () => {
            const top = navStack[navStack.length - 1];
            if (!top || top.type !== 'meeting') return;
            navStack.pop();
            closeModal(document.getElementById('player-modal'));
            const hdr = document.querySelector('#player-modal .modal-title');
            if (hdr) hdr.textContent = 'Spieler';
            openMeetingById(top.meetingId, { fromStack: true });
        });
        header.prepend(back);
    }
    return back;
}

function render() {
    const body = document.getElementById('player-modal-body');
    if (!body || !currentData) return;
    body.replaceChildren();

    const { profile, season } = currentData;
    const allMatches = [...(season.matches || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
    const leagues = distinctLeagues(allMatches);
    const teamMode = LEAGUE_LABEL_MODE === 'team';
    //Team-Modus: 1 Filter-Key pro Liga (1 Gruppe = 1 Team) + genau 1 POKAL-Key.
    //Gruppierung bleibt liga-identisch, nur Labels und Pokal-Zusammenfassung sind neu.
    const filterKeys = teamMode ? distinctFilterKeys(allMatches) : [];
    const validKeys = teamMode ? ['alle', ...filterKeys.map(f => f.key)] : ['alle', ...leagues];
    if (!validKeys.includes(currentLeague)) currentLeague = 'alle';
    const matches = teamMode
        ? filterMatchesByKey(allMatches, currentLeague)
        : (currentLeague === 'alle' ? allMatches : allMatches.filter(m => (m.league || 'Liga') === currentLeague));
    const agg = aggregate(matches);
    const last = matches[matches.length - 1];
    const firstName = profile?.firstName || last?.firstName || currentMeta.firstName || '';
    const lastName = profile?.lastName || last?.lastName || currentMeta.lastName || '—';
    const clubId = last?.clubId || currentMeta.clubId || '';

    const wrap = document.createElement('div');
    wrap.className = 'player-container';

    const playerTitle = `${firstName} ${lastName}`.trim() || 'Spieler';
    const modalHeaderTitle = document.querySelector('#player-modal .modal-title');
    const backBtn = ensurePlayerHeader();
    const showPlayerBack = navStack.length && navStack[navStack.length - 1]?.type === 'meeting';
    if (backBtn) backBtn.style.display = showPlayerBack ? '' : 'none';
    if (currentTab === 'leistung') {
        // Leistung: hero collapsed — name moves to the modal header for maximum bar space
        if (modalHeaderTitle) modalHeaderTitle.textContent = lastName ? lastName.toUpperCase() : playerTitle.toUpperCase();
    } else {
        if (modalHeaderTitle) modalHeaderTitle.textContent = 'Spieler';
        // ——— HERO ——— (only on Übersicht)
        const hero = document.createElement('div');
        hero.className = 'player-hero';
        const heroNames = document.createElement('div');
        heroNames.className = 'player-hero-names';
        const phFirst = document.createElement('div');
        phFirst.className = 'ph-first';
        phFirst.textContent = firstName;
        const phLast = document.createElement('div');
        phLast.className = 'ph-last';
        phLast.textContent = lastName;
        heroNames.append(phFirst, phLast);
        hero.appendChild(heroNames);
        const pillCount = teamMode ? filterKeys.length : leagues.length;
        if (pillCount > 1) {
            const heroPills = document.createElement('div');
            heroPills.className = 'player-hero-badges';
            const mkHeroPill = (label, active, fullName) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.textContent = label;
                b.title = fullName || label;
                if (active) b.classList.add('active');
                return b;
            };
            const bAll = mkHeroPill('ALLE', currentLeague === 'alle', 'Alle Ligen und Pokal');
            bAll.addEventListener('click', () => { if (currentLeague !== 'alle') { currentLeague = 'alle'; render(); }});
            heroPills.appendChild(bAll);
            if (teamMode) {
                for (const f of filterKeys) {
                    const isPokal = f.key === POKAL_KEY;
                    const label = isPokal ? 'POKAL' : shortTeamLabel(f.league, f.teamName);
                    const full = isPokal ? 'Alle Pokalspiele' : `${f.teamName ? f.teamName + ' · ' : ''}${f.league}`;
                    const b = mkHeroPill(label, currentLeague === f.key, full);
                    b.addEventListener('click', () => { if (currentLeague !== f.key) { currentLeague = f.key; render(); }});
                    heroPills.appendChild(b);
                }
            } else {
            for (const name of leagues) {
                const b = mkHeroPill(shortLeague(name), currentLeague === name, name);
                b.addEventListener('click', () => { if (currentLeague !== name) { currentLeague = name; render(); }});
                heroPills.appendChild(b);
            }
            }
            hero.appendChild(heroPills);
        }
        // ——— META ROW ——— (only on Übersicht)
        const meta = document.createElement('div');
        meta.className = 'player-meta';
        const metaLeft = document.createElement('div');
        metaLeft.className = 'player-meta-left';
        if (clubId) metaLeft.appendChild(logoImg(clubId));
        const metaTeam = document.createElement('span');
        metaTeam.className = 'player-meta-team';
        metaTeam.textContent = currentLeague === 'alle'
            ? (allMatches[0]?.teamName || '')
            : (matches[0]?.teamName || '');
        metaLeft.appendChild(metaTeam);
        const scouted = document.createElement('button');
        scouted.type = 'button';
        const scoutedActive = isScouted(currentMeta.personId);
        scouted.className = 'player-scouted ' + (scoutedActive ? 'is-active' : 'is-inactive');
        scouted.setAttribute('aria-pressed', String(scoutedActive));
        scouted.innerHTML = scoutedActive
            ? '<i class="fa-regular fa-eye"></i> GESCOUTED'
            : '<i class="fa-regular fa-eye"></i> SCOUTEN';
        scouted.addEventListener('click', () => {
            const wasActive = isScouted(currentMeta.personId);
            toggleScouted({
                personId: currentMeta.personId,
                firstName: firstName,
                lastName: lastName,
                clubId: clubId,
                season: currentMeta.season || '',
                groupId: currentMeta.groupId || ''
            });
            const nowActive = !wasActive;
            scouted.classList.toggle('is-active', nowActive);
            scouted.classList.toggle('is-inactive', !nowActive);
            scouted.setAttribute('aria-pressed', String(nowActive));
            scouted.innerHTML = nowActive
                ? '<i class="fa-regular fa-eye"></i> GESCOUTED'
                : '<i class="fa-regular fa-eye"></i> SCOUTEN';
            scouted.classList.remove('is-popping');
            void scouted.offsetWidth;
            scouted.classList.add('is-popping');
            setTimeout(() => scouted.classList.remove('is-popping'), 200);
        });
        meta.append(metaLeft, scouted);
        wrap.append(hero, meta);
    }

    // ——— SCROLL AREA ———
    const scroll = document.createElement('div');
    scroll.className = 'player-scroll';

    if (currentTab === 'uebersicht') {
        // form dots only on Übersicht
        const form = document.createElement('div');
        form.className = 'player-form';
        const last5 = matches.slice(-5);
        if (!last5.length) {
            const s = document.createElement('span'); s.className = 'six'; form.appendChild(s);
        }
        for (const m of last5) {
            const s = document.createElement('span');
            s.className = scoreClass(m.playerScore);
            s.title = `${fmtDate(m.date)}: ${m.playerScore}`;
            form.appendChild(s);
        }
        scroll.appendChild(form);
    } else if ((teamMode ? filterKeys.length : leagues.length) > 1) {
        // Leistung: replace form dots with league/team pills
        const scope = document.createElement('div');
        scope.className = 'player-scope';
        const mkPill = (label, active, fullName) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            b.title = fullName || label;
            if (active) b.classList.add('active');
            return b;
        };
        const bAll = mkPill('ALLE', currentLeague === 'alle', 'Alle Ligen und Pokal');
        bAll.addEventListener('click', () => { if (currentLeague !== 'alle') { currentLeague = 'alle'; render(); }});
        scope.appendChild(bAll);
        if (teamMode) {
            for (const f of filterKeys) {
                const isPokal = f.key === POKAL_KEY;
                const label = isPokal ? 'POKAL' : shortTeamLabel(f.league, f.teamName);
                const full = isPokal ? 'Alle Pokalspiele' : `${f.teamName ? f.teamName + ' · ' : ''}${f.league}`;
                const b = mkPill(label, currentLeague === f.key, full);
                b.addEventListener('click', () => { if (currentLeague !== f.key) { currentLeague = f.key; render(); }});
                scope.appendChild(b);
            }
        } else {
        for (const name of leagues) {
            const b = mkPill(shortLeague(name), currentLeague === name, name);
            b.addEventListener('click', () => { if (currentLeague !== name) { currentLeague = name; render(); }});
            scope.appendChild(b);
        }
        }
        scroll.appendChild(scope);
    }

    if (currentTab === 'uebersicht') scroll.appendChild(renderUebersichtContent(matches, agg));
    else scroll.appendChild(renderLeistungContent(matches, agg));
    wrap.appendChild(scroll);

    // ——— BOTTOM TABS ———
    const bottom = document.createElement('div');
    bottom.className = 'player-bottombar';
    const bu = document.createElement('button');
    bu.type = 'button';
    bu.classList.toggle('active', currentTab === 'uebersicht');
    bu.innerHTML = '<i class="fa-solid fa-table-cells"></i> ÜBERSICHT';
    bu.addEventListener('click', () => { if (currentTab !== 'uebersicht') { currentTab = 'uebersicht'; render(); }});
    const bl = document.createElement('button');
    bl.type = 'button';
    bl.classList.toggle('active', currentTab === 'leistung');
    bl.innerHTML = '<i class="fa-solid fa-chart-simple"></i> LEISTUNG';
    bl.addEventListener('click', () => { if (currentTab !== 'leistung') { currentTab = 'leistung'; render(); }});
    bottom.append(bu, bl);
    wrap.appendChild(bottom);

    body.appendChild(wrap);

    requestAnimationFrame(() => {
        body.querySelectorAll('.leistung-fill[data-h]').forEach(el => {
            const target = el.dataset.h;
            el.animate([{ height: '0%' }, { height: `${target}%` }], { duration: 450, easing: 'ease-out', fill: 'forwards' });
            el.style.height = `${target}%`;
        });
    });
}

function openMeetingById(meetingId, opts = {}) {
    // push player onto stack only for genuine player->meeting navigations, not for back pops
    if (opts.fromPlayer) {
        navStack.push({
            type: 'player',
            personId: currentMeta?.personId,
            meta: currentMeta ? { ...currentMeta } : null,
            data: currentData,
            league: currentLeague,
            tab: currentTab
        });
    }
    const body = document.getElementById('meeting-modal-body');
    closeModal(document.getElementById('player-modal'));
    if (body) {
        body.replaceChildren();
        const holder = document.createElement('div');
        holder.className = 'kb-meeting-loader';
        holder.appendChild(spinnerEl('Lade Spieldaten …'));
        body.appendChild(holder);
    }
    ensureMeetingHeader(true);
    openModal(document.getElementById('meeting-modal'));
    fetch(`${API}/meeting/${encodeURIComponent(meetingId)}`)
        .then(r => { if (!r.ok) throw new Error(`Server ${r.status}`); return r.json(); })
        .then(info => {
            if (body) body.replaceChildren();
            // meetingModal is imported via meeting-modal.js global — use dynamic import fallback
            const mod = document.querySelector('[template="modal-meeting-item"]');
            if (!mod) { if (body) body.textContent = 'Spieldetails konnten nicht geladen werden.'; return; }
            // lazy import to avoid circular init
            import('./meeting-modal.js').then(m => m.meetingModal(info)).catch(() => {
                if (body) body.textContent = 'Spieldetails konnten nicht geladen werden.';
            });
        })
        .catch(() => { if (body) body.textContent = 'Spieldetails konnten nicht geladen werden.'; });
}

function ensureMeetingHeader(showBack) {
    const header = document.querySelector('#meeting-modal .modal-header');
    if (!header) return;
    let back = header.querySelector('[data-meeting-back]');
    if (!back) {
        back = document.createElement('button');
        back.type = 'button';
        back.setAttribute('data-meeting-back', '');
        back.className = 'modal-back-btn';
        back.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
        back.title = 'Zurück zum Spieler';
        back.addEventListener('click', () => {
            const top = navStack[navStack.length - 1];
            if (!top || top.type !== 'player') return;
            navStack.pop();
            closeModal(document.getElementById('meeting-modal'));
            const h = document.querySelector('#meeting-modal .modal-title');
            if (h) h.textContent = 'Matchcenter';
            currentMeta = top.meta;
            currentData = top.data;
            currentLeague = 'alle';
            currentTab = top.tab || 'uebersicht';
            openModal(document.getElementById('player-modal'));
            if (currentData) render();
            else loadPlayer();
        });
        header.prepend(back);
    }
    const show = showBack && navStack.length && navStack[navStack.length - 1]?.type === 'player';
    back.style.display = show ? '' : 'none';
    const title = header.querySelector('.modal-title');
    if (!showBack && title) title.textContent = 'Matchcenter';
}

function renderUebersichtContent(matches, agg) {
    const frag = document.createDocumentFragment();
    const { profile } = currentData;

    // top row: Kickbase-like two cards — left: Punkte+Ø stacked, right: TTR+TTR-deltas stacked
    const top = document.createElement('div');
    top.className = 'player-cards';
    const cLeft = document.createElement('div'); cLeft.className = 'player-card';
    cLeft.innerHTML = `<div class="v">${agg.total.toLocaleString('de-DE')}</div><div class="l">Punkte</div><div class="v" style="margin-top:0.6em">${agg.avg}</div><div class="l">Ø Punkte</div>`;
    const cRight = document.createElement('div'); cRight.className = 'player-card';
    const lastDelta = profile?.lastGame?.delta;
    let ttrTop = '';
    if (typeof lastDelta === 'number') {
        const neg = lastDelta < 0;
        const cls = neg ? 'neg' : (lastDelta > 0 ? 'pos' : '');
        const icon = neg ? 'fa-arrow-trend-down' : (lastDelta > 0 ? 'fa-arrow-trend-up' : 'fa-minus');
        // no "+-5" — sign comes from the number itself; only add "+" for positives
        const sign = lastDelta > 0 ? `+${lastDelta}` : `${lastDelta}`;
        ttrTop = `<div class="t ${cls}"><i class="fa-solid ${icon}"></i> ${sign} TTR letztes Spiel</div>`;
    }
    const d = profile?.delta3m;
    let deltaBlock = '';
    if (d && typeof d.delta === 'number') {
        const neg = d.delta < 0;
        const cls = neg ? 'neg' : (d.delta > 0 ? 'pos' : '');
        const sign = d.delta > 0 ? `+${d.delta}` : `${d.delta}`;
        deltaBlock = `<div class="v ${cls}" style="font-size:0.95em;margin-top:0.45em">${sign}</div><div class="l">letzte 3 Monate</div>`;
    } else {
        deltaBlock = `<div class="v">—</div><div class="l">letzte 3 Monate</div>`;
    }
    cRight.innerHTML = `${ttrTop}<div class="v">${profile?.ttr ?? '—'}</div><div class="l">TTR</div>${deltaBlock}`;
    top.append(cLeft, cRight);
    frag.appendChild(top);

    // row 3: triple
    const triple = document.createElement('div'); triple.className = 'player-triple';
    const mkMini = (v, label) => { const e = document.createElement('div'); e.className = 'player-card'; e.style.minHeight = '3.6em'; e.innerHTML = `<div class="v" style="font-size:1.15em">${v}</div><div class="l">${label}</div>`; return e; };
    triple.append(mkMini(matches.length, 'Einsätze'), mkMini(agg.siege, 'Siege'), mkMini(agg.niederlagen, 'Niederlagen'));
    frag.appendChild(triple);

    if (!profile && currentData.profileError === 'needLogin') {
        frag.appendChild(statusEl('TTR-Daten brauchen einen frischen myTT-Login (Server). Punkte stimmen trotzdem.'));
    }

    // last matches — tap to open meeting
    const title = document.createElement('div'); title.className = 'player-section-title'; title.textContent = 'Letzte Spiele';
    frag.appendChild(title);
    const lm = document.createElement('div'); lm.className = 'player-lastmatches';
    const last3 = matches.slice(-3).reverse();
    if (!last3.length) lm.appendChild(statusEl('Keine Ligaspiele gefunden.'));
    for (const m of last3) {
        const row = document.createElement('button'); row.type = 'button'; row.className = 'player-lastmatch as-button';
        row.dataset.meetingId = String(m.meetingId || '');
        if (!m.meetingId) row.disabled = true;
        const date = document.createElement('span'); date.className = 'lm-date'; date.textContent = fmtDate(m.date);
        const center = document.createElement('span'); center.className = 'lm-center';
        center.appendChild(logoImg(m.clubId));
        const sc = document.createElement('span'); sc.className = 'lm-score'; sc.textContent = `${m.teamHome ?? '–'}:${m.teamAway ?? '–'}`; sc.title = `${m.teamName} vs ${m.opponentName}`;
        center.append(sc, logoImg(m.opponentClubId));
        const ps = document.createElement('span'); ps.className = `lm-pscore ${scoreClass(m.playerScore)}`; ps.textContent = m.playerScore;
        row.append(date, center, ps);
        if (m.meetingId) row.addEventListener('click', () => openMeetingById(m.meetingId, { fromPlayer: true }));
        lm.appendChild(row);
    }
    frag.appendChild(lm);
    return frag;
}

function renderLeistungContent(matches, agg) {
    const frag = document.createDocumentFragment();

    const head = document.createElement('div'); head.className = 'leistung-head';
    const seasonLabel = document.createElement('span'); seasonLabel.textContent = currentData.season?.season ? String(currentData.season.season).replace('/', ' / ') : '';
    // keep empty if unknown; right side intentionally blank like reference (numbers on bars)
    head.appendChild(seasonLabel);
    frag.appendChild(head);

    const scroll = document.createElement('div'); scroll.className = 'leistung-scroll';
    const maxPos = Math.max(1, ...matches.map(m => m.playerScore));
    if (!matches.length) scroll.appendChild(statusEl('Keine Ligaspiele gefunden.'));
    matches.forEach((m, i) => {
        const col = document.createElement('button'); col.type = 'button'; col.className = 'leistung-col as-button';
        col.dataset.meetingId = String(m.meetingId || '');
        if (!m.meetingId) col.disabled = true;
        const top = document.createElement('span'); top.className = 'lc-top'; top.textContent = `#${i + 1}`;
        const logos = document.createElement('span'); logos.className = 'lc-logos';
        logos.append(logoImg(m.clubId), logoImg(m.opponentClubId));
        const res = document.createElement('span'); res.className = 'lc-result'; res.textContent = `${m.teamHome ?? '–'}:${m.teamAway ?? '–'}`; res.title = `${m.teamName} vs ${m.opponentName}`;
        const track = document.createElement('div'); track.className = 'leistung-track';
        const fill = document.createElement('div'); const h = barHeight(m.playerScore, maxPos);
        fill.className = `leistung-fill ${scoreClass(m.playerScore)}`; fill.style.height = '0%'; fill.dataset.h = String(h);
        track.appendChild(fill);
        const val = document.createElement('span'); val.className = `lc-score ${scoreClass(m.playerScore)}`; val.textContent = m.playerScore;
        const sub = document.createElement('span'); sub.className = 'lc-sub'; sub.textContent = labelForMatch(m); sub.title = isPokalMatch(m) ? 'Pokal' : (m.league || '');
        col.append(top, logos, res, track, val, sub);
        if (m.meetingId) col.addEventListener('click', () => openMeetingById(m.meetingId, { fromPlayer: true }));
        scroll.appendChild(col);
    });
    frag.appendChild(scroll);

    const cards = document.createElement('div'); cards.className = 'player-cards';
    const mk = (v, label) => { const e = document.createElement('div'); e.className = 'player-card'; e.innerHTML = `<div class="v">${v}</div><div class="l">${label}</div>`; return e; };
    // reference bottom shows 3 stats; we keep the 2 we have (Ø + Gesamt) — layout stays 2-col
    cards.append(mk(agg.avg, 'Ø Punkte'), mk(agg.total, 'Gesamtpunkte'));
    frag.appendChild(cards);
    return frag;
}

//--- modal helpers (same pattern as modal.js / liga.js) ---
function openModal(modal) {
    if (!modal) return;
    modal.classList.add('active');
    document.getElementById('modal-overlay')?.classList.add('active');
}

function closeModal(modal) {
    if (!modal) return;
    const wasPlayer = modal.id === 'player-modal';
    const wasMeeting = modal.id === 'meeting-modal';
    modal.classList.remove('active');
    if (!document.querySelector('.modal.active')) {
        document.getElementById('modal-overlay')?.classList.remove('active');
    }
    if (wasPlayer) {
        const t = document.querySelector('#player-modal .modal-title');
        if (t) t.textContent = 'Spieler';
    }
    if (wasMeeting) {
        const title = document.querySelector('#meeting-modal .modal-title');
        if (title) title.textContent = 'Matchcenter';
    }
    // only clear the whole navigation chain when no modal remains open (X / overlay close all)
    setTimeout(() => {
        clearStackIfAllClosed();
        // refresh back-button visibility after stack potentially cleared
        const pb = document.querySelector('#player-modal [data-player-back]');
        if (pb) pb.style.display = navStack.length && navStack[navStack.length - 1]?.type === 'meeting' ? '' : 'none';
        const mb = document.querySelector('#meeting-modal [data-meeting-back]');
        if (mb) mb.style.display = navStack.length && navStack[navStack.length - 1]?.type === 'player' ? '' : 'none';
    }, 0);
}
