-- PT ABISENA RAIS JAYA — multi-business support: one PT, many offices.
-- Providers, settings and the director stay PT-wide; per-office records gain an office_id.
begin;

-- 1) Allow the Command Code CLI provider kind (added to the app after the original migration).
alter table public.provider_connections drop constraint if exists providers_kind;
alter table public.provider_connections add constraint providers_kind check (kind in ('openai', 'opencode', 'commandcode', 'generic', 'demo'));

-- 2) Every per-office replica row carries an officeId, indexed for per-business queries.
--    Existing rows keep a null office_id until their next sync.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'employees', 'employee_appearance', 'employee_provider_config', 'employment_history', 'tasks',
    'conversations', 'messages', 'reports', 'meetings', 'meeting_participants', 'meeting_messages',
    'recurring_tasks', 'scheduled_task_runs', 'torture_sessions', 'incidents'
  ] loop
    execute format('alter table public.%I add column if not exists office_id uuid generated always as ((payload->>''officeId'')::uuid) stored', table_name);
    execute format('create index if not exists %I on public.%I (company_id, office_id)', table_name || '_office_idx', table_name);
  end loop;
end;
$$;

-- 3) Per-business branding (name, motto, wall color, plants, goals, chaos).
create table if not exists public.office_branding (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint office_branding_payload_object check (jsonb_typeof(payload) = 'object')
);
alter table public.office_branding add column if not exists office_id uuid generated always as ((payload->>'officeId')::uuid) stored;
create index if not exists office_branding_company_office_idx on public.office_branding (company_id, office_id);
alter table public.office_branding enable row level security;
revoke all on public.office_branding from anon, authenticated;
grant select, insert, update, delete on public.office_branding to service_role;
drop trigger if exists office_updated on public.office_branding;
create trigger office_updated before update on public.office_branding for each row execute function public.office_touch_updated_at();

comment on column public.employees.office_id is 'Business office this employee belongs to. Null for pre-multi-office rows.';
comment on table public.office_branding is 'One row per business office: name, motto, wall color, plants, goals and chaos.';
commit;
