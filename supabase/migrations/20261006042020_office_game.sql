-- PT ABISENA RAIS JAYA — single-local-server durable replica.
-- JSONB preserves the exact typed game records. Generated columns support SQL
-- queries, constraints and indexes without a second conflicting source of truth.
begin;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_payload_object check (jsonb_typeof(payload) = 'object')
);

create function public.office_touch_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.office_touch_updated_at() from public, anon, authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'employees', 'employee_appearance', 'employee_provider_config',
    'employment_history', 'tasks', 'task_events', 'conversations', 'messages',
    'reports', 'meetings', 'meeting_participants', 'meeting_messages',
    'provider_connections', 'game_settings', 'company_settings', 'office_state',
    'player_state', 'inventory', 'incidents'
  ] loop
    execute format('create table public.%I (
      id uuid primary key default gen_random_uuid(),
      company_id uuid not null references public.companies(id) on delete cascade,
      payload jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint %I check (jsonb_typeof(payload) = ''object'')
    )', table_name, table_name || '_payload_object');
    execute format('create index %I on public.%I (company_id, created_at desc)', table_name || '_company_created_idx', table_name);
    execute format('create trigger office_updated before update on public.%I for each row execute function public.office_touch_updated_at()', table_name);
    execute format('alter table public.%I enable row level security', table_name);
    -- No browser access. This local application uses its backend service role.
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to service_role', table_name);
  end loop;
end;
$$;

alter table public.companies enable row level security;
revoke all on public.companies from anon, authenticated;
grant select, insert, update, delete on public.companies to service_role;
create trigger office_updated before update on public.companies for each row execute function public.office_touch_updated_at();

alter table public.employees
  add column name text generated always as (payload->>'name') stored,
  add column role text generated always as (payload->>'role') stored,
  add column department text generated always as (payload->>'department') stored,
  add column employment_status text generated always as (payload->>'employmentStatus') stored,
  add constraint employees_employment_status check (employment_status in ('active', 'fired', 'deceased', 'quit'));
create index employees_staffing_idx on public.employees(company_id, employment_status, department);

alter table public.employee_appearance add column employee_id uuid generated always as ((payload->>'employeeId')::uuid) stored references public.employees(id);
alter table public.employee_provider_config add column employee_id uuid generated always as ((payload->>'employeeId')::uuid) stored references public.employees(id);
create unique index employee_appearance_employee_idx on public.employee_appearance(employee_id);
create unique index employee_provider_config_employee_idx on public.employee_provider_config(employee_id);

alter table public.provider_connections
  add column kind text generated always as (payload->>'kind') stored,
  add constraint providers_kind check (kind in ('openai', 'opencode', 'generic', 'demo')),
  add constraint providers_no_raw_secrets check (not (payload ?| array['apiKey', 'api_key', 'headers', 'secret', 'password']));

alter table public.tasks
  add column employee_id uuid generated always as ((payload->>'employeeId')::uuid) stored references public.employees(id),
  add column status text generated always as (payload->>'status') stored,
  add constraint tasks_status check (status in ('QUEUED', 'WALKING_TO_WORKSTATION', 'STARTING', 'WORKING', 'WAITING_FOR_TOOL', 'WAITING_FOR_USER', 'BLOCKED', 'REVIEWING', 'COMPLETED', 'FAILED', 'CANCELLED'));
create index tasks_employee_status_idx on public.tasks(employee_id, status);
create index tasks_open_queue_idx on public.tasks(company_id, status) where status not in ('COMPLETED', 'FAILED', 'CANCELLED');

alter table public.conversations add column employee_id uuid generated always as ((payload->>'employeeId')::uuid) stored references public.employees(id);
create index conversations_employee_idx on public.conversations(employee_id, created_at desc);
alter table public.messages add column conversation_id uuid generated always as ((payload->>'conversationId')::uuid) stored references public.conversations(id);
create index messages_conversation_idx on public.messages(conversation_id, created_at);
alter table public.reports
  add column employee_id uuid generated always as ((payload->>'employeeId')::uuid) stored references public.employees(id),
  add column task_id uuid generated always as ((payload->>'taskId')::uuid) stored references public.tasks(id);
create index reports_employee_idx on public.reports(employee_id, created_at desc);
create index reports_task_idx on public.reports(task_id);

alter table public.meeting_participants
  add column meeting_id uuid generated always as ((payload->>'meetingId')::uuid) stored references public.meetings(id),
  add column employee_id uuid generated always as ((payload->>'employeeId')::uuid) stored references public.employees(id);
create unique index meeting_participant_unique_idx on public.meeting_participants(meeting_id, employee_id);
create index meeting_participant_employee_idx on public.meeting_participants(employee_id);
alter table public.meeting_messages add column meeting_id uuid generated always as ((payload->>'meetingId')::uuid) stored references public.meetings(id);
create index meeting_messages_meeting_idx on public.meeting_messages(meeting_id, created_at);
alter table public.employment_history add column employee_id uuid generated always as ((payload->>'employeeId')::uuid) stored references public.employees(id);
create index employment_history_employee_idx on public.employment_history(employee_id, created_at desc);
alter table public.incidents add column employee_id uuid generated always as ((payload->>'employeeId')::uuid) stored references public.employees(id);
create index incidents_employee_idx on public.incidents(employee_id, created_at desc);
alter table public.task_events add column event_type text generated always as (payload->>'type') stored;
create index task_events_type_idx on public.task_events(company_id, event_type, created_at desc);

comment on table public.office_state is 'Atomic complete restore snapshot, written after child replicas. Contains no provider secrets.';
comment on table public.provider_connections is 'Provider metadata only. Keys/passwords/custom headers stay in local AES-256-GCM vault.';
comment on table public.employees is 'Deceased and fired employees are retained. Never filter these rows out of a backup.';
commit;
