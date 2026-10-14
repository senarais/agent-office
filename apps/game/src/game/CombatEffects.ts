import Phaser from 'phaser';
import type { AttackEvent, Point, Settings, Weapon } from '../../../../packages/shared/src/types';
import { directions, weapons } from '../../../../packages/shared/src/combat';
import { audio } from '../audio';

type Particle = { x: number; y: number; vx: number; vy: number; color: number; size: number; life: number; max: number; blood: boolean };
/** Fixed particle pool and capped trails: spam-fire never allocates an unbounded effect list. */
export class CombatEffects {
  private graphics: Phaser.GameObjects.Graphics;
  private pool: Particle[] = Array.from({ length: 240 }, () => ({ x: 0, y: 0, vx: 0, vy: 0, color: 0, size: 2, life: 0, max: 0, blood: false }));
  private cursor = 0; private shots: AttackEvent[] = []; private predicted = new Set<string>();
  shotsFired = 0; confirmedHits = 0; bloodBursts = 0; hitStopUntil = 0;
  constructor(private scene: Phaser.Scene) { this.graphics = scene.add.graphics().setDepth(2300); }
  private burst(p: Point, count: number, color: number, blood = false) {
    for (let i = 0; i < count; i++) { const particle = this.pool[this.cursor++ % this.pool.length], angle = (i * 2.399 + this.cursor * .1); Object.assign(particle, { x: p.x, y: p.y - 16, vx: Math.cos(angle) * (40 + i % 4 * 18), vy: Math.sin(angle) * 65 - 25, color: i % 3 === 0 && !blood ? 0xffe8a6 : color, size: blood ? 2 : i % 2 + 2, life: blood ? .6 : .26, max: blood ? .6 : .26, blood }); }
  }
  fire(event: AttackEvent, predicted = false) {
    if (predicted) { this.predicted.add(event.id); if (this.predicted.size > 256) this.predicted.delete(this.predicted.values().next().value!); }
    this.shotsFired++; this.shots.push({ ...event, at: Date.now() }); this.shots = this.shots.slice(-48);
    const sound = event.source === 'meeting' ? 'meeting' : event.source === 'paperwork' ? 'printer' : event.source === 'shock' ? 'shock' : event.weapon === 'hand' ? 'punch' : event.weapon;
    audio.play(sound, event.weapon === 'rifle' ? .6 : .7, 1 + (this.shotsFired % 3 - 1) * .025);
    if (event.weapon === 'rifle') { const d = directions[event.direction]; this.burst({ x: event.origin.x + d.x * 27, y: event.origin.y + d.y * 27 }, 4, 0xf2c46f); }
  }
  confirm(event: AttackEvent, settings: Settings, player: Point) {
    if (!this.predicted.has(event.id)) this.fire(event);
    if (event.employeeId) {
      this.confirmedHits++; this.burst(event.end, 8, event.source === 'shock' ? 0x90dce7 : 0xf0cc88);
      if (event.damage > 0 && settings.blood && settings.violence === 'full' && event.weapon !== 'hand') { this.bloodBursts++; this.burst(event.end, 10, 0xb85856, true); audio.play('blood', .18, 1.15); }
      if (!['shock', 'meeting', 'paperwork'].includes(event.source)) audio.play(event.weapon === 'knife' ? 'stab' : 'body', .45, .95, (event.end.x - player.x) / 500);
      if (event.killed) { audio.play('fall', .6, .9); audio.play('death', .35); }
      if (!settings.reducedMotion && event.damage > 0) this.hitStopUntil = Date.now() + 38;
      if (settings.shake && !settings.reducedMotion && event.damage > 0) this.scene.cameras.main.shake(65, .0017);
    } else if (Phaser.Math.Distance.BetweenPoints(event.origin, event.end) < weapons[event.weapon].range - 6) { this.burst(event.end, 4, 0xaac6c1); audio.play('wall', .18, 1.1); }
  }
  restore(p: Point) { this.burst(p, 18, 0xb5d88c); }
  render(delta: number, settings: Settings, player: Point, direction: number, equipped: Weapon, showWeapon: boolean) {
    const now = Date.now(), g = this.graphics; g.clear(); const dt = Math.min(delta, 50) / 1000;
    for (const p of this.pool) { if (p.life <= 0) continue; p.life -= dt; if (p.blood && (!settings.blood || settings.violence !== 'full')) { p.life = 0; continue; } if (!settings.reducedMotion) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.blood ? 150 * dt : 30 * dt; } g.fillStyle(p.color, Math.min(1, p.life / .12)); g.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size); }
    this.shots = this.shots.filter(s => now - s.at < (s.weapon === 'rifle' ? 95 : 260));
    for (const shot of this.shots) {
      const age = now - shot.at, axis = directions[shot.direction], x = shot.origin.x, y = shot.origin.y - 16;
      if (shot.source === 'meeting') { g.fillStyle(0xcbd4a4).fillRect(x - 15, y - 17, 30, 20); g.fillStyle(0x4c6a50).fillRect(x - 11, y - 12, 18, 2).fillRect(x - 11, y - 6, 23, 2); }
      else if (shot.source === 'paperwork') { for (let i = 0; i < 3; i++) g.fillStyle(0xe6d9b2).fillRect(x - 14 + i * 10, y - 12 + i * 5 + Math.floor(age / 35), 9, 12); }
      else if (shot.source === 'shock') { g.lineStyle(2, 0x99dce8).beginPath().moveTo(x - 16, y - 14).lineTo(x + 12, y - 8).lineTo(x - 8, y + 4).lineTo(x + 16, y + 10).strokePath(); }
      else if (shot.weapon === 'rifle') { const muzzle = Math.min(25, Phaser.Math.Distance.BetweenPoints(shot.origin, shot.end)); g.lineStyle(1, 0xf2dc99, Math.max(0, 1 - age / 95)); g.lineBetween(x + axis.x * muzzle, y + axis.y * muzzle, shot.end.x, shot.end.y - 16); g.fillStyle(0xffedb2).fillRect(x + axis.x * muzzle - 3, y + axis.y * muzzle - 3, 6, 6); }
      else if (shot.weapon === 'whip') { const swing = settings.reducedMotion ? 5 : Math.sin(age / 240 * Math.PI) * 25; g.lineStyle(2, 0xcaa474); g.beginPath().moveTo(x + axis.x * 14, y + axis.y * 14).lineTo(x + axis.x * 35 - axis.y * swing, y + axis.y * 35 + axis.x * swing).lineTo(x + axis.x * 70 + axis.y * swing / 2, y + axis.y * 70 - axis.x * swing / 2).strokePath(); }
      else if (shot.weapon === 'knife') { const reach = 18 + Math.sin(Math.min(1, age / 200) * Math.PI) * 26; g.lineStyle(3, 0xd7e6da).lineBetween(x + axis.x * 14, y + axis.y * 14, x + axis.x * reach, y + axis.y * reach); g.lineStyle(1, 0xf8e4b1).strokeCircle(x + axis.x * reach, y + axis.y * reach, 5); }
      else { g.fillStyle(0xe1b38d).fillRect(x + axis.x * 22 - 4, y + axis.y * 22 - 4, 9, 9); }
    }
    if (showWeapon && settings.violence !== 'disabled' && equipped !== 'hand') {
      const d = directions[direction], x = Math.round(player.x + d.x * 12), y = Math.round(player.y - 16 + d.y * 12);
      g.lineStyle(equipped === 'rifle' ? 4 : 2, equipped === 'knife' ? 0xd9e5d5 : equipped === 'whip' ? 0xac7d4e : 0x415449);
      g.lineBetween(x, y, x + d.x * (equipped === 'rifle' ? 15 : 9), y + d.y * (equipped === 'rifle' ? 15 : 9));
      if (equipped === 'rifle') g.lineStyle(3, 0xaa7d54).lineBetween(x - d.y * 2, y + d.x * 2, x - d.y * 7, y + d.x * 7);
    }
  }
  destroy() { this.graphics.destroy(); }
}
