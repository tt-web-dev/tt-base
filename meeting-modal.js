import { openPlayerView } from './player-view.js'

export function meetingModal(meetingInfo) {
    const modalBody = document.getElementById('meeting-modal-body')
    const meetingElement = document.querySelector('[template="modal-meeting-item"]').content.cloneNode(true)


    const dateElement = meetingElement.querySelector('[data="meeting-modal-date"]')
    const leagueNameElement = meetingElement.querySelector('[data="meeting-modal-leaguename"]')
    const homeTeamElement = meetingElement.querySelector('[data="meeting-modal-team-home"]')
    const awayTeamElement = meetingElement.querySelector('[data="meeting-modal-team-away"]')
    const homeLogoElement = meetingElement.querySelector('[data="meeting-modal-logo-home"]')
    const awayLogoElement = meetingElement.querySelector('[data="meeting-modal-logo-away"]')
    const homeGamesElement = meetingElement.querySelector('[data="meeting-modal-games-home"]')
    const awayGamesElement = meetingElement.querySelector('[data="meeting-modal-games-away"]')
    const homeCoachElement = meetingElement.querySelector('[data="meeting-modal-coach-home"]')
    const awayCoachElement = meetingElement.querySelector('[data="meeting-modal-coach-away"]')
    const homeScoresElement = meetingElement.querySelector('[data="meeting-modal-scores-home"]')
    const awayScoresElement = meetingElement.querySelector('[data="meeting-modal-scores-away"]')


    //---

    dateElement.textContent = formatDate(meetingInfo.date)
    leagueNameElement.textContent = meetingInfo.league
    homeTeamElement.textContent = meetingInfo.home_team_name
    awayTeamElement.textContent = meetingInfo.away_team_name
    homeLogoElement.src = `/logos/${meetingInfo.home_clubId}.png`
    awayLogoElement.src = `/logos/${meetingInfo.away_clubId}.png`
    homeGamesElement.textContent = meetingInfo.home_matches_won
    awayGamesElement.textContent = meetingInfo.away_matches_won
    homeCoachElement.textContent = `${meetingInfo.home_coach_firstName} ${meetingInfo.home_coach_lastName}`
    awayCoachElement.textContent = `${meetingInfo.away_coach_firstName} ${meetingInfo.away_coach_lastName}`

    meetingInfo.home_players.forEach((p) => {
        const playerElement = document.querySelector("[template='modal-meeting-player-item']").content.cloneNode(true)

        const wrapperElement = playerElement.querySelector('.player-score-wrapper')
        const firstnameElement = playerElement.querySelector('[data="meeting-modal-firstname"]')
        const lastnameElement = playerElement.querySelector('[data="meeting-modal-lastname"]')
        const pscoreElement = playerElement.querySelector('[data="meeting-modal-pscore"]')

        firstnameElement.textContent = p.firstName
        lastnameElement.textContent = p.lastName
        pscoreElement.textContent = p.score
        if (p.personId) {
            wrapperElement.classList.add('as-button')
            wrapperElement.dataset.personId = p.personId
            wrapperElement.dataset.groupId = meetingInfo.groupId || ''
            wrapperElement.dataset.clubId = p.clubId || ''
            wrapperElement.dataset.season = meetingInfo.season || ''
            wrapperElement.dataset.meetingId = meetingInfo.meetingId || ''
        }
        if(p.score < 0){
            pscoreElement.classList.add('one')
        }
        if(p.score > 0 && p.score < 100){
            pscoreElement.classList.add('two')
        }
        if(p.score >= 100 && p.score < 200){
            pscoreElement.classList.add('three')
        }
        if(p.score >= 200 && p.score < 300){
            pscoreElement.classList.add('four')
        }
        if(p.score >= 300){
            pscoreElement.classList.add('five')
        }
        if(p.score == 0){
            pscoreElement.classList.add('six')
        }

        homeScoresElement.appendChild(playerElement)
    })

    meetingInfo.away_players.forEach((p) => {
        const playerElement = document.querySelector("[template='modal-meeting-player-item']").content.cloneNode(true)

        const wrapperElement = playerElement.querySelector('.player-score-wrapper')
        const firstnameElement = playerElement.querySelector('[data="meeting-modal-firstname"]')
        const lastnameElement = playerElement.querySelector('[data="meeting-modal-lastname"]')
        const pscoreElement = playerElement.querySelector('[data="meeting-modal-pscore"]')

        firstnameElement.textContent = p.firstName
        lastnameElement.textContent = p.lastName
        pscoreElement.textContent = p.score
        if (p.personId) {
            wrapperElement.classList.add('as-button')
            wrapperElement.dataset.personId = p.personId
            wrapperElement.dataset.groupId = meetingInfo.groupId || ''
            wrapperElement.dataset.clubId = p.clubId || ''
            wrapperElement.dataset.season = meetingInfo.season || ''
            wrapperElement.dataset.meetingId = meetingInfo.meetingId || ''
        }
        if(p.score < 0){
            pscoreElement.classList.add('one')
        }
        if(p.score > 0 && p.score < 100){
            pscoreElement.classList.add('two')
        }
        if(p.score >= 100 && p.score < 200){
            pscoreElement.classList.add('three')
        }
        if(p.score >= 200 && p.score < 300){
            pscoreElement.classList.add('four')
        }
        if(p.score >= 300){
            pscoreElement.classList.add('five')
        }
        if(p.score == 0){
            pscoreElement.classList.add('six')
        }

        awayScoresElement.appendChild(playerElement)
    })

    modalBody.appendChild(meetingElement)
}

//myTT API times are UTC wall time, venue time is +2h - shift literally,
//independent of the viewer's browser timezone (incl. day rollover).
function shiftApiTime2h(datestring) {
    const m = String(datestring || '').match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
    if (!m) return null
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) + 2 * 3600 * 1000)
}

function formatDate(datestring) {
    const d = shiftApiTime2h(datestring)
    if (!d) return String(datestring).slice(11, 16)
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

//player click (meeting modal -> player view), works on all pages using this module
document.addEventListener('click', (event) => {
    if (event.target.closest('[data-meeting-back]') || event.target.closest('[data-player-back]')) return;
    const btn = event.target.closest('.player-score-wrapper[data-person-id]')
    if (!btn || !btn.dataset.personId) return
    openPlayerView(btn.dataset.personId, {
        groupId: btn.dataset.groupId || '',
        clubId: btn.dataset.clubId || '',
        season: btn.dataset.season || '',
        meetingId: btn.dataset.meetingId || ''
    })
})
