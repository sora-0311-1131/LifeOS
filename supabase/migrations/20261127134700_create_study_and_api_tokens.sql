-- Study Module Integration (YPT-for-me -> LifeOS)
-- Creates personal API tokens table and multi-tenant Study tables with RLS,
-- indexes, updated_at trigger, and authenticated Realtime subscription.

-- ============================================================================
-- 1. Personal API Tokens (shared foundation for NFC / iOS Shortcuts / automation)
-- ============================================================================
create table if not exists public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  token_prefix text not null,
  token_hash text not null unique,
  scopes text[] not null default '{study:write}'::text[],
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists api_tokens_user_id_idx
  on public.api_tokens (user_id);

-- ============================================================================
-- 2. Study Settings (per-user configuration, replaces app_settings)
-- ============================================================================
create table if not exists public.study_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  day_boundary_hour smallint not null default 4 check (day_boundary_hour between 0 and 6),
  streak_min_minutes integer not null default 30 check (streak_min_minutes >= 0),
  daily_goal_weekday_min integer not null default 180 check (daily_goal_weekday_min > 0),
  daily_goal_weekend_min integer not null default 360 check (daily_goal_weekend_min > 0),
  long_session_warn_min integer not null default 360 check (long_session_warn_min > 0),
  univ_periods jsonb not null default '[
    {"key": "morning", "label": "朝", "start": "04:00", "end": "08:50"},
    {"key": "period_1", "label": "1限", "start": "08:50", "end": "10:20"},
    {"key": "period_2", "label": "2限", "start": "10:30", "end": "12:00"},
    {"key": "lunch", "label": "昼休み", "start": "12:00", "end": "13:00"},
    {"key": "period_3", "label": "3限", "start": "13:00", "end": "14:30"},
    {"key": "period_4", "label": "4限", "start": "14:40", "end": "16:10"},
    {"key": "period_5", "label": "5限", "start": "16:20", "end": "17:50"},
    {"key": "after_school", "label": "放課後", "start": "17:50", "end": "23:00"},
    {"key": "late_night", "label": "深夜", "start": "23:00", "end": "04:00"}
  ]'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.set_study_settings_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_study_settings_updated_at() from public, anon, authenticated;

drop trigger if exists study_settings_updated_at_trg on public.study_settings;
create trigger study_settings_updated_at_trg
  before update on public.study_settings
  for each row
  execute function public.set_study_settings_updated_at();

-- ============================================================================
-- 3. Study Categories (replaces categories)
-- ============================================================================
create table if not exists public.study_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  constraint study_categories_user_name_uniq unique (user_id, name)
);

create index if not exists study_categories_user_sort_idx
  on public.study_categories (user_id, sort_order);

-- ============================================================================
-- 4. Study Spots (geofence & Wi-Fi SSID spots, replaces spots)
-- ============================================================================
create table if not exists public.study_spots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  spot_group text not null default 'Other' check (spot_group in ('Home', 'Univ', 'Cafe', 'Other')),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  radius_m integer not null default 50 check (radius_m > 0),
  wifi_ssid text,
  created_at timestamptz not null default now(),
  constraint study_spots_user_name_uniq unique (user_id, name)
);

create index if not exists study_spots_user_id_idx
  on public.study_spots (user_id);

-- ============================================================================
-- 5. Study Sessions (with optional LifeOS Goal / Project / Task binding)
-- ============================================================================
create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- NO ACTION (default) instead of RESTRICT: still blocks deleting a category in use,
  -- but defers the check to end of statement so auth.users cascade deletes succeed.
  category_id uuid not null references public.study_categories(id),
  spot_id uuid references public.study_spots(id) on delete set null,
  goal_id uuid references public.goals(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  location_label text not null default 'Other',
  memo text,
  tag_id text,
  wifi_ssid text,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  weather_code smallint,
  temperature_c real,
  pressure_hpa real,
  pressure_diff_3h real,
  pressure_diff_6h real,
  day_type text check (day_type is null or day_type in ('weekday', 'weekend', 'holiday')),
  univ_period text,
  needs_review boolean not null default false,
  start_event_id text,
  stop_event_id text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_sec integer check (duration_sec is null or duration_sec >= 0),
  created_at timestamptz not null default now(),
  constraint study_sessions_time_order_chk check (ended_at is null or ended_at >= started_at)
);

-- At most one active session per user
create unique index if not exists study_sessions_single_active_idx
  on public.study_sessions (user_id)
  where ended_at is null;

-- Offline sync idempotency keys per user
create unique index if not exists study_sessions_user_start_event_idx
  on public.study_sessions (user_id, start_event_id)
  where start_event_id is not null;

create unique index if not exists study_sessions_user_stop_event_idx
  on public.study_sessions (user_id, stop_event_id)
  where stop_event_id is not null;

-- Query performance indexes
create index if not exists study_sessions_user_started_at_idx
  on public.study_sessions (user_id, started_at desc);

create index if not exists study_sessions_user_category_id_idx
  on public.study_sessions (user_id, category_id);

create index if not exists study_sessions_user_spot_id_idx
  on public.study_sessions (user_id, spot_id)
  where spot_id is not null;

create index if not exists study_sessions_user_goal_id_idx
  on public.study_sessions (user_id, goal_id)
  where goal_id is not null;

create index if not exists study_sessions_user_project_id_idx
  on public.study_sessions (user_id, project_id)
  where project_id is not null;

create index if not exists study_sessions_user_task_id_idx
  on public.study_sessions (user_id, task_id)
  where task_id is not null;

create index if not exists study_sessions_user_needs_review_idx
  on public.study_sessions (user_id)
  where needs_review = true;

-- ============================================================================
-- 6. Grants & Row-Level Security (authenticated own-row access only, no anon)
-- ============================================================================
-- Supabase default privileges grant ALL on new public tables to anon/authenticated,
-- so revoke explicitly before granting what each role actually needs.
revoke all on table public.api_tokens from anon, authenticated;
revoke all on table public.study_settings from anon;
revoke all on table public.study_categories from anon;
revoke all on table public.study_spots from anon;
revoke all on table public.study_sessions from anon;

-- api_tokens: issuing and last_used_at updates go through the server (service_role).
-- Clients may only list their tokens (without token_hash) and delete (revoke) them.
grant select (id, user_id, name, token_prefix, scopes, last_used_at, revoked_at, created_at)
  on table public.api_tokens to authenticated;
grant delete on table public.api_tokens to authenticated;
grant all on table public.api_tokens to service_role;

grant all on table public.study_settings to authenticated, service_role;
grant all on table public.study_categories to authenticated, service_role;
grant all on table public.study_spots to authenticated, service_role;
grant all on table public.study_sessions to authenticated, service_role;

alter table public.api_tokens enable row level security;
alter table public.study_settings enable row level security;
alter table public.study_categories enable row level security;
alter table public.study_spots enable row level security;
alter table public.study_sessions enable row level security;

-- api_tokens policies
drop policy if exists "Users can view own api_tokens" on public.api_tokens;
drop policy if exists "Users can insert own api_tokens" on public.api_tokens;
drop policy if exists "Users can update own api_tokens" on public.api_tokens;
drop policy if exists "Users can delete own api_tokens" on public.api_tokens;

create policy "Users can view own api_tokens"
  on public.api_tokens for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can delete own api_tokens"
  on public.api_tokens for delete to authenticated
  using ((select auth.uid()) = user_id);

-- study_settings policies
drop policy if exists "Users can view own study_settings" on public.study_settings;
drop policy if exists "Users can insert own study_settings" on public.study_settings;
drop policy if exists "Users can update own study_settings" on public.study_settings;
drop policy if exists "Users can delete own study_settings" on public.study_settings;

create policy "Users can view own study_settings"
  on public.study_settings for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can insert own study_settings"
  on public.study_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update own study_settings"
  on public.study_settings for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete own study_settings"
  on public.study_settings for delete to authenticated
  using ((select auth.uid()) = user_id);

-- study_categories policies
drop policy if exists "Users can view own study_categories" on public.study_categories;
drop policy if exists "Users can insert own study_categories" on public.study_categories;
drop policy if exists "Users can update own study_categories" on public.study_categories;
drop policy if exists "Users can delete own study_categories" on public.study_categories;

create policy "Users can view own study_categories"
  on public.study_categories for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can insert own study_categories"
  on public.study_categories for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update own study_categories"
  on public.study_categories for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete own study_categories"
  on public.study_categories for delete to authenticated
  using ((select auth.uid()) = user_id);

-- study_spots policies
drop policy if exists "Users can view own study_spots" on public.study_spots;
drop policy if exists "Users can insert own study_spots" on public.study_spots;
drop policy if exists "Users can update own study_spots" on public.study_spots;
drop policy if exists "Users can delete own study_spots" on public.study_spots;

create policy "Users can view own study_spots"
  on public.study_spots for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can insert own study_spots"
  on public.study_spots for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update own study_spots"
  on public.study_spots for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete own study_spots"
  on public.study_spots for delete to authenticated
  using ((select auth.uid()) = user_id);

-- study_sessions policies
drop policy if exists "Users can view own study_sessions" on public.study_sessions;
drop policy if exists "Users can insert own study_sessions" on public.study_sessions;
drop policy if exists "Users can update own study_sessions" on public.study_sessions;
drop policy if exists "Users can delete own study_sessions" on public.study_sessions;

create policy "Users can view own study_sessions"
  on public.study_sessions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can insert own study_sessions"
  on public.study_sessions for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update own study_sessions"
  on public.study_sessions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete own study_sessions"
  on public.study_sessions for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ============================================================================
-- 7. Supabase Realtime Publication (authenticated + RLS only)
-- ============================================================================
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'study_sessions'
  ) then
    alter publication supabase_realtime add table public.study_sessions;
  end if;
end;
$$;
