# Architecture

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
        ↓                        └─ OpenAI-compatible SDK client
Optional Supabase REST replica
```

No page router or dashboard navigation. React only owns title/HUD and pixel windows opened from world objects or Esc. Phaser owns the canvas, responsive player movement, depth sorting, camera, sprite frames and effects. Typing/window focus blocks world controls.

## Code ownership

| File | Responsibility |
| --- | --- |
| `packages/shared/src/types.ts` | Employee/task/provider/message/report/meeting records and SSE event union |
| `packages/shared/src/world.ts` | Canonical compact map, interaction points, collision footprints, workstations, A* |
| `apps/game/src/game/OfficeScene.ts` | Input, movement, interpolation, interactions, animation, camera, world effects |
| `apps/game/src/game/art.ts` | Original cached furniture/character textures |
| `apps/game/src/state.ts` | API/session, SSE reconnect, world mirror and transient UI state |
| `apps/game/src/ui/` | Pixel windows, forms, conversations, devices, options |
| `apps/game/src/audio.ts` | Howler recordings and SFX, settings, optional non-musical fan hum |
| `apps/server/src/api.ts` | Local trust boundary, validation and HTTP/SSE transport |
| `apps/server/src/engine.ts` | Authoritative employees, movement, task queues, agent orchestration and consequences |
| `apps/server/src/providers.ts` | Provider-independent execution contract and concrete adapters |
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

OpenCode tool events map to reading/terminal/working/waiting. Permission requests are surfaced but approval stays in the attached OpenCode client. Text-only OpenAI-compatible employees cannot claim to execute filesystem tools.

Pausing is explicitly cancel-and-preserve-context, not native suspension. Clarification is saved for the next retry/turn. Report revision creates a new task with original output as context. Interrupted server restarts require explicit retry to prevent duplicate paid/external work.

## Reports and meetings

Completion saves report before directing employee toward boss. Nearby approach displays an exclamation/dialogue cue. Reading or approving report releases employee back to work. Reports remain available through printer, dialogue or boss laptop.

Meetings gather 1–6 available agents at unique seats. Agents contribute sequentially with shared topic and prior messages. The first attendee synthesizes minutes using a real provider call. Structured decisions/action items are used only if model returns valid fields; otherwise original text is retained, never replaced with invented minutes. Action conversion uses the real task queue and is idempotent per item.

## Durable state

SQLite WAL contains a transactional single-row world snapshot and separate encrypted provider vault. Single-process ownership is deliberate. Hiring, tasks, messages, reports, configuration and employment events write immediately; positions checkpoint every five seconds. Save errors are not silently replaced by simulated success.

Optional Supabase replication writes queryable entity tables, then complete `office_state` snapshot last. Empty local saves can restore it. Existing local saves win; there is no bidirectional multi-writer merge. Raw secrets never replicate. RLS has no public access policies; backend service role owns writes.

## Security boundaries

- Loopback listener; Host and Origin allowlist; cross-site requests rejected.
- Per-server random CSRF/session token; HttpOnly SameSite cookie for SSE.
- Zod validates mutable payloads. No provider keys in world snapshots, browser storage or Vite variables.
- AES-256-GCM vault with restricted directory/key permissions. This protects copied database files; it does not protect against an attacker with access to both local vault and key.
- Provider base URLs are intentionally user-selectable local/HTTP(S) endpoints; reject URL credentials/query/fragments. API does not read arbitrary server files.
- Code/runtime filesystem access belongs to explicitly connected OpenCode and selected tools.
- Every execution validates active employment. Firing/death abort requests, cancel queued/running tasks and preserve history.

## Art/audio and map interoperability

Textures are cached per appearance rather than recreated each frame. Furniture is original code-drawn art with bottom-edge depth sorting. Pixel UI uses one consistent kit/palette and bundled Silkscreen font. Long AI output uses practical monospace inside pixel dialogue/monitor frames.

Music is licensed existing audio, not generated. Howler controls actual tracks and effects; all controls persist server-side.

`npm run map:export` exports valid Tiled JSON with shared walkability tiles, rooms, interaction objects and spawn. Canonical runtime source remains `world.ts`; Tiled import/full map editing is a future extension, not an implemented control.

## Current deliberate limits

Single local company, single floor, max 20 active employees. No provider-native task suspension, in-game OpenCode permission approval, binary attachments, multiplayer, salary/accounting simulation, live budget estimation or automatic provider login. Those controls are not exposed as working features. All current buttons operate on real state or explicitly labeled offline simulation.
