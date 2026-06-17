-- ============================================================================
-- CLOC-Tinder — schema Postgres (Supabase)
-- Rode UMA VEZ no Supabase: Dashboard → SQL Editor → cole tudo → Run.
-- ============================================================================

create table if not exists users (
  id            bigint generated always as identity primary key,
  name          text not null,
  email         text unique not null,
  password      text not null,
  phone         text default '',
  bio           text default '',
  skills        jsonb default '[]'::jsonb,
  help_categories jsonb default '[]'::jsonb,
  available     int default 1,
  can_help      int default 1,
  needs_help    int default 1,
  phone_e164    text default '',
  linkedin      text default '',
  instagram     text default '',
  x             text default '',
  substack      text default '',
  photo_url     text default '',
  work          text default '',
  interests     text default '',
  cloc_competencies jsonb default '[]'::jsonb,
  is_admin      int default 0,
  is_banned     int default 0,
  created_at    timestamptz default now()
);
-- Mandala da CLOC (perfil): colunas adicionadas depois — alters idempotentes
-- para bancos que já existiam antes desta feature.
alter table users add column if not exists work text default '';
alter table users add column if not exists interests text default '';
alter table users add column if not exists cloc_competencies jsonb default '[]'::jsonb;
-- Obs: o upload de foto usa o bucket público "avatars" do Supabase Storage
-- (criado pela aplicação; público para leitura).

create table if not exists needs (
  id              bigint generated always as identity primary key,
  title           text not null,
  description     text default '',
  category        text default 'outro',
  requester_name  text default '',
  requester_phone text default '',
  requester_id    bigint,
  helper_id       bigint,
  status          text default 'open',
  source          text default 'app',
  created_at      timestamptz default now()
);

create table if not exists matches (
  id         bigint generated always as identity primary key,
  need_id    bigint not null references needs(id) on delete cascade,
  helper_id  bigint references users(id) on delete cascade,
  status     text default 'pending',
  created_at timestamptz default now()
);

create table if not exists notifications (
  id         bigint generated always as identity primary key,
  user_id    bigint not null,
  message    text not null,
  type       text default 'info',
  read       int default 0,
  created_at timestamptz default now()
);

create table if not exists group_members (
  phone     text primary key,
  jid       text,
  name      text default '',
  photo     text default '',
  is_admin  int default 0,
  synced_at timestamptz default now()
);

create table if not exists push_subscriptions (
  id         bigint generated always as identity primary key,
  user_id    bigint not null,
  endpoint   text unique not null,
  keys       jsonb not null,
  created_at timestamptz default now()
);
create index if not exists idx_push_user on push_subscriptions(user_id);

create index if not exists idx_needs_status   on needs(status);
create index if not exists idx_needs_requester on needs(requester_id);
create index if not exists idx_matches_helper  on matches(helper_id);
create index if not exists idx_matches_need     on matches(need_id);
create index if not exists idx_users_phone_e164 on users(phone_e164);

-- Segurança: liga RLS sem políticas. A chave pública (anon) fica sem acesso;
-- o servidor usa a service_role, que ignora RLS.
alter table users          enable row level security;
alter table needs          enable row level security;
alter table matches        enable row level security;
alter table notifications  enable row level security;
alter table group_members  enable row level security;
alter table push_subscriptions enable row level security;
