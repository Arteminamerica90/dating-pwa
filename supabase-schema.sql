-- WalkDate: схема Supabase.
-- Выполнить в Supabase Dashboard -> SQL Editor -> New query.
-- Требуется: включённый Auth (Email/Password), Email confirmations можно выключить.

-- ============ ПРОФИЛИ ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_read_all" on public.profiles;
create policy "profiles_read_all" on public.profiles for select using (true);

drop policy if exists "profiles_write_own" on public.profiles;
create policy "profiles_write_own" on public.profiles for all
  using (auth.uid() = id) with check (auth.uid() = id);

-- ============ ЛАЙКИ / ДИЗЛАЙКИ ============
create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  dir text not null check (dir in ('like', 'skip')),
  created_at timestamptz not null default now(),
  unique (from_user, to_user)
);

alter table public.likes enable row level security;

drop policy if exists "likes_read_own" on public.likes;
create policy "likes_read_own" on public.likes for select
  using (auth.uid() = from_user or auth.uid() = to_user);

drop policy if exists "likes_write_own" on public.likes;
create policy "likes_write_own" on public.likes for insert
  with check (auth.uid() = from_user);

drop policy if exists "likes_update_own" on public.likes;
create policy "likes_update_own" on public.likes for update
  using (auth.uid() = from_user) with check (auth.uid() = from_user);

drop policy if exists "likes_delete_own" on public.likes;
create policy "likes_delete_own" on public.likes for delete
  using (auth.uid() = from_user);

-- ============ МАТЧИ (реальная таблица, а не view) ============
-- Появляется только после взаимного лайка. a_user < b_user (упорядоченная пара).

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  a_user uuid not null references auth.users(id) on delete cascade,
  b_user uuid not null references auth.users(id) on delete cascade,
  matched_at timestamptz not null default now(),
  seen_a boolean not null default false,
  seen_b boolean not null default false,
  unmatch_a boolean not null default false,
  unmatch_b boolean not null default false,
  unique (a_user, b_user),
  check (a_user < b_user)
);

create index if not exists matches_user_idx on public.matches (a_user);
create index if not exists matches_user2_idx on public.matches (b_user);
create index if not exists matches_at_idx on public.matches (matched_at desc);

alter table public.matches enable row level security;

drop policy if exists "matches_read_participants" on public.matches;
create policy "matches_read_participants" on public.matches for select
  using (auth.uid() = a_user or auth.uid() = b_user);

drop policy if exists "matches_insert_participants" on public.matches;
create policy "matches_insert_participants" on public.matches for insert
  with check (auth.uid() = a_user or auth.uid() = b_user);

drop policy if exists "matches_update_participants" on public.matches;
create policy "matches_update_participants" on public.matches for update
  using (auth.uid() = a_user or auth.uid() = b_user)
  with check (auth.uid() = a_user or auth.uid() = b_user);

drop policy if exists "matches_delete_participants" on public.matches;
create policy "matches_delete_participants" on public.matches for delete
  using (auth.uid() = a_user or auth.uid() = b_user);

-- ============ СООБЩЕНИЯ (AES-GCM, шифротекст в БД) ============
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  iv text not null,
  ct text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_pair_idx on public.messages (from_user, to_user, created_at);
create index if not exists messages_pair2_idx on public.messages (to_user, from_user, created_at);

alter table public.messages enable row level security;

drop policy if exists "messages_read_participants" on public.messages;
create policy "messages_read_participants" on public.messages for select
  using (auth.uid() = from_user or auth.uid() = to_user);

drop policy if exists "messages_insert_sender" on public.messages;
create policy "messages_insert_sender" on public.messages for insert
  with check (auth.uid() = from_user);

drop policy if exists "messages_delete_participants" on public.messages;
create policy "messages_delete_participants" on public.messages for delete
  using (auth.uid() = from_user or auth.uid() = to_user);

-- ============ ПЛАНЫ НА СЕГОДНЯ (публичные) ============
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day text not null,
  title text not null,
  scheduled_at timestamptz,
  company_ok boolean not null default false,
  city text,
  lat double precision,
  lon double precision,
  created_at timestamptz not null default now()
);

create index if not exists plans_day_idx on public.plans(day);
create index if not exists plans_city_idx on public.plans(city);

alter table public.plans enable row level security;

drop policy if exists "plans_read_all" on public.plans;
create policy "plans_read_all" on public.plans for select using (true);

drop policy if exists "plans_write_own" on public.plans;
create policy "plans_write_own" on public.plans for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ ЛОКАЦИИ (кой-где/круг) ============
create table if not exists public.locations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lat double precision not null,
  lon double precision not null,
  acc double precision,
  city text,
  updated_at timestamptz not null default now()
);

alter table public.locations enable row level security;

drop policy if exists "locations_read_all" on public.locations;
create policy "locations_read_all" on public.locations for select using (true);

drop policy if exists "locations_write_own" on public.locations;
create policy "locations_write_own" on public.locations for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ СОБЫТИЯ (шаринг от пользователей) ============
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  place text,
  city text,
  lat double precision,
  lon double precision,
  starts_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.events enable row level security;

drop policy if exists "events_read_all" on public.events;
create policy "events_read_all" on public.events for select using (true);

drop policy if exists "events_write_own" on public.events;
create policy "events_write_own" on public.events for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ СОГЛАСИЯ (аудит-журнал) ============
create table if not exists public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_type text not null check (consent_type in (
    'agreement', 'personalData', 'newsletters', 'cookies', 'thirdPartyData',
    'specialCategories', 'profiling', 'geo', 'steps'
  )),
  granted boolean not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists consents_user_idx on public.consents (user_id, consent_type);
create index if not exists consents_created_idx on public.consents (created_at desc);

alter table public.consents enable row level security;

drop policy if exists "consents_read_own" on public.consents;
create policy "consents_read_own" on public.consents for select
  using (auth.uid() = user_id);

drop policy if exists "consents_write_own" on public.consents;
create policy "consents_write_own" on public.consents for insert
  with check (auth.uid() = user_id);

-- ============ ТЕКУЩИЕ СОГЛАСИЯ (быстрый доступ) ============
create table if not exists public.current_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  agreement boolean not null default false,
  personal_data boolean not null default false,
  newsletters boolean not null default false,
  cookies boolean not null default false,
  third_party_data boolean not null default false,
  special_categories boolean not null default false,
  profiling boolean not null default true,
  geo boolean not null default false,
  steps boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.current_consents enable row level security;

drop policy if exists "current_consents_read_own" on public.current_consents;
create policy "current_consents_read_own" on public.current_consents for select
  using (auth.uid() = user_id);

drop policy if exists "current_consents_write_own" on public.current_consents;
create policy "current_consents_write_own" on public.current_consents for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ ЖАЛОБЫ (модерация) ============
create table if not exists public.reports (
  id text primary key,
  reporter_id text not null,
  target_id text not null,
  target_type text not null default 'user',
  reason text not null,
  details text,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'resolved', 'dismissed')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists reports_status_idx on public.reports (status);
create index if not exists reports_target_idx on public.reports (target_id);
create index if not exists reports_created_idx on public.reports (created_at desc);

alter table public.reports enable row level security;

drop policy if exists "reports_read_admin" on public.reports;
create policy "reports_read_admin" on public.reports for select using (true);

drop policy if exists "reports_insert_auth" on public.reports;
create policy "reports_insert_auth" on public.reports for insert with check (true);

-- ============ ПЕРСИСТЕНТНЫЙ СТАТУС МОДЕРАЦИИ ============
-- Хранит решение (авто-кворум или модератор) независимо от in-memory store,
-- чтобы переживать рестарты бессерверной платформы.
-- status: 'approved' — анкета видна; 'pending_review' — скрыта до разбора; 'blocked' — забанена.
create table if not exists public.moderation_status (
  target_id text primary key,
  status text not null default 'approved'
    check (status in ('approved', 'pending_review', 'blocked')),
  reason text,
  changed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists moderation_status_status_idx
  on public.moderation_status (status, updated_at desc);

alter table public.moderation_status enable row level security;
-- Читается/пишется только служебным ключом (сервис-роль). Публичных политик нет.

-- ============ АУДИТ-ЖУРНАЛ (152-ФЗ, ст. 18.1; срок хранения 3 года) ============
create table if not exists public.audit_log (
  id bigserial primary key,
  user_id text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists audit_user_idx on public.audit_log (user_id, created_at desc);
create index if not exists audit_action_idx on public.audit_log (action, created_at desc);
create index if not exists audit_created_idx on public.audit_log (created_at desc);

-- Хранение не менее 3 лет: удалять записи старше 1100 дней.
create table if not exists public.audit_retention (
  id int primary key default 1 check (id = 1),
  retention_days int not null default 1095,
  updated_at timestamptz not null default now()
);
insert into public.audit_retention (id) values (1) on conflict (id) do nothing;

alter table public.audit_log enable row level security;

drop policy if exists "audit_read_own" on public.audit_log;
create policy "audit_read_own" on public.audit_log for select
  using (auth.uid()::text = user_id);

drop policy if exists "audit_insert_service" on public.audit_log;
create policy "audit_insert_service" on public.audit_log for insert with check (true);

-- ============ ПОДПИСКИ (CloudPayments) ============
-- provider всегда 'cloudpayments'; subscription_id / token — для автопродления и отмены.
create table if not exists public.subscriptions (
  id bigserial primary key,
  user_id text not null,
  plan_id text not null,
  payment_id text,
  subscription_id text,
  token text,
  provider text not null default 'cloudpayments',
  status text not null default 'active',
  addons jsonb not null default '[]'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists subscriptions_user_plan_idx
  on public.subscriptions (user_id, plan_id, status);

create index if not exists subscriptions_expires_idx on public.subscriptions (expires_at desc);

-- Обратная совместимость, если таблица уже была создана без новых колонок.
alter table public.subscriptions add column if not exists subscription_id text;
alter table public.subscriptions add column if not exists token text;
alter table public.subscriptions add column if not exists addons jsonb not null default '[]'::jsonb;

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_read_own" on public.subscriptions;
create policy "subscriptions_read_own" on public.subscriptions for select
  using (auth.uid()::text = user_id);

-- Вставка/обновление идёт со служебным ключом (сервис-роль, SRP/full_access),
-- поэтому для публичной роли нужен только select. Защита от записи самим юзером:
drop policy if exists "subscriptions_no_user_write" on public.subscriptions;
create policy "subscriptions_no_user_write" on public.subscriptions for insert with check (false);