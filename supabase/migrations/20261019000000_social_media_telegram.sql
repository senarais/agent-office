-- PT ABISENA RAIS JAYA — social media campaigns, publishing, analytics and Telegram flags.
-- Additive only. Apply after 20261015000000_multi_office.sql.
begin;

-- Recurring reports can opt into Telegram delivery per definition.
alter table public.recurring_tasks
  add column if not exists telegram_notify boolean generated always as ((payload->>'telegramNotify')::boolean) stored;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'social_accounts', 'social_posts', 'social_campaigns', 'social_publishes'
  ] loop
    execute format('create table if not exists public.%I (
      id uuid primary key default gen_random_uuid(),
      company_id uuid not null references public.companies(id) on delete cascade,
      payload jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint %I check (jsonb_typeof(payload) = ''object'')
    )', table_name, table_name || '_payload_object');
    execute format('alter table public.%I add column if not exists office_id uuid generated always as ((payload->>''officeId'')::uuid) stored', table_name);
    execute format('create index if not exists %I on public.%I (company_id, office_id)', table_name || '_office_idx', table_name);
    execute format('drop trigger if exists office_updated on public.%I', table_name);
    execute format('create trigger office_updated before update on public.%I for each row execute function public.office_touch_updated_at()', table_name);
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to service_role', table_name);
  end loop;
end;
$$;

alter table public.social_accounts
  add column if not exists platform text generated always as (payload->>'platform') stored,
  add column if not exists handle text generated always as (payload->>'handle') stored;
create index if not exists social_accounts_platform_idx on public.social_accounts (company_id, platform);

alter table public.social_posts
  add column if not exists platform text generated always as (payload->>'platform') stored,
  add column if not exists external_id text generated always as (payload->>'externalId') stored;
create index if not exists social_posts_platform_posted_idx on public.social_posts (company_id, platform, created_at desc);
create unique index if not exists social_posts_external_unique_idx on public.social_posts (company_id, platform, external_id) where external_id is not null;

alter table public.social_campaigns
  add column if not exists status text generated always as (payload->>'status') stored,
  add column if not exists platform text generated always as (payload->>'platform') stored;
create index if not exists social_campaigns_status_idx on public.social_campaigns (company_id, status);

alter table public.social_publishes
  add column if not exists status text generated always as (payload->>'status') stored,
  add column if not exists campaign_id uuid generated always as ((payload->>'campaignId')::uuid) stored,
  add column if not exists option_id uuid generated always as ((payload->>'optionId')::uuid) stored;
create index if not exists social_publishes_campaign_idx on public.social_publishes (campaign_id, created_at desc);
create unique index if not exists social_publishes_option_unique_idx on public.social_publishes (company_id, campaign_id, option_id);

comment on table public.social_accounts is 'Synced social account summaries. No platform credentials or access tokens.';
comment on table public.social_posts is 'Synced or office-published posts with audience metrics. Missing metrics remain null.';
comment on table public.social_campaigns is 'Creative-to-social review pipeline records and generated options.';
comment on table public.social_publishes is 'Publishing attempts and automation idempotency keys.';
commit;
