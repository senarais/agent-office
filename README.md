# PT ABISENA RAIS JAYA

**A little office. Big ideas. Real AI colleagues.**

A full-screen top-down pixel office game. Walk to HR, hire a colleague, connect their agent at the IT terminal, assign real work through dialogue, and let them bring you the result. Every management screen lives inside an office device or game menu.

![The office](docs/screenshots/office.png)

## Quick start

**Node.js 22.13+ required; Node 24 recommended.** Uses Node's built-in SQLite. No Docker required.

```bash
npm install
cp .env.example .env
npm run dev
```

Open **http://127.0.0.1:5173**. One command starts Vite and the local agent server on `127.0.0.1:3001`.

The game works immediately with an empty company and durable local save. No login required. Music and sound files are bundled. Click **ENTER OFFICE** to unlock browser audio.

### Your first day

1. **WASD / arrows** to walk; **Shift** to run. Click floor for pathfinding movement.
2. Head to **People & Culture**, lower-left room. Approach HR computer; **E**.
3. **Hire employee**: name, role, department, appearance and instructions. Hiring offline is supported.
4. Visit **IT / Agent Network**, upper-right room. **E → Add provider → Save → Test connection**.
5. Return to HR, edit employee, select provider and model under **Agent connection**.
6. Walk up to colleague. **E → Talk** for real chat, or **Assign task** for work.
7. They walk to a workstation, invoke the actual provider, then approach you with a saved report.
8. **Read → Discuss / Revise / Approve**. Printer and boss laptop retain every report.

The tutorial can be skipped. The company has no pre-hired roster.

## AI credentials

Use the in-game **IT terminal**, or configure backend `.env`:

```dotenv
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4.1-mini
```

**ChatGPT Plus/Pro is not an API credential.** API access and billing can be separate.

For actual coding/tool work, start OpenCode in your project:

```bash
opencode serve --hostname 127.0.0.1 --port 4096
```

Add **OpenCode server** at IT, base URL `http://127.0.0.1:4096`, test, choose a discovered `provider/model`, and grant employee tools in HR. Optional task project path selects an OpenCode workspace. OpenAI and compatible adapters are text-generation connections; they do not pretend to edit files or execute tools.

Local/third-party endpoints: choose **OpenAI-compatible**, supply base URL (usually ending `/v1`), optional API key/custom headers and model.

See [provider setup](docs/AGENT_PROVIDERS.md) for full instructions, cancellation and troubleshooting.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Walk, default 6 tiles/sec |
| Shift | Run, 8.75 tiles/sec |
| E | Interact with nearest person/device |
| Space | Equipped cartoon action; advance unfocused dialogue text |
| Esc | Pause/menu or close current window |
| M | Mute/unmute |
| Mouse | Click floor to walk; click object/person to approach and interact |
| Tab / ↑ ↓ / Enter | Focus, navigate dialogue choices, select |

Typing disables movement. Core keys are remappable in **Esc → Controls**. Touch movement buttons appear on small screens.

## In-world systems

- **Office:** research, developer desks, meeting room, IT, HR, creative/QA, open office/operations, pantry, lounge, boss office, reception, printer and whiteboard. Shared collision grid and A*; short corridors.
- **Employees:** user-created profiles, modular appearance, five departments, tool permissions, morale/energy/relationship/stress, idle coffee trips, follow-me, firing and vacant positions. Capacity: 20 employees, four workstations per department.
- **Tasks:** durable prioritized queues; real workstation arrival before execution; streamed output/tool activity; error details, retry, cancel, pause-as-cancel and saved clarifications; report delivery/revisions/approval.
- **Chat:** persistent conversations, streaming, cancel, retry, new conversations and bounded model context.
- **Meetings:** 1–6 available employees physically gather; sequential real-agent contributions; stored transcript, model-produced summary/decisions/actions; convert actions to real tasks.
- **Boss computer:** pixel desktop with company, tasks, employees, reports, finance, analytics, meetings, network and settings. Analytics uses saved task/chat usage only; unknown counts/costs are marked unavailable.
- **Whiteboard:** live Kanban, projects, employee/department status, meetings and editable goals.
- **Customization:** character layers, employee outfits, company motto, wall accents and lush/dormant plant palette.
- **Audio:** licensed recorded music, functional jukebox, separate master/music/SFX/ambient/dialogue volumes, mute, shuffle and repeat.
- **Options:** day/local-time/night, pixel scale, text scale, camera follow, rain, glow, CRT/scanlines, reduced motion, shake, damage flash, contrast and movement/text/animation speeds.
- **Inventory/cartoon consequences:** coffee boost, hand/whip (always nonlethal), fictional rifle (persistent death), morale changes and HR incidents. Violence can be full/slapstick/disabled. Deceased/fired employees cannot execute agents; active work is interrupted.

## Saves and secrets

State is stored server-side in **`.local-data/office.sqlite`**, not browser localStorage. Core changes save immediately; NPC/player position checkpoints save every five seconds. **Esc → Save** forces a checkpoint.

Provider keys, OpenCode password and custom headers use AES-256-GCM in a separate SQLite vault table. The generated key is `.local-data/vault.key` (or backend `VAULT_KEY`); directory/file permissions are restricted. Back up the **whole data directory with server stopped**, including key. Losing the key means re-entering provider credentials.

The backend binds to loopback, validates Host/Origin, rejects cross-site requests, and requires a per-server session token for mutations. Browser receives provider metadata only. This is a trusted single-user local application, not a multi-user hosted service.

### Optional Supabase

Configure `SUPABASE_URL` and backend-only `SUPABASE_SERVICE_ROLE_KEY`, then apply the included migration. SQLite remains the immediate offline save; records and complete restore snapshots replicate to Supabase. Unreachable database errors appear in **Company** and local saves remain usable.

Follow **[docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)**. No public/anon key is needed by this frontend. No remote database is modified by `npm install` or `npm run dev` without your configuration.

## Verification

```bash
npm test                  # Isolated backend, HTTP adapter and persistence tests
npm run build             # TypeScript + production frontend build
npx playwright install chromium
npm run test:e2e           # Isolated server + full browser game flows
```

If Chrome is installed, tests discover `/usr/bin/google-chrome`; override with `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/browser`. Tests use ports **5175/3101**, isolated temporary saves, and an explicitly labeled **DEMO SIMULATION** provider. The live OpenAI test runs only when `OPENAI_API_KEY` exists in the test process. It performs a small billed API request.

Production frontend preview: `npm run dev:server` in one terminal, `npm run preview` in another. Normal local play uses `npm run dev`.

More: [testing notes](docs/TESTING.md), [architecture](docs/ARCHITECTURE.md), [reference research](docs/REFERENCES.md), [audio](docs/AUDIO.md), [asset manifest](ASSETS.md), [credits](CREDITS.md).

## Source layout

```text
apps/game/src/        Phaser world, original art, audio, state bridge, pixel UI
apps/server/src/      Fastify API, agent adapters, engine, SQLite/vault, Supabase sync
packages/shared/src/ Typed records/events, office geometry, collision and A*
public/audio/        Licensed music and effects, bundled for local playback
public/office.tmj    Tiled-compatible export of the canonical office map
supabase/migrations/ Complete Postgres schema, indexes, constraints and RLS
tests/               Backend, browser, and SQL verification
docs/                Setup, architecture, research, screenshots
```

Canonical map is `packages/shared/src/world.ts`; `npm run map:export` refreshes the Tiled file. Tiled round-trip editing and multiplayer are not implemented. Previous prototype `src/` and its documentation are retained for provenance; current entry point exclusively uses `apps/`.

## Honest integration boundaries

- Provider-less AI actions say **NO AGENT PROVIDER CONNECTED**. Optional `ENABLE_DEMO_PROVIDER=true` adds a visibly labeled simulation for testing; off by default.
- Pausing cancels generation, preserving work/session. Retry starts another provider turn; it is not a provider-native suspended computation. Clarification is included on retry/revision.
- OpenCode permission requests are surfaced; approve them in the OpenCode client attached to that server, or cancel in-game.
- Real AI output depends on supplied credentials, provider/model capabilities and OpenCode permissions. Automated local HTTP/SDK protocol tests do not claim live credential verification.
- Supabase is a single-writer replica/restore path, not conflict-resolving multi-machine synchronization.
