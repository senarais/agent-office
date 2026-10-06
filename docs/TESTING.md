# Verification and regression checks

## Backend and shared logic

```bash
npm test
```

Tests create independent SQLite databases and local HTTP providers. Coverage includes:

- Every workstation, interaction point and meeting seat reachable through A*; collision substeps prevent tunneling.
- Empty initial staff; hire/edit appearance; employee/settings persistence.
- Real queued/walking/workstation lifecycle; offline task becomes BLOCKED without fabricated output.
- Official OpenAI SDK against a local OpenAI-compatible HTTP/SSE fixture: model list, auth header, streamed task/chat, report delivery, conversation persistence and encrypted secrets.
- Official OpenCode SDK against local protocol fixture: session creation, model selection, tool allowlist, streamed/final result.
- Nonlethal punch; lethal persistent death; cancellation of in-flight work; no execution by deceased employee.
- Firing/leaving/vacancy records; violence settings enforced server-side.
- Pause/cancel/retry and restart recovery without duplicate automatic execution.
- API schema failures, missing session token, cross-site rejection, bad credentials and redaction.
- Two-agent meeting arrival/orchestration, shared context, persisted minutes and one-time action conversion.
- Chat cancellation and maximum-size current-message retention; disabling a provider cancels work and clears the working state.
- Secret-free Supabase REST replication/restore; failed initial restore cannot overwrite an existing cloud backup with an empty fallback.

The local protocol fixtures verify adapter requests/responses, not live vendor authentication.

## Browser flows

```bash
npx playwright install chromium
npm run test:e2e
```

Tests use isolated backend/frontend ports 3101/5175, unique temporary saves, and **explicit DEMO SIMULATION** mode. No live API is required. A real OpenAI smoke case is skipped unless the test process has `OPENAI_API_KEY`.

Browser journey checks actual WASD movement/collision and physical pathfinding to HR, IT and colleagues; HR creation/spawn; provider setup/model assignment; real backend task orchestration through the test adapter; report approach/read/approval; streamed chat; player/employee appearance; actual music playback and jukebox track change/mute; nonlethal punch; persistent firearm death across reload; replacement hire and firing/exit. Separate checks cover a physical two-employee meeting, persisted minutes, editable whiteboard goals, boss-computer apps/analytics, and a 390px viewport without outside-page scrolling.

Tests call the scene's normal `walkTo` method to automate long journeys. It follows the same A*/movement/collision route as mouse clicks, not teleportation. Forms and interactions use real keyboard/click input.

Failure traces/screenshots: `test-results/`. Example screenshots: `docs/screenshots/`. Tests listen for uncaught browser errors. The full journey runs about 70–90 seconds on the development machine.

Optional installed Chrome:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome npm run test:e2e
```

Optional live API smoke (small billed call):

```bash
OPENAI_API_KEY=your_key OPENAI_MODEL=gpt-4.1-mini npm run test:e2e
```

## Build

```bash
npm run build
```

Typechecks active frontend, backend and shared code, then bundles frontend to `dist/`. Phaser's engine bundle triggers Vite's standard large-chunk advisory; it is split from application code and is not a build error.

## Database migration

On a disposable Postgres database with Supabase-equivalent `anon`, `authenticated`, `service_role BYPASSRLS` roles:

```bash
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261006042020_office_game.sql
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/database-check.sql
```

The second script rolls back all sample data. It checks real DDL, generated employment state, service-role operations, rejected raw provider secrets, rejected invalid task statuses, denied public access and RLS on all 20 tables.

## Manual integration checks with your credentials

1. Test invalid OpenAI key: visible error, no successful fake response.
2. Test valid key/model: arbitrary chat, streaming, cancellation, saved history after restart.
3. OpenCode: create a harmless task in a disposable project; verify actual file change, displayed tool activity, session cancellation and returned report.
4. Supabase: verify SQL rows, then restore into a new `DATA_DIR` as described in setup guide.
5. Audio: listen to both recorded tracks and subtle effects; verify separate sliders and M mute.

No live OpenAI/OpenCode account or hosted Supabase configuration is bundled with the source.
