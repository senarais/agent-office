import Phaser from 'phaser';
import { WORLD, rooms, furniture, moveWithCollision, findPath, distance } from '../../../../packages/shared/src/world';
import type { Point } from '../../../../packages/shared/src/types';
import { useGame, api } from '../state';
import type { Screen } from '../state';
import { audio } from '../audio';
import { createOfficeArt, characterTextures } from './art';
type Actor = { sprite: Phaser.GameObjects.Image; bubble: Phaser.GameObjects.Text; label: Phaser.GameObjects.Text; key: string; direction: number };
export let officeScene: OfficeScene | undefined;
export class OfficeScene extends Phaser.Scene {
  player!: Phaser.GameObjects.Image; private keys = new Set<string>(); private direction = 0; private actors = new Map<string, Actor>();
  private prompt!: Phaser.GameObjects.Text; private overlay!: Phaser.GameObjects.Rectangle; private effects!: Phaser.GameObjects.Graphics;
  private clock!: Phaser.GameObjects.Text; private wallTint!: Phaser.GameObjects.Graphics; private weather!: Phaser.GameObjects.Graphics;
  private target?: { id: string; action: string; label: string }; private path: Point[] = []; private autoInteract?: string;
  private lastSync = 0; private lastStep = 0; private lastEvent = ''; private lastStyle = ''; private lastAttack = 0; private boundsKey = ''; private printedAt = 0;
  constructor() { super('OfficeScene'); }
  create() {
    officeScene = this; const world = useGame.getState().world!; createOfficeArt(this);
    this.add.image(0, 0, 'floor').setOrigin(0);
    for (const f of furniture) this.add.image(f.x - 8, f.y - 36, `f-${f.id}`).setOrigin(0).setDepth(f.y + f.h).setName(f.id);
    this.wallTint = this.add.graphics().setDepth(1);
    const key = characterTextures(this, world.player.appearance, true); this.player = this.add.image(world.player.x, world.player.y, `${key}-0-0`).setOrigin(.5, .9);
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height).setZoom(world.settings.pixelScale).startFollow(this.player, true, .12, .12); this.cameras.main.roundPixels = true;
    this.prompt = this.add.text(0, 0, '', { fontFamily: 'Silkscreen', fontSize: '8px', color: '#f3e7be', backgroundColor: '#21382f', padding: { x: 6, y: 5 }, align: 'center' }).setOrigin(.5, 0).setDepth(3000);
    this.overlay = this.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x172e49, .08).setOrigin(0).setDepth(2000);
    this.effects = this.add.graphics().setDepth(2100); this.weather = this.add.graphics().setDepth(1999);
    this.clock = this.add.text(978, 475, '', { fontFamily: 'Silkscreen', fontSize: '7px', color: '#efe2ad' }).setDepth(1000);
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (useGame.getState().window || !useGame.getState().entered) return;
      const p = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const actor = [...this.actors.entries()].find(([, a]) => distance(a.sprite, p) < 25);
      const f = furniture.find(f => f.action && p.x >= f.x - 5 && p.x <= f.x + f.w + 5 && p.y >= f.y - 35 && p.y <= f.y + f.h);
      if (actor) { this.walkTo(actor[1].sprite); this.autoInteract = actor[0]; }
      else if (f?.point) { this.walkTo(f.point); this.autoInteract = f.id; }
      else this.walkTo(p);
    });
    window.addEventListener('keydown', this.keydown); window.addEventListener('keyup', this.keyup); window.addEventListener('blur', this.blur);
    this.events.once('shutdown', () => { officeScene = undefined; window.removeEventListener('keydown', this.keydown); window.removeEventListener('keyup', this.keyup); window.removeEventListener('blur', this.blur); });
  }
  walkTo(point: Point) { this.path = findPath(this.player, point); this.autoInteract = undefined; }
  private keydown = (e: KeyboardEvent) => {
    const state = useGame.getState(); if (!state.entered || state.window || (e.target as HTMLElement).closest('input, textarea, select')) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    this.keys.add(e.key.toLowerCase());
    if (e.repeat) return;
    if (e.key.toLowerCase() === state.world!.settings.keys.interact) this.interact();
    if (e.key.toLowerCase() === state.world!.settings.keys.action) this.attack();
  };
  private keyup = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
  private blur = () => this.keys.clear();
  private interact() {
    if (!this.target) return; this.keys.clear(); this.path = []; this.autoInteract = undefined;
    const target = this.target;
    const object = this.actors.get(target.id)?.sprite || furniture.find(f => f.id === target.id)?.point;
    if (object) this.direction = this.facing(object.x - this.player.x, object.y - this.player.y);
    void this.syncPosition();
    if (target.action === 'employee') { void api(`/employees/${target.id}/interact`, { hold: true }).catch(() => {}); const actor = this.actors.get(target.id)!; actor.direction = this.facing(this.player.x - actor.sprite.x, this.player.y - actor.sprite.y); }
    audio.play(target.action === 'coffee' ? 'coffee' : target.action === 'network' ? 'server' : 'open'); useGame.getState().open(target.action as Screen, target.id);
  }
  private attack() {
    const state = useGame.getState(), world = state.world!; if (world.settings.violence === 'disabled' || Date.now() - this.lastAttack < 550) return;
    this.lastAttack = Date.now(); const range = world.player.equipped === 'rifle' ? 200 : world.player.equipped === 'whip' ? 80 : 56;
    const target = world.employees.filter(e => e.employmentStatus === 'active').map(e => ({ e, a: this.actors.get(e.id) })).filter(o => o.a && distance(o.a.sprite, this.player) < range).sort((a, b) => distance(a.a!.sprite, this.player) - distance(b.a!.sprite, this.player))[0];
    if (!target) { useGame.getState().toast('No employee in range. SPACE uses equipped item.'); return; }
    void this.syncPosition().then(() => api('/combat', { employeeId: target.e.id, weapon: world.player.equipped })).catch(e => useGame.getState().toast(e.message));
  }
  async syncPosition() { await api('/player', { x: this.player.x, y: this.player.y }, 'PATCH'); }
  private facing(dx: number, dy: number) { return Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 3 : 1 : dy > 0 ? 0 : 2; }
  update(time: number, delta: number) {
    const state = useGame.getState(); const world = state.world; if (!this.player || !world) return;
    const dt = Math.min(delta, 50) / 1000, settings = world.settings, camera = this.cameras.main;
    if (camera.zoom !== settings.pixelScale) camera.setZoom(settings.pixelScale);
    const boundsKey = `${camera.width}:${camera.height}:${camera.zoom}`;
    if (boundsKey !== this.boundsKey) { this.boundsKey = boundsKey; const extraW = Math.max(0, camera.width / camera.zoom - WORLD.width), extraH = Math.max(0, camera.height / camera.zoom - WORLD.height); camera.setBounds(-extraW / 2, -extraH / 2, WORLD.width + extraW, WORLD.height + extraH); }
    camera.setLerp(settings.reducedMotion ? 1 : settings.cameraSmoothness, settings.reducedMotion ? 1 : settings.cameraSmoothness);
    let dx = 0, dy = 0;
    if (state.window || !state.entered) { this.keys.clear(); this.path = []; }
    else {
      dx = Number(this.keys.has(settings.keys.right) || this.keys.has('arrowright')) - Number(this.keys.has(settings.keys.left) || this.keys.has('arrowleft'));
      dy = Number(this.keys.has(settings.keys.down) || this.keys.has('arrowdown')) - Number(this.keys.has(settings.keys.up) || this.keys.has('arrowup'));
      if (dx || dy) { this.path = []; this.autoInteract = undefined; }
      else if (this.path.length) { const p = this.path[0]; dx = p.x - this.player.x; dy = p.y - this.player.y; if (Math.hypot(dx, dy) < 5) { this.path.shift(); dx = 0; dy = 0; } }
      if (dx || dy) { const speed = this.keys.has('shift') ? 280 : { normal: 168, fast: 192, 'very fast': 232 }[settings.playerSpeed] + ((world.player.caffeinatedUntil || 0) > Date.now() ? 24 : 0); const len = Math.hypot(dx, dy), step = Math.min(speed * dt, this.path.length ? len : Infinity); const p = moveWithCollision(this.player, dx / len * step, dy / len * step); this.player.setPosition(p.x, p.y); this.direction = this.facing(dx, dy); }
    }
    const playerKey = characterTextures(this, world.player.appearance, true); this.player.setTexture(`${playerKey}-${this.direction}-${dx || dy ? Math.floor(time / 110) % 3 : Math.floor(time / 2500) % 5 === 0 ? 3 : 0}`).setDepth(this.player.y);
    if (time - this.lastSync > 350 && state.entered && state.connected) { this.lastSync = time; void this.syncPosition().catch(() => {}); }
    for (const e of world.employees) {
      if (e.employmentStatus === 'deceased' || (e.employmentStatus !== 'active' && e.state !== 'leaving')) { const a = this.actors.get(e.id); if (a) { if (e.employmentStatus === 'deceased' && !settings.reducedMotion) { const fallen = this.add.image(a.sprite.x, a.sprite.y - 12, a.sprite.texture.key).setDepth(a.sprite.y).setTint(0xaaa88f); this.tweens.add({ targets: fallen, angle: 90, alpha: 0, duration: 700, onComplete: () => fallen.destroy() }); } a.sprite.destroy(); a.bubble.destroy(); a.label.destroy(); this.actors.delete(e.id); } continue; }
      let a = this.actors.get(e.id); const key = characterTextures(this, e.appearance);
      if (!a) { a = { sprite: this.add.image(e.position.x, e.position.y, `${key}-0-0`).setOrigin(.5, .9), label: this.add.text(0, 0, '', { fontFamily: 'Silkscreen', fontSize: '7px', color: '#f3e4bd', backgroundColor: '#294237', padding: { x: 4, y: 2 } }).setOrigin(.5, 0).setDepth(2200), bubble: this.add.text(0, 0, '', { fontFamily: 'Silkscreen', fontSize: '7px', color: '#2b4338', backgroundColor: '#ece1b8', padding: { x: 5, y: 4 }, wordWrap: { width: 150 }, align: 'center' }).setOrigin(.5, 1).setDepth(2300), direction: 0, key }; this.actors.set(e.id, a); }
      const ax = e.position.x - a.sprite.x, ay = e.position.y - a.sprite.y, moving = Math.hypot(ax, ay) > 1;
      a.sprite.x += ax * Math.min(1, dt * 14); a.sprite.y += ay * Math.min(1, dt * 14); if (moving) a.direction = this.facing(ax, ay);
      if (state.window?.id === e.id && ['employee', 'chat', 'assign'].includes(state.window.screen)) a.direction = this.facing(this.player.x - a.sprite.x, this.player.y - a.sprite.y);
      const work = ['working', 'terminal', 'reading'].includes(e.state); const hurt = (e.hurtUntil || 0) > Date.now();
      const sitting = !moving && (work || e.state === 'meeting'); const talking = state.window?.id === e.id && ['employee', 'chat', 'assign'].includes(state.window.screen); const direction = talking ? a.direction : e.state === 'meeting' ? this.facing(784 - a.sprite.x, 212 - a.sprite.y) : work ? 2 : a.direction;
      a.sprite.setTexture(`${key}-${sitting ? 'sit-' : ''}${direction}-${moving || work ? Math.floor(time / (work ? settings.animationSpeed === 'fast' ? 140 : 240 : 115)) % 3 : 0}`).setDepth(a.sprite.y).setAlpha(e.state === 'leaving' && e.position.x > 1180 ? .5 : 1);
      a.sprite.setTint(hurt && settings.damageFlash ? 0xffb38f : 0xffffff); a.sprite.setAngle(hurt && !settings.reducedMotion ? Math.sin(time / 45) * 12 : 0);
      a.label.setText(e.name + (work ? ' ···' : '')).setPosition(a.sprite.x, a.sprite.y + 6).setVisible(distance(this.player, a.sprite) < 100 || work || e.state === 'blocked');
      const caption = hurt ? '★ Seriously?! ★' : e.bubbleUntil > Date.now() ? e.bubble : e.state === 'blocked' ? '! PROVIDER ERROR' : work ? e.state === 'reading' ? 'Reading…' : e.state === 'terminal' ? '>_ running tool' : 'Working…' : e.state === 'waiting' ? '! Needs permission' : '';
      a.bubble.setText(caption).setPosition(a.sprite.x, a.sprite.y - 40).setVisible(!!caption && state.window?.id !== e.id);
    }
    const targets = [...world.employees.filter(e => e.employmentStatus === 'active').map(e => ({ id: e.id, action: 'employee', label: `Talk to ${e.name}`, point: this.actors.get(e.id)?.sprite || e.position })), ...furniture.filter(f => f.action && f.point).map(f => ({ id: f.id, action: f.action!, label: f.label!, point: f.point! }))];
    this.target = targets.filter(t => distance(this.player, t.point) < 46).sort((a, b) => distance(this.player, a.point) - distance(this.player, b.point))[0];
    if (this.autoInteract && this.target?.id === this.autoInteract && !state.window) this.interact();
    this.prompt.setText(this.target ? `[${settings.keys.interact.toUpperCase()}] ${this.target.label}` : '').setPosition(this.player.x, this.player.y + 22).setVisible(!!this.target && !state.window && state.entered);
    const room = rooms.find(r => this.player.x > r.x && this.player.x < r.x + r.w && this.player.y > r.y && this.player.y < r.y + r.h)?.name || (this.player.y > 740 ? 'RECEPTION' : 'MAIN HALL');
    if (state.room !== room) audio.play('door');
    if (state.room !== room || state.prompt !== (this.target?.label || '')) useGame.setState({ room, prompt: this.target?.label || '' });
    const hour = new Date().getHours(), night = settings.time === 'night' || settings.time === 'local' && (hour < 6 || hour >= 19), evening = settings.time === 'local' && hour >= 16 && hour < 19;
    this.overlay.setFillStyle(night ? 0x16354e : 0xceb879, night ? .25 : evening ? .1 : .025);
    this.clock.setText(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    const style = `${world.company.wallColor}-${world.company.plants}`;
    if (style !== this.lastStyle) { this.lastStyle = style; this.wallTint.clear().fillStyle(Phaser.Display.Color.HexStringToColor(world.company.wallColor).color, .7); for (const r of rooms) this.wallTint.fillRect(r.x, r.y + 2, r.w, 8); for (const f of furniture.filter(f => f.kind === 'plant')) (this.children.getByName(f.id) as Phaser.GameObjects.Image).setTint(world.company.plants ? 0xffffff : 0x9b8b65); }
    this.effects.clear();
    if (settings.glow && night) { this.effects.fillStyle(0xe4bf68, .06); for (const r of rooms) this.effects.fillRect(r.x + 45, r.y + 50, r.w - 90, 80); }
    for (let i = 0; i < 6; i++) this.effects.fillStyle(Math.floor(time / 550 + i) % 3 ? 0xaacb7e : 0xe5c780, .8).fillRect(984, 109 + i * 11, 3, 3);
    if (time - this.printedAt < 2500 && this.printedAt) { this.effects.fillStyle(0xeee3bd).fillRect(984, 681, 24, 8 + Math.floor((time - this.printedAt) / 180) % 16); }
    if (Date.now() - this.lastAttack < 220) { const ux = this.direction === 3 ? 1 : this.direction === 1 ? -1 : 0, uy = this.direction === 0 ? 1 : this.direction === 2 ? -1 : 0, x = this.player.x, y = this.player.y - 16, weapon = world.player.equipped; this.effects.lineStyle(2, 0xe5c791); if (weapon === 'whip') { const sway = Math.sin((Date.now() - this.lastAttack) / 45) * 12; this.effects.beginPath().moveTo(x + ux * 10, y + uy * 10).lineTo(x + ux * 35 - uy * sway, y + uy * 35 + ux * sway).lineTo(x + ux * 66, y + uy * 66).strokePath(); } else { this.effects.fillStyle(weapon === 'rifle' ? 0x5b6047 : 0xdfb28a).fillRect(x + ux * 16 - 4, y + uy * 16 - 4, ux ? 16 : 8, uy ? 16 : 8); this.effects.lineStyle(2, 0xf0db8e).strokeCircle(x + ux * 35, y + uy * 35, weapon === 'rifle' ? 9 : 6); } }
    if (settings.weather && !settings.reducedMotion) { this.weather.clear().lineStyle(1, 0xb7d3cc, .45); for (const x of [104, 416, 736, 1112]) for (let i = 0; i < 10; i++) { const y = 61 + (time / 70 + i * 4) % 36; this.weather.lineBetween(x + i * 9, y, x + i * 9 - 2, y + 4); } } else this.weather.clear();
    const event = state.lastEvent;
    if (event && event.id !== this.lastEvent) {
      this.lastEvent = event.id;
      if (event.type === 'task.completed') this.printedAt = time;
      const sound = event.type === 'task.completed' ? 'complete' : event.type === 'task.created' ? 'assigned' : event.type === 'task.failed' || event.type === 'provider.failed' ? 'warning' : event.type === 'employee.deceased' ? 'death' : event.type === 'combat.hit' ? world.player.equipped === 'whip' ? 'whip' : 'punch' : event.type === 'meeting.started' ? 'meeting' : event.type === 'meeting.completed' ? 'confirm' : event.type === 'report.delivered' ? 'printer' : event.type === 'chat.completed' ? 'message' : undefined;
      if (sound) audio.play(sound);
      if (['employee.deceased', 'combat.hit'].includes(event.type)) { if (settings.shake && !settings.reducedMotion) camera.shake(120, .002); if (event.type === 'employee.deceased') { const e = world.employees.find(e => e.id === event.entityId); if (e) { const puff = this.add.text(e.position.x, e.position.y - 20, '✦ POOF ✦', { fontFamily: 'Silkscreen', fontSize: '10px', color: '#ebd5aa', backgroundColor: '#41584a' }).setOrigin(.5).setDepth(2400); this.time.delayedCall(1600, () => puff.destroy()); } audio.play('rifle'); } }
    }
    if (time - this.lastStep > 1300 && world.employees.some(e => e.state === 'working')) { this.lastStep = time; audio.play('keyboard'); }
  }
}
