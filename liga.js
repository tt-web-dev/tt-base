import { meetingModal } from './meeting-modal.js'
import { spinnerEl, showMeetingLoading } from './loading.js'

const API = (typeof window !== 'undefined' && window.TT_API_BASE) || '';
const STORAGE_KEY = 'liga-groupId'
const TSV_CLUB_ID = '22107'

let leagueTeams = []
let selectedGroupId = localStorage.getItem(STORAGE_KEY) || ''
let ligaData = null
let currentView = 'begegnungen'
let tableCache = {}
let currentLeagueName = ''

const datePillFormatter = new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
})

document.addEventListener('DOMContentLoaded', () => {
    initModals()
    initTabs()
    loadLeagues()
})

function prettySlug(slug) {
    return String(slug || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
}

async function loadLeagues() {
    setStatus('Lade Ligen …')
    try {
        const res = await fetch(`${API}/teams`)
        if (!res.ok) throw new Error(`Server Error: ${res.status}`)
        const teams = await res.json()
        //one entry per league (groupId), keep first team per league — all teams[] entries, not just active
        const seen = new Map()
        for (const t of teams) {
            const key = String(t.groupId)
            if (!seen.has(key)) seen.set(key, t)
        }
        leagueTeams = [...seen.values()]
        if (!leagueTeams.length) throw new Error('Keine Ligen in teams[] gefunden.')
        if (!leagueTeams.some(t => String(t.groupId) === selectedGroupId)) {
            selectedGroupId = String(leagueTeams[0].groupId)
            localStorage.setItem(STORAGE_KEY, selectedGroupId)
        }
        renderLeagueList()
        await loadLiga(selectedGroupId)
    } catch (error) {
        console.error(error)
        setStatus('Ligen konnten nicht geladen werden. Läuft der Server auf Port 3000?')
    }
}

function renderLeagueList() {
    const list = document.getElementById('ligaselect-list')
    if (!list) return
    list.replaceChildren()
    leagueTeams.forEach(team => {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'liga-select-row' + (String(team.groupId) === selectedGroupId ? ' active' : '')
        const img = document.createElement('img')
        img.src = `./logos/${team.clubId}.png`
        img.alt = ''
        img.loading = 'lazy'
        img.onerror = () => {
            if (!img.dataset.fallback) {
                img.dataset.fallback = 'true'
                img.src = 'imgs/table-tennis.png'
            } else {
                img.style.display = 'none'
            }
        }
        const txt = document.createElement('span')
        const ligaName = prettySlug(team.league_slug)
        txt.textContent = team.anzeigeName ? `${team.anzeigeName} · ${ligaName}` : ligaName
        btn.append(img, txt)
        btn.addEventListener('click', () => {
            selectedGroupId = String(team.groupId)
            localStorage.setItem(STORAGE_KEY, selectedGroupId)
            renderLeagueList()
            closeModal(document.getElementById('ligaselect-modal'))
            reloadCurrentView()
        })
        list.appendChild(btn)
    })
}

async function loadLiga(groupId) {
    setStatus('Lade Spielplan …')
    const listEl = document.getElementById('liga-list')
    if (listEl) showLigaLoading(listEl, 'Lade Spielplan …')
    try {
        const res = await fetch(`${API}/liga?groupId=${encodeURIComponent(groupId)}`)
        if (!res.ok) throw new Error(`Server Error: ${res.status}`)
        ligaData = await res.json()
        currentLeagueName = ligaData.league_name || ligaData.teamLabel || ''
        updateHeaderName()
        renderLeagueListWithRealNames()
        renderMatchdays()
        jumpToNearest()
    } catch (error) {
        console.error(error)
        setStatus('Spielplan konnte nicht geladen werden.')
    }
}

function updateHeaderName() {
    const el = document.getElementById('liga-select-name')
    if (!el) return
    el.textContent = (currentLeagueName || 'LIGA').toUpperCase()
}

function renderLeagueListWithRealNames() {
    if (!currentLeagueName) return
    const rows = document.querySelectorAll('#ligaselect-list .liga-select-row')
    rows.forEach((row, i) => {
        const team = leagueTeams[i]
        if (!team) return
        const span = row.querySelector('span')
        if (String(team.groupId) === selectedGroupId && span) {
            span.textContent = `${team.anzeigeName} · ${currentLeagueName}`
        }
    })
}

function renderMatchdays() {
    const listEl = document.getElementById('liga-list')
    if (!listEl || !ligaData) return
    listEl.replaceChildren()
    if (!ligaData.matchdays?.length) {
        setStatus('Keine Spiele in dieser Liga gefunden.')
        return
    }
    setStatus('')
    for (const day of ligaData.matchdays) {
        const card = document.createElement('section')
        card.className = 'spieltag-card'
        card.dataset.spieltag = String(day.spieltag)
        card.id = `spieltag-${day.spieltag}`

        const title = document.createElement('h2')
        title.className = 'spieltag-title'
        title.textContent = `SPIELTAG ${day.spieltag}`
        card.appendChild(title)

        for (const group of day.dateGroups) {
            card.appendChild(buildDatePill(group.date))
            //sort games within a day by time (backend already sorts, keep stable)
            const sorted = [...group.games].sort((a, b) => new Date(a.date) - new Date(b.date))
            for (const game of sorted) {
                card.appendChild(buildMatchRow(game))
            }
        }
        listEl.appendChild(card)
    }
}

function initTabs() {
    document.getElementById('tab-begegnungen')?.addEventListener('click', () => switchView('begegnungen'))
    document.getElementById('tab-tabelle')?.addEventListener('click', () => switchView('tabelle'))
}

function switchView(view) {
    currentView = view
    const isTable = view === 'tabelle'
    const tabB = document.getElementById('tab-begegnungen')
    const tabT = document.getElementById('tab-tabelle')
    tabB?.classList.toggle('active', !isTable)
    tabT?.classList.toggle('active', isTable)
    tabB?.setAttribute('aria-selected', String(!isTable))
    tabT?.setAttribute('aria-selected', String(isTable))
    const listEl = document.getElementById('liga-list')
    const tableEl = document.getElementById('liga-table')
    if (listEl) listEl.hidden = isTable
    if (tableEl) tableEl.hidden = !isTable
    window.__keepNavVisibleBriefly?.(500)
    window.scrollTo({ top: 0 })
    if (isTable) {
        loadTable(selectedGroupId)
    }
}

function reloadCurrentView() {
    if (currentView === 'tabelle') {
        loadTable(selectedGroupId, true)
    } else {
        loadLiga(selectedGroupId)
    }
}

async function loadTable(groupId, force = false) {
    const tableEl = document.getElementById('liga-table')
    if (!force && tableCache[groupId]) {
        renderTable(tableCache[groupId])
        return
    }
    setStatus('Lade Tabelle …')
    if (tableEl) showLigaLoading(tableEl, 'Lade Tabelle …')
    try {
        const res = await fetch(`${API}/tabelle?groupId=${encodeURIComponent(groupId)}`)
        if (!res.ok) throw new Error(`Server Error: ${res.status}`)
        const data = await res.json()
        tableCache[groupId] = data
        //league switch emits a fresh table payload — prefer its league name
        if (String(data.groupId) === String(selectedGroupId)) {
            currentLeagueName = data.league_name || currentLeagueName
        }
        updateHeaderName()
        renderLeagueListWithRealNames()
        if (currentView === 'tabelle' && String(data.groupId) === String(selectedGroupId)) {
            renderTable(data)
        }
    } catch (error) {
        console.error(error)
        setStatus('Tabelle konnte nicht geladen werden.')
    }
}

function renderTable(data) {
    const tableEl = document.getElementById('liga-table')
    if (!tableEl || !data) return
    tableEl.replaceChildren()
    if (!data.rows?.length) {
        setStatus('Keine Tabelle für diese Liga gefunden.')
        return
    }
    setStatus('')
    const card = document.createElement('div')
    card.className = 'tabelle-card'

    const head = document.createElement('div')
    head.className = 'tabelle-row tabelle-head'
    head.setAttribute('aria-hidden', 'true')
    head.innerHTML = '<span class="c-rank" title="Platz">#</span>' +
        '<span class="c-logo"></span>' +
        '<span class="c-name"></span>' +
        '<span class="c-stat" title="Spiele">SP</span>' +
        '<span class="c-stat" title="Satzdifferenz">SD</span>' +
        '<span class="c-stat" title="Punkte">P</span>'
    card.appendChild(head)

    const tendMarks = { rise: '▲', fall: '▼', steady: '•' }
    for (const row of data.rows) {
        const el = document.createElement('div')
        el.className = 'tabelle-row'
        if (String(row.clubId) === TSV_CLUB_ID) el.classList.add('is-own')
        if (row.excluded) el.classList.add('is-excluded')

        const rank = document.createElement('span')
        rank.className = 'c-rank'
        rank.textContent = row.rank

        const tend = document.createElement('span')
        tend.className = `c-tend tend-${row.tendency || 'steady'}`
        tend.textContent = tendMarks[row.tendency] || tendMarks.steady
        rank.appendChild(tend)

        const logoWrap = document.createElement('span')
        logoWrap.className = 'c-logo'
        const logo = document.createElement('img')
        logo.src = `./logos/${row.clubId}.png`
        logo.alt = ''
        logo.loading = 'lazy'
        logo.decoding = 'async'
        logo.draggable = false
        attachLogoFallback(logo)
        logoWrap.appendChild(logo)

        const name = document.createElement('span')
        name.className = 'c-name'
        name.textContent = row.teamName || '—'
        name.title = row.teamName || ''

        const sp = document.createElement('span')
        sp.className = 'c-stat'
        sp.textContent = row.meetings ?? '–'

        const sd = document.createElement('span')
        sd.className = 'c-stat'
        sd.textContent = row.setsRelation ?? '–'

        const pts = document.createElement('span')
        pts.className = 'c-stat c-points'
        pts.textContent = row.points ?? '–'

        el.append(rank, logoWrap, name, sp, sd, pts)
        card.appendChild(el)
    }
    tableEl.appendChild(card)
}

function buildDatePill(dateString) {
    const wrap = document.createElement('div')
    wrap.className = 'date-pill-row'
    const left = document.createElement('hr')
    const pill = document.createElement('span')
    pill.className = 'date-pill'
    pill.textContent = pillLabel(dateString)
    const right = document.createElement('hr')
    wrap.append(left, pill, right)
    return wrap
}

function pillLabel(dateString) {
    const d = new Date(dateString + 'T12:00:00')
    const today = startOfToday()
    const diffDays = Math.round((startOfDay(d) - today) / 86400000)
    if (diffDays === 0) return 'Heute'
    if (diffDays === 1) return 'Morgen'
    if (diffDays === -1) return 'Gestern'
    let s = datePillFormatter.format(d)
    return s.charAt(0).toUpperCase() + s.slice(1)
}

function buildMatchRow(game) {
    const finished = game.state === 'done'
    const row = document.createElement(finished ? 'button' : 'div')
    row.className = 'liga-match' + (finished ? ' is-done' : ' is-scheduled')
    if (finished) row.type = 'button'
    const isOwn = String(game.homeClubId) === TSV_CLUB_ID || String(game.awayClubId) === TSV_CLUB_ID
    if (isOwn) row.classList.add('is-own')

    const homeName = document.createElement('span')
    homeName.className = 'team home'
    homeName.textContent = game.homeName || '—'
    homeName.title = game.homeName || ''

    const homeLogo = document.createElement('img')
    homeLogo.src = `./logos/${game.homeClubId}.png`
    homeLogo.alt = ''
    homeLogo.loading = 'lazy'
    homeLogo.decoding = 'async'
    homeLogo.draggable = false
    attachLogoFallback(homeLogo)

    const center = document.createElement('span')
    center.className = 'center'
    center.textContent = finished ? `${game.homeScore} - ${game.awayScore}` : timeOf(game.date)

    const awayLogo = document.createElement('img')
    awayLogo.src = `./logos/${game.awayClubId}.png`
    awayLogo.alt = ''
    awayLogo.loading = 'lazy'
    awayLogo.decoding = 'async'
    awayLogo.draggable = false
    attachLogoFallback(awayLogo)

    const awayName = document.createElement('span')
    awayName.className = 'team away'
    awayName.textContent = game.awayName || '—'
    awayName.title = game.awayName || ''

    row.append(homeName, homeLogo, center, awayLogo, awayName)

    if (finished) {
        row.addEventListener('click', () => openMeeting(game.meetingId))
    }
    return row
}

function attachLogoFallback(img) {
    img.onerror = () => {
        if (!img.dataset.fallback) {
            img.dataset.fallback = 'true'
            img.src = 'imgs/table-tennis.png'
        } else {
            img.style.display = 'none'
        }
    }
}

function timeOf(isoString) {
    if (!isoString || isoString.length < 16) return '--:--'
    //myTT API times are UTC wall time, venue time is +2h (see meeting-modal.js)
    const m = String(isoString).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
    if (!m) return isoString.slice(11, 16)
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) + 2 * 3600 * 1000)
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function jumpToNearest() {
    if (!ligaData?.matchdays?.length) return
    const today = startOfToday()
    let target = null
    for (const day of ligaData.matchdays) {
        const hasUpcoming = day.dateGroups.some(g => startOfDay(new Date(g.date + 'T12:00:00')) >= today)
        if (hasUpcoming) {
            target = document.getElementById(`spieltag-${day.spieltag}`)
            break
        }
    }
    if (!target) {
        const last = ligaData.matchdays[ligaData.matchdays.length - 1]
        target = document.getElementById(`spieltag-${last.spieltag}`)
    }
    if (target) {
        window.__keepNavVisibleBriefly?.(800)
        requestAnimationFrame(() => {
            setTimeout(() => target.scrollIntoView({ block: 'start' }), 50)
        })
    }
}

async function openMeeting(meetingId) {
    const modalBody = document.getElementById('meeting-modal-body')
    if (modalBody) showMeetingLoading(modalBody, 'Lade Spieldaten …')
    openModal(document.getElementById('meeting-modal'))
    try {
        const res = await fetch(`${API}/meeting/${encodeURIComponent(meetingId)}`)
        if (!res.ok) throw new Error(`Server Error: ${res.status}`)
        const info = await res.json()
        if (modalBody) modalBody.replaceChildren()
        meetingModal(info)
    } catch (error) {
        console.error(error)
        if (modalBody) modalBody.textContent = 'Spieldetails konnten nicht geladen werden.'
    }
}

//--- modal handling (local copy of modal.js pattern, without calendar import) ---
function initModals() {
    const overlay = document.getElementById('modal-overlay')
    document.addEventListener('click', (event) => {
        const button = event.target.closest('[data-modal-target]')
        if (button) {
            const modal = document.querySelector(button.dataset.modalTarget)
            openModal(modal)
        }
    })
    if (overlay) {
        overlay.addEventListener('click', () => {
            document.querySelectorAll('.modal.active').forEach(closeModal)
        })
    }
    document.querySelectorAll('[data-modal-close-btn]').forEach(button => {
        button.addEventListener('click', () => closeModal(button.closest('.modal')))
    })
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            document.querySelectorAll('.modal.active').forEach(closeModal)
        }
    })
}

function openModal(modal) {
    if (!modal) return
    modal.classList.add('active')
    document.getElementById('modal-overlay')?.classList.add('active')
}

function closeModal(modal) {
    if (!modal) return
    modal.classList.remove('active')
    document.getElementById('modal-overlay')?.classList.remove('active')
    if (modal.id === 'meeting-modal') {
        document.getElementById('meeting-modal-body')?.replaceChildren()
    }
    if (modal.id === 'player-modal') {
        document.getElementById('player-modal-body')?.replaceChildren()
    }
}

function setStatus(text) {
    const el = document.getElementById('liga-status')
    if (!el) return
    el.textContent = text
    el.style.display = text ? '' : 'none'
}

function showLigaLoading(targetEl, label) {
    targetEl.replaceChildren()
    const holder = document.createElement('div')
    holder.className = 'kb-liga-loader'
    holder.appendChild(spinnerEl(label))
    targetEl.appendChild(holder)
}

function startOfToday() {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
