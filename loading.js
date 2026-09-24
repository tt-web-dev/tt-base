// Shared loaders — spinner (calendar/liga/meeting) + skeletons (player/scouting).
// Imported by calendar.js, liga.js, meeting-modal.js, player-view.js, scouting.js.
// Kept dependency-free so player-view <-> meeting-modal stay circular-import free.

export const BALL_SRC = 'imgs/table-tennis.png';

export function spinnerEl(label = '', orange = false) {
    const wrap = document.createElement('div');
    wrap.className = 'kb-loader-wrap';
    wrap.setAttribute('role', 'status');
    if (label) wrap.setAttribute('aria-label', label);

    const spinner = document.createElement('div');
    spinner.className = 'kb-spinner' + (orange ? ' kb-spinner-orange' : '');
    spinner.setAttribute('aria-hidden', 'true');
    const ball = document.createElement('img');
    ball.src = BALL_SRC;
    ball.alt = '';
    ball.draggable = false;
    ball.onerror = () => { ball.style.display = 'none'; };
    spinner.appendChild(ball);

    wrap.appendChild(spinner);
    if (label) {
        const text = document.createElement('div');
        text.className = 'kb-loader-label';
        text.textContent = label;
        wrap.appendChild(text);
    }
    return wrap;
}

// Meeting modal loading state: spinner centered in the modal body.
export function showMeetingLoading(container, label = 'Lade Spieldaten …') {
    if (!container) return null;
    container.replaceChildren();
    const holder = document.createElement('div');
    holder.className = 'kb-meeting-loader';
    holder.appendChild(spinnerEl(label));
    container.appendChild(holder);
    return holder;
}

// Player view loading state: Kickbase-like shimmer (hero + cards + rows + bars).
export function playerSkeletonEl() {
    const wrap = document.createElement('div');
    wrap.className = 'kb-player-skel';
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-label', 'Lade Spielerdaten');

    const hero = document.createElement('div');
    hero.className = 'kb-skel-hero';
    const hFirst = document.createElement('div');
    hFirst.className = 'kb-skel-line md';
    const hLast = document.createElement('div');
    hLast.className = 'kb-skel-line lg';
    const pills = document.createElement('div');
    pills.className = 'kb-skel-pills';
    for (let i = 0; i < 3; i++) {
        const p = document.createElement('div');
        p.className = 'kb-skel-pill';
        pills.appendChild(p);
    }
    hero.append(hFirst, hLast, pills);

    const cards = document.createElement('div');
    cards.className = 'kb-skel-cards';
    for (let i = 0; i < 2; i++) {
        const c = document.createElement('div');
        c.className = 'kb-skel-card';
        cards.appendChild(c);
    }

    const triple = document.createElement('div');
    triple.className = 'kb-skel-triple';
    for (let i = 0; i < 3; i++) {
        const c = document.createElement('div');
        c.className = 'kb-skel-card';
        triple.appendChild(c);
    }

    const bars = document.createElement('div');
    bars.className = 'kb-skel-bars';
    const heights = ['7em', '9.5em', '5.5em', '11em', '8.2em', '6.3em', '10.1em'];
    heights.forEach((h) => {
        const t = document.createElement('div');
        t.className = 'kb-skel-ball-track';
        t.style.height = h;
        bars.appendChild(t);
    });

    const rows = document.createElement('div');
    rows.className = 'kb-skel-rows';
    for (let i = 0; i < 3; i++) {
        const r = document.createElement('div');
        r.className = 'kb-skel-row';
        rows.appendChild(r);
    }

    wrap.append(hero, cards, triple, bars, rows);
    return wrap;
}

// Small helper for the teamselect modal while GET /teams is in flight.
export function teamselectSkeleton(count = 4) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
        const s = document.createElement('div');
        s.className = 'teamselect-skel';
        s.setAttribute('aria-hidden', 'true');
        frag.appendChild(s);
    }
    return frag;
}
