# Archived credits — previous simulation runtime

These credits apply to the retained legacy `src/` tree. Current game assets and recorded music are documented in root CREDITS.md and ASSETS.md.

## Original pixel art

All office artwork was made specifically for **PT Abisena Rais Jaya** in this project:

- Office floor, room walls, windows, plants, shelves, furniture, computers, coffee machine, jukebox, printer, company signage, rugs, posters, and server racks.
- Arga, Nisa, Bima, Tita, Damar, Sari, and the crown-wearing director.
- Portraits, direction-dependent walking frames, idle blinks, and contextual effects.
- PT favicon and monogram.

Source: [`src/game/art.ts`](src/game/art.ts), [`src/game/OfficeScene.ts`](src/game/OfficeScene.ts), and [`public/favicon.svg`](public/favicon.svg).

These are project-original, code-generated assets. No sprite pack, tileset, screenshot, or artwork was copied from any reference repository. No external image download is required.

## Original music and sound

Source: [`src/lib/audio.ts`](src/lib/audio.ts).

Music is synthesized into mono, 22,050 Hz, 16-bit PCM WAV blobs in the browser. Howler handles playback, looping, volume, and browser audio unlock. The compositions use soft chord pads, rounded bass, a gentle kick, and quiet pixel-like melodic tones.

| Track | Tempo | Loop duration |
| --- | --- | --- |
| A little room to dream | 80 BPM | 24 seconds |
| Coffee, code & sunshine | 88 BPM | Approximately 21.82 seconds |
| After hours, before stars | 72 BPM | Approximately 26.67 seconds |

All ten interaction sounds and the optional soft ambience are also synthesized locally. There are no third-party recordings, sample downloads, streaming URLs, or audio placeholders. The tracks are original short compositions, not reproductions of existing music.

Browser policy requires user interaction before audible playback. Use the player’s Play button; remembered volume and mute settings apply immediately.

## Bundled third-party assets

| Asset | Source | License |
| --- | --- | --- |
| DM Sans, body and interface type | [Fontsource](https://fontsource.org/fonts/dm-sans) / [Google Fonts](https://github.com/google/fonts/tree/main/ofl/dmsans) | SIL Open Font License 1.1 |
| Silkscreen, pixel signs and accents | [Fontsource](https://fontsource.org/fonts/silkscreen) / [Google Fonts](https://github.com/google/fonts/tree/main/ofl/silkscreen) | SIL Open Font License 1.1 |
| Lucide interface icons | [lucide.dev](https://lucide.dev/license) | ISC |

The fonts are installed with `@fontsource/dm-sans` and `@fontsource/silkscreen`; their license text accompanies those packages. Icons ship through `lucide-react`, with the upstream license included in the package. The app makes no runtime request to Google Fonts or an icon CDN.

Phaser, Howler, React, Vite, Zustand, Tailwind, and Recharts retain their respective upstream software licenses. Dependency license files are included with the installed packages.

## Product references reviewed

The brief’s office references were treated as interaction and architecture inspiration, not code or asset sources:

- [ishkkman/agent-office](https://github.com/ishkkman/agent-office): in-world conversations, task delegation, meetings, and report handoffs.
- [paulrobello/claude-office](https://github.com/paulrobello/claude-office): boss/employee hierarchy, visible agent state, and keeping per-frame rendering separate from shared UI state.
- [leonvanzyl/cubefarm](https://github.com/leonvanzyl/cubefarm): a playable leader, walk-up desk interactions, visible progress, and a useful simulated demo mode.
- [Conor-Collins/Prawnitor](https://github.com/Conor-Collins/Prawnitor): activity monitoring, workload visibility, and actionable local dashboards.

Searches for the broader Agent Office, swarm-office, multiagent-dashboard, and pixel-agent-office names informed the research. No code or visual assets were imported from those projects.

## Asset setup

**Nothing to download or place manually.** `npm install` supplies the licensed fonts and icon library. Pixel art and WAV audio are generated from source. No placeholder files need replacing for the app to be fully functional.
