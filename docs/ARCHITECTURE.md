# Architecture

## Revision 2 systems

`apps/server/src/scheduler.ts` contains the single-writer scheduler. `cron-parser` handles calendar/timezone arithmetic; intervals use a stable creation-time anchor. The 100 ms engine tick polls schedules once per second. A schedule occurrence, its task and advanced next-run pointer are saved in the same SQLite snapshot before dispatch. Occurrence keys prevent duplicate restart delivery; Supabase enforces the same `(recurring_task_id, scheduled_at)` uniqueness. No overlapping run per definition; after downtime, one overdue run is coalesced rather than flooding providers. Retries are bounded and never undo deliberate task pauses/cancellations or silently repeat interrupted server-restart requests.

`packages/shared/src/automation.ts` defines schedules, runs and frozen per-task delivery metadata. One-time/daily/weekly/interval/cron definitions support explicit provider/model, tool subset, timezone, output destination, notify/physical-delivery flags and retry policy. Logs retain errors and attempts. Template replacements create new schedule IDs and disable old definitions. Archived reports remain durable; follow-up tasks are normal manual assignments.

`packages/shared/src/combat.ts` defines tunable default weapons, direction vectors, wall-occluded hitscan/melee, and seven machine recipes. SPACE predicts only audiovisual feedback; the server owns cooldowns, replay protection, HP damage and death. No target lock is required. `CombatEffects.ts` uses 240 reusable square particles, 48 capped trails, short hit-stop and layered effects. Blood is small/non-graphic and suppressed by Reduced/Off or the independent blood toggle.

Employee records now persist max/current HP, productivity flavor, damage time, corpse presence, death time and predecessor/replacement links. `deceased` retains an unresolved roster position and visible lying actor. Firing is a separate action. Resurrection restores the same employee; similar/new replacements create fresh identities. Healing consumes stock and cannot resurrect. Deceased/terminated/confined employees cannot execute agents.

The torture room is carved from the bottom of the old boss-office footprint; map size remains 1280×832. Printer moves beside Operations. A persisted session owns the single rig: walking → active ↔ paused → released/deceased. Arrival starts the chosen machine. Pulses change real game stats and emit effect events; stop/release/violence-Off halt damage. Server restart resets the next pulse, so there is no accumulated offline punishment. Unresolved bodies keep the rig occupied until resolved.

`migrate-state.ts` upgrades version-1 snapshots additively without discarding staff, conversations, provider IDs or historical deaths. Supabase revision migration adds three tables and generated HP/corpse fields. Replica writes are ordered provider → employee → schedule → task → run/session → dependent records. Secrets remain in the encrypted local vault; Vite's deny list also prevents serving the vault, key, saves and backups over HTTP.

## One game, one local server

```text
Keyboard / pointer
        ↓
Phaser OfficeScene ← shared geometry / A* / collision
        ↕
Pixel React overlays ← Zustand snapshot/event bridge
        ↕ HTTP commands + Server-Sent Events
Loopback Fastify API → Engine → provider adapter
        ↓              ↓         ├─ official OpenAI SDK
SQLite / AES-GCM vault  NPC tick  ├─ official OpenCode SDK
        ↓                        ├─ local Command Code CLI (headless child process)
                                 └─ OpenAI-compatible SDK client
Optional Supabase REST replica
```

No page router or dashboard navigation. React only owns title/HUD and pixel windows opened from world objects or Esc. Phaser owns the canvas, responsive player movement, depth sorting, camera, sprite frames and effects. Typing/window focus blocks world controls.

## Code ownership

| File | Responsibility |
| --- | --- |
| `packages/shared/src/types.ts` | Employee/task/provider/message/report/meeting records, integrations and SSE event union |
| `packages/shared/src/social.ts` | Social campaign/options/posts/publish records and tolerant creative-JSON parser |
| `packages/shared/src/world.ts` | Canonical compact map, interaction points, collision footprints, workstations, A* |
| `apps/game/src/game/OfficeScene.ts` | Input, movement, interpolation, interactions, animation, camera, world effects |
| `apps/game/src/game/art.ts` | Original cached furniture/character textures |
| `apps/game/src/state.ts` | API/session, SSE reconnect, world mirror and transient UI state |
| `apps/game/src/ui/` | Pixel windows, forms, conversations, devices, options |
| `apps/game/src/audio.ts` | Howler recordings and SFX, settings, optional non-musical fan hum |
| `apps/server/src/api.ts` | Local trust boundary, validation and HTTP/SSE transport |
| `apps/server/src/engine.ts` | Authoritative employees, movement, task queues, agent orchestration and consequences |
| `apps/server/src/providers.ts` | Provider-independent execution contract and concrete adapters |
| `apps/server/src/telegram.ts` | Long-polled Telegram bot, report/review notifications and approval callbacks |
| `apps/server/src/social.ts` | Signed publishing/analytics/media automation boundary and webhook secret verification |
| `apps/server/src/integrations.ts` | Secret-free integration status shared with the browser |
| `apps/server/src/database.ts` | SQLite checkpoints, encrypted vault, Supabase replication/restore |

## Movement and authority

32 px visual tiles, 16 px navigation grid; 1280×832 logical world. Player is client-controlled for immediate input, collision-substepped in increments no larger than four pixels. Position updates every 350 ms; server accepts only walkable coordinates. This is not multiplayer anti-cheat.

NPCs are server-owned and tick every 100 ms. A* shares furniture/wall geometry with the player. Routes cache until destination changes. Agents yield to earlier moving peers at short range, have distinct work spots, and walk at 152/180/220 px/sec. Player defaults to 192 px/sec; Shift runs at 280 px/sec.

Renderer interpolates NPC snapshots at display refresh rate. `world.tick` only carries movement/state fields; major state changes stream a full snapshot. Streaming output snapshots are throttled. The office caps staffing at 20, with four slots per department. Event history is capped at 500 locally. Movement does not write SQLite every frame.

## Task state machine

```text
QUEUED → WALKING_TO_WORKSTATION → STARTING → WORKING
                                              ↕
                                  WAITING_FOR_TOOL / WAITING_FOR_USER
                                              ↓
                                       REVIEWING → COMPLETED → report delivery

Any active state → BLOCKED / FAILED / CANCELLED
BLOCKED / FAILED / CANCELLED → explicit retry → QUEUED
```

There is no artificial percent-progress counter. Arrival at an assigned workstation starts provider execution. Offline configuration failures become BLOCKED; provider failures become FAILED with actual details. An employee task queue is serialized. Quick chat gets a separate request/session.

Provider interface: `listModels()` (also connection health check) and `execute()` with an abort signal, model, system/context, messages, selected tools, session callback, text callback and activity callback. Execution returns authoritative output and optional usage. Provider-specific conversation creation, cancellation and event subscription occur inside the adapter rather than unnecessary no-op interface methods.

One PT holds several business offices. The persisted root is `{ company, settings, providers, director, activeOfficeId, offices[] }` (`GameSave`); `GameState` resolves `state.employees`/`state.tasks`/`state.player.x` etc. to the **active** office and keeps providers, options and the director at the PT root, so the engine code reads the same fields as before. `tick`, `dispatch` and `Scheduler` iterate **every** office (background businesses keep walking, executing and scheduling), async task/meeting execution captures its owning office so a switch mid-request cannot corrupt state, and the browser only ever receives `view()` for the active office plus an office directory. A task's project context names its business.

OpenCode tool events map to reading/terminal/working/waiting. Permission requests are surfaced but approval stays in the attached OpenCode client. Text-only OpenAI-compatible employees cannot claim to execute filesystem tools. The Command Code adapter spawns the local `cmd` CLI headlessly, maps its NDJSON text/tool events, persists the returned session id for `--resume`, and terminates the child process on cancel; granting `bash`/`write`/`edit` runs that assignment with the CLI’s non-interactive bypass.

Pausing is explicitly cancel-and-preserve-context, not native suspension. Clarification is saved for the next retry/turn. Report revision creates a new task with original output as context. Interrupted server restarts require explicit retry to prevent duplicate paid/external work.

## Reports and meetings

Completion saves report before directing employee toward boss. Nearby approach displays an exclamation/dialogue cue. Reading or approving report releases employee back to work. Reports remain available through printer, dialogue or boss laptop.

Meetings gather 1–6 available agents at unique seats. Agents contribute sequentially with shared topic and prior messages. The first attendee synthesizes minutes using a real provider call. Structured decisions/action items are used only if model returns valid fields; otherwise original text is retained, never replaced with invented minutes. Action conversion uses the real task queue and is idempotent per item.

## Telegram and social publishing

Telegram is an optional bridge, not a second source of truth. The engine owns all state changes; `telegram.ts` only transports messages and maps authorized chats/callbacks back to `reportAction`, `approveSocialCampaign`, `reviseSocialCampaign` and the scheduler. It long-polls the Bot API, so no inbound webhook is exposed. Only `TELEGRAM_CHAT_ID` may act. Report delivery is recorded on the report; scheduled tasks freeze `telegramNotify` at queue time.

The Social Media division adds a campaign record per content brief. `createSocialCampaign` creates a normal Creative task. On completion, the engine parses the task result into options, optionally generates media through `MEDIA_WEBHOOK_URL` or OpenAI Images, marks the campaign `review`, and notifies Telegram. Approval selects one option and calls `SOCIAL_WEBHOOK_URL` with a stable idempotency key; failures are persisted, never converted into fake success. Revision creates another real Creative task with the previous options and the director's feedback, then appends new options. Analytics are pulled from `SOCIAL_ANALYTICS_URL` or the shared webhook with `action: analytics`, or pushed to a secret-authenticated callback.

Platform credentials remain outside this application. The office only knows platform names, captions, media URLs and public metrics. Signed outgoing calls use `X-Social-Signature` (HMAC-SHA256); inbound automation calls use `x-social-secret` and bypass the browser session token but no other localhost/origin checks.

## Durable state

SQLite WAL contains a transactional single-row PT snapshot (every business office) and separate encrypted provider vault. Single-process ownership is deliberate. Hiring, tasks, messages, reports, configuration and employment events write immediately; positions checkpoint every five seconds. Save errors are not silently replaced by simulated success.

Optional Supabase replication writes queryable entity tables, then complete `office_state` snapshot last. Empty local saves can restore it. Existing local saves win; there is no bidirectional multi-writer merge. Raw secrets never replicate. RLS has no public access policies; backend service role owns writes.

## Security boundaries

- Loopback listener; Host and Origin allowlist; cross-site requests rejected.
- Per-server random CSRF/session token; HttpOnly SameSite cookie for SSE.
- Zod validates mutable payloads. No provider keys in world snapshots, browser storage or Vite variables.
- AES-256-GCM vault with restricted directory/key permissions. This protects copied database files; it does not protect against an attacker with access to both local vault and key.
- Provider base URLs are intentionally user-selectable local/HTTP(S) endpoints; reject URL credentials/query/fragments. API does not read arbitrary server files.
- Code/runtime filesystem access belongs to explicitly connected OpenCode / Command Code CLI and selected tools.
- Every execution validates active employment and room availability. Firing/death/confinement abort requests, cancel queued/running tasks and preserve history. Running requests remember their actual provider ID, including schedule overrides, so disabling that connection cancels the correct request.

## Art/audio and map interoperability

Textures are cached per appearance rather than recreated each frame. Furniture is original code-drawn art with bottom-edge depth sorting. Pixel UI uses one consistent kit/palette and bundled Silkscreen font. Long AI output uses practical monospace inside pixel dialogue/monitor frames.

Music is licensed existing audio, not generated. Howler controls actual tracks and effects; all controls persist server-side.

`npm run map:export` exports valid Tiled JSON with shared walkability tiles, rooms, interaction objects and spawn. Canonical runtime source remains `world.ts`; Tiled import/full map editing is a future extension, not an implemented control.

## Current deliberate limits

Single local company, single floor, max 20 active employees. No provider-native task suspension, in-game OpenCode permission approval, binary attachments, multiplayer, salary/accounting simulation, live budget estimation or automatic provider login. Those controls are not exposed as working features. All current buttons operate on real state or explicitly labeled offline simulation.
