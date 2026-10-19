# Verification and regression checks

## Revision 4 checks

`npm test` now also runs `social.test.ts`: tolerant creative-JSON parsing (fences/wrappers/prose fallback), real Creative task execution into reviewable media options, Telegram approval and publishing through a fixture automation connector, revision loops that append options, global and per-schedule Telegram report toggles, analytics deduplication/engagement math, and signed automation callbacks that bypass the browser token only with the shared secret.

Browser flows exercise the expanded boss computer (14 apps), the new Social media studio screen reachable from the world, and the existing combat/HR flows. The Social media campaign lint is covered by typecheck/build and backend tests; live Telegram and social publishing require the user's own credentials and are not claimed as tested.

## Revision 2 checks

`npm test` now runs `core.test.ts`, `revision.test.ts` and `social.test.ts`. Current suite: 44 checks covering the original flows plus timezone/DST scheduling, exact due boundaries, interval phase, downtime coalescing, occurrence deduplication, CRUD/overlap, bounded retry, deliberate-pause protection, provider overrides, reports/archive/follow-up, directional empty-space combat/cooldown/occlusion, multi-hit HP, healing, persistent bodies/resurrection/replacement, seven machine methods, stop/release/restart persistence, additive legacy-save migration and authoritative NPC interaction acknowledgments.

`revision.spec.ts` adds browser flows that deliberately delay combat HTTP responses to verify feedback is immediate, hold SPACE to verify bounded autofire, inspect actual world HP bars/blood counters/body sprites, reload a corpse, exercise healing/resurrection/similar/new replacement, run a real server-scheduled fixture task while the page is `about:blank`, review its report, and test persistent machine control. A separate HTTP test verifies Vite refuses vault/SQLite files. Test servers explicitly disable Supabase replication so fixtures cannot alter a configured real project.

New SQL verification:

```bash
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261006213943_scheduler_combat_and_torture.sql
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/revision-database-check.sql
```

Apply the original migration first on a new test database. The revision check rolls back sample data and validates HP/corpse invariants, resurrection, schedule/task/run relations, duplicate-occurrence rejection, device sessions/incidents and private RLS.

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
- Command Code CLI adapter against a local executable fixture: NDJSON streaming, model list, session resume, tool-bypass flag, abort and friendly missing/unauth errors.
- Multi-office: staff isolated per business, providers/settings/director shared PT-wide, switching changes the active office, and a scheduled job keeps running in one business while another is active.
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

Browser journey checks actual WASD movement/collision and physical pathfinding to HR, IT and colleagues; HR creation/spawn; provider setup/model assignment; real backend task orchestration through the test adapter; report approach/read/approval; streamed chat; player/employee appearance; actual music playback and jukebox track change/mute; nonlethal punch; persistent firearm death across reload; replacement hire and firing/exit. Separate checks cover a physical two-employee meeting, persisted minutes, editable whiteboard goals, boss-computer apps/analytics, business switching (the previous office's staff and sprites are fully replaced, with no lingering actors), and a 390px viewport without outside-page scrolling.

Tests call the scene's normal `walkTo` and `approachEmployee` methods to automate long journeys. These use the same A*/movement/collision and live NPC pursuit as canvas clicks, not teleportation. Nearby NPCs are held at the acknowledged server position before automatic dialogue opens. Keyboard E interactions, forms and combat use actual keyboard/click input.

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
