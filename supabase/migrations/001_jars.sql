-- Terrarium Dreams: saved jars.
--
-- Privacy model: we store HOW someone wrote (pauses, rewriting, the wait
-- before letting go, length) and the jar's weather — never the words.
--
-- Access model: every read/write goes through the app's server using the
-- service role. RLS is enabled with no policies, so the anon/public key can
-- touch nothing. Secret tokens are stored only as SHA-256 hashes, so a leaked
-- database can't be used to open anyone's jar.

-- One jar per verified email.
create table jars (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,          -- lowercased
  name          text,                          -- optional label: "Sarah's jar"
  weather       jsonb not null default '{}',   -- current glass state
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- A browser that has opened the emailed link. One jar can be open on several
-- devices; each holds its own cookie token, stored here only as a hash.
create table jar_sessions (
  session_hash  text primary key,              -- sha256 of the cookie token
  jar_id        uuid not null references jars(id) on delete cascade,
  created_at    timestamptz not null default now()
);

-- One row per entry: qualities of the writing only. No text column, on purpose.
create table jar_entries (
  id            uuid primary key default gen_random_uuid(),
  jar_id        uuid not null references jars(id) on delete cascade,
  client_id     uuid not null,                 -- generated in the browser; dedupes resyncs
  written_at    timestamptz not null,
  hesitation_s  real not null,                 -- before the first character
  dwell_s       real not null,                 -- before letting go
  long_pauses   integer not null,              -- gaps over 1.4s while writing
  median_gap_ms real not null,                 -- typing pace
  delete_ratio  real not null,                 -- rewriting
  length        integer not null,              -- characters given
  weather       jsonb not null,                -- what the glass became
  unique (jar_id, client_id)
);
create index jar_entries_jar_time on jar_entries (jar_id, written_at);

-- A save request waiting for the inbox owner to click the link. Nothing is
-- attached to an email until then, so typing someone else's address does
-- nothing to their jar. One row per email; last_sent_at enforces the
-- 25-minute no-spam window.
create table pending_saves (
  email         text primary key,              -- lowercased
  name          text,
  claim_hash    text not null unique,          -- sha256 of the emailed token
  payload       jsonb not null,                -- weather + entries to merge on claim
  last_sent_at  timestamptz not null,
  expires_at    timestamptz not null
);

alter table jars          enable row level security;
alter table jar_sessions  enable row level security;
alter table jar_entries   enable row level security;
alter table pending_saves enable row level security;
