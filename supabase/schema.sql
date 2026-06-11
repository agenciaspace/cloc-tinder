-- ============================================================================
-- CLOC-Tinder — schema Postgres (Supabase)
-- Cole este arquivo no Supabase → SQL Editor → New query → Run.
-- Pode rodar novamente sem problema (idempotente).
-- ============================================================================

create table if not exists users (
  id              bigint generated always as identity primary key,
  name            text not null,
  email           text unique not null,
  password        text not null,
  phone           text default '',
  bio             text default '',
  skills          jsonb default '[]'::jsonb,
  help_categories jsonb default '[]'::jsonb,
  available       int  default 1,
  can_help        int  default 1,
  needs_help      int  default 1,
  phone_e164      text default '',
  is_admin        int  default 0,
  is_banned       int  default 0,
  created_at      timestamptz default now()
);

create table if not exists needs (
  id              bigint generated always as identity primary key,
  title           text not null,
  description     text default '',
  category        text default 'outro',
  requester_name  text default '',
  requester_phone text default '',
  requester_id    bigint references users(id) on delete cascade,
  helper_id       bigint references users(id) on delete set null,
  status          text default 'open',
  source          text default 'app',
  created_at      timestamptz default now()
);

create table if not exists matches (
  id         bigint generated always as identity primary key,
  need_id    bigint not null references needs(id) on delete cascade,
  helper_id  bigint not null references users(id) on delete cascade,
  status     text default 'pending',
  created_at timestamptz default now()
);

create table if not exists notifications (
  id         bigint generated always as identity primary key,
  user_id    bigint not null references users(id) on delete cascade,
  message    text not null,
  type       text default 'info',
  read       int  default 0,
  created_at timestamptz default now()
);

create table if not exists group_members (
  phone     text primary key,
  jid       text,
  is_admin  int default 0,
  synced_at timestamptz default now()
);

create index if not exists idx_needs_status     on needs(status);
create index if not exists idx_needs_requester  on needs(requester_id);
create index if not exists idx_matches_helper   on matches(helper_id);
create index if not exists idx_matches_need     on matches(need_id);
create index if not exists idx_users_phone_e164 on users(phone_e164);

-- O app acessa o banco com a chave service_role (no servidor), que ignora RLS.
-- Mantemos RLS habilitado e SEM políticas públicas: assim a chave anon não lê nada.
alter table users         enable row level security;
alter table needs         enable row level security;
alter table matches       enable row level security;
alter table notifications enable row level security;
alter table group_members enable row level security;
