# Supabase setup — optional durable remote replica

The office already saves to local SQLite. Supabase adds a durable remote record store and restore snapshot. It is optional, and an outage does not block play or lose local saves.

## 1. Create a project

Create a project at https://supabase.com/dashboard. A standard Postgres project is sufficient. Wait until it is healthy.

Use a project dedicated to this game: table names such as `employees` and `tasks` are intentionally ordinary. Migration is not an in-place upgrade of unrelated existing tables.

## 2. Copy Project URL

From **Project Settings → API**, copy the HTTPS project URL:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
```

## 3. Public/anon key

**Not needed by this frontend.** The browser talks only to your local backend. Do not add Supabase keys to Vite variables or browser storage.

## 4. Backend service-role key

Copy the legacy **service_role** API key into your local root `.env`:

```dotenv
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_SIDE_SERVICE_ROLE_JWT
```

Keep this key server-side. It bypasses RLS and must not be distributed with screenshots, source control, frontend JavaScript or logs. `.env` is gitignored.

## 5. Apply the complete migration

Open Supabase **SQL Editor → New query**. Paste and run the entire file:

[`supabase/migrations/20261006042020_office_game.sql`](../supabase/migrations/20261006042020_office_game.sql)

No schema invention is required. The migration is transactional and creates:

`companies`, `employees`, `employee_appearance`, `employee_provider_config`, `employment_history`, `tasks`, `task_events`, `conversations`, `messages`, `reports`, `meetings`, `meeting_participants`, `meeting_messages`, `provider_connections`, `game_settings`, `company_settings`, `office_state`, `player_state`, `inventory`, `incidents`.

Each record has UUID primary key, `created_at`, `updated_at`, JSONB payload and indexed company relationship. Generated typed columns support employment status, task state, employee/conversation/meeting relationships. Status constraints reject invalid states. Provider metadata explicitly rejects raw credential fields.

The active engine uses typed JSON records so the replica stores the exact records without lossy field mapping. SQL queries use the indexed generated columns. A complete `office_state` snapshot is written last for consistent full-game restoration.

CLI alternative, after connecting the CLI to **your** project:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Review CLI target before pushing. No Docker is necessary for the hosted-project workflow.

## 6. Environment

```dotenv
DATA_DIR=.local-data
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_SIDE_SERVICE_ROLE_JWT
```

Provider credentials remain in the local encrypted vault and are **never replicated**. The remote tables contain only provider names, URLs, kind, availability, model IDs and a presence flag.

## 7. Start the game

```bash
npm run dev
```

Hire an employee in HR. Press **Esc → Save**. **Company** shows `SUPABASE + LOCAL SAVE` after successful sync; if the database cannot be reached, its actual error is shown and SQLite still saves.

Sync is debounced to at most one batch per 10 seconds. Manual Save waits for any in-flight batch, then writes a fresh snapshot. This is a **single local writer** design: do not run independent servers against the same company expecting conflict resolution.

If a brand-new local save cannot perform its initial remote restore, remote writes stay paused for that save. This prevents an empty fallback from overwriting an existing cloud backup when connectivity returns. Local play still saves normally. Preserve that fallback directory; after fixing connectivity/credentials, start with a **different, empty `DATA_DIR`** to restore the cloud save. Offline fallback changes are not automatically merged into it. Existing established local saves simply keep saving locally during normal remote outages and resume replication afterward.

## 8. Test persistence

1. Hire a colleague, change appearance and complete a task.
2. Save. Verify in SQL Editor:

```sql
select name, role, department, employment_status from public.employees;
select employee_id, status, payload->>'title' as title from public.tasks;
select conversation_id, payload->>'text' as message from public.messages;
select updated_at, payload->>'version' as save_version from public.office_state;
```

3. Reload browser; records remain.
4. Restart local backend; records remain from SQLite.
5. To test remote restore **without deleting your save**, stop server and temporarily set `DATA_DIR=.local-data-restore-test`. Start again. An empty local store loads the matching remote company snapshot. Re-enter provider secrets in IT; those are intentionally absent from Supabase. Return to original `DATA_DIR` afterward.

Tasks interrupted by a server restart become **BLOCKED**, requiring explicit retry. This prevents silently duplicating paid/provider work. Deceased/fired employees remain unavailable after restore.

## RLS and permissions

All 20 tables have RLS enabled. `anon` and `authenticated` have no table privileges and no access policies. Only backend `service_role` is granted CRUD. This matches the no-login, localhost-only design. No publicly callable security-definer function is created.

If changing to a hosted multi-user product later, introduce authenticated company membership and ownership policies before allowing browser access. Do not merely grant anonymous access to fix a connection problem.

References: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [securing the Data API](https://supabase.com/docs/guides/api/securing-your-api).

## Storage buckets

None required. Appearance is modular JSON, music is bundled, and small text/code attachments are incorporated into task instructions. Binary attachment storage is not implemented.

## Verification performed

Migration executed successfully against a disposable PostgreSQL 16 database. `tests/database-check.sql` validates generated columns, service-role writes, permanent employment state, secret/status constraints and 20/20 RLS tables. Actual hosted Supabase connectivity requires your project URL/key; no project was modified during development.
