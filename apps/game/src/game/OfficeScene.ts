import Phaser from 'phaser';
import { WORLD, rooms, furniture, moveWithCollision, findPath, distance, nearbyWalkable } from '../../../../packages/shared/src/world';
import type { Point, AttackEvent, Employee } from '../../../../packages/shared/src/types';
import { weapons, traceAttack, clearShot } from '../../../../packages/shared/src/combat';
import { useGame, api } from '../state';
import type { Screen } from '../state';
import { audio } from '../audio';
import { createOfficeArt, characterTextures } from './art';
import { CombatEffects } from './CombatEffects';
type Actor = { sprite: Phaser.GameObjects.Image; bubble: Phaser.GameObjects.Text; label: Phaser.GameObjects.Text; key: string; direction: number; dead: boolean };
export let officeScene: OfficeScene | undefined;
export class OfficeScene extends Phaser.Scene {
  player!: Phaser.GameObjects.Image; private keys = new Set<string>(); private direction = 0; private actors = new Map<string, Actor>();
  private prompt!: Phaser.GameObjects.Text; private overlay!: Phaser.GameObjects.Rectangle; private effects!: Phaser.GameObjects.Graphics;
  private clock!: Phaser.GameObjects.Text; private wallTint!: Phaser.GameObjects.Graphics; private weather!: Phaser.GameObjects.Graphics;
  combatFX!: CombatEffects; private health!: Phaser.GameObjects.Graphics; private seenFX = new Set<string>(); private lastFootstep = 0;
  private target?: { id: string; action: string; label: string }; private path: Point[] = []; private autoInteract?: string; private lastApproach = 0;
  private approachHeld?: { id: string; position: Point }; private approachPending?: string;
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
    this.combatFX = new CombatEffects(this); this.health = this.add.graphics().setDepth(2250);
    this.clock = this.add.text(978, 475, '', { fontFamily: 'Silkscreen', fontSize: '7px', color: '#efe2ad' }).setDepth(1000);
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (useGame.getState().window || !useGame.getState().entered) return;
      const p = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const actor = [...this.actors.entries()].find(([, a]) => distance(a.sprite, p) < 25);
      const f = furniture.find(f => f.action && p.x >= f.x - 5 && p.x <= f.x + f.w + 5 && p.y >= f.y - 35 && p.y <= f.y + f.h);
      if (actor) this.approachEmployee(actor[0]);
      else if (f?.point) { this.walkTo(f.point); this.autoInteract = f.id; }
      else this.walkTo(p);
    });
    window.addEventListener('keydown', this.keydown); window.addEventListener('keyup', this.keyup); window.addEventListener('blur', this.blur);
    this.events.once('shutdown', () => { officeScene = undefined; this.combatFX.destroy(); audio.machine(); window.removeEventListener('keydown', this.keydown); window.removeEventListener('keyup', this.keyup); window.removeEventListener('blur', this.blur); });
  }
  private cancelApproach() { const held = this.approachHeld; this.approachHeld = undefined; this.approachPending = undefined; this.autoInteract = undefined; if (held) void api(`/employees/${held.id}/interact`, { hold: false }).catch(() => {}); }
  walkTo(point: Point) { this.cancelApproach(); this.path = findPath(this.player, point); }
  approachEmployee(employeeId: string) { this.cancelApproach(); this.autoInteract = employeeId; this.lastApproach = -Infinity; this.path = []; }
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
    const object = this.approachHeld?.id === target.id ? this.approachHeld.position : this.actors.get(target.id)?.sprite || furniture.find(f => f.id === target.id)?.point;
    this.approachHeld = undefined;
    if (object) this.direction = this.facing(object.x - this.player.x, object.y - this.player.y);
    if (target.action === 'employee' && useGame.getState().world!.employees.find(e => e.id === target.id)?.employmentStatus === 'active') { void this.syncPosition().then(() => { if (useGame.getState().window?.id === target.id) return api(`/employees/${target.id}/interact`, { hold: true }); }).catch(e => useGame.getState().toast(e.message)); const actor = this.actors.get(target.id)!; actor.direction = this.facing(this.player.x - actor.sprite.x, this.player.y - actor.sprite.y); }
    else void this.syncPosition().catch(() => {});
    audio.play(target.action === 'coffee' ? 'coffee' : target.action === 'network' ? 'server' : target.action === 'board' ? 'board' : 'open'); useGame.getState().open(target.action as Screen, target.id);
  }
  private attack() {
    const state = useGame.getState(), world = state.world!, weapon = world.player.equipped;
    if (world.settings.violence === 'disabled' || Date.now() - this.lastAttack < weapons[weapon].cooldown + 10) return;
    this.lastAttack = Date.now(); this.path = []; const origin = { x: this.player.x, y: this.player.y }; const shot: AttackEvent = { id: crypto.randomUUID(), origin, direction: this.direction, weapon, ...traceAttack(origin, this.direction, weapon, world.employees), at: this.lastAttack, source: 'player', damage: 0, killed: false };
    // Feedback happens before any network await, even with no nearby employee.
    this.combatFX.fire(shot, true);
    if (state.connected) void api('/combat', { id: shot.id, origin, direction: shot.direction, weapon }).catch(e => { if (!e.message.includes('cooling down')) useGame.getState().toast(e.message); });
  }
  async syncPosition() { await api('/player', { x: this.player.x, y: this.player.y }, 'PATCH'); }
  private facing(dx: number, dy: number) { return Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 3 : 1 : dy > 0 ? 0 : 2; }
  update(time: number, delta: number) {
    const state = useGame.getState(); const world = state.world; if (!this.player || !world) return;
    const dt = Date.now() < this.combatFX.hitStopUntil ? 0 : Math.min(delta, 50) / 1000, settings = world.settings, camera = this.cameras.main;
    if (state.entered && !state.window && world.player.equipped === 'rifle' && this.keys.has(settings.keys.action)) this.attack();
    if (camera.zoom !== settings.pixelScale) camera.setZoom(settings.pixelScale);
    const boundsKey = `${camera.width}:${camera.height}:${camera.zoom}`;
    if (boundsKey !== this.boundsKey) { this.boundsKey = boundsKey; const extraW = Math.max(0, camera.width / camera.zoom - WORLD.width), extraH = Math.max(0, camera.height / camera.zoom - WORLD.height); camera.setBounds(-extraW / 2, -extraH / 2, WORLD.width + extraW, WORLD.height + extraH); }
    camera.setLerp(settings.reducedMotion ? 1 : settings.cameraSmoothness, settings.reducedMotion ? 1 : settings.cameraSmoothness);
    if (this.autoInteract && !state.window) {
      const employee = world.employees.find(e => e.id === this.autoInteract && (e.employmentStatus === 'active' || e.corpsePresent));
      if (employee) {
        if (employee.employmentStatus === 'active' && !this.approachHeld && !this.approachPending && distance(this.player, employee.position) < 44) {
          const id = employee.id; this.approachPending = id; this.path = [];
          void this.syncPosition().then(() => api<{ employee: Employee }>(`/employees/${id}/interact`, { hold: true })).then(({ employee: stopped }) => {
            if (this.autoInteract !== id) { if (useGame.getState().window?.id !== id) void api(`/employees/${id}/interact`, { hold: false }).catch(() => {}); return; }
            this.approachHeld = { id, position: { ...stopped.position } }; this.lastApproach = -Infinity;
          }).catch(() => {}).finally(() => { if (this.approachPending === id) this.approachPending = undefined; });
        }
        const position = this.approachHeld?.id === employee.id ? this.approachHeld.position : employee.position;
        if (!this.approachPending && time - this.lastApproach > 250) {
          this.lastApproach = time;
          for (let slot = 1; slot <= 6; slot++) { const goal = nearbyWalkable(position, slot); if (!clearShot(goal, position)) continue; const path = findPath(this.player, goal); if (path.length || distance(this.player, goal) < 6) { this.path = path; break; } }
        }
      }
    }
    let dx = 0, dy = 0;
    if (state.window || !state.entered) { this.keys.clear(); this.path = []; if (this.autoInteract) this.cancelApproach(); }
    else {
      dx = Number(this.keys.has(settings.keys.right) || this.keys.has('arrowright')) - Number(this.keys.has(settings.keys.left) || this.keys.has('arrowleft'));
      dy = Number(this.keys.has(settings.keys.down) || this.keys.has('arrowdown')) - Number(this.keys.has(settings.keys.up) || this.keys.has('arrowup'));
      if (dx || dy) { this.path = []; if (this.autoInteract) this.cancelApproach(); }
      else if (this.path.length) { const p = this.path[0]; dx = p.x - this.player.x; dy = p.y - this.player.y; if (Math.hypot(dx, dy) < 5) { this.path.shift(); dx = 0; dy = 0; } }
      if (dx || dy) { const speed = this.keys.has('shift') ? 280 : { normal: 168, fast: 192, 'very fast': 232 }[settings.playerSpeed] + ((world.player.caffeinatedUntil || 0) > Date.now() ? 24 : 0); const len = Math.hypot(dx, dy), step = Math.min(speed * dt, this.path.length ? len : Infinity); const p = moveWithCollision(this.player, dx / len * step, dy / len * step); this.player.setPosition(p.x, p.y); this.direction = this.facing(dx, dy); }
    }
    const attacking = Date.now() - this.lastAttack < (world.player.equipped === 'rifle' ? 100 : 210);
    const playerKey = characterTextures(this, world.player.appearance, true); this.player.setTexture(`${playerKey}-${this.direction}-${attacking ? Date.now() - this.lastAttack < 70 ? 1 : 2 : dx || dy ? Math.floor(time / (this.keys.has('shift') ? 75 : 110)) % 3 : Math.floor(time / 2500) % 5 === 0 ? 3 : 0}`).setDepth(this.player.y).setAngle(attacking && !settings.reducedMotion ? (this.direction === 1 ? -1 : 1) * 3 : 0);
    if ((dx || dy) && dt && time - this.lastFootstep > (this.keys.has('shift') ? 170 : 260)) { this.lastFootstep = time; audio.play(Math.floor(time / 270) % 2 ? 'footstep' : 'footstep2'); }
    if (time - this.lastSync > 350 && state.entered && state.connected) { this.lastSync = time; void this.syncPosition().catch(() => {}); }
    this.health.clear(); const aimedId = traceAttack(this.player, this.direction, world.player.equipped, world.employees).employeeId; const pointer = camera.getWorldPoint(this.input.activePointer.x, this.input.activePointer.y);
    for (const e of world.employees) {
      const dead = e.employmentStatus === 'deceased' && e.corpsePresent;
      if (e.employmentStatus !== 'active' && !dead && e.state !== 'leaving') { const a = this.actors.get(e.id); if (a) { a.sprite.destroy(); a.bubble.destroy(); a.label.destroy(); this.actors.delete(e.id); } continue; }
      let a = this.actors.get(e.id); const key = characterTextures(this, e.appearance);
      if (!a) { a = { sprite: this.add.image(e.position.x, e.position.y, `${key}-0-0`).setOrigin(.5, .9).setAngle(dead ? 90 : 0).setData('employeeId', e.id), label: this.add.text(0, 0, '', { fontFamily: 'Silkscreen', fontSize: '7px', color: '#f3e4bd', backgroundColor: '#294237', padding: { x: 4, y: 2 } }).setOrigin(.5, 0).setDepth(2200), bubble: this.add.text(0, 0, '', { fontFamily: 'Silkscreen', fontSize: '7px', color: '#2b4338', backgroundColor: '#ece1b8', padding: { x: 5, y: 4 }, wordWrap: { width: 150 }, align: 'center' }).setOrigin(.5, 1).setDepth(2300), direction: 0, key, dead }; this.actors.set(e.id, a); }
      const hpVisible = e.id === aimedId || e.id === this.target?.id || distance(pointer, a.sprite) < 26 || Date.now() - (e.damagedAt || 0) < 8000 || !!e.tortureId;
      a.sprite.setData('hpVisible', hpVisible).setData('corpse', dead);
      if (hpVisible) { const hx = Math.round(a.sprite.x) - 17, hy = Math.round(a.sprite.y) - (dead ? 22 : 48); this.health.fillStyle(0x172d25).fillRect(hx - 1, hy - 1, 36, 7); this.health.fillStyle(0x8b9b78).fillRect(hx, hy, 34, 5); this.health.fillStyle(0x493a37).fillRect(hx + 1, hy + 1, 32, 3); this.health.fillStyle(e.currentHp <= 30 ? 0xdb896f : 0xb8d38a).fillRect(hx + 1, hy + 1, Math.round(32 * e.currentHp / e.maxHp), 3); }
      if (dead) { if (!a.dead) { a.dead = true; if (settings.reducedMotion) a.sprite.setAngle(90); else this.tweens.add({ targets: a.sprite, angle: 90, duration: 230, ease: 'Stepped', easeParams: [3] }); } a.sprite.setTexture(`${key}-0-0`).setPosition(e.position.x, e.position.y).setTint(0xb1ac9a).setDepth(e.position.y - 4); a.label.setText(`${e.name} · DECEASED`).setPosition(e.position.x, e.position.y + 12).setVisible(distance(this.player, e.position) < 100); a.bubble.setVisible(false); continue; }
      if (a.dead) { this.tweens.killTweensOf(a.sprite); a.dead = false; a.sprite.setAngle(0).setAlpha(1); this.combatFX.restore(e.position); }
      const position = this.approachHeld?.id === e.id ? this.approachHeld.position : e.position;
      const ax = position.x - a.sprite.x, ay = position.y - a.sprite.y, moving = Math.hypot(ax, ay) > 1;
      a.sprite.x += ax * Math.min(1, dt * 14); a.sprite.y += ay * Math.min(1, dt * 14); if (moving) a.direction = this.facing(ax, ay);
      if (state.window?.id === e.id && ['employee', 'chat', 'assign'].includes(state.window.screen)) a.direction = this.facing(this.player.x - a.sprite.x, this.player.y - a.sprite.y);
      const work = ['working', 'terminal', 'reading'].includes(e.state); const hurt = (e.hurtUntil || 0) > Date.now();
      const sitting = !moving && (work || e.state === 'meeting' || e.state === 'torture'); const talking = state.window?.id === e.id && ['employee', 'chat', 'assign'].includes(state.window.screen); const direction = talking ? a.direction : e.state === 'meeting' ? this.facing(784 - a.sprite.x, 212 - a.sprite.y) : work ? 2 : a.direction;
      a.sprite.setTexture(`${key}-${sitting ? 'sit-' : ''}${direction}-${moving || work ? Math.floor(time / (work ? settings.animationSpeed === 'fast' ? 140 : 240 : 115)) % 3 : 0}`).setDepth(a.sprite.y).setAlpha(e.state === 'leaving' && e.position.x > 1180 ? .5 : 1);
      a.sprite.setTint(hurt && settings.damageFlash ? 0xffb38f : 0xffffff); a.sprite.setAngle(hurt && !settings.reducedMotion ? Math.sin(time / 45) * 12 : 0);
      a.label.setText(e.name + (work ? ' ···' : '')).setPosition(a.sprite.x, a.sprite.y + 6).setVisible(distance(this.player, a.sprite) < 100 || work || e.state === 'blocked');
      const caption = hurt ? '★ Seriously?! ★' : e.bubbleUntil > Date.now() ? e.bubble : e.state === 'torture' ? '! HR, PLEASE.' : e.stress > 80 ? '... deeply stressed ...' : e.state === 'blocked' ? '! PROVIDER ERROR' : work ? e.state === 'reading' ? 'Reading…' : e.state === 'terminal' ? '>_ running tool' : 'Working…' : e.state === 'waiting' ? '! Needs permission' : '';
      a.bubble.setText(caption).setPosition(a.sprite.x, a.sprite.y - 40).setVisible(!!caption && state.window?.id !== e.id);
    }
    const targets = [...world.employees.filter(e => e.employmentStatus === 'active' || e.employmentStatus === 'deceased' && e.corpsePresent).map(e => ({ id: e.id, action: 'employee', label: e.employmentStatus === 'deceased' ? `Resolve ${e.name}’s case` : `Talk to ${e.name}`, point: this.approachHeld?.id === e.id ? this.approachHeld.position : this.actors.get(e.id)?.sprite || e.position })), ...furniture.filter(f => f.action && f.point).map(f => ({ id: f.id, action: f.action!, label: f.label!, point: f.point! }))];
    const reachable = targets.filter(t => distance(this.player, t.point) < 46 && clearShot(this.player, t.point));
    this.target = reachable.find(t => t.id === this.autoInteract) || reachable.sort((a, b) => distance(this.player, a.point) - distance(this.player, b.point))[0];
    if (this.autoInteract && this.target?.id === this.autoInteract && !state.window) { const employee = world.employees.find(e => e.id === this.autoInteract); const position = this.approachHeld?.id === employee?.id ? this.approachHeld!.position : employee?.position; if (!employee || position && (employee.employmentStatus === 'deceased' || this.approachHeld?.id === employee.id) && distance(this.player, position) <= 38 && Math.min(Math.abs(this.player.x - position.x), Math.abs(this.player.y - position.y)) <= 10) this.interact(); }
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
    if (time - this.printedAt < 2500 && this.printedAt) this.effects.fillStyle(0xeee3bd).fillRect(672, 697, 24, 8 + Math.floor((time - this.printedAt) / 180) % 16);
    for (const attack of state.attacks) if (!this.seenFX.has(attack.id)) { this.seenFX.add(attack.id); this.combatFX.confirm(attack, settings, this.player); if (this.seenFX.size > 256) this.seenFX.delete(this.seenFX.values().next().value!); }
    this.combatFX.render(delta, settings, this.player, this.direction, world.player.equipped, state.entered && !state.window);
    const machine = world.tortureSessions.find(s => s.status === 'active'); const machineEmployee = world.employees.find(e => e.id === machine?.employeeId);
    audio.machine(state.entered && machine && machineEmployee && distance(this.player, machineEmployee.position) < 300 ? machine.method : undefined);
    if (machine) { const phase = settings.reducedMotion ? 0 : Math.floor(time / 110) % 4; this.effects.fillStyle(machine.method === 'shock' ? 0x96d7d6 : 0xdbc486).fillRect(1148, 672, 5, 5); this.effects.fillStyle(machine.method === 'meeting' ? 0xaec99a : 0xd19076, .7).fillRect(985 + phase * 2, 682, 15, 4); if (machine.method === 'paperwork') this.effects.fillStyle(0xe7dbb6).fillRect(1020, 690 + phase * 3, 10, 8); }
    if (settings.weather && !settings.reducedMotion) { this.weather.clear().lineStyle(1, 0xb7d3cc, .45); for (const x of [104, 416, 736, 1112]) for (let i = 0; i < 10; i++) { const y = 61 + (time / 70 + i * 4) % 36; this.weather.lineBetween(x + i * 9, y, x + i * 9 - 2, y + 4); } } else this.weather.clear();
    const event = state.lastEvent;
    if (event && event.id !== this.lastEvent) {
      this.lastEvent = event.id;
      if (['task.completed', 'schedule.finished'].includes(event.type) && world.tasks.find(t => t.id === event.entityId)?.scheduled?.outputDestination !== 'laptop') this.printedAt = time;
      const sound = event.type === 'task.completed' || event.type === 'schedule.finished' ? 'complete' : event.type === 'schedule.started' ? 'scheduled' : event.type === 'task.created' ? 'assigned' : event.type === 'task.failed' || event.type === 'provider.failed' ? 'warning' : event.type === 'employee.revived' ? 'revive' : event.type === 'employee.healed' ? 'heal' : event.type === 'torture.started' ? 'alarm' : event.type === 'meeting.started' ? 'meeting' : event.type === 'meeting.completed' ? 'confirm' : event.type === 'report.delivered' ? 'printer' : event.type === 'chat.completed' ? 'message' : event.type === 'settings.saved' ? 'save' : undefined;
      if (sound && event.notify !== false) audio.play(sound);
      if (['employee.revived', 'employee.healed'].includes(event.type)) { const e = world.employees.find(e => e.id === event.entityId); if (e) this.combatFX.restore(e.position); }
    }
    if (time - this.lastStep > 1300 && world.employees.some(e => e.state === 'working')) { this.lastStep = time; audio.play('keyboard'); }
  }
}
