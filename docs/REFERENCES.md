# Reference implementation research

Inspected on 2026-10-06 using repository metadata, recursive trees, READMEs and selected source. No source code or art/audio assets were copied. Repository licenses do not grant rights to separately licensed assets by implication.

## Pixel-Process-UG / agent-office

https://github.com/Pixel-Process-UG/agent-office

GitHub code license: MIT. Studied `agent-runtime.mjs` and office/provider state locations. Key observations: distinguish runtime lifecycle from visual state; queue requests; persist tasks; expose messages/events to office actors. Adopted conceptually: server execution independent of render frames, event-driven speech and durable tasks/chat. Rejected fixed seeded staff and implicit simulated success.

## forgeekscn / pixel-agent-office

https://github.com/forgeekscn/pixel-agent-office

GitHub code license: MIT. Studied backend core state machine/event processor and WebSocket connection management, plus frontend/opencode-plugin layout. Observed boss/employee states, arrival queues, session-to-agent mapping, event persistence and permission-wait events. Adopted conceptually: explicit state transitions drive world animations; separate realtime transport from execution and frontend; model wait/error states honestly. Chose SSE over WebSocket for this mostly server-to-client local stream. Rejected multi-floor complexity and monitoring-dashboard presentation.

## ishkkman / agent-office

https://github.com/ishkkman/agent-office

GitHub license metadata: NOASSERTION/custom; assets include their own sprite license file. Inspected multi-adapter NPC-agent design (`docs/superpowers/specs/2026-04-09-multi-adapter-npc-agent-design.md`), adapter/session concepts and meeting references. Studied world conversations, runtime registry, sessions, meeting context and report handoff. Adopted conceptually: employees are persistent people in a world, with real agent sessions behind them; physically deliver results. Independently implemented artwork, character layers, A*, meetings and interfaces. Imported no code or assets under an assumed license.

## yourtechtribe-labs / swarm-office

https://github.com/yourtechtribe-labs/swarm-office

GitHub code license: MIT. Inspected `client/src/game/EventBus.ts`, server agent layout, phase specifications and Phaser/Vite/Tiled roadmap. Adopted conceptually: typed events connecting game and service; server-owned NPC world state; shared zones/collision. Independently authored current map and Tiled export. Rejected multiplayer/OIDC/infrastructure requirements for local single-player use.

## chaos-cl / multiagent-dashboard

https://github.com/chaos-cl/multiagent-dashboard

GitHub API did not report a code license. Inspected `server.py` routes, agent asking/communication, thread persistence and SSE stream architecture. Adopted backend ideas only: provider abstraction, real errors/health, saved conversations and streamed events. Explicitly rejected its dashboard layout, visual components and navigation. Imported no source or assets.

## Additional implementation references

- Phaser docs: https://docs.phaser.io/
- OpenCode SDK/server docs: https://opencode.ai/docs/sdk/ and https://opencode.ai/docs/server/
- OpenAI SDK: https://github.com/openai/openai-node
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Audio provenance: `ASSETS.md` and `CREDITS.md`, independently verified per asset source.

Initial decisions were recorded before major implementation in root `DEVELOPMENT_NOTES.md`.
