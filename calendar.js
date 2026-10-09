import { meetingModal } from './meeting-modal.js'
import { spinnerEl, showMeetingLoading } from './loading.js'
import { getKnownDone, tsvState, isFixtureDay, noteFullResult } from './matchstate.js'

const API = (typeof window !== 'undefined' && window.TT_API_BASE) || '';
//import * as modal from './modal.js';
//idk if needed, but if, this imports all exported functions from modal.js, accessible as modal.functionx()
//----
document.addEventListener("DOMContentLoaded", function(event) {
    
    loadMatchdays()

})

document.addEventListener("date-change", (event) => {
    let selectedDate = event.detail.date;
    //hier request ob ein Spiel an dem Tag ist
    //wenn ja: Kontextmenü für das Spiel öffnen

    const todaysMeetings = matchdays.filter(m =>
        isTheSameDay(formatDate(m.date), selectedDate)
    );
    if (todaysMeetings.length === 0) {
        return;
    }

    // Clear previous content so one modal holds all meetings of the day (scrollable)
    const modalBody = document.getElementById('meeting-modal-body');
    if (modalBody) {
        showMeetingLoading(modalBody, 'Lade Spieldaten …');
    }

    let firstRendered = false;
    for (var i = 0; i < todaysMeetings.length; i++) {
        fetch(`${API}/meeting/${todaysMeetings[i].meetingId}`)
            .then(response => {
                if(!response.ok){
                    throw new Error(`Server Error: ${response.status} ${response.statusText}`)
                }
                return response.json()
            })
            .then(gameInfo => {
                meetingInfo = gameInfo
                console.log('meetingInfo:', meetingInfo)
                //show modified modal body
                //just call imported function that takes meetingInfo as param
                //works for played (scores) and scheduled (fixture card) alike
                if (modalBody && !firstRendered) {
                    firstRendered = true;
                    modalBody.replaceChildren();
                }
                meetingModal(meetingInfo)
            })
            .catch(error => {
                console.log(error)
                if (modalBody && !firstRendered) {
                    firstRendered = true;
                    modalBody.replaceChildren();
                    modalBody.textContent = 'Spieldetails konnten nicht geladen werden.';
                }
            })
    }
});

const calendarDayListItemTemplateElement = document.querySelector("[template='calendar-day-list-item']");

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
    month: 'long',
    year: 'numeric'
});

function formatDate(dateString) {
    const parts = dateString.split('-')
    const year = parseInt(parts[0], 10)
    const month = parseInt(parts[1], 10) - 1
    const day = parseInt(parts[2], 10)
    return new Date(year, month, day, 12)
}
//--- imported for calendar
function today() {
    const now = new Date();

    return new Date(
        now.getFullYear(),
                    now.getMonth(),
                    now.getDate(),
                    12
    );
}

function addMonths(date, months) {
    const firstDayOfMonth = new Date(
        date.getFullYear(),
                                     date.getMonth() + months,
                                     1,
                                     date.getHours()
    );
    const lastDayOfMonth = getLastDayOfMonthDate(firstDayOfMonth);

    const dayOfMonth = Math.min(date.getDate(), lastDayOfMonth.getDate());

    return new Date(
        date.getFullYear(),
                    date.getMonth() + months,
                    dayOfMonth,
                    date.getHours()
    );
}

function subtractMonths(date, months) {
    return addMonths(date, -months);
}

function addDays(date, days) {
    return new Date(
        date.getFullYear(),
                    date.getMonth(),
                    date.getDate() + days,
                    date.getHours()
    );
}

function subtractDays(date, days) {
    return addDays(date, -days);
}

function generateMonthCalendarDays(currentDate) {
    const calendarDays = [];

    const lastDayOfPreviousMonthDate = getLastDayOfMonthDate(
        subtractMonths(currentDate, 1)
    );

    const lastDayOfPreviousMonthWeekDay = (lastDayOfPreviousMonthDate.getDay() + 6) % 7;
    if (lastDayOfPreviousMonthWeekDay !== 6) {
        for (let i = lastDayOfPreviousMonthWeekDay; i >= 0; i -= 1) {
            const calendarDay = subtractDays(lastDayOfPreviousMonthDate, i);
            calendarDays.push(calendarDay);
        }
    }

    const lastDayOfCurrentMonthDate = getLastDayOfMonthDate(currentDate);
    for (let i = 1; i <= lastDayOfCurrentMonthDate.getDate(); i += 1) {
        const calendarDay = addDays(lastDayOfPreviousMonthDate, i);
        calendarDays.push(calendarDay);
    }

    const totalWeeks = Math.ceil(calendarDays.length / 7);
    const totalDays = totalWeeks * 7;
    const missingDayAmount = totalDays - calendarDays.length;
    for (let i = 1; i <= missingDayAmount; i += 1) {
        const calendarDay = addDays(lastDayOfCurrentMonthDate, i);
        calendarDays.push(calendarDay);
    }

    return calendarDays;
}

function isTheSameDay(dateA, dateB) {
    return dateA.getFullYear() === dateB.getFullYear() && dateA.getMonth() === dateB.getMonth() && dateA.getDate() === dateB.getDate();
}

function isTheSameMonth(dateA, dateB) {
    return dateA.getFullYear() === dateB.getFullYear() && dateA.getMonth() === dateB.getMonth();
}

function isTheSameYear(dateA, dateB) {
    return dateA.getFullYear() === dateB.getFullYear();
}

function generateWeekDays(date) {
    const weekDays = [];
    const firstWeekDay = subtractDays(date, date.getDay());

    for (let i = 0; i <= 6; i += 1) {
        const weekDay = addDays(firstWeekDay, i);
        weekDays.push(weekDay);
    }

    return weekDays;
}

function getLastDayOfMonthDate(date) {
    return new Date(
        date.getFullYear(),
                    date.getMonth() + 1,
                    0,
                    12
    );
}

function initUrl() {
    let selectedView = getUrlView();
    let selectedDate = getUrlDate();

    function updateUrl() {
        const url = new URL(window.location);

        url.searchParams.set("view", selectedView);
        url.searchParams.set("date", selectedDate.toISOString());

        history.replaceState(null, "", url);
    }

    document.addEventListener("view-change", (event) => {
        selectedView = event.detail.view;
        updateUrl();
    });

    document.addEventListener("date-change", (event) => {
        selectedDate = event.detail.date;
        updateUrl();
    });
}

function getUrlView() {
    const urlParams = new URLSearchParams(window.location.search);

    return urlParams.get("view") || "month";
}

function getUrlDate() {
    const urlParams = new URLSearchParams(window.location.search);
    const date = urlParams.get("date");

    return date ? new Date(date) : today();
}

const calendarRerenders = [];

function initMiniCalendars() {
    const calendarElements = document.querySelectorAll("[calendar]");
    calendarRerenders.length = 0;

    for (const calendarElement of calendarElements) {
        initMiniCalendar(calendarElement);
    }
}

function initMiniCalendar(calendarElement) {
    const calendarPreviousButtonElement = calendarElement.querySelector("[calendar-prev-btn]");
    const calendarNextButtonElement = calendarElement.querySelector("[calendar-next-btn]");

    let selectedDate = getUrlDate();
    let miniCalendarDate = getUrlDate();

    function refreshMiniCalendar() {
        refreshDateElement(calendarElement, miniCalendarDate);
        refreshDayListElement(
            calendarElement,
            miniCalendarDate,
            selectedDate
        );
    }

    // Registered so same-day refreshes and modal-driven updates can redraw
    // all calendars without disturbing the viewed month.
    calendarRerenders.push(() => {
        try { refreshMiniCalendar(); } catch { /* ignore */ }
    });

    calendarPreviousButtonElement.addEventListener("click", () => {
        miniCalendarDate = subtractMonths(miniCalendarDate, 1);
        refreshMiniCalendar();
    });

    calendarNextButtonElement.addEventListener("click", () => {
        miniCalendarDate = addMonths(miniCalendarDate, 1);
        refreshMiniCalendar();
    });

    document.addEventListener("date-change", (event) => {
        selectedDate = event.detail.date;
        miniCalendarDate = event.detail.date;
        refreshMiniCalendar();
    });

    refreshMiniCalendar();
}

function refreshDateElement(parent, date) {
    const calendarDateElement = parent.querySelector("[calendar-date]");

    calendarDateElement.textContent = dateFormatter.format(date);
}

function setMatchdayBorder(element, state) {
    element.classList.remove("matchday-btn-s", "matchday-btn-w", "matchday-btn-r", "matchday-btn-l");
    if (state == "scheduled") {
        element.classList.add("matchday-btn-s");
    }
    else if (state == "w") {
        element.classList.add("matchday-btn-w");
    }
    else if (state == "r") {
        element.classList.add("matchday-btn-r");
    }
    else if (state == "l") {
        element.classList.add("matchday-btn-l");
    }
}

// Effective border state: server state wins for w/r/l; a locally remembered
// proven result upgrades 'scheduled' without waiting for the nightly warm.
// (Calendar cells always involve a TSV team, so w/r/l is well-defined.)
function borderStateFor(m) {
    if (m && (m.state === 'w' || m.state === 'r' || m.state === 'l')) return m.state;
    const known = m ? getKnownDone(m.meetingId) : null;
    if (known) return tsvState(known.hw, known.aw, known.hc, known.ac);
    return 'scheduled';
}

// Refresh states for fixture-day meetings (yesterday + today, Berlin):
// a few live fetches that make "today" truthful without touching the warm.
// Results flow through noteFullResult -> 'matchday-known-done' -> rerender.
async function refreshTodayStates() {
    try {
        const candidates = matchdays.filter(m =>
            (m.state === 'scheduled' || !m.state) &&
            m.meetingId != null &&
            isFixtureDay(m.date) &&
            !getKnownDone(m.meetingId)
        ).slice(0, 15);
        if (!candidates.length) return;
        await Promise.allSettled(candidates.map(m =>
            fetch(`${API}/meeting/${m.meetingId}`)
                .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
                .then(info => { noteFullResult(info); })
                .catch(() => {})
        ));
    } catch { /* best-effort only */ }
}

// A modal just proved a result (any entry path): patch the in-memory schedule
// truth and redraw, so the cell flips behind/beside the modal immediately.
document.addEventListener('matchday-known-done', (event) => {
    try {
        const d = (event && event.detail) || {};
        if (d.meetingId == null) return;
        const known = getKnownDone(d.meetingId);
        const m = matchdays.find(x => String(x.meetingId) === String(d.meetingId));
        if (m && known && m.state !== 'w' && m.state !== 'r' && m.state !== 'l') {
            m.state = tsvState(known.hw, known.aw, known.hc, known.ac);
        }
        calendarRerenders.forEach(fn => { try { fn(); } catch { /* ignore */ } });
    } catch { /* ignore */ }
});

function buildLogoStack(dayMeetings) {
    const stack = document.createElement('div');
    stack.classList.add('logo-stack');
    if (dayMeetings.length <= 1) {
        stack.classList.add('single');
    } else {
        // Multi-match days are driven by the JS rotator below so the
        // border color can stay in sync with the visible logo.
        stack.classList.add('js-controlled');
    }

    dayMeetings.forEach((meeting, index) => {
        const img = document.createElement('img');
        img.src = `logos/${meeting.oppClubId}.png`;
        img.alt = `Gegner-Logo ${meeting.oppClubId}`;
        img.loading = 'lazy';
        img.decoding = 'async';
        img.draggable = false;
        img.classList.add('logo-slide');
        if (dayMeetings.length > 1 && index === 0) {
            img.classList.add('active');
        }
        img.onerror = () => {
            // Fallback for missing/broken logos (e.g. 292-byte placeholders)
            if (!img.dataset.fallback) {
                img.dataset.fallback = 'true';
                img.src = 'imgs/table-tennis.png';
            } else {
                img.style.display = 'none';
            }
        };
        stack.appendChild(img);
    });

    if (dayMeetings.length > 1) {
        const badge = document.createElement('span');
        badge.classList.add('logo-badge');
        badge.textContent = dayMeetings.length;
        badge.title = `${dayMeetings.length} Spiele an diesem Tag`;
        stack.appendChild(badge);
    }

    return stack;
}

function refreshDayListElement(parent, miniCalendarDate, selectedDate) {
    const calendarDayListElement = parent.querySelector("[calendar-day-list]");

    calendarDayListElement.replaceChildren();
    const calendarDays = generateMonthCalendarDays(miniCalendarDate);
    for (const calendarDay of calendarDays) {
        const calendarDayListItemContent = calendarDayListItemTemplateElement.content.cloneNode(true);
        const calendarDayListItemElement = calendarDayListItemContent.querySelector("[calendar-day-list-item]");
        const calendarDayElement = calendarDayListItemElement.querySelector("[calendar-day]");

        calendarDayElement.textContent = calendarDay.getDate();

        if (miniCalendarDate.getMonth() !== calendarDay.getMonth()) {
            calendarDayElement.classList.add("calendar-day-list-item");
        }

        if (isTheSameMonth(miniCalendarDate, calendarDay)) {
            calendarDayElement.classList.add("calendar-day-btn1");
        } else {
            calendarDayElement.classList.add("calendar-day-btn2");
        }

        if (isTheSameDay(today(), calendarDay)) {
            calendarDayElement.classList.add("calendar-today-btn");
        }

        const dayMeetings = [];
        for (let i = 0; i < matchdays.length; i++) {
            if (isTheSameDay(formatDate(matchdays[i].date), calendarDay)) {
                dayMeetings.push(matchdays[i]);
            }
        }

        if (dayMeetings.length > 0) {
            // Start with the first meeting's state; the rotator below keeps
            // the border in sync with whichever logo is currently visible.
            // Locally known results (opened modals, today-refresh) upgrade
            // scheduled cells without waiting for the nightly warm.
            setMatchdayBorder(calendarDayElement, borderStateFor(dayMeetings[0]));
            // Every matchday opens the modal: played meetings render scores,
            // scheduled ones a fixture card (usable right after the match).
            calendarDayElement.setAttribute('data-modal-target', '#meeting-modal');
            calendarDayElement.replaceChildren(buildLogoStack(dayMeetings));
            calendarDayElement.classList.add("matchday-btn");
            if (dayMeetings.length > 1) {
                calendarDayElement.dataset.multi = "true";
                calendarDayElement.dataset.index = "0";
                calendarDayElement.dataset.states = dayMeetings.map(borderStateFor).join(",");
            }
        }

        calendarDayElement.addEventListener("click", () => {
            calendarDayElement.dispatchEvent(new CustomEvent("date-change", {
                detail: {
                    date: calendarDay
                },
                bubbles: true
            }));
        });

        calendarDayListElement.appendChild(calendarDayListItemElement);
    }
}

let matchdays = [];
let meetingInfo = {};

// Single global 2s ticker for multi-match days. One interval for all cells
// avoids leaks when the calendar re-renders (month nav / team switch).
// Skips hovered cells (pause) and respects prefers-reduced-motion.
if (!window.__logoRotatorStarted) {
    window.__logoRotatorStarted = true;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion) {
        setInterval(() => {
            document.querySelectorAll('.matchday-btn[data-multi="true"]').forEach((btn) => {
                if (btn.matches(':hover')) {
                    return;
                }
                const states = (btn.dataset.states || '').split(',');
                const slides = btn.querySelectorAll('.logo-slide');
                if (slides.length <= 1 || states.length <= 1) {
                    return;
                }
                let index = (parseInt(btn.dataset.index || '0', 10) + 1) % slides.length;
                btn.dataset.index = String(index);
                slides.forEach((slide, i) => {
                    slide.classList.toggle('active', i === index);
                });
                setMatchdayBorder(btn, states[index]);
            });
        }, 2000);
    }
}

let loadMatchdaysRequestId = 0

export function loadMatchdays() {
    showCalendarLoading('Lade Spielplan …')
    const requestId = ++loadMatchdaysRequestId
    fetch(`${API}/matchdays`)
    .then(response => {
        if(!response.ok){
            throw new Error(`Server Error: ${response.status} ${response.statusText}`)
        }
        return response.json()
    })
    .then(meetings => {
        if (requestId !== loadMatchdaysRequestId) return
        matchdays = meetings
        console.log('matchdays: ', matchdays)
        initMiniCalendars();
        hideCalendarLoading()
        // Same-day truth for fixture-day meetings (yesterday + today):
        // a few bounded live fetches, results upgrade cells via event.
        refreshTodayStates();
    })
    .catch(error => {
        if (requestId !== loadMatchdaysRequestId) return
        console.log(error)
        hideCalendarLoading()
    })
}

function showCalendarLoading(label) {
    const calendarEl = document.querySelector('[calendar]')
    if (!calendarEl) return
    calendarEl.classList.add('is-loading')
    let loader = calendarEl.querySelector('.kb-calendar-loader')
    if (!loader) {
        loader = document.createElement('div')
        loader.className = 'kb-calendar-loader'
        loader.appendChild(spinnerEl(label))
        calendarEl.appendChild(loader)
    } else {
        loader.replaceChildren(spinnerEl(label))
    }
}

function hideCalendarLoading() {
    const calendarEl = document.querySelector('[calendar]')
    if (!calendarEl) return
    calendarEl.classList.remove('is-loading')
    calendarEl.querySelector('.kb-calendar-loader')?.remove()
}
