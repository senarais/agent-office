# Development notes

## Revision 4 — Telegram delivery and the Social Media division

Implementation decisions:
- Telegram uses Bot API long-polling from the local server, so approvals work without a public webhook or tunnel. Only chat ids listed in `TELEGRAM_CHAT_ID` may approve or revise. Outbound report chunks are capped below the Bot API limit; inline callbacks use short stable prefixes.
- Report delivery is durable per report (`sent` / `failed` / `not-configured`), with a global default for manual assignments and a per-schedule `telegramNotify` flag frozen into each scheduled task. Creative-pipeline JSON reports do not leak into the Telegram report queue; the campaign review notification is the relevant message.
- Social Media is a sixth department with four reachable workstations and a studio desk in the open office. The engine owns the pipeline; CI/agent interaction remains the existing task/report executor.
- Creative agents return strict JSON options. The parser tolerates markdown fences and wrapper objects, and falls back to one reviewable text option rather than discarding prose. Image prompts are generated in parallel through OpenAI Images when configured; missing media is recorded as an option error, never replaced with fake files.
- Approval selects one option, freezes an idempotency key, and runs a local Playwright browser worker. X uses the composer/Post flow; Instagram uses Create/upload/Next/Share. The worker returns the real external id/URL or a real failure; nothing is marked published without a browser result.
- Analytics are scraped from the logged-in public profile using Playwright. X reads the latest 12 posts and public metrics; Instagram reads profile metadata and the latest 6 posts. Metrics are merged by platform + external id/permalink, and unavailable values stay unavailable.
- No platform passwords or OAuth tokens are stored in the office save. Persistent Chromium profiles live under `DATA_DIR/browser/<platform>` and are treated as secrets. Login is a one-time headed window; posting/analytics run headless by default.
- Supabase receives additive `social_*` replica tables and a generated `telegram_notify` column. Existing saves gain empty social arrays, `socialSettings`, and `telegramNotify: false` without touching staff or histories.
- Browser automation is the only social publishing path; external workflow/webhook bridges are not part of this implementation.

Verification targets: backend tests for option parsing, media/review/publish/revision lifecycle, global and per-schedule Telegram toggles, analytics deduplication, and browser account settings; TypeScript/build; browser smoke via the existing Playwright harness. Real X/Instagram login and posting are user-credential checks, never claimed as automated test success.

## Revision 2 — scheduled work and arcade gameplay

Before implementation, re-inspected all five office references plus the six combat/art references. LPC generators inform ordered character/equipment layers and per-action frame timing, not imported art (LPC assets carry individual attribution/share-alike requirements). Pixel Effect Generator informs bounded deterministic square-particle bursts. Street-fighter-game informs anticipation/impact/recovery and hitboxes; Top-Down-Shooter informs immediate muzzle feedback, directional hit tests and reusable effect pools. Tiddybub is an asset discovery index only: check original licenses. New sounds will come directly from Kenney CC0 Impact Sounds / Digital Audio. Pixabay license page returned HTTP 403, so no Pixabay asset is used.

Implementation decisions:
- Server-authoritative HP/hits; immediate predicted local attack audiovisuals, including empty-space fire. Shared weapon balance, directional hitscan/melee and world occlusion. Full/reduced/off and separate blood toggle.
- Death retains a corpse and unresolved employee record. Resurrect, terminate or template-replace explicitly. Old saves migrate in-place; no roster reset.
- Server scheduler reuses the actual task executor. One-time, daily, weekly, interval and cron, IANA timezones, persistent occurrence keys, bounded retry, no overlapping runs. Downtime coalesces missed occurrences into one run; no pretend execution while the computer is off.
- One compact physical punishment room carved from existing office space, seven interchangeable cartoon machines, persisted session/pulse state, no offline damage catch-up, no realistic gore.
- Supabase receives new schedules/run/session tables through a separate additive migration. Existing local/remote saves retain history and provider vaults.

## Pre-implementation research — 2026-10-06

Inspected repository metadata, README architecture, file trees, and implementation entry points from all five requested references using GitHub's API/raw source. This is an independent implementation; no reference code or assets are incorporated.

* **Pixel-Process-UG/agent-office** (MIT): inspected `agent-runtime.mjs` and provider/office state code. Borrow conceptually: separate agent execution from rendering, durable task/conversation records and event-driven speech bubbles. Reject: silently simulating configured agents.
* **forgeekscn/pixel-agent-office** (MIT): inspected backend state machine, event processor and WebSocket connection manager. Borrow: lifecycle-to-animation mapping, bounded event history, runtime/game separation. Reject: mandatory multi-floor complexity, monitoring-first navigation. One compact floor and SSE are sufficient locally.
* **ishkkman/agent-office** (license reported NOASSERTION; sprite license separate): inspected NPC adapter design, meeting and provider-related sources. Borrow: walk-up conversations, physical meetings and report delivery. Independently implement sprites, pathfinding, character layers and persistence; import no artwork or code.
* **yourtechtribe-labs/swarm-office** (MIT): inspected Phaser client EventBus, server agent layout, authoritative world and Tiled plans. Borrow: shared typed events and server-owned NPC state. Client owns responsive player movement; server validates periodic position updates. Reject: multiplayer/OIDC/deployment infrastructure for this local game.
* **chaos-cl/multiagent-dashboard** (no API-reported license): inspected `server.py` route, ask, persistence and SSE handlers. Borrow only: adapter separation, health/usage visibility, streamed events and stored conversations. Explicitly reject its dashboard visual design.

## Independent implementation

Phaser canvas, original canvas-drawn office/sprites, pixel-styled React overlays only when interacting with game objects, Node/Fastify server, SQLite durable offline save, encrypted server-side provider vault, official OpenAI and OpenCode SDKs, generic OpenAI-compatible adapter, optional Supabase replication. Existing project artwork informed palette and furniture vocabulary; old dashboard source is retained but not loaded by the new entry point.

One shared walkability grid drives player collision and NPC A*. Agent work begins after workstation arrival. No fake task progress. Provider-less operation remains a playable office with explicit connection errors. No pre-hired roster. Fictional combat updates durable employment status and cancels active work.

## Verification targets

Build/typecheck; isolated backend lifecycle/persistence/cancellation/security tests; Playwright movement, HR, hiring, provider/task/chat, firing, nonlethal/lethal combat and reload. Real credential smoke tests are conditional, never reported as passing without credentials.

## Implementation findings

- Existing simulation source retained for provenance, but removed from the active entry/build path. Current game starts with no employees or demo work.
- UI testing caught submitting form tabs and ambiguous labels; tabs now use explicit button types and fields have unique accessible label associations.
- A* testing caught off-grid arrivals stopping at cell centers. Routes now include the exact walkable destination and validate first/last short segments.
- Disabling a provider now aborts generation, timestamps cancelled tasks and changes the NPC to a blocked state.
- Remote restore failure in a brand-new save pauses remote writes; the empty fallback cannot overwrite a previous Supabase checkpoint. Manual Save awaits a fresh replica after any in-flight write.
- Supabase schema was executed against disposable PostgreSQL 16, with all 20 tables RLS-enabled, service-role writes verified and public access denied. No remote project was altered.
- Active music is existing licensed audio. No synthesized music from the legacy runtime is imported.

Current architecture is intentionally single-writer/local. OpenCode permissions are approved in its attached client; task pause is explicit cancellation with preserved context. Live vendor credentials and hosted Supabase connectivity require user configuration.

## Revision 2 verification findings

- A pre-revision SQLite backup was created in the ignored local data directory before changing saved record shape. Existing user staff/configuration were preserved.
- Scheduler reuses actual adapters and tasks; tests verify real provider-fixture execution without a browser, timezone/DST boundaries, recurrence CRUD, duplicate prevention, downtime coalescing, bounded retry and provider overrides.
- Combat browser tests delay network traffic and still observe immediate shots. Directional hits, multiple-hit kills, visible HP, blood effects, persistent corpse sprites, healing, resurrection and both replacement workflows are verified.
- All seven machine methods have runnable state/persistence checks; browser flow verifies physical arrival, active cycles, stopping, reloading paused state and release.
- Added explicit Vite deny rules for local databases/backups/keys/environment files, plus an HTTP regression test. Test servers disable remote Supabase writes.
- Both Postgres migrations were executed against the isolated local test database. HP/corpse constraints, unique scheduled occurrences, references, machine records and RLS passed; all 23 tables have RLS. No hosted schema migration was applied by development tooling.
- Final browser runs exposed a moving-NPC interaction race: client interpolation used an old position while the employee had already started a coffee trip. Canvas clicks now pursue the live target, obtain an authoritative nearby hold/position, align before dialogue, and release after a brief natural pause. Keyboard interactions synchronize player position before the hold request; walls block interactions. Requests cancelled while approaching release their NPC hold.

Final verification: 36 backend/shared checks passed; 6 Playwright flows passed (1 optional live OpenAI check skipped without environment credentials); TypeScript/production build passed; 35 OGG files decoded successfully in the browser; default development server returned save version 2 with both original staff records retained. Screenshots are under `docs/screenshots/`.
