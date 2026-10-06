# Credits

## Original game artwork

Office tiles/furniture, PT monogram, layered directional characters, effects, title building and pixel icons are original project artwork, drawn independently in:

- `apps/game/src/game/art.ts`
- `apps/game/src/game/OfficeScene.ts`
- `apps/game/src/ui/kit.tsx`
- `apps/game/src/style.css`
- `public/favicon.svg`, `public/map-tiles.svg`

The existing project's original moss/wood palette and drawing approach were reused conceptually. No Pokémon or other proprietary game sprites, maps, branding or music are used. No reference-repository artwork was imported.

## Recorded music

**“8 Bit Lofi” by ThePixel**

- Source: https://opengameart.org/content/8-bit-lofi
- File: `public/audio/8-bit-lofi.mp3` (original `8_bit_lofi_music.mp3`)
- License: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- Modification: filename only; recording unchanged.

**“Pleasant Creek” by Matthew Pablo — https://www.matthewpablo.com/**

- Source: https://opengameart.org/content/pleasant-creek
- File: `public/audio/pleasant-creek.mp3` (from `Pleasant Creek Pack/Pleasant Creek.mp3`)
- License: [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/)
- Modification: filename only; recording unchanged. Attribution must accompany redistribution.

No music was generated or synthesized for the active game. Howler plays the existing recordings locally.

## Sound effects

**Interface Sounds 1.0 — Kenney (https://kenney.nl)**

- Source: https://kenney.nl/assets/interface-sounds
- License: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- Fourteen selected OGG files; filenames retained, recordings unchanged.
- Original license bundled at `public/audio/KENNEY-LICENSE.txt`.
- These sounds are repurposed as subtle retro UI/world/slapstick cues, not realistic weapon recordings.

Optional server-fan ambience is an independently synthesized non-musical low-volume 60 Hz hum.

## Typography and software

- **Silkscreen**, Jason Kottke: [Google Fonts source](https://github.com/google/fonts/tree/main/ofl/silkscreen), SIL Open Font License 1.1. Bundled via `@fontsource/silkscreen`; license accompanies the package.
- Phaser, React, Zustand, Vite, Fastify, Howler, OpenAI SDK and OpenCode SDK retain their respective upstream licenses included with dependencies. No asset license is inferred from a repository's code license.

Reference studies: [docs/REFERENCES.md](docs/REFERENCES.md). Detailed filenames: [ASSETS.md](ASSETS.md).
