create table if not exists quotes (
  id              text primary key,              -- 'q_' + 16 base32 chars
  kind            text not null check (kind in ('deposit','withdraw')),
  owner           text not null,                 -- lowercase 0x address
  nim_address     text,
  amount_raw      numeric(78,0) not null,        -- 6-decimal units; 2^256-1 = withdraw all
  goal_id         text,
  fee_luna        bigint not null,
  memo            text not null unique,          -- 'cedinest:' || id
  permit_nonce    numeric(78,0) not null,
  permit_deadline bigint not null,               -- unix seconds
  expires_at      timestamptz not null,
  used_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists quotes_owner_created on quotes (owner, created_at);

create table if not exists jobs (
  id              text primary key,              -- 'j_' + 16 base32 chars
  quote_id        text not null unique references quotes(id),
  kind            text not null,
  owner           text not null,
  amount_raw      numeric(78,0) not null,
  goal_id         text,
  nim_tx_hash     text not null unique,
  signature       text,                          -- null if the user cancelled after paying the fee
  status          text not null default 'fee_pending'
                  check (status in ('fee_pending','fee_final','submitted','done','failed','refund_due')),
  polygon_tx_hash text,
  usd_amount      numeric(20,6),                 -- settled amount in USDT
  ghs_rate        numeric(12,6),                 -- rate at settlement, feeds the chart
  error           text,
  attempts        int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists jobs_owner_created on jobs (owner, created_at);
create index if not exists jobs_status on jobs (status, updated_at);

create table if not exists goals (
  id          text primary key,
  owner       text not null,
  name        text not null check (char_length(name) <= 40),
  target_ghs  numeric(14,2) not null check (target_ghs > 0),
  target_date date,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists goals_owner on goals (owner, archived);

create table if not exists fx_daily (
  day      date primary key,
  usd_ghs  numeric(12,6) not null,
  source   text not null
);

create table if not exists sessions (
  token_hash text primary key,
  owner      text not null,
  expires_at timestamptz not null
);

-- Sign-in challenges: one nonce per attempt, short lived.
create table if not exists challenges (
  nonce      text primary key,
  owner      text not null,
  expires_at timestamptz not null
);

-- What the user told us on first open: an optional first name and the consent timestamp.
create table if not exists profiles (
  owner        text primary key,
  display_name text check (char_length(display_name) <= 24),
  consented_at timestamptz,
  created_at   timestamptz not null default now()
);
