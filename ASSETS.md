# Active game asset manifest

All third-party audio is bundled under `public/audio/`. Verified source licenses on 2026-10-06. `npm run assets` re-downloads the exact listed originals; it is not required for normal startup.

| Filename | Creator | Source | License | Modification |
| --- | --- | --- | --- | --- |
| `8-bit-lofi.mp3` | ThePixel | [8 Bit Lofi](https://opengameart.org/content/8-bit-lofi) | CC0 1.0 | Renamed only |
| `pleasant-creek.mp3` | Matthew Pablo | [Pleasant Creek](https://opengameart.org/content/pleasant-creek) | CC-BY 3.0 | Renamed only |
| `click_001.ogg` | Kenney | [Interface Sounds](https://kenney.nl/assets/interface-sounds) | CC0 | None |
| `click_003.ogg` | Kenney | same pack | CC0 | None |
| `confirmation_001.ogg` | Kenney | same pack | CC0 | None |
| `error_001.ogg` | Kenney | same pack | CC0 | None |
| `select_001.ogg` | Kenney | same pack | CC0 | None |
| `switch_001.ogg` | Kenney | same pack | CC0 | None |
| `drop_001.ogg` | Kenney | same pack | CC0 | None |
| `maximize_001.ogg` | Kenney | same pack | CC0 | None |
| `minimize_001.ogg` | Kenney | same pack | CC0 | None |
| `open_001.ogg` | Kenney | same pack | CC0 | None |
| `close_001.ogg` | Kenney | same pack | CC0 | None |
| `tick_001.ogg` | Kenney | same pack | CC0 | None |
| `bong_001.ogg` | Kenney | same pack | CC0 | None |
| `glass_001.ogg` | Kenney | same pack | CC0 | None |
| `KENNEY-LICENSE.txt` | Kenney | Original archive | CC0 statement | None |
| Silkscreen WOFF/WOFF2 | Jason Kottke / Fontsource | [fontsource.org/fonts/silkscreen](https://fontsource.org/fonts/silkscreen) | SIL OFL 1.1 | None |
| `favicon.svg`, `map-tiles.svg` | This project | Local source | Project-original artwork | N/A |
| Office/character texture atlases | This project | `apps/game/src/game/art.ts` | Project-original artwork | Generated from original drawing code |
| UI icons/title building | This project | `ui/kit.tsx`, `style.css` | Project-original artwork | N/A |

Tile vocabulary: 32 px visual tiles, 16 px navigation cells. Character textures: 32×42 logical pixels, four directions, three walk/idle frames plus blink. Layer choices: skin, hair/style, shirt, jacket, pants/skirt, shoes, glasses, hat and badge. All render nearest-neighbor.

Music source links and required Matthew Pablo attribution are also in `CREDITS.md`. The prior synthesized music in retained legacy `src/lib/audio.ts` is not imported by the active application.
