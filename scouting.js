// Renders Scout List on index.html — tap row opens player modal.
// Reads localStorage via scouted.js; fetches Gesamtpunkte live per player.

import { getScouted, subscribe } from './scouted.js';
import { openPlayerView } from './player-view.js';

const API = (typeof window !== 'undefined' && window.TT_API_BASE) || '';
const pointsCache = new Map(); // personId -> {total, at}

async function fetchPoints(personId, clubId, season) {
    const cached = pointsCache.get(String(personId));
    if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.total;
    try {
        let data;
        if (clubId && season) {
            const r = await fetch(`${API}/player/${encodeURIComponent(personId)}/career?clubId=${encodeURIComponent(clubId)}&season=${encodeURIComponent(season)}&includePokal=1`);
            if (r.ok) data = await r.json();
        }
        if (!data) {
            // fallback: try any group? use the warm season if available — try career with just season
            const r = await fetch(`${API}/player/${encodeURIComponent(personId)}/career?clubId=${encodeURIComponent(clubId || '22107')}&season=${encodeURIComponent(season || '26--27')}&includePokal=1`);
            if (r.ok) data = await r.json();
        }
        if (!data) return null;
        const matches = data.season?.matches || data.matches || [];
        const total = matches.reduce((s, m) => s + (m.playerScore || 0), 0);
        // alternative: data.season.total if provided
        const val = (data.season && typeof data.season.total === 'number') ? data.season.total : total;
        pointsCache.set(String(personId), { total: val, at: Date.now() });
        return val;
    } catch { return null; }
}

function logoImg(clubId) {
    const img = document.createElement('img');
    img.src = `./logos/${clubId || 'x'}.png`;
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = () => {
        if (!img.dataset.fallback) { img.dataset.fallback = 'true'; img.src = 'imgs/table-tennis.png'; }
        else img.style.display = 'none';
    };
    return img;
}

function renderRow(player) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scout-row is-loading';
    btn.dataset.personId = player.personId;

    const logo = logoImg(player.clubId);
    const names = document.createElement('div');
    names.className = 'scout-row-names';
    const last = document.createElement('div');
    last.className = 'scout-last';
    last.textContent = (player.lastName || '—').toUpperCase();
    const first = document.createElement('div');
    first.className = 'scout-first';
    first.textContent = (player.firstName || '').toLowerCase();
    names.append(last, first);

    const pts = document.createElement('div');
    pts.className = 'scout-row-points';
    pts.innerHTML = `<span data-points>—</span> <i class="fa-solid fa-chart-simple"></i>`;

    btn.append(logo, names, pts);
    btn.addEventListener('click', () => {
        openPlayerView(player.personId, { clubId: player.clubId, season: player.season });
    });

    // async fill points (shimmer until resolved)
    fetchPoints(player.personId, player.clubId, player.season).then(val => {
        const el = btn.querySelector('[data-points]');
        if (el) el.textContent = (val == null ? '—' : String(val));
        btn.classList.remove('is-loading');
    });

    return btn;
}

function renderList() {
    const container = document.querySelector('.scout-list-container');
    if (!container) return;
    const list = getScouted();
    // newest first (reverse addedAt)
    const sorted = [...list].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    container.replaceChildren();
    if (!sorted.length) {
        const e = document.createElement('div');
        e.className = 'scout-empty';
        e.textContent = 'Noch keine Spieler gescoutet — tippe im Spiel auf einen Namen.';
        container.appendChild(e);
        return;
    }
    for (const p of sorted) container.appendChild(renderRow(p));
}

document.addEventListener('DOMContentLoaded', () => {
    renderList();
    subscribe(() => renderList());
});
