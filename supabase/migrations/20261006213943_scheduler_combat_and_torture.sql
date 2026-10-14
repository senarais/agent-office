-- Additive revision 2. Run after 20261006042020_office_game.sql.
-- Existing JSONB records and provider vault references remain intact.
begin;

alter table public.employees
  add column max_hp integer generated always as (coalesce((payload->>'maxHp')::integer, 100)) stored,
  add column current_hp integer generated always as (coalesce((payload->>'currentHp')::integer, case when payload->>'employmentStatus' = 'deceased' then 0 else 100 end)) stored,
  add column corpse_present boolean generated always as (coalesce((payload->>'corpsePresent')::boolean, payload->>'employmentStatus' = 'deceased')) stored,
  add constraint employee_hp_range check (max_hp between 1 and 10000 and current_hp between 0 and max_hp),
  add constraint employee_deceased_hp check (employment_status <> 'deceased' or current_hp = 0),
  add constraint employee_corpse_status check (not corpse_present or employment_status = 'deceased');

create index employees_injured_idx on public.employees(company_id, current_hp) where employment_status = 'active' and current_hp < max_hp;
create index employees_unresolved_idx on public.employees(company_id, employment_status) where employment_status = 'deceased';

create table public.recurring_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  employee_id uuid generated always as ((payload->>'employeeId')::uuid) stored references public.employees(id),
  provider_id uuid generated always as (nullif(payload->>'providerId', '')::uuid) stored references public.provider_connections(id),
  schedule_type text generated always as (payload->'schedule'->>'type') stored,
  timezone text generated always as (payload->'schedule'->>'timezone') stored,
  enabled boolean generated always as (coalesce((payload->>'enabled')::boolean, false)) stored,
  next_run_at text generated always as (payload->>'nextRunAt') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_schedule_type check (schedule_type in ('once', 'daily', 'weekly', 'interval', 'cron')),
  constraint recurring_output_destination check (payload->>'outputDestination' in ('printer', 'laptop', 'both'))
);
create index recurring_tasks_employee_idx on public.recurring_tasks(employee_id);
create index recurring_tasks_provider_idx on public.recurring_tasks(provider_id);
create index recurring_tasks_due_idx on public.recurring_tasks(company_id, next_run_at) where enabled;

alter table public.tasks add column recurring_task_id uuid generated always as ((payload->'scheduled'->>'scheduleId')::uuid) stored references public.recurring_tasks(id);
create index tasks_recurring_idx on public.tasks(recurring_task_id) where recurring_task_id is not null;

create table public.scheduled_task_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  recurring_task_id uuid generated always as ((payload->>'recurringTaskId')::uuid) stored references public.recurring_tasks(id),
  employee_id uuid generated always as ((payload->>'employeeId')::uuid) stored references public.employees(id),
  task_id uuid generated always as ((payload->>'taskId')::uuid) stored references public.tasks(id),
  scheduled_at text generated always as (payload->>'scheduledAt') stored,
  status text generated always as (payload->>'status') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduled_run_status check (status in ('queued', 'running', 'completed', 'failed', 'cancelled', 'skipped')),
  constraint scheduled_occurrence_unique unique (recurring_task_id, scheduled_at)
);
create index scheduled_runs_employee_idx on public.scheduled_task_runs(employee_id);
create index scheduled_runs_task_idx on public.scheduled_task_runs(task_id);
create index scheduled_runs_history_idx on public.scheduled_task_runs(company_id, created_at desc);

create table public.torture_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  employee_id uuid generated always as ((payload->>'employeeId')::uuid) stored references public.employees(id),
  method text generated always as (payload->>'method') stored,
  status text generated always as (payload->>'status') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint torture_method check (method in ('whip', 'punch', 'knife', 'target', 'shock', 'meeting', 'paperwork')),
  constraint torture_status check (status in ('walking', 'active', 'paused', 'released', 'deceased')),
  constraint torture_intensity check ((payload->>'intensity')::numeric between 0.5 and 2)
);
create index torture_sessions_employee_idx on public.torture_sessions(employee_id);
create index torture_sessions_company_idx on public.torture_sessions(company_id, created_at desc);
alter table public.incidents add column torture_session_id uuid generated always as ((payload->>'tortureSessionId')::uuid) stored references public.torture_sessions(id);
create index incidents_torture_idx on public.incidents(torture_session_id) where torture_session_id is not null;

do $$
declare table_name text;
begin
  foreach table_name in array array['recurring_tasks', 'scheduled_task_runs', 'torture_sessions'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to service_role', table_name);
    execute format('create trigger office_updated before update on public.%I for each row execute function public.office_touch_updated_at()', table_name);
  end loop;
end;
$$;

comment on column public.recurring_tasks.next_run_at is 'UTC ISO-8601 timestamp. Text retains an immutable generated expression; UTC strings sort chronologically.';
comment on table public.recurring_tasks is 'Server-side schedules. Deleted definitions retain a deletedAt tombstone so run histories remain referentially intact.';
comment on table public.scheduled_task_runs is 'One durable occurrence per definition and scheduledAt; retries update the same run and task.';
comment on table public.torture_sessions is 'Fictional pixel-game device sessions; no offline damage catch-up. Deceased is distinct from fired.';
commit;
