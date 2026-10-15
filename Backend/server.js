
//----------team declaration---------
//bei neuem Team auch Logos der Gegner hinzufügen!
//Gegner Club-Namen auch bei club-names.js eintragen
//set the teams shown by default to active = true
var teams = [
  {
    "active": false,
    "association": "WTTV",
    "season": "26--27",
    "league_slug": "2._Bezirksliga_5_(4er)_Erwachsene",
    "groupId": "522200",
    "teamId": "3106660",
    "teamName": "TSV_Bonn_rrh._III",
    "filter": "vr",
    "clubId": "22107",
    "anzeigeName": "Herren I (26/27)"
  },
  {
    "active": false,
    "association": "WTTV",
    "season": "26--27",
    "league_slug": "Erwachsene_1._Bezirksklasse_4_(4er)",
    "groupId": "522044",
    "teamId": "3107405",
    "teamName": "TSV_Bonn_rrh._II",
    "filter": "vr",
    "clubId": "22107",
    "anzeigeName": "Herren II (26/27)"
  },
  {
    "active": true,
    "association": "WTTV",
    "season": "26--27",
    "league_slug": "2._Bezirksklasse_4_Erwachsene",
    "groupId": "522558",
    "teamId": "3106565",
    "teamName": "TSV_Bonn_rrh._III",
    "filter": "vr",
    "clubId": "22107",
    "anzeigeName": "Herren III (26/27)"
  },
  {
    "active": false,
    "association": "WTTV",
    "season": "26--27",
    "league_slug": "3._Bezirksklasse_5_Erwachsene",
    "groupId": "522877",
    "teamId": "3109371",
    "teamName": "TSV_Bonn_rrh._IV",
    "filter": "vr",
    "clubId": "22107",
    "anzeigeName": "Herren IV (26/27)"
  },
  {
    "active": true,
    "association": "WTTV",
    "season": "26--27",
    "league_slug": "1._Bezirksliga",
    "groupId": "522257",
    "teamId": "3105998",
    "teamName": "TSV_Bonn_rrh.",
    "filter": "vr",
    "clubId": "22107",
    "anzeigeName": "U19 I (26/27)"
  },
  {
    "active": false,
    "association": "WTTV",
    "season": "26--27",
    "league_slug": "2._Bezirksliga_2_Jugend_19",
    "groupId": "522295",
    "teamId": "3105319",
    "teamName": "TSV_Bonn_rrh._II",
    "filter": "vr",
    "clubId": "22107",
    "anzeigeName": "U19 II (26/27)"
  },
  {
    "active": false,
    "association": "WTTV",
    "season": "26--27",
    "league_slug": "1._Bezirksklasse_Gruppe_2_Jugend_19",
    "groupId": "522415",
    "teamId": "3141442",
    "teamName": "TSV_Bonn_rrh._III",
    "filter": "vr",
    "clubId": "22107",
    "anzeigeName": "U19 III (26/27)"
  },
  {
    "active": false,
    "association": "WTTV",
    "season": "26--27",
    "league_slug": "Bezirksoberliga_Jugend_15",
    "groupId": "522660",
    "teamId": "3109341",
    "teamName": "TSV_Bonn_rrh.",
    "filter": "vr",
    "clubId": "22107",
    "anzeigeName": "U15 I (26/27)"
  },
  {
    "active": false,
    "association": "WTTV",
    "season": "26--27",
    "league_slug": "1._Bezirksliga_1_Jugend_15",
    "groupId": "522055",
    "teamId": "3105547",
    "teamName": "TSV_Bonn_rrh._II",
    "filter": "vr",
    "clubId": "22107",
    "anzeigeName": "U15 II (26/27)"
  },
  {
    "active": false,
    "association": "WTTV",
    "season": "26--27",
    "league_slug": "2._Bezirksliga_Jugend_13_Gruppe_2",
    "groupId": "528417",
    "teamId": "3110340",
    "teamName": "TSV_Bonn_rrh.",
    "filter": "vr",
    "clubId": "22107",
    "anzeigeName": "U13 (26/27)"
  },
  {
    "active": false,
    "association": "WTTV",
    "season": "25--26",
    "league_slug": "J19-1BL",
    "groupId": "507278",
    "teamId": "2974043",
    "teamName": "TSV_Bonn_rrh.",
    "filter": "rr",
    "clubId": "22107",
    "anzeigeName": "U19 I (25/26)"
  },
]

const TSV_clubId = "22107"

//^^^^^^^^^^team declaration^^^^^^^^^
const { Punkte, getDScore, getEScore, getScore } = require('./scoring');
const path = require('path');
const db = require('./db');
const mvp = require('./mvp');
const { clubNameFor } = require('./club-names');

// Freshness windows (team decision, CEST = fixed UTC+2):
// league schedules revalidate after 24h, tables after 15 min (memory only).
// Everything else falls back to stored data silently on failure.
const SCHEDULE_TTL_MS = 24 * 3600 * 1000;
const TABLE_TTL_MS = 15 * 60 * 1000;
const tableCacheMem = new Map();
//----------general functions--------
function filterActive(array) {
  let newArray = []
  for (var i = 0; i < array.length; i++) {
    if (array[i].active) {
      newArray.push(array[i])
    }
  }
  return newArray
}

function getOppClubId(clubId1, clubId2) {
  if (clubId1 != TSV_clubId) {
    return clubId1
  }
  else {
    return clubId2
  }
}

function getMatchState(state, homeClubId, awayClubId, matches_won, matches_lost) {
  if (state != "scheduled"){
    if ((matches_won > matches_lost && homeClubId == TSV_clubId) || (matches_won < matches_lost && awayClubId == TSV_clubId)) {
        return "w"
    }
    else if (matches_won == matches_lost) {
      return "r"
    }
    else{
      return "l"
    }
  }
  else{
    return "scheduled"
  }
}

//distinct players of one side, any play mode (fallback for non-Bundessystem layouts)
function collectSidePlayers(match, slots) {
  const seen = new Map()
  for (const g of match) {
    for (const s of slots) {
      const p = g[s]
      if (p && p.player_id && !seen.has(p.player_id)) seen.set(p.player_id, p)
    }
  }
  return [...seen.values()]
}

function getMatchInfo(match, homeClubId, awayClubId) {
  //return array with players (name, score, ttr)
  //don't forget to check if player != undefined before sending
  //call getScore for each existing player
  const d1 = match.find(game => game.match_name == "D1-D1")
  const d2 = match.find(game => game.match_name == "D2-D2")
  const e1_2 = match.find(game => game.match_name == "1-2")
  const e2_1 = match.find(game => game.match_name == "2-1")
  const e3_4 = match.find(game => game.match_name == "3-4")
  const e4_3 = match.find(game => game.match_name == "4-3")
  const e1_1 = match.find(game => game.match_name == "1-1")
  const e2_2 = match.find(game => game.match_name == "2-2")
  const e3_3 = match.find(game => game.match_name == "3-3")
  const e4_4 = match.find(game => game.match_name == "4-4")

  //classic 4v4 Bundessystem layout? Otherwise use the generic fallback below
  //(e.g. Swaythling-Cup-System) so other play modes can't crash the endpoint.
  const classicLayout = e1_2?.mm_player11 && e2_1?.mm_player11 && e3_4?.mm_player11 && e4_3?.mm_player11
    && e2_1?.mm_player21 && e1_2?.mm_player21 && e4_3?.mm_player21 && e3_4?.mm_player21
    && d1?.mm_player11 && d1?.mm_player21

  let home_playerArray, away_playerArray
  if (classicLayout) {
    const home_p1 = e1_2.mm_player11
    const home_p2 = e2_1.mm_player11
    const home_p3 = e3_4.mm_player11
    const home_p4 = e4_3.mm_player11
    const away_p1 = e2_1.mm_player21
    const away_p2 = e1_2.mm_player21
    const away_p3 = e4_3.mm_player21
    const away_p4 = e3_4.mm_player21

    //undefined, falls kein 5ter Spieler vorhanden
    const home_p5 = match.flatMap(m => [m.mm_player11, m.mm_player12, m.mm_player21, m.mm_player22].filter(Boolean)).find(p => p.player_id == [
      ...[d1?.mm_player11?.player_id, d1?.mm_player12?.player_id, d2?.mm_player11?.player_id, d2?.mm_player12?.player_id].filter(item => ![home_p1.player_id, home_p2.player_id, home_p3.player_id, home_p4.player_id].includes(item))
    ].at(0))
    const away_p5 = match.flatMap(m => [m.mm_player11, m.mm_player12, m.mm_player21, m.mm_player22].filter(Boolean)).find(p => p.player_id == [
      ...[d1?.mm_player21?.player_id, d1?.mm_player22?.player_id, d2?.mm_player21?.player_id, d2?.mm_player22?.player_id].filter(item => ![away_p1.player_id, away_p2.player_id, away_p3.player_id, away_p4.player_id].includes(item))
    ].at(0))

    //create player arrays + filter undefined players
    home_playerArray = [home_p1, home_p2, home_p3, home_p4, home_p5].filter(Boolean)
    away_playerArray = [away_p1, away_p2, away_p3, away_p4, away_p5].filter(Boolean)
  }
  else {
    //generic fallback: distinct players per side, works with any match_name layout
    home_playerArray = collectSidePlayers(match, ["mm_player11", "mm_player12"])
    away_playerArray = collectSidePlayers(match, ["mm_player21", "mm_player22"])
  }
  //format the array
  let formatted_home_playerArray = []
  let formatted_away_playerArray = []
  for (var k = 0; k < home_playerArray.length; k++) {
    formatted_home_playerArray.push({
      personId: home_playerArray[k].person_id,
      playerId: home_playerArray[k].player_id,
      side: "home",
      clubId: homeClubId,
      firstName: home_playerArray[k].firstname,
      lastName: home_playerArray[k].lastname,
      ttr: home_playerArray[k].fed_rank,
      score: getScore(match, home_playerArray[k], "home")
    })
  }
  for (var l = 0; l < away_playerArray.length; l++) {
    formatted_away_playerArray.push({
      personId: away_playerArray[l].person_id,
      playerId: away_playerArray[l].player_id,
      side: "away",
      clubId: awayClubId,
      firstName: away_playerArray[l].firstname,
      lastName: away_playerArray[l].lastname,
      ttr: away_playerArray[l].fed_rank,
      score: getScore(match, away_playerArray[l], "away")
    })
  }
  //get teamscore (all players combined)
  let home_teamscore = 0
  let away_teamscore = 0
  for (var m = 0; m < formatted_home_playerArray.length; m++) {
    home_teamscore += formatted_home_playerArray[m].score
  }
  for (var n = 0; n < formatted_away_playerArray.length; n++) {
    away_teamscore += formatted_away_playerArray[n].score
  }
  
  //final const that will be returned
  const matchInfo = {
    home_players: formatted_home_playerArray,
    away_players: formatted_away_playerArray,
    home_teamscore: home_teamscore,
    away_teamscore: away_teamscore
  }
  
  return matchInfo
  
}

async function getMeetingInfo(data) {
  //call getMatchInfo
  //return formatted array with everything
  //Rating fill first (stored official TTR <=60d -> fed_rank -> Q-TTR) so the
  //TTR bonuses compute even where myTT ships fed_rank:null. Falls back to
  //raw fed_rank on any error.
  let match = data.match;
  try {
    const filled = await resolveMatchRatings(data.match, data.start_date).catch(() => null);
    if (filled && filled.match) match = filled.match;
  } catch { /* fall back to raw fed_rank */ }
  const matchInfo = getMatchInfo(match, data.team_home_club_nr, data.team_guest_club_nr)
  
  const meetingInfo = {
    meetingId: data.meeting_id,
    groupId: data.group_id,
    date: data.start_date,
    season: data.season_nickname,
    league: data.group_name,
    home_team_name: data.team_home,
    away_team_name: data.team_guest,
    home_clubId: data.team_home_club_nr,
    away_clubId: data.team_guest_club_nr,
    home_matches_won: data.matches_home,
    away_matches_won: data.matches_guest,
    home_coach_firstName: data.team_home_coach_first_name,
    home_coach_lastName: data.team_home_coach_last_name,
    away_coach_firstName: data.team_guest_coach_first_name,
    away_coach_lastName: data.team_guest_coach_last_name
  }
  
  const gameInfo = {...meetingInfo, ...matchInfo}

  return gameInfo
}

// Scheduled (not yet played) meeting card payload for the modal: names and
// date from the warm's schedule skeleton, no scores. Lets users open matches
// right after (or before) they happen instead of waiting for the nightly warm.
async function getScheduledInfo(stored) {
  let leagueName = '';
  try {
    if (stored && stored.group_id && db.available()) {
      const lg = await db.getLeague(stored.group_id, 'gesamt').catch(() => null);
      if (lg && lg.league_name) leagueName = lg.league_name;
    }
  } catch { /* ignore */ }
  return {
    scheduled: true,
    meetingId: stored ? stored.meeting_id : null,
    date: stored ? stored.date : null,
    league: leagueName,
    home_team_name: stored ? (stored.home_name || '') : '',
    away_team_name: stored ? (stored.away_name || '') : '',
    home_clubId: stored ? stored.home_club : null,
    away_clubId: stored ? stored.away_club : null
  };
}

//^^^^^^^^^^general functions^^^^^^^^

// Derive the calendar matchday list from stored 'gesamt' schedules:
// keep only games where one of our teams plays (equivalent to the per-team
// mannschaft excerpt, but with zero myTT calls).
function deriveMatchdays(activeTeams, schedules) {
  const out = [];
  for (const team of activeTeams) {
    const games = (schedules[String(team.groupId)] || {}).schedule || [];
    for (const g of games) {
      if (String(g.homeTeamId) !== String(team.teamId) && String(g.awayTeamId) !== String(team.teamId)) continue;
      out.push({
        date: String(g.date || '').slice(0, 10),
        meetingId: g.meetingId,
        state: getMatchState(g.state === 'done' ? 'done' : 'scheduled', g.homeClubId, g.awayClubId, g.homeScore, g.awayScore),
        oppClubId: getOppClubId(g.homeClubId, g.awayClubId)
      });
    }
  }
  return out;
}

// Group a flat normalized game list (as stored in Supabase) by calendar day.
function gamesToDateGroups(games) {
  const byDate = new Map();
  for (const g of games || []) {
    const day = String(g.date || '').slice(0, 10);
    if (!day || g.meetingId == null) continue;
    if (!byDate.has(day)) byDate.set(day, []);
    byDate.get(day).push({
      meetingId: g.meetingId,
      date: g.date,
      state: g.state === 'done' ? 'done' : 'scheduled',
      homeName: g.homeName,
      awayName: g.awayName,
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      homeClubId: g.homeClubId,
      awayClubId: g.awayClubId,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      leagueName: g.leagueName || ''
    });
  }
  return [...byDate.entries()]
    .map(([date, dayGames]) => ({
      date,
      games: dayGames.sort((a, b) => new Date(a.date) - new Date(b.date))
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

// Cluster consecutive dates (gap <= 4 days) into Spieltage. Adult leagues play
// on scattered weekdays, so the expected round size additionally splits rounds.
function clusterDateGroups(dateGroups) {
  const teamIds = new Set();
  dateGroups.forEach(g => g.games.forEach(game => {
    if (game.homeTeamId) teamIds.add(String(game.homeTeamId));
    if (game.awayTeamId) teamIds.add(String(game.awayTeamId));
  }));
  const gamesPerSpieltag = Math.max(1, Math.round(teamIds.size / 2));

  const matchdays = [];
  let current = null;
  let prevDate = null;
  let currentGames = 0;
  for (const group of dateGroups) {
    const currentDate = new Date(group.date + 'T12:00:00');
    const gap = prevDate ? ((currentDate - prevDate) / 86400000) : 0;
    if (!current || gap > 4 || (currentGames >= gamesPerSpieltag && gap >= 1)) {
      current = { spieltag: matchdays.length + 1, dateGroups: [] };
      matchdays.push(current);
      currentGames = 0;
    }
    current.dateGroups.push(group);
    currentGames += group.games.length;
    prevDate = currentDate;
  }
  return matchdays;
}

function ligaPayload(team, matchdays, leagueName, shortName) {
  return {
    groupId: team.groupId,
    teamLabel: team.anzeigeName,
    league_slug: team.league_slug,
    league_name: leagueName || '',
    league_short_name: shortName || '',
    matchdays
  };
}

const cors = require('cors');
const express = require('express');
const app = express();

// Lock CORS to the deployed frontend via CORS_ORIGIN (comma-separated).
// Without it we allow all origins and warn (local dev only).
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors(corsOrigin
  ? { origin: corsOrigin.split(',').map(s => s.trim()).filter(Boolean) }
  : { origin: '*' }));
if (!corsOrigin) console.warn('[server] CORS_ORIGIN not set - allowing all origins (dev only).');

app.use(express.json())

// Serve the frontend from the same origin in production, but never expose
// the backend directory (secrets), git metadata or workflows.
app.use((req, res, next) => {
  if (req.path === '/Backend' || req.path.startsWith('/Backend/') ||
      req.path.startsWith('/.git') || req.path.startsWith('/.github')) {
    return res.status(404).end();
  }
  next();
});
app.use(express.static(path.join(__dirname, '..'), { index: 'index.html', dotfiles: 'deny' }));

// Health for monitoring the nightly warm (checks Supabase + last run log).
app.get('/health', async (req, res) => {
  const out = { ok: true, db: db.available(), at: new Date().toISOString(), lastWarm: null };
  if (db.available()) {
    try {
      const raw = await db.metaGet('warm-last-run');
      out.lastWarm = raw ? JSON.parse(raw) : null;
    } catch { /* ignore */ }
  }
  res.send(out);
});

//myTT player view (TTR profile + season aggregation for EVERY league player)
const { registerPlayerRoutes, resolveMatchRatings, distinctPersonIds, fillQttrsBackground } = require('./mytt-player');
registerPlayerRoutes(app, () => teams);

const PORT = process.env.PORT || 3000
const httpServer = app.listen(PORT, () => {
  console.log(`The server is running on port ${PORT}`);
});
httpServer.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use - another TT-Kickbase server is still running. Stop it first (curl -X POST http://localhost:${PORT}/admin/shutdown), then start again.`);
    process.exit(1);
  }
  throw err;
});

app.get('/connectiontest', (req, res) => {
  res.send({"msg": "...Connection to server was successful..."})
})

//send matchdays to frontend (Supabase-first, silent stale fallback)
app.get('/matchdays', async (req, res) => {
  const active = filterActive(teams);
  // 1) Fresh stored schedules: zero myTT calls.
  try {
    if (db.available() && active.length) {
      const schedules = await db.getSchedulesByGroups(active.map(t => t.groupId), 'gesamt').catch(() => ({}));
      const fresh = active.every(t => {
        const s = schedules[String(t.groupId)];
        return s && s.schedule && (Date.now() - (s.updated_at || 0) < SCHEDULE_TTL_MS);
      });
      if (fresh) {
        const derived = deriveMatchdays(active, schedules);
        console.log(`Serving ${derived.length} matchdays from Supabase.`);
        return res.send(derived);
      }
    }
  } catch { /* fall through to live */ }

  try {
    // One fetch per active team, isolated: a single dead endpoint (archived
    // season, transient {data:null}, HTTP error) contributes zero meetings
    // instead of failing the whole calendar (Promise.all would reject all).
    const fetchPromises = filterActive(teams).map(team => {
      const url = `https://www.mytischtennis.de/click-tt/${team.association}/${team.season}/ligen/${team.league_slug}/gruppe/${team.groupId}/mannschaft/${team.teamId}/${team.teamName}/spielplan/${team.filter}?_data=routes%2Fclick-tt%2B%2F%24association%2B%2F%24season%2B%2F%24type%2B%2F%28%24groupname%29.gruppe.%24urlid_.mannschaft.%24teamid.%24teamname%2B%2Fspielplan.%24filter`;

      return fetch(url)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Fetch error: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          const excerpt = data?.data?.meetings_excerpt?.meetings;
          if (!Array.isArray(excerpt)) {
            console.log(`[matchdays] group ${team.groupId} (${team.anzeigeName}): upstream payload unusable (${data?.data === null ? 'null data' : 'missing meetings_excerpt'}) - team skipped.`);
            return [];
          }
          return excerpt;
        })
        .catch(error => {
          console.log(`[matchdays] group ${team.groupId} (${team.anzeigeName}): ${error.message} - team skipped.`);
          return [];
        });
    });

    // Wait for all fetches to finish (never rejects: failures become [])
    const results = await Promise.all(fetchPromises);

    // .flat() to combine them into one single array of meetings.
    const meetings = results.flat();
    
    //format the array into frontend-readable-format
    const formattedMeetings = meetings.flatMap(dayObject => {
      const [[dateString, matchesArray]] = Object.entries(dayObject)
      return matchesArray.map(match => ({
        date: dateString,
        meetingId: match.meeting_id,
        state: getMatchState(match.state, match.team_home_club_id, match.team_away_club_id, match.matches_won, match.matches_lost),
        oppClubId: getOppClubId(match.team_home_club_id, match.team_away_club_id)
      }))
    })

    // Now send the fully populated array to the frontend
    const okTeams = results.filter(r => r.length).length;
    console.log(`Sending ${formattedMeetings.length} formatted matchdays (${okTeams}/${fetchPromises.length} teams healthy).`);
    res.send(formattedMeetings);

  } catch (error) {
    // Silent stale fallback: last stored schedules, any age. Never 429 here.
    try {
      if (db.available() && active.length) {
        const schedules = await db.getSchedulesByGroups(active.map(t => t.groupId), 'gesamt').catch(() => ({}));
        const derived = deriveMatchdays(active, schedules);
        if (derived.length) {
          console.log(`Serving ${derived.length} stale matchdays from Supabase.`);
          return res.send(derived);
        }
      }
    } catch { /* ignore */ }
    // 5. Catch any errors that happen during the fetches
    console.error("Error fetching matchdays:", error);
    res.status(500).send({ error: "Failed to fetch match data." });
  }

});

//send full league schedule (all meetings of one league) to frontend
//league is identified via groupId; remaining params are taken from teams[]
app.get('/liga', async (req, res) => {
  const groupId = String(req.query.groupId || '')
  if (!groupId) {
    return res.status(400).send({ error: "Missing groupId query param." })
  }
  const team = teams.find(t => String(t.groupId) === groupId)
  if (!team) {
    return res.status(404).send({ error: `No league with groupId ${groupId} in teams[].` })
  }

  // 1) Fresh stored 'gesamt' schedule: zero myTT calls. Serves the full
  // season (the warm owns schedules; the server never overwrites them).
  try {
    if (db.available()) {
      const stored = await db.getLeague(groupId, 'gesamt').catch(() => null);
      if (stored && stored.schedule && (Date.now() - (stored.updated_at || 0) < SCHEDULE_TTL_MS)) {
        const dateGroups = gamesToDateGroups(stored.schedule);
        const matchdays = clusterDateGroups(dateGroups);
        console.log(`Serving liga ${groupId} from Supabase: ${matchdays.length} Spieltage.`);
        return res.send(ligaPayload(team, matchdays, stored.league_name, dateGroups[0]?.games[0]?.leagueName || stored.league_name));
      }
    }
  } catch { /* fall through to live */ }

  try {
    const url = `https://www.mytischtennis.de/click-tt/${team.association}/${team.season}/ligen/${team.league_slug}/gruppe/${team.groupId}/spielplan/${team.filter}?_data=routes%2Fclick-tt%2B%2F%24association%2B%2F%24season%2B%2F%24type%2B%2F%24groupname.gruppe.%24urlid%2B%2Fspielplan.%24filter`

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'de-DE,de;q=0.9'
      }
    })
    if (response.status === 204) {
      throw new Error('Upstream returned 204 (no content) — possibly rate-limited, retry later.')
    }
    if (!response.ok) {
      throw new Error(`Fetch error: ${response.status}`)
    }
    const text = await response.text()
    if (!text) {
      throw new Error('Upstream returned an empty body — possibly rate-limited, retry later.')
    }
    const data = JSON.parse(text)
    const rawMeetings = data?.data?.meetings || []
    const headInfos = data?.data?.head_infos || {}

    //normalize: [{date: 'YYYY-MM-DD', games: [...]}] sorted ascending
    const dateGroups = rawMeetings.flatMap(dayObject => {
      const [[dateString, matchesArray]] = Object.entries(dayObject)
      if (!Array.isArray(matchesArray)) return []
      const games = matchesArray.map(match => ({
        meetingId: match.meeting_id,
        date: match.date,
        state: match.state === 'done' ? 'done' : 'scheduled',
        homeName: match.team_home,
        awayName: match.team_away,
        homeTeamId: match.team_home_id,
        awayTeamId: match.team_away_id,
        homeClubId: match.team_home_club_id,
        awayClubId: match.team_away_club_id,
        homeScore: match.matches_won,
        awayScore: match.matches_lost,
        leagueName: match.league_name || headInfos.league_name || ''
      }))
      games.sort((a, b) => new Date(a.date) - new Date(b.date))
      return [{ date: dateString, games }]
    }).sort((a, b) => new Date(a.date) - new Date(b.date))

    //expected games per Spieltag = distinct teams / 2 (adult leagues play
    //on scattered weekdays, so a pure date-gap rule would lump many rounds)
    //See clusterDateGroups() above; postponed games stay in the short round
    //instead of stealing games from the next round.
    const matchdays = clusterDateGroups(dateGroups)

    console.log(`Sending liga ${team.groupId} (${headInfos.league_name || team.league_slug}): ${matchdays.length} Spieltage, ${dateGroups.length} dates.`)
    res.send(ligaPayload(team, matchdays, headInfos.league_name, dateGroups[0]?.games[0]?.leagueName))
  } catch (error) {
    // Silent stale fallback: last stored schedule, any age. Never 429 here.
    try {
      if (db.available()) {
        const stored = await db.getLeague(groupId, 'gesamt').catch(() => null);
        if (stored && stored.schedule) {
          const dateGroups = gamesToDateGroups(stored.schedule);
          const matchdays = clusterDateGroups(dateGroups);
          console.log(`Serving stale liga ${groupId} from Supabase.`);
          return res.send(ligaPayload(team, matchdays, stored.league_name, stored.league_name));
        }
      }
    } catch { /* ignore */ }
    console.error(`Error fetching liga ${groupId}:`, error)
    res.status(500).send({ error: `Failed to fetch liga ${groupId}` })
  }
})

//send league table (one league) to frontend
//league is identified via groupId; remaining params are taken from teams[]
//Tables are not stored in Supabase: 15 min in-memory cache, silent stale
//fallback on failure (never 429 here).
app.get('/tabelle', async (req, res) => {
  const groupId = String(req.query.groupId || '')
  if (!groupId) {
    return res.status(400).send({ error: "Missing groupId query param." })
  }
  const team = teams.find(t => String(t.groupId) === groupId)
  if (!team) {
    return res.status(404).send({ error: `No league with groupId ${groupId} in teams[].` })
  }

  const memCached = tableCacheMem.get(String(team.groupId));
  if (memCached && (Date.now() - memCached.at < TABLE_TTL_MS)) {
    return res.send(memCached.data);
  }

  try {
    const url = `https://www.mytischtennis.de/click-tt/${team.association}/${team.season}/ligen/${team.league_slug}/gruppe/${team.groupId}/tabelle/${team.filter}?_data=routes%2Fclick-tt%2B%2F%24association%2B%2F%24season%2B%2F%24type%2B%2F%24groupname.gruppe.%24urlid%2B%2Ftabelle.%24filter`

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'de-DE,de;q=0.9'
      }
    })
    if (response.status === 204) {
      throw new Error('Upstream returned 204 (no content) — possibly rate-limited, retry later.')
    }
    if (!response.ok) {
      throw new Error(`Fetch error: ${response.status}`)
    }
    const text = await response.text()
    if (!text) {
      throw new Error('Upstream returned an empty body — possibly rate-limited, retry later.')
    }
    const data = JSON.parse(text)
    const rawTable = data?.data?.league_table || []
    const headInfos = data?.data?.head_infos || {}

    const rows = rawTable.map(entry => ({
      rank: entry.table_rank,
      teamName: entry.team_name,
      clubId: entry.club_id,
      teamId: entry.team_id,
      meetings: entry.meetings_count,
      setsRelation: entry.sets_relation,
      points: `${entry.points_won}:${entry.points_lost}`,
      tendency: entry.tendency || 'steady',
      excluded: !!entry.is_excluded
    })).sort((a, b) => a.rank - b.rank)

    console.log(`Sending tabelle ${team.groupId} (${headInfos.league_name || team.league_slug}): ${rows.length} rows.`)
    const payload = {
      groupId: team.groupId,
      teamLabel: team.anzeigeName,
      league_slug: team.league_slug,
      league_name: headInfos.league_name || '',
      rows
    };
    tableCacheMem.set(String(team.groupId), { at: Date.now(), data: payload });
    res.send(payload)
  } catch (error) {
    // Silent stale fallback: last table from memory (15 min TTL normally,
    // any age on failure). Never 429 here.
    const cached = tableCacheMem.get(String(req.query.groupId || ''));
    if (cached) {
      console.log(`Serving stale tabelle ${req.query.groupId} from memory.`);
      return res.send(cached.data);
    }
    console.error(`Error fetching tabelle ${groupId}:`, error)
    res.status(500).send({ error: `Failed to fetch tabelle ${groupId}` })
  }
})

//send meetingInfo to frontend (Supabase-first, silent stale fallback).
//First-ever open fetches live and stores the raw JSON (the nightly warm
//computes appearances from it). Frozen/stored meetings cost zero myTT calls.
app.get('/meeting/:id', async (req, res) => {
  const id = String(req.params.id)

  try {
    if (db.available()) {
      const stored = await db.getMeeting(id).catch(() => null);
      if (stored && stored.raw && (stored.frozen || stored.state === 'done')) {
        return res.send(await getMeetingInfo(stored.raw));
      }
    }
  } catch { /* fall through to live */ }

  try{
    const url = `https://www.mytischtennis.de/api/meeting/${id}/live`

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Fetch error: ${response.status}`);
    }
    const body = await response.json();
    const hasResults = body && body.data && Array.isArray(body.data.match) && body.data.match.length > 0;
    if (!hasResults) {
      // Live answered but empty (not yet played): scheduled card from the
      // stored skeleton if we know the fixture, else honest 404.
      try {
        if (db.available()) {
          const stored = await db.getMeeting(id).catch(() => null);
          if (stored && stored.raw) return res.send(await getMeetingInfo(stored.raw));
          if (stored && (stored.home_name || stored.away_name || stored.date)) {
            return res.send(await getScheduledInfo(stored));
          }
        }
      } catch { /* ignore */ }
      return res.status(404).send({ error: 'Noch keine Daten für dieses Spiel.' });
    }
    const info = await getMeetingInfo(body.data);
    // First-open store (raw only). Never fail the response on store errors.
    // Q-TTR background fill only makes sense with actual match data present.
    try {
      if (db.available() && body.data) {
        const d = body.data;
        await db.upsertMeeting({
          meeting_id: id,
          group_id: d.group_id ? String(d.group_id) : null,
          date: d.start_date || null,
          state: 'done',
          home_club: d.team_home_club_nr ? String(d.team_home_club_nr) : null,
          away_club: d.team_guest_club_nr ? String(d.team_guest_club_nr) : null,
          home_name: d.team_home || '',
          away_name: d.team_guest || '',
          team_home_score: d.matches_home ?? null,
          team_away_score: d.matches_guest ?? null,
          season: d.season_nickname || '',
          competition: 'league',
          raw: d,
          frozen: false
        });
      }
    } catch { /* ignore */ }
    res.send(info);
    // Lazy Q-TTR fill for all participants (background): whatever is missing
    // or past-cutoff gets stored for future scoring. Never blocks/errors.
    try {
      if (body.data && Array.isArray(body.data.match)) {
        fillQttrsBackground(distinctPersonIds(body.data.match)).catch(() => {});
      }
    } catch { /* ignore */ }

  } catch (error) {
    // Stale fallbacks, silent: full stored data first, then the scheduled
    // skeleton card. Only truly unknown ids end in an error.
    try {
      if (db.available()) {
        const stored = await db.getMeeting(id).catch(() => null);
        if (stored && stored.raw) {
          console.log(`Serving stale meeting ${id} from Supabase.`);
          return res.send(await getMeetingInfo(stored.raw));
        }
        if (stored && (stored.home_name || stored.away_name || stored.date)) {
          console.log(`Serving scheduled meeting ${id} from Supabase.`);
          return res.send(await getScheduledInfo(stored));
        }
      }
    } catch { /* ignore */ }
    console.error(`Error fetching meeting ${id}:`, error)
    res.status(500).send({ error: `Failed to fetch meeting ${id}`})
  }
})

//send Punktetabelle to frontend
app.get('/punkte', (req, res) => {
  res.send(Punkte)
})

// ---------- weekly MVP (badge only, no scoring impact) ----------
// All reads are Supabase-only (zero myTT calls): winner snapshots from
// weekly_mvps, everything else recomputed live from appearances. Never 429:
// db down -> honest 503 (frontend shows "Keine Daten"), empty week -> 200
// with winner:null (frontend shows "Keine Spiele in dieser Woche").
function mvpNotWarmed(res) {
  return res.status(503).send({ notWarmed: true, error: 'Career store unavailable.' });
}

function mvpDefaultSeason() {
  const first = filterActive(teams)[0] || teams[0];
  if (!first || !first.season) return '';
  return db.normalizeSeason(first.season).season;
}

async function mvpLastWarmAt() {
  try {
    if (!db.available()) return null;
    const raw = await db.metaGet('warm-last-run');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const t = Date.parse(parsed && parsed.at);
    return Number.isFinite(t) ? t : null;
  } catch { return null; }
}

function mvpWeekPayload(weekStart) {
  const { week, year } = mvp.isoWeekOf(weekStart);
  return { weekStart, isoWeek: week, year };
}

// Live rank of one CEST week with optional club/league filters. Returns
// { winner, top, total, provisional } with enriched rows.
async function mvpRankWeek(weekStart, { season, competition, clubId, groupId }) {
  const padFrom = mvp.addDays(weekStart, -1);
  const padTo = mvp.addDays(weekStart, 8);
  const rows = await db.getAppearancesInRange(padFrom, padTo, { season, competition });
  let cand = rows.filter(r => mvp.inWeek(r, weekStart));
  if (clubId) cand = cand.filter(r => String(r.club_id) === String(clubId));
  const groups = await db.getMeetingGroups(cand.map(r => r.meeting_id)).catch(() => ({}));
  if (groupId) cand = cand.filter(r => String((groups[String(r.meeting_id)] || {}).group_id) === String(groupId));
  if (!cand.length) return { winner: null, top: [], total: 0, provisional: Date.now() < (mvp.monday00CEST(mvp.addDays(weekStart, 7)) || 0) };
  const ranked = mvp.rankRows(cand);
  const needGroups = await db.getMeetingGroups(ranked.slice(0, 6).map(r => r.meeting_id)).catch(() => groups);
  const merged = { ...groups, ...needGroups };
  const provisional = Date.now() < (mvp.monday00CEST(mvp.addDays(weekStart, 7)) || 0)
    || cand.some(r => !((merged[String(r.meeting_id)] || {}).frozen));
  return {
    winner: mvp.enrichRow(ranked[0], merged),
    top: ranked.slice(0, 6).map(r => mvp.enrichRow(r, merged)),
    total: cand.length,
    provisional
  };
}

// GET /mvp?weekStart=YYYY-MM-DD&clubId=&groupId=&season=&competition=league
// weekStart accepts any date inside the week (normalized to Monday) or is
// omitted for the gated default (last warmed Mon-Sun week).
app.get('/mvp', async (req, res) => {
  try {
    if (!db.available()) return mvpNotWarmed(res);
    const season = req.query.season ? String(req.query.season) : mvpDefaultSeason();
    const competition = req.query.competition ? String(req.query.competition) : 'league';
    const clubId = req.query.clubId ? String(req.query.clubId) : '';
    const groupId = req.query.groupId ? String(req.query.groupId) : '';
    let weekStart = '';
    if (req.query.weekStart) {
      const day = String(req.query.weekStart).slice(0, 10);
      weekStart = mvp.mondayOf(day);
      if (!weekStart) return res.status(400).send({ error: 'Invalid weekStart (expected YYYY-MM-DD).' });
    } else {
      const gate = mvp.defaultWeekStart(await mvpLastWarmAt());
      weekStart = gate.weekStart;
    }
    const unfiltered = !clubId && !groupId && competition === 'league';
    if (unfiltered) {
      try {
        const snap = await db.getWeeklyMvp(weekStart);
        if (snap && snap.season === season && snap.score_version === mvp.scoreVersion()) {
          const groups = await db.getMeetingGroups([snap.meeting_id]).catch(() => ({}));
          const winner = mvp.enrichRow({
            person_id: snap.person_id, meeting_id: snap.meeting_id,
            first_name: snap.first_name, last_name: snap.last_name,
            club_id: snap.club_id, team_name: snap.team_name,
            opponent_name: '', date: null, season: snap.season,
            player_score: snap.player_score, wins: snap.wins, losses: snap.losses
          }, groups);
          // Winner date for the card comes from the stored meeting when known.
          const g = groups[String(snap.meeting_id)];
          if (winner && g && g.date) winner.date = g.date;
          const prov = Date.now() < (mvp.monday00CEST(mvp.addDays(weekStart, 7)) || 0)
            || !(g && g.frozen);
          console.log(`Serving mvp ${weekStart} from snapshot.`);
          return res.send({ ...mvpWeekPayload(weekStart), season, competition, provisional: prov, stored: true, winner, top: winner ? [winner] : [], total: winner ? 1 : 0 });
        }
      } catch { /* fall through to live */ }
    }
    const live = await mvpRankWeek(weekStart, { season, competition, clubId, groupId });
    // Opportunistic persist of the overall winner (refresh-on-change cache).
    if (unfiltered && live.winner) {
      db.upsertWeeklyMvp({
        week_start: weekStart, season,
        competition, person_id: live.winner.personId, meeting_id: live.winner.meetingId,
        player_score: live.winner.playerScore, wins: live.winner.wins, losses: live.winner.losses,
        first_name: live.winner.firstName, last_name: live.winner.lastName,
        club_id: live.winner.clubId || null, team_name: live.winner.teamName || '',
        computed_at: Date.now(), score_version: mvp.scoreVersion()
      }).catch(() => {});
    }
    console.log(`Serving mvp ${weekStart} live (filters club=${clubId || '-'} league=${groupId || '-'}).`);
    res.send({ ...mvpWeekPayload(weekStart), season, competition, provisional: live.provisional, stored: false, winner: live.winner, top: live.top, total: live.total });
  } catch (e) {
    console.error('[mvp] failed:', e.message || e);
    res.status(500).send({ error: 'MVP konnte nicht geladen werden.' });
  }
});

// GET /mvp/meta?season=&weekStart= — filter metadata for the Advanced card:
// week-scoped leagues/clubs/pairs (only this week) + gated default week.
app.get('/mvp/meta', async (req, res) => {
  try {
    if (!db.available()) return mvpNotWarmed(res);
    const season = req.query.season ? String(req.query.season) : mvpDefaultSeason();
    const competition = 'league';
    const lastWarmAt = await mvpLastWarmAt();
    const gate = mvp.defaultWeekStart(lastWarmAt);
    let weekStart = gate.weekStart;
    if (req.query.weekStart) {
      const day = String(req.query.weekStart).slice(0, 10);
      const mon = mvp.mondayOf(day);
      if (!mon) return res.status(400).send({ error: 'Invalid weekStart (expected YYYY-MM-DD).' });
      weekStart = mon;
    }
    const padFrom = mvp.addDays(weekStart, -1);
    const padTo = mvp.addDays(weekStart, 8);
    const rows = await db.getAppearancesInRange(padFrom, padTo, { season, competition });
    const cand = rows.filter(r => mvp.inWeek(r, weekStart));
    const groups = await db.getMeetingGroups(cand.map(r => r.meeting_id)).catch(() => ({}));
    const leagueByGroup = {};
    const clubSeed = {};
    const pairMeetings = {};
    for (const r of cand) {
      const g = groups[String(r.meeting_id)] || {};
      if (g.group_id) {
        if (!leagueByGroup[g.group_id]) leagueByGroup[g.group_id] = g.league_name || prettyLeagueGroup(g.group_id);
        const pk = `${g.group_id}|${String(r.club_id)}`;
        if (!pairMeetings[pk]) pairMeetings[pk] = new Set();
        pairMeetings[pk].add(String(r.meeting_id));
      }
      const cid = r.club_id != null ? String(r.club_id) : '';
      if (cid && !clubSeed[cid]) clubSeed[cid] = r.team_name || '';
    }
    const leagues = Object.entries(leagueByGroup)
      .map(([groupId, league]) => ({ groupId, league }))
      .sort((a, b) => String(a.league).localeCompare(String(b.league), 'de'));
    const clubs = Object.entries(clubSeed)
      .map(([clubId, team]) => ({ clubId, name: clubNameFor(clubId, team), team }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'de'));
    const pairs = Object.entries(pairMeetings).map(([k, set]) => {
      const [groupId, clubId] = k.split('|');
      return { groupId, clubId, games: set.size };
    });
    // Exact distinct-meeting counts per option (pair sums would double-count
    // meetings across clubs, so unions are computed here, not client-side).
    const leagueMeetings = {};
    const clubMeetings = {};
    {
      const byLeague = {};
      const byClub = {};
      for (const r of cand) {
        const g = groups[String(r.meeting_id)] || {};
        const mid = String(r.meeting_id);
        if (g.group_id) {
          if (!byLeague[g.group_id]) byLeague[g.group_id] = new Set();
          byLeague[g.group_id].add(mid);
        }
        const cid = r.club_id != null ? String(r.club_id) : '';
        if (cid) {
          if (!byClub[cid]) byClub[cid] = new Set();
          byClub[cid].add(mid);
        }
      }
      for (const [k, set] of Object.entries(byLeague)) leagueMeetings[k] = set.size;
      for (const [k, set] of Object.entries(byClub)) clubMeetings[k] = set.size;
    }
    res.send({
      season, weekStart,
      defaultWeekStart: gate.weekStart, warmed: gate.warmed,
      lastWarmAt: lastWarmAt ? new Date(lastWarmAt).toISOString() : null,
      leagues, clubs, pairs, leagueMeetings, clubMeetings
    });
  } catch (e) {
    console.error('[mvp/meta] failed:', e.message || e);
    res.status(500).send({ error: 'MVP-Filter konnten nicht geladen werden.' });
  }
});

function prettyLeagueGroup(groupId) {
  const t = teams.find(x => String(x.groupId) === String(groupId));
  const slug = t && t.league_slug ? String(t.league_slug) : '';
  return slug ? slug.replace(/_/g, ' ').replace(/\s+/g, ' ').trim() : String(groupId);
}

// GET /mvp/highscore?season= — highest single-meeting league score of the season.
app.get('/mvp/highscore', async (req, res) => {
  try {
    if (!db.available()) return mvpNotWarmed(res);
    const season = req.query.season ? String(req.query.season) : mvpDefaultSeason();
    const best = await db.getSeasonBest(season, 'league');
    if (!best) return res.send({ season, winner: null });
    const groups = await db.getMeetingGroups([best.meeting_id]).catch(() => ({}));
    res.send({ season, winner: mvp.enrichRow(best, groups) });
  } catch (e) {
    console.error('[mvp/highscore] failed:', e.message || e);
    res.status(500).send({ error: 'Highscore konnte nicht geladen werden.' });
  }
});

//send teamAuswahl[] to frontend
app.get('/teams', (req, res) => {
  res.send(teams)
})

//get updated teamAuswahl from frontend
app.put('/teams', (req, res) => {
  teams = req.body
  res.status(200).send({ success: true, message: "teamselection updated"})

})
