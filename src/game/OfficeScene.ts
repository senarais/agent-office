import Phaser from 'phaser';
import { createOfficeArt, createCharacterTextures } from './art';
import { FURNITURE, WORLD } from '../data/office';
import { findPath, moveWithCollision } from './pathfinding';
import { useOfficeStore } from '../store/useOfficeStore';
import { officeAudio } from '../lib/audio';
import type { Point, Agent } from '../types';

interface Actor { sprite: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; bubble: Phaser.GameObjects.Text; path: Point[]; target: string; direction: number }
export const INTERACTION_LABELS: Record<string, string> = { coffee: 'Make a little coffee', jukebox: 'Tune into Abisena Radio', whiteboard: 'Open the task board', printer: 'Collect team reports', 'meeting-table': 'Gather the team', sign: 'A little company secret' };

export class OfficeScene extends Phaser.Scene {
  private actors = new Map<string, Actor>();
  private director!: Phaser.GameObjects.Image;
  private directorDirection = 0;
  private keys = new Set<string>();
  private ring!: Phaser.GameObjects.Graphics;
  private paths!: Phaser.GameObjects.Graphics;
  private effects!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Rectangle;
  private statusText!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
  private syncAt = 0;
  private zoomLevel = 1;
  private lastSimTime = 0;
  private hovered: string | null = null;
  private keydown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"]') || useOfficeStore.getState().modal || useOfficeStore.getState().view !== 'office') return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key) && !target.closest('button')) e.preventDefault();
    this.keys.add(e.key.toLowerCase());
    if ((e.key.toLowerCase() === 'e' || (e.code === 'Space' && !target.closest('button'))) && !e.repeat) {
      const id = useOfficeStore.getState().interaction;
      if (id) { officeAudio.play(id === 'coffee' ? 'coffee' : 'open'); useOfficeStore.getState().interact(id); }
    }
  };
  private keyup = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); };
  private blur = () => this.keys.clear();
  constructor() { super('office'); }

  create() {
    const state = useOfficeStore.getState();
    createOfficeArt(this); createCharacterTextures(this, state.agents);
    this.add.image(0, 0, 'office-floor').setOrigin(0).setDepth(0);
    for (const f of FURNITURE) {
      const object = this.add.image(f.x - 10, f.y - 34, `f-${f.id}`).setOrigin(0).setDepth(f.y + f.h);
      const interactive = INTERACTION_LABELS[f.id] || f.agentId;
      if (interactive) {
        object.setInteractive({ useHandCursor: true });
        object.on('pointerover', () => { this.hovered = f.id; object.setTint(0xeaffce); });
        object.on('pointerout', () => { this.hovered = null; object.clearTint(); });
        object.on('pointerdown', () => {
          const current = useOfficeStore.getState();
          if (current.modal || current.reportId) return;
          officeAudio.play(f.id === 'coffee' ? 'coffee' : 'open'); current.interact(f.agentId ?? f.id);
        });
      }
    }
    this.add.zone(520, 42, 450, 53).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      const current = useOfficeStore.getState(); if (!current.modal && !current.reportId) current.interact('sign');
    });
    this.paths = this.add.graphics().setDepth(2);
    this.ring = this.add.graphics().setDepth(1000);
    this.effects = this.add.graphics().setDepth(1100);
    for (const a of state.agents) {
      const sprite = this.add.image(a.position.x, a.position.y, `${a.id}-0-0`).setOrigin(0.5, 0.91).setScale(1.2).setInteractive({ useHandCursor: true });
      const label = this.add.text(a.position.x, a.position.y + 12, a.name, { fontFamily: 'Silkscreen', fontSize: '11px', color: '#f5e9c8', backgroundColor: '#273e32dd', padding: { x: 5, y: 3 } }).setOrigin(0.5).setDepth(1002);
      const bubble = this.add.text(a.position.x, a.position.y - 54, '', { fontFamily: 'DM Sans', fontSize: '11px', color: '#2c3b30', backgroundColor: '#f0e8ce', padding: { x: 8, y: 5 } }).setOrigin(0.5, 1).setDepth(1200);
      sprite.on('pointerdown', () => {
        const current = useOfficeStore.getState();
        if (!current.modal && !current.reportId) { current.selectAgent(a.id); officeAudio.play('open'); }
      });
      sprite.on('pointerover', () => { this.hovered = a.id; }); sprite.on('pointerout', () => { this.hovered = null; });
      this.actors.set(a.id, { sprite, label, bubble, path: [], target: '', direction: 0 });
    }
    this.director = this.add.image(state.player.x, state.player.y, 'director-0-0').setOrigin(0.5, 0.91).setScale(1.3).setDepth(state.player.y);
    this.prompt = this.add.text(0, 0, '', { fontFamily: 'DM Sans', fontSize: '12px', color: '#e8ebd5', backgroundColor: '#20382bef', padding: { x: 10, y: 7 } }).setOrigin(0.5, 0).setDepth(2001).setVisible(false);
    this.overlay = this.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x162a33, 0.08).setOrigin(0).setDepth(1500);
    this.statusText = this.add.text(904, 202, '', { fontFamily: 'Silkscreen', fontSize: '10px', color: '#b4cd95', align: 'center' }).setOrigin(0.5, 0).setDepth(999);
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
    window.addEventListener('keydown', this.keydown); window.addEventListener('keyup', this.keyup); window.addEventListener('blur', this.blur);
    this.events.once('shutdown', () => { window.removeEventListener('keydown', this.keydown); window.removeEventListener('keyup', this.keyup); window.removeEventListener('blur', this.blur); useOfficeStore.getState().setInteraction(null); });
  }
  zoomBy(amount: number) {
    this.zoomLevel = Phaser.Math.Clamp(this.zoomLevel + amount, 1, 2);
    this.cameras.main.setZoom(this.zoomLevel);
    if (this.zoomLevel > 1) this.cameras.main.startFollow(this.director, true, 0.08, 0.08);
    else { this.cameras.main.stopFollow(); this.cameras.main.setScroll(0, 0); }
    return this.zoomLevel;
  }
  snapshot() { this.game.renderer.snapshot(image => { if (image instanceof HTMLImageElement) { const link = document.createElement('a'); link.href = image.src; link.download = 'a-day-at-abisena.png'; link.click(); } }); }

  update(time: number, delta: number) {
    if (!this.director) return;
    const state = useOfficeStore.getState(), { settings } = state;
    if (state.simTime < this.lastSimTime) {
      this.director.setPosition(state.player.x, state.player.y);
      state.agents.forEach(a => { const actor = this.actors.get(a.id)!; actor.sprite.setPosition(a.position.x, a.position.y); actor.target = ''; });
    }
    this.lastSimTime = state.simTime;
    const dt = Math.min(delta, 200) / 1000;
    this.input.enabled = !state.modal && !state.reportId;
    this.overlay.setAlpha(settings.dayMode ? 0 : 0.09);
    this.ring.clear(); this.paths.clear(); this.effects.clear();
    this.updatePlayer(dt, time);
    const positions: Record<string, Point> = {};
    for (const agent of state.agents) {
      const actor = this.actors.get(agent.id)!;
      if (!settings.autoplay) { actor.sprite.setPosition(agent.position.x, agent.position.y); actor.target = ''; }
      const target = `${agent.destination.x}:${agent.destination.y}`;
      if (target !== actor.target) { actor.target = target; actor.path = findPath(actor.sprite, agent.destination); }
      let walking = false;
      if (!state.paused && settings.autoplay && !agent.paused && actor.path.length) {
        const to = actor.path[0], dx = to.x - actor.sprite.x, dy = to.y - actor.sprite.y, distance = Math.hypot(dx, dy);
        const speed = 47 * settings.simulationSpeed * dt;
        if (distance <= speed) { actor.sprite.setPosition(to.x, to.y); actor.path.shift(); }
        else { actor.sprite.x += dx / distance * speed; actor.sprite.y += dy / distance * speed; }
        walking = true; actor.direction = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 3) : (dy < 0 ? 2 : 0);
      }
      const idleFrame = (time + state.agents.indexOf(agent) * 650) % 5200 > 5000 ? 3 : 0;
      const frame = settings.reducedMotion || state.paused ? 0 : walking ? Math.floor(time / (140 / settings.animationSpeed)) % 2 + 1 : idleFrame;
      actor.sprite.setTexture(`${agent.id}-${actor.direction}-${frame}`).setDepth(actor.sprite.y);
      actor.sprite.setAlpha(settings.focusMode && agent.state !== 'working' ? 0.5 : 1);
      actor.label.setPosition(actor.sprite.x, actor.sprite.y + 10);
      actor.label.setText(`${agent.paused ? 'Ⅱ ' : agent.state === 'blocked' ? '! ' : ''}${agent.name}`);
      const selected = agent.id === state.selectedAgentId || this.hovered === agent.id;
      actor.label.setColor(selected ? '#d3edb2' : '#eee2c5');
      if (selected) {
        this.ring.lineStyle(2, 0xc4e9a1, 0.9); this.ring.strokeEllipse(actor.sprite.x, actor.sprite.y - 2, 36, 12);
        this.ring.fillStyle(0xc4e9a1); this.ring.fillTriangle(actor.sprite.x - 4, actor.sprite.y - 53, actor.sprite.x + 4, actor.sprite.y - 53, actor.sprite.x, actor.sprite.y - 48);
      }
      this.agentEffects(actor, agent, time, walking);
      const showBubble = settings.speechBubbles && (this.hovered === agent.id || (Math.floor(time / 5000) % 8 === state.agents.indexOf(agent) && time % 5000 < 3300));
      actor.bubble.setText(agent.bubble).setPosition(actor.sprite.x, actor.sprite.y - 58).setVisible(showBubble);
      if (settings.pathLines && actor.path.length) {
        this.paths.lineStyle(1, Phaser.Display.Color.HexStringToColor(agent.color).color, 0.65);
        this.paths.beginPath(); this.paths.moveTo(actor.sprite.x, actor.sprite.y); actor.path.forEach(p => this.paths.lineTo(p.x, p.y)); this.paths.strokePath();
      }
      positions[agent.id] = { x: actor.sprite.x, y: actor.sprite.y };
    }
    const completed = state.tasks.filter(t => t.status === 'done').length;
    const wallModes = [`${completed} GOOD THINGS\nDELIVERED`, `${state.agents.filter(a => a.state === 'working').length} MINDS\nAT WORK`, 'SMALL TEAM.\nBIG HEART.'];
    this.statusText.setText(wallModes[Math.floor(time / 8000) % 3]);
    const clock = new Date();
    const hand = (value: number, length: number, width: number) => {
      const angle = value * Math.PI * 2 - Math.PI / 2;
      this.effects.lineStyle(width, 0x53614e);
      this.effects.lineBetween(882, 385, Math.round(882 + Math.cos(angle) * length), Math.round(385 + Math.sin(angle) * length));
    };
    hand(clock.getMinutes() / 60, 7, 1); hand((clock.getHours() % 12 + clock.getMinutes() / 60) / 12, 5, 2);
    // Living details: server LEDs, coffee steam, printer page, warm signage.
    if (!settings.reducedMotion && !state.paused) {
      this.effects.fillStyle(0xcce8a1, 0.5 + Math.sin(time / 1200) * 0.2); this.effects.fillRect(843, 118, 3, 3); this.effects.fillRect(903, 131, 3, 3);
      for (let i = 0; i < 3; i++) { this.effects.fillStyle(0xe9e4c8, 0.25); this.effects.fillRect(87 + Math.sin(time / 800 + i) * 3, 363 - ((time / 120 + i * 6) % 18), 2, 4); }
      if (state.tasks.some(t => t.status === 'review')) { this.effects.fillStyle(0xf0e7c8); this.effects.fillRect(860, 308 + Math.sin(time / 300) * 2, 20, 10); }
    }
    this.updateInteraction();
    if (time - this.syncAt > 400) { this.syncAt = time; state.updatePositions(positions); state.setPlayer({ x: this.director.x, y: this.director.y }); }
  }
  private agentEffects(actor: Actor, agent: Agent, time: number, walking: boolean) {
    if (walking) return;
    const x = actor.sprite.x, y = actor.sprite.y;
    if (agent.state === 'working') {
      this.effects.fillStyle(0xc8e9a5, 0.85);
      const step = useOfficeStore.getState().settings.reducedMotion ? 0 : Math.floor(time / 300) % 3;
      for (let i = 0; i < 3; i++) this.effects.fillRect(x + 18 + i * 4, y - 29 - (step === i ? 3 : 0), 2, 2);
    } else if (agent.state === 'blocked') {
      this.effects.fillStyle(0xe6af80); this.effects.fillRect(x + 18, y - 38, 4, 9); this.effects.fillRect(x + 18, y - 26, 4, 3);
    } else if (agent.state === 'task complete') {
      this.effects.fillStyle(0xd8e9ac); this.effects.fillRect(x + 19, y - 34, 3, 7); this.effects.fillRect(x + 22, y - 38, 3, 11);
    }
  }
  private updatePlayer(dt: number, time: number) {
    const state = useOfficeStore.getState();
    if (state.modal) this.keys.clear();
    const x = Number(this.keys.has('d') || this.keys.has('arrowright')) - Number(this.keys.has('a') || this.keys.has('arrowleft'));
    const y = Number(this.keys.has('s') || this.keys.has('arrowdown')) - Number(this.keys.has('w') || this.keys.has('arrowup'));
    const moving = !!(x || y) && !state.modal;
    if (moving) {
      const speed = 105 * (this.keys.has('shift') ? 1.5 : 1) * (state.caffeinatedUntil > Date.now() ? 1.2 : 1) * dt;
      const length = Math.hypot(x, y);
      const p = moveWithCollision(this.director, x / length * speed, y / length * speed);
      this.director.setPosition(p.x, p.y);
      this.directorDirection = Math.abs(x) > Math.abs(y) ? (x < 0 ? 1 : 3) : (y < 0 ? 2 : 0);
    }
    const frame = state.settings.reducedMotion ? 0 : moving ? Math.floor(time / (120 / state.settings.animationSpeed)) % 2 + 1 : time % 5200 > 5000 ? 3 : 0;
    this.director.setTexture(`director-${this.directorDirection}-${frame}`).setDepth(this.director.y);
    this.ring.lineStyle(1, 0xf1d999, 0.8); this.ring.strokeEllipse(this.director.x, this.director.y - 2, 32, 11);
  }
  private updateInteraction() {
    const state = useOfficeStore.getState();
    const targets = [...[...this.actors].map(([id, actor]) => ({ id, x: actor.sprite.x, y: actor.sprite.y, label: `Talk to ${state.agents.find(a => a.id === id)?.name}` })),
      ...FURNITURE.filter(f => INTERACTION_LABELS[f.id] || f.agentId).map(f => ({ id: f.agentId ?? f.id, x: f.x + f.w / 2, y: f.y + f.h + 8, label: INTERACTION_LABELS[f.id] ?? 'Check this desk' }))];
    const nearest = targets.map(t => ({ ...t, d: Math.hypot(t.x - this.director.x, t.y - this.director.y) })).filter(t => t.d < 58).sort((a, b) => a.d - b.d)[0];
    const id = nearest?.id ?? null;
    if (id !== state.interaction) state.setInteraction(id);
    this.prompt.setVisible(!!nearest && !state.modal);
    if (nearest) this.prompt.setText(`[E]  ${nearest.label}`).setPosition(Phaser.Math.Clamp(this.director.x, 130, 910), this.director.y + 23);
  }
}
