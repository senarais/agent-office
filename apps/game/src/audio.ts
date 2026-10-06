import { Howl, Howler } from 'howler';
import type { Settings } from '../../../packages/shared/src/types';
import { api, useGame } from './state';
export const tracks = [ { name: '8-bit LoFi', artist: 'ThePixel', file: '8-bit-lofi.mp3' }, { name: 'Pleasant Creek', artist: 'Matthew Pablo', file: 'pleasant-creek.mp3' } ];
const sounds = { move: 'select_001', select: 'click_001', cancel: 'close_001', open: 'open_001', text: 'tick_001', confirm: 'confirmation_001', error: 'error_001', door: 'switch_001', keyboard: 'click_003', boot: 'maximize_001', printer: 'drop_001', coffee: 'glass_001', phone: 'bong_001', server: 'maximize_001', message: 'select_001', assigned: 'confirmation_001', complete: 'bong_001', warning: 'error_001', meeting: 'open_001', punch: 'drop_001', whip: 'switch_001', rifle: 'minimize_001', hit: 'click_003', death: 'close_001' };
export type Sound = keyof typeof sounds;
class OfficeAudio {
  private music?: Howl; private track = -1; private settings?: Settings; private sfx = new Map<string, Howl>(); private last = new Map<string, number>(); private unlocked = false;
  private ambient?: AudioContext; private gain?: GainNode;
  unlock() { this.unlocked = true; void Howler.ctx?.resume(); if (this.settings) this.configure(this.settings); }
  configure(s: Settings) {
    this.settings = s; Howler.volume(s.master); Howler.mute(s.muted);
    if (!this.unlocked) return;
    if (this.track !== s.track) {
      this.music?.unload(); this.track = s.track; const track = tracks[s.track] || tracks[0];
      this.music = new Howl({ src: [`/audio/${track.file}`], html5: true, volume: s.music, loop: s.repeat && !s.shuffle, onend: () => { if (!this.settings?.repeat || this.settings.shuffle) this.next(1); }, onloaderror: () => useGame.getState().toast('Music unavailable. Check public/audio and docs/AUDIO.md.') });
    }
    this.music?.volume(s.music); this.music?.loop(s.repeat && !s.shuffle);
    if (s.musicOn && !this.music?.playing()) this.music?.play(); else if (!s.musicOn) this.music?.pause();
    if (s.ambientOn && !this.ambient) { this.ambient = new AudioContext(); this.gain = this.ambient.createGain(); const osc = this.ambient.createOscillator(); osc.frequency.value = 60; osc.type = 'sine'; osc.connect(this.gain); this.gain.connect(this.ambient.destination); osc.start(); }
    if (this.gain) this.gain.gain.value = s.ambientOn && !s.muted ? s.ambient * s.master * .05 : 0;
  }
  play(name: Sound) {
    const s = this.settings; if (!this.unlocked || !s || !s.sfxOn || s.muted || Date.now() - (this.last.get(name) || 0) < (name === 'text' ? 75 : 80)) return;
    this.last.set(name, Date.now()); const file = sounds[name]; let sound = this.sfx.get(file);
    if (!sound) { sound = new Howl({ src: [`/audio/${file}.ogg`], volume: s.sfx }); this.sfx.set(file, sound); }
    sound.volume(name === 'text' ? s.dialogue * .4 : name === 'keyboard' ? s.sfx * .2 : s.sfx); sound.play();
  }
  next(direction: number) { const s = useGame.getState().world!.settings; const track = s.shuffle ? (s.track + 1 + Math.floor(Math.random() * (tracks.length - 1))) % tracks.length : (s.track + direction + tracks.length) % tracks.length; void api('/settings', { track }, 'PATCH').catch(e => useGame.getState().toast(e.message)); }
}
export const audio = new OfficeAudio();
