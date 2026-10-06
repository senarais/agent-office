# Development notes

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
