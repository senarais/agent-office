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

## Revision 2: additional CC0 sound bank

Creator for every file below: **Kenney**. Files unchanged; runtime playback may vary rate/gain/panning or use loops. Original license text is included alongside each bank. Downloaded directly from the creator, not copied out of a reference repository.

| Filename | Original source | License | Main use |
| --- | --- | --- | --- |
| `footstep_wood_000.ogg` | [Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Walking |
| `footstep_wood_001.ogg` | same | CC0 | Alternating footsteps |
| `impactPunch_heavy_000.ogg` | same | CC0 | Fists / boxing rig |
| `impactPunch_medium_000.ogg` | same | CC0 | Knife hit / small hit layer |
| `impactSoft_heavy_000.ogg` | same | CC0 | Body fall |
| `impactSoft_medium_000.ogg` | same | CC0 | Body impact |
| `impactMetal_light_000.ogg` | same | CC0 | Bullet wall impact |
| `impactMetal_medium_000.ogg` | same | CC0 | Machine action |
| `impactBell_heavy_000.ogg` | same | CC0 | Meeting bell |
| `impactTin_medium_000.ogg` | same | CC0 | Printer / supplies / machine loop |
| `impactGeneric_light_000.ogg` | same | CC0 | Light impact |
| `impactWood_light_000.ogg` | same | CC0 | Doorway |
| `laser5.ogg` | [Digital Audio](https://kenney.nl/assets/digital-audio) | CC0 | Fictional pixel rifle |
| `laser9.ogg` | same | CC0 | Machine alarm |
| `phaserDown1.ogg` | same | CC0 | Knife slash / projector loop |
| `phaserUp1.ogg` | same | CC0 | Heal / recurring task started |
| `phaseJump1.ogg` | same | CC0 | Whip crack |
| `powerUp3.ogg` | same | CC0 | Revive / completion |
| `zap1.ogg` | same | CC0 | Electric pulse |
| `zap2.ogg` | same | CC0 | Electrical machine loop |
| `zapThreeToneDown.ogg` | same | CC0 | Cartoon death cue |

`KENNEY-IMPACT-LICENSE.txt` and `KENNEY-DIGITAL-LICENSE.txt` are verbatim archive license statements. New knife, whip, rifle, blood squares, sparks, HP bars, corpse/revive poses, machinery and room visuals are original code-drawn artwork in the same palette; no LPC/share-alike sprite assets were imported.
