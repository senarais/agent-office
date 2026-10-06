import { Howl, Howler } from 'howler';
import type { Settings } from '../types';

export const TRACKS = [
  { title: 'A little room to dream', artist: 'Abisena Radio', bpm: 80 },
  { title: 'Coffee, code & sunshine', artist: 'Abisena Radio', bpm: 88 },
  { title: 'After hours, before stars', artist: 'Abisena Radio', bpm: 72 },
];
export type SoundName = 'click' | 'hover' | 'open' | 'assign' | 'message' | 'complete' | 'alert' | 'coffee' | 'meeting' | 'printer';

function wav(samples: Float32Array, rate = 22050): string {
  const buffer = new ArrayBuffer(44 + samples.length * 2), view = new DataView(buffer);
  const str = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  str(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, samples.length * 2, true);
  samples.forEach((v, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 32767, true));
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}
const freq = (note: number) => 440 * 2 ** ((note - 69) / 12);
function note(samples: Float32Array, start: number, duration: number, midi: number, volume: number, soft = false) {
  const rate = 22050, at = Math.floor(start * rate), length = Math.floor(duration * rate), f = freq(midi);
  for (let i = 0; i < length && at + i < samples.length; i++) {
    const t = i / rate, attack = Math.min(1, t / 0.014), envelope = attack * Math.exp(-t / (duration * 0.35)) * Math.min(1, (length - i) / 500);
    const fundamental = Math.sin(2 * Math.PI * f * t);
    const tone = soft ? fundamental : fundamental * 0.75 + Math.sin(2 * Math.PI * f * 3 * t) * 0.16;
    samples[at + i] += tone * envelope * volume;
  }
}
function music(track: number) {
  const beat = 60 / TRACKS[track].bpm, length = beat * 32;
  const samples = new Float32Array(Math.ceil(length * 22050));
  const chords = [[48, 52, 55, 59], [45, 48, 52, 55], [41, 45, 48, 52], [43, 47, 50, 55]];
  const melody = [0, 2, 3, 2, 1, 0, 2, 1, 3, 2, 0, 1, 2, 3, 1, 0];
  for (let b = 0; b < 32; b++) {
    const chord = chords[(Math.floor(b / 4) + track) % 4];
    if (b % 4 === 0) chord.forEach(n => note(samples, b * beat, beat * 3.9, n + track * 2, 0.075, true));
    if (b % 2 === 0) note(samples, b * beat, beat * 1.7, chord[0] - 12 + track * 2, 0.13, true);
    note(samples, b * beat + beat * 0.04, beat * 0.75, chord[melody[b % 16]] + 24 + track * 2, 0.075);
    if (b % 4 === 3) note(samples, (b + 0.5) * beat, beat * 0.4, chord[1] + 24 + track * 2, 0.045);
    // Quiet, rounded kick: no harsh noise layer during long listening sessions.
    for (let i = 0; i < 2200; i++) {
      const at = Math.floor(b * beat * 22050) + i;
      if (at < samples.length) samples[at] += Math.sin(i / 22050 * Math.PI * 2 * (65 - i / 100)) * Math.exp(-i / 400) * 0.09;
    }
  }
  return new Howl({ src: [wav(samples)], format: ['wav'], loop: true, volume: 0 });
}
class OfficeAudio {
  private tracks = new Map<number, Howl>();
  private sounds = new Map<SoundName, Howl>();
  private current = -1;
  private settings: Settings | null = null;
  private ambient: Howl | null = null;
  private playing = false;
  configure(settings: Settings) {
    this.settings = settings;
    Howler.volume(settings.masterVolume / 100);
    Howler.mute(settings.muted);
    this.tracks.forEach(sound => sound.volume(settings.musicVolume / 100));
    this.sounds.forEach(sound => sound.volume(settings.sfxVolume / 100));
    if (this.ambient) settings.ambience && this.playing ? (!this.ambient.playing() && this.ambient.play()) : this.ambient.pause();
  }
  sync(track: number, playing: boolean) {
    this.playing = playing;
    if (this.current !== track) this.tracks.get(this.current)?.stop();
    this.current = track;
    if (playing) {
      if (!this.tracks.has(track)) this.tracks.set(track, music(track));
      const sound = this.tracks.get(track)!;
      sound.volume((this.settings?.musicVolume ?? 35) / 100);
      if (!sound.playing()) sound.play();
      if (!this.ambient && this.settings?.ambience) {
        const samples = new Float32Array(22050 * 6);
        for (let i = 0; i < samples.length; i++) samples[i] = (Math.sin(i / 22050 * 2 * Math.PI * 110) * 0.006 + Math.sin(i / 22050 * 2 * Math.PI * 165) * 0.004);
        this.ambient = new Howl({ src: [wav(samples)], format: ['wav'], loop: true, volume: 0.3 });
      }
    } else this.tracks.get(track)?.pause();
    if (this.settings) this.configure(this.settings);
  }
  play(name: SoundName) {
    if (this.settings?.muted) return;
    if (!this.sounds.has(name)) {
      const notes: Record<SoundName, number[]> = { click: [72], hover: [79], open: [60, 67], assign: [60, 64, 72], message: [72, 79], complete: [60, 64, 67, 76], alert: [58, 54], coffee: [67, 69, 72], meeting: [72, 67, 76], printer: [48, 55, 60, 72] };
      const sequence = notes[name], samples = new Float32Array(Math.ceil((sequence.length * 0.085 + 0.22) * 22050));
      sequence.forEach((n, i) => note(samples, i * 0.085, 0.2, n, name === 'hover' ? 0.025 : 0.12, true));
      this.sounds.set(name, new Howl({ src: [wav(samples)], format: ['wav'], volume: (this.settings?.sfxVolume ?? 45) / 100 }));
    }
    this.sounds.get(name)?.play();
  }
}
export const officeAudio = new OfficeAudio();
