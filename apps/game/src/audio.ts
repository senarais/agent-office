import { Howl, Howler } from 'howler';
import type { Settings, PunishmentMethod } from '../../../packages/shared/src/types';
import { api, useGame } from './state';
export const tracks = [ { name: '8-bit LoFi', artist: 'ThePixel', file: '8-bit-lofi.mp3' }, { name: 'Pleasant Creek', artist: 'Matthew Pablo', file: 'pleasant-creek.mp3' } ];
const sounds = { move: 'select_001', select: 'click_001', cancel: 'close_001', open: 'open_001', text: 'tick_001', confirm: 'confirmation_001', error: 'error_001', door: 'impactWood_light_000', keyboard: 'click_003', boot: 'maximize_001', printer: 'impactTin_medium_000', coffee: 'glass_001', phone: 'bong_001', server: 'maximize_001', message: 'select_001', assigned: 'confirmation_001', complete: 'powerUp3', warning: 'error_001', meeting: 'impactBell_heavy_000', punch: 'impactPunch_heavy_000', whip: 'phaseJump1', knife: 'phaserDown1', stab: 'impactPunch_medium_000', rifle: 'laser5', hit: 'impactGeneric_light_000', body: 'impactSoft_medium_000', fall: 'impactSoft_heavy_000', blood: 'impactPunch_medium_000', death: 'zapThreeToneDown', revive: 'powerUp3', heal: 'phaserUp1', shock: 'zap1', machine: 'impactMetal_medium_000', alarm: 'laser9', footstep: 'footstep_wood_000', footstep2: 'footstep_wood_001', wall: 'impactMetal_light_000', save: 'confirmation_001', board: 'switch_001', vending: 'impactTin_medium_000', approach: 'bong_001', scheduled: 'phaserUp1' };
export type Sound = keyof typeof sounds;
class OfficeAudio {
  private music?: Howl; private track = -1; private settings?: Settings; private sfx = new Map<string, Howl>(); private last = new Map<string, number>(); private unlocked = false;
  private ambient?: AudioContext; private gain?: GainNode; private machineLoop?: Howl; private machineMethod?: PunishmentMethod;
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
  play(name: Sound, gain = 1, pitch = 1, pan = 0) {
    const s = this.settings; if (!this.unlocked || !s || !s.sfxOn || s.muted || Date.now() - (this.last.get(name) || 0) < (name === 'text' ? 75 : 80)) return;
    this.last.set(name, Date.now()); const file = sounds[name]; let sound = this.sfx.get(file);
    if (!sound) { sound = new Howl({ src: [`/audio/${file}.ogg`], volume: s.sfx }); this.sfx.set(file, sound); }
    const volume = (name === 'text' ? s.dialogue * .4 : name === 'keyboard' || name.startsWith('footstep') ? s.sfx * .2 : s.sfx) * gain;
    const playing = sound.play(); sound.volume(volume, playing); sound.rate(pitch, playing); sound.stereo(Math.max(-1, Math.min(1, pan)), playing);
  }
  machine(method?: PunishmentMethod) {
    const s = this.settings; const enabled = method && s?.sfxOn && !s.muted && this.unlocked;
    if (!enabled) { this.machineLoop?.stop(); this.machineMethod = undefined; return; }
    if (this.machineMethod !== method) { this.machineLoop?.unload(); this.machineMethod = method; this.machineLoop = new Howl({ src: [`/audio/${method === 'shock' ? 'zap2' : method === 'meeting' ? 'phaserDown1' : 'impactTin_medium_000'}.ogg`], loop: true, volume: s.sfx * .09, rate: method === 'meeting' ? .6 : 1 }); this.machineLoop.play(); }
    this.machineLoop?.volume(s.sfx * .09);
  }
  next(direction: number) { const s = useGame.getState().world!.settings; const track = s.shuffle ? (s.track + 1 + Math.floor(Math.random() * (tracks.length - 1))) % tracks.length : (s.track + direction + tracks.length) % tracks.length; void api('/settings', { track }, 'PATCH').catch(e => useGame.getState().toast(e.message)); }
}
export const audio = new OfficeAudio();
