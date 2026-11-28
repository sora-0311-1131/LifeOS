-- Remove legacy anonymous access to the planning tables.
--
-- goals / non_goals / periods / projects / tasks carried `anon_*` policies with
-- `USING (true)` / `WITH CHECK (true)` plus full table grants to `anon`. Since the
-- publishable key ships in the browser bundle, anyone could read, insert, update
-- or delete every row without signing in. These policies predate Supabase Auth
-- (they are not in this repo's migrations; they were created in the dashboard).
--
-- The app only touches these tables after login, through the `authenticated`
-- "Users can ... own ..." policies (auth.uid() = user_id), which stay as they are.
-- `events` had no anon policies but still held anon REFERENCES/TRIGGER/TRUNCATE,
-- so it is revoked as well.

drop policy if exists "anon_select_goals" on public.goals;
drop policy if exists "anon_insert_goals" on public.goals;
drop policy if exists "anon_update_goals" on public.goals;
drop policy if exists "anon_delete_goals" on public.goals;

drop policy if exists "anon_select_non_goals" on public.non_goals;
drop policy if exists "anon_insert_non_goals" on public.non_goals;
drop policy if exists "anon_update_non_goals" on public.non_goals;
drop policy if exists "anon_delete_non_goals" on public.non_goals;

drop policy if exists "anon_select_periods" on public.periods;
drop policy if exists "anon_insert_periods" on public.periods;
drop policy if exists "anon_update_periods" on public.periods;
drop policy if exists "anon_delete_periods" on public.periods;

drop policy if exists "anon_select_projects" on public.projects;
drop policy if exists "anon_insert_projects" on public.projects;
drop policy if exists "anon_update_projects" on public.projects;
drop policy if exists "anon_delete_projects" on public.projects;

drop policy if exists "anon_select_tasks" on public.tasks;
drop policy if exists "anon_insert_tasks" on public.tasks;
drop policy if exists "anon_update_tasks" on public.tasks;
drop policy if exists "anon_delete_tasks" on public.tasks;

revoke all on table public.goals from anon;
revoke all on table public.non_goals from anon;
revoke all on table public.periods from anon;
revoke all on table public.projects from anon;
revoke all on table public.tasks from anon;
revoke all on table public.events from anon;
