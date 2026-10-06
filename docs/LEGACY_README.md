# Archived documentation — previous simulation runtime

This file documents the pre-existing application, not the game now launched by `npm run dev`. See the root README for current instructions.

**A little office. Big ideas.**

A local-first pixel-art office simulator, team dashboard, and small world to wander. You’re the director. Six locally simulated teammates research, build, design, test, organize, and report back. Original pixel art, a moss-green interface, warm wooden rooms, and a soft chiptune soundtrack make the office feel like home.

## Run locally

Use **Node.js 20.19+ or 22+** and npm.

```bash
npm install
npm run dev
```

Open **http://localhost:5173**. No accounts, environment variables, API keys, backend, or database setup.

```bash
npm run build     # Type-check and build to dist/
npm run preview   # Serve the production build locally
npm test          # Deterministic collision, navigation, and simulation checks
```

Dependencies and fonts are installed through npm. Once installed, the app runs without external APIs, CDNs, or asset downloads. This is a local web app, not an installable/offline-cached PWA.

## Take a little tour

1. **Find the crown.** The cream-jacketed director in the central hall is you.
2. **Wander with WASD.** Approach a teammate, a desk, or an interactive object. Press **E** when the contextual prompt appears. Agents and objects also respond to clicks.
3. **Give Bima a task**, or let **Arga delegate** to the teammate whose specialty matches the task type. Agents walk to the appropriate work area before making progress.
4. **Turn simulation speed up to 4×** for a quick demo. Work moves through the queue, into progress, then to review. Open **The paper trail** to read, approve, or download the output.
5. **Help Damar.** The seeded QA task is blocked on the optional welcome-tour decision. Select Damar and choose **Resume task** to approve the proposed direction.
6. **Ring the meeting bell.** The team walks to its meeting seats, holds work, and returns afterward. Huddles last 90 simulated seconds; you can finish early and keep the notes.
7. **Get a coffee.** The machine gives the director a 60-second, 20% walking-speed boost. Try the jukebox, whiteboard, printer, and company sign too.
8. **Press Play in Abisena Radio.** Music begins after your interaction, in accordance with browser autoplay rules.

## Controls

| Key | Action |
| --- | --- |
| **W A S D** or **arrow keys** | Smooth eight-direction movement |
| **Shift** | Walk 50% faster |
| **E** or **Space** | Interact with the nearest teammate or object |
| **Escape** | Close the current dialog |
| **M** | Toggle audio mute |
| **Tab** | Switch office ↔ task board when the page background or game canvas is focused |
| **?** | Open guidance |
| **/** | Focus task search on the task board |

Tab retains normal focus navigation inside UI controls and dialogs. Typing in fields never moves the character. Dialogs trap focus, restore it when closed, and make the background inert. Opening a dialog also disables Phaser pointer interactions behind it.

### Mouse controls

- Click an agent to select their inspector; use **Say hello** or **Assign task**.
- Click desks or interactive objects to open their actions.
- Drag task cards between Kanban columns, or use the status selector in a task dialog/list view.
- Use canvas controls to zoom, follow the director, reset the camera, save a PNG, or enter fullscreen.

The interface also fits small screens. Direct character movement is keyboard-based; touch users can tap agents, objects, and dashboard controls.

## What’s inside

### A living office

- Branded **PT ABISENA RAIS JAYA** sign, receptionist desk, manager’s area, developer studio, research library, meeting room, creative corner, shared workspace, pantry, lounge, whiteboard, printer, and server corner.
- Original four-direction pixel sprites, alternating footsteps, idle blinks, working indicators, speech bubbles, hover states, and selection rings.
- Shared furniture/wall collision geometry and breadth-first pathfinding. The director cannot tunnel through furniture, even during a slow frame.
- Live wall clock, animated coffee steam, server lights, rotating office display, report-printing animation, and a company-sign Easter egg.
- Camera follow when zoomed, day/night tint, path visualization, reduced motion, focus mode, and configurable animation speed.

### Team and work

- **Arga** — team lead / planning and delegation.
- **Nisa** — research.
- **Bima** — development.
- **Tita** — design.
- **Damar** — quality assurance.
- **Sari** — operations.
- Task priorities, descriptions, categories, agent queues, search, per-agent filtering, Kanban and list views.
- Queue → working → review → approved; blocked tasks wait for your input.
- Task category controls the destination, including cross-specialty assignments.
- Agent inspection, pause/resume, task clearing, context menus, local chat history, coffee breaks, meetings, and report handoff.
- Downloadable `.txt` reports, meeting notes, live event feed, and small-win notifications.

### Insights

- Task-status donut, stacked workloads, sampled activity area chart, event-category breakdown, room occupancy, completed work, reports, meetings, and office mood.
- Charts use real local simulation state. Activity is sampled every 10 simulated seconds and retains 60 samples; it starts sparse rather than inventing historical data.
- The event feed keeps the most recent 100 events. Chats retain 200 messages; meeting history retains 20 meetings.

### A soundtrack for small wins

- Three original, procedurally generated looping tracks.
- Previous/next, play/pause, shuffle, music label, and animated equalizer.
- Click, hover, dialog, assignment, chat, completion, alert, coffee, printer, and meeting sound effects.
- Master, music, and SFX volume; mute; optional soft ambience; sound-test controls.

## Local intelligence and persistence

This is intentionally a **simulation**, not a connection to a real AI model. Chat uses role-specific local responses. Generated reports are illustrative templates and clearly labeled as simulated; no actual research, code execution, or external work is claimed.

Zustand persists tasks, agents, positions, events, chats, meetings, activity history, and preferences in `localStorage` under **`abisena-office-v1`**. Track selection and shuffle persist; audio playback starts paused after reload. Short-lived toasts and caffeine effects are not persisted.

Simulation runs on a one-second clock. Phaser handles smooth visual movement; when another view is open, the store advances navigation on that clock instead. Task work starts only after an agent reaches its destination. Meetings and individual pauses suspend the affected work. Global pause suspends the simulation while still allowing the director to walk. Hidden browser tabs pause automatic progress; there is no offline catch-up.

**Make it yours → The little details** offers a demo reset or a full local-data reset, each with confirmation. Demo reset preserves settings. Full reset restores the original office and preferences.

## Project structure

```text
.
├── README.md
├── CREDITS.md
├── index.html
├── package.json
├── package-lock.json
├── tsconfig.json
├── vite.config.ts
├── playwright.config.ts
├── public/
│   └── favicon.svg
├── src/
│   ├── main.tsx
│   ├── app/
│   │   └── App.tsx                 # App shell, clock, shortcuts, audio sync
│   ├── components/
│   │   ├── Avatar.tsx              # Shared original pixel portraits
│   │   ├── MusicPlayer.tsx
│   │   ├── Sidebar.tsx
│   │   └── ui.tsx                  # Focus-managed modal, chips, toasts
│   ├── data/
│   │   └── office.ts               # Map, collision footprints, demo seed
│   ├── features/
│   │   ├── AgentInspector.tsx
│   │   ├── Analytics.tsx
│   │   ├── Dialogs.tsx             # Task creation, chat, interactions, help
│   │   ├── OfficeView.tsx          # Office dashboard and team gallery
│   │   ├── SettingsDialog.tsx
│   │   └── TaskBoard.tsx           # Kanban, list, task details, reports
│   ├── game/
│   │   ├── art.ts                 # Procedurally drawn pixel art/textures
│   │   ├── OfficeGame.tsx          # React ↔ Phaser lifecycle and controls
│   │   ├── OfficeScene.ts          # Director, agents, effects, interactions
│   │   └── pathfinding.ts         # Grid BFS and collision-safe movement
│   ├── lib/
│   │   ├── audio.ts               # Original PCM synthesis + Howler playback
│   │   └── simulation.ts          # Pure task/agent/meeting state transitions
│   ├── store/
│   │   └── useOfficeStore.ts      # Typed actions and local persistence
│   ├── styles/
│   │   └── index.css              # Tailwind entry + bespoke responsive UI
│   └── types/
│       └── index.ts
└── tests/
    ├── office.test.ts             # Node/tsx logic tests
    └── office.spec.ts             # Playwright browser workflows
```

### Architecture choices

- **React + TypeScript + Vite**, **Tailwind CSS**, **Zustand**, **Phaser 3**, **Howler.js**, **Recharts**, and **Lucide**.
- React owns the interface; Phaser owns rendering and keyboard movement. Both use the same typed state and map geometry.
- Phaser uses its Canvas renderer: this small, original pixel world does not require WebGL. It stays crisp and performs well without GPU setup.
- Agent positions are synchronized in batches every 400 ms, not written to React state every frame.
- Phaser and charts are split into separate bundles; office and analytics are loaded when needed. Vite can report a large-chunk advisory for the Phaser engine; the production build still succeeds.
- No router is necessary for the five local workspace views. No backend is necessary for the simulation.

## Browser verification

```bash
# Install a test browser once:
npx playwright install chromium

# Runs the browser flows; starts Vite automatically if needed:
npm run test:e2e
```

If Chrome is already installed, skip the browser download:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome npm run test:e2e
```

The checks cover movement, furniture collision, in-world interaction, keyboard shortcuts, delegation, task-state changes, persistence, chat, music controls, preferences, meetings, visible charts, report downloads, and a 390px viewport. Failure screenshots/traces are saved to ignored `test-results/`.

## Assets and remaining work

**No missing assets, API credentials, or required TODOs.** Art and music are generated locally from source. Fonts are bundled from npm. See [CREDITS.md](CREDITS.md) for the sources, licenses, audio track details, and inspiration notes.

This implementation deliberately keeps a fixed handcrafted map and local simulated agents. It does not include multiplayer, a map editor, or external LLM integrations.
