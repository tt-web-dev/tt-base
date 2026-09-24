-- TT-Kickbase Supabase schema (Postgres). Run once in the Supabase SQL Editor.
-- Replaces the local SQLite file (Backend/tt-kickbase.db). All access goes through
-- the Node backend with the service_role key; nothing in the browser talks to
-- Supabase directly, so no RLS policies are required.
--
-- Conventions (fixed by team decision):
-- * Times are compared in UTC. "German time" means fixed CEST = UTC+2, so the
--   nightly job runs at 01:00 UTC and TTR values expire at 05:00 UTC daily.
-- * updated_at stores milliseconds since epoch (BIGINT, never INTEGER).
-- * Meetings fetched live are stored immediately; done meetings are re-fetched
--   for 2 days to catch myTT corrections, then frozen forever.

CREATE TABLE IF NOT EXISTS clubs (
  club_id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  org TEXT NOT NULL DEFAULT '',
  updated_at BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS teams (
  team_id TEXT PRIMARY KEY,
  club_id TEXT,
  group_id TEXT,
  team_name TEXT NOT NULL DEFAULT '',
  league_name TEXT NOT NULL DEFAULT '',
  season TEXT NOT NULL DEFAULT '',
  competition TEXT NOT NULL DEFAULT 'league',
  updated_at BIGINT NOT NULL DEFAULT 0
);

-- One row per (league, schedule filter): the nightly warm stores 'gesamt',
-- live league views use the team's own filter ('vr'/'rr'). The two never
-- overwrite each other.
CREATE TABLE IF NOT EXISTS leagues (
  group_id TEXT NOT NULL,
  filter TEXT NOT NULL DEFAULT 'gesamt',
  league_name TEXT NOT NULL DEFAULT '',
  season TEXT NOT NULL DEFAULT '',
  competition TEXT NOT NULL DEFAULT 'league',
  schedule_json JSONB,
  updated_at BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (group_id, filter)
);

CREATE TABLE IF NOT EXISTS meetings (
  meeting_id TEXT PRIMARY KEY,
  group_id TEXT,
  date TEXT,
  state TEXT,
  home_club TEXT,
  away_club TEXT,
  home_name TEXT NOT NULL DEFAULT '',
  away_name TEXT NOT NULL DEFAULT '',
  team_home_score INTEGER,
  team_away_score INTEGER,
  season TEXT NOT NULL DEFAULT '',
  competition TEXT NOT NULL DEFAULT 'league',
  raw_json JSONB,
  frozen BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_meetings_group ON meetings (group_id);
CREATE INDEX IF NOT EXISTS idx_meetings_state ON meetings (state);

CREATE TABLE IF NOT EXISTS appearances (
  person_id TEXT NOT NULL,
  meeting_id TEXT NOT NULL,
  side TEXT,
  player_score INTEGER,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  single_wins INTEGER NOT NULL DEFAULT 0,
  single_losses INTEGER NOT NULL DEFAULT 0,
  double_wins INTEGER NOT NULL DEFAULT 0,
  double_losses INTEGER NOT NULL DEFAULT 0,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  club_id TEXT,
  team_name TEXT NOT NULL DEFAULT '',
  opponent_name TEXT NOT NULL DEFAULT '',
  opponent_club TEXT,
  date TEXT,
  season TEXT NOT NULL DEFAULT '',
  competition TEXT NOT NULL DEFAULT 'league',
  PRIMARY KEY (person_id, meeting_id)
);
CREATE INDEX IF NOT EXISTS idx_appear_person ON appearances (person_id, season);
CREATE INDEX IF NOT EXISTS idx_appear_meeting ON appearances (meeting_id);

CREATE TABLE IF NOT EXISTS ttr (
  person_id TEXT PRIMARY KEY,
  profile_json JSONB,
  updated_at BIGINT NOT NULL DEFAULT 0
);

-- Generic key/value store for warm checkpoints and run logs.
-- Named k/v (not key/value) to avoid Postgres keyword friction.
CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT
);
