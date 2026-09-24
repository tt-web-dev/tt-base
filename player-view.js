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
    return fetch(`${API}${path}`).then(res => {
        if (!res.ok) {
            const err = new Error(`Server Error: ${res.status}`);
            err.status = res.status;
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
    if (currentLeague !== 'alle' && !leagues.includes(currentLeague)) currentLeague = 'alle';
    const matches = currentLeague === 'alle' ? allMatches : allMatches.filter(m => (m.league || 'Liga') === currentLeague);
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
        if (leagues.length > 1) {
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
            for (const name of leagues) {
                const b = mkHeroPill(shortLeague(name), currentLeague === name, name);
                b.addEventListener('click', () => { if (currentLeague !== name) { currentLeague = name; render(); }});
                heroPills.appendChild(b);
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
                season: currentMeta.season || ''
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
    } else if (leagues.length > 1) {
        // Leistung: replace form dots with league pills
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
        for (const name of leagues) {
            const b = mkPill(shortLeague(name), currentLeague === name, name);
            b.addEventListener('click', () => { if (currentLeague !== name) { currentLeague = name; render(); }});
            scope.appendChild(b);
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
        const sub = document.createElement('span'); sub.className = 'lc-sub'; sub.textContent = m.league ? shortLeague(m.league) : '';
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
