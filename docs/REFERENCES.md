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

## Revision 2 research: characters, combat and effects

Re-inspected the five office repositories before this revision. Their queue/state/event boundaries informed scheduled work sharing the real task pipeline; none were used as a dashboard-design template.

### 6. kjenney / lpc-spritesheet-generator

https://github.com/kjenney/lpc-spritesheet-generator

Studied README, animation controls/info and renderer/customization layout: consistent directional cells, ordered modular appearance layers, action-specific frame timing and preview/export separation. Adopted conceptually for original character/equipment layering and attack/idle/work/hurt/dead poses. GitHub reports NOASSERTION despite an MIT badge in README; no source or sprites were copied, and no asset rights were inferred from that badge.

### 7. nsetzer / lpc-spritesheets

https://github.com/nsetzer/lpc-spritesheets

Studied README and `lpcdb/sprites.py`: oversized weapon layers, slash/thrust framing, expanded backswing timing and separate sprite-credit requirements. Adopted the idea of equipment/action layers around the existing character proportions. Code metadata is GPL-3.0; artwork has per-file GPL/CC-BY-SA and attribution considerations. No code or assets imported; current sprites/knife/rifle/whip are independently drawn in the original office palette.

### 8. minerva-studio / pixel-effect-generator

https://github.com/minerva-studio/pixel-effect-generator

Studied README and projectile/shared-effect organization: deterministic parameter-driven effects, short impact phases, square fragments, trails and separate renderer/model concerns. MIT metadata. Adopted bounded original particle bursts, compact sparks, blade/whip trails and muzzle flashes. Did not import generators, atlases or exported art.

### 9. Tiddybub / 2d-assets

https://github.com/Tiddybub/2d-assets

Studied README and per-pack `SOURCE.md`/`License.txt` organization. Used as discovery/provenance reference for impact/audio packs. Repository metadata says NOASSERTION; README's broad CC0 statement was not treated as sufficient evidence for every file. Downloads came directly from Kenney after checking original pages and archive license files. No sprite collage or mismatched pack art copied.

### 10. alfredang / street-fighter-game

https://github.com/alfredang/street-fighter-game

Studied README and `javascript/Sprite.js`: frame-aware attacks/hitboxes, anticipation/impact/recovery, facing and integer sprite sampling. No declared GitHub code license; README also describes AI-generated image assets. Borrowed only general combat-timing principles. No source, images, characters, logos or Street Fighter assets copied. Our attack visuals are original top-down pixel geometry.

### 11. sajal37 / Top-Down-Shooter

https://github.com/sajal37/Top-Down-Shooter

Studied README, `src/entities/Bullet.ts` and `src/ui/ScreenEffects.ts`: immediate weapon feedback, trails, hit effects, recoil/shake and bounded projectile/effect lifecycles. No declared GitHub code license. Adopted the concepts using independent directional hitscan, a fixed 240-particle pool, capped traces and settings-aware hit-stop. No source or generated audio copied.

### 12–15. Audio source review

- [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds): original CC0 page/archive verified; retained interface bank.
- [Kenney UI Audio](https://kenney.nl/assets/ui-audio): inspected download/license page, CC0. No recordings imported from this pack; existing Interface bank already covers UI.
- [OpenGameArt](https://opengameart.org/): per-asset licenses checked for the two existing music recordings. Assets on OGA do not share one blanket license.
- [Pixabay license summary](https://pixabay.com/service/license-summary/): attempted access returned HTTP 403. No Pixabay audio/assets used or license claims made.
- Additional original sources: [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) and [Kenney Digital Audio](https://kenney.nl/assets/digital-audio), both CC0 verified on source pages and bundled license text. Twenty-one unchanged recordings added. Exact filenames/credits are in `ASSETS.md` and `CREDITS.md`.

Independent implementation keeps one office-art palette and sprite family. The references inform interaction, timing and system boundaries, not imported copyrighted characters, music or visual identity.
