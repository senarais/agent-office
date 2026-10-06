# Audio

## Recorded soundtrack

No generated music in the active game. Two bundled legal recordings:

1. **8 Bit Lofi — ThePixel**, CC0. Cozy chiptune/LoFi default.
2. **Pleasant Creek — Matthew Pablo**, CC-BY 3.0. Calm town/office alternative.

Full attribution and links: [CREDITS.md](../CREDITS.md). Filename manifest: [ASSETS.md](../ASSETS.md).

The first is an existing MP3 recording; second is the original full MP3 in the creator's pack. Repeat replays the recording. MP3 playback can have a small encoder gap; this version does not claim sample-perfect music looping. No proprietary game soundtrack is used.

## Playback

Click **ENTER OFFICE** first; browsers require a user gesture for audible playback. **M** toggles global mute. **Esc → Audio** or the lounge radio opens the same in-world pixel music interface.

Functional controls: play/pause, next/previous, shuffle, repeat, track/artist, master/music/SFX/ambient/dialogue volume, music/SFX/ambient toggles and mute all. Server stores preferences and selected track. Next/previous changes the actual audio source, not only displayed text.

## Sound effects

Kenney [Interface Sounds](https://kenney.nl/assets/interface-sounds), CC0. Original archive license included at `public/audio/KENNEY-LICENSE.txt`.

`apps/game/src/audio.ts` maps selected sounds to menu selection/navigation, dialogue open/text/cancel, errors, computer/server boot, keyboard, printer, coffee, task assignment/completion, messages, meeting start and cartoon punch/whip/rifle/death cues. Effects are deliberately abstract/retro rather than realistic. Rate limiting keeps typing/menu sounds subtle.

Optional ambient effect: quiet non-musical 60 Hz server-fan hum. Separate ambient/master/mute controls apply. It is not part of the music soundtrack.

## Re-download

Files are already bundled. If intentionally removing assets, restore them with:

```bash
npm run assets
```

Requires Python 3 and internet only for that maintenance command. The script uses source URLs in the manifest, extracts explicitly selected regular audio entries, and keeps the recordings unchanged. It does not run during normal `npm install`.

## Verification

Playwright exercises audio track switching, mute persistence and resource loading. Browser automation cannot substitute for subjective listening. If silence occurs, check OS/browser mute and whether you entered the office with a click; then check the in-game audio settings. Missing-resource errors show an in-game message rather than fake playback success.
