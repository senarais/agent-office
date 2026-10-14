import type Phaser from 'phaser';
import type { Appearance } from '../../../../packages/shared/src/types';
import { WORLD, rooms, walls, furniture } from '../../../../packages/shared/src/world';
import type { Furniture } from '../../../../packages/shared/src/world';
type Ctx = CanvasRenderingContext2D;
const rect = (c: Ctx, color: string, x: number, y: number, w: number, h: number) => { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), w, h); };
const text = (c: Ctx, value: string, x: number, y: number, size = 9, color = '#e9e2c6') => { c.font = `${size}px Silkscreen`; c.fillStyle = color; c.fillText(value, x, y); };
function texture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Ctx) => void) { if (scene.textures.exists(key)) return; const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d')!; ctx.imageSmoothingEnabled = false; draw(ctx); scene.textures.addCanvas(key, canvas); }
export const appearanceKey = (a: Appearance) => Object.values(a).join('').replace(/#/g, '');
export function drawCharacter(c: Ctx, a: Appearance, frame = 0, dir = 0, boss = false, sitting = false) {
  const step = frame === 1 ? 2 : frame === 2 ? -2 : 0; c.save(); c.translate(0, step ? -1 : 0);
  rect(c, '#1e302b66', 4, 35, 23, 4);
  rect(c, a.bottom, 8, 27, 6, (sitting ? 5 : 9) + Math.max(step, 0)); rect(c, a.bottom, 17, 27, 6, (sitting ? 5 : 9) - Math.min(step, 0));
  if (a.skirt) { rect(c, a.bottom, 7, 26, 17, 7); rect(c, a.bottom, 5, 30, 21, 3); }
  rect(c, a.shoes, 7, (sitting ? 31 : 35) + Math.max(step, 0), 7, 3); rect(c, a.shoes, 17, (sitting ? 31 : 35) - Math.min(step, 0), 7, 3);
  rect(c, a.jacket, 6, 18, 19, 13); rect(c, a.shirt, 12, 18, 7, 13); rect(c, '#13282730', 6, 28, 19, 3);
  rect(c, a.jacket, 3, 19 + step, 4, 8); rect(c, a.skin, 3, 26 + step, 4, 4); rect(c, a.jacket, 25, 19 - step, 4, 8); rect(c, a.skin, 25, 26 - step, 4, 4);
  rect(c, '#233b35', 7, 5, 17, 15); rect(c, a.skin, 8, 5, 15, 14); rect(c, '#6f3c3125', 8, 16, 15, 3);
  if (a.hairstyle !== 'bald') { rect(c, a.hair, 7, 3, 17, 6); rect(c, a.hair, 6, 7, 4, 6); rect(c, a.hair, 22, 7, 3, a.hairstyle === 'long' ? 18 : 6); if (dir === 2) rect(c, a.hair, 8, 8, 15, a.hairstyle === 'long' ? 17 : 9); if (a.hairstyle === 'long') rect(c, a.hair, 5, 8, 4, 17); if (a.hairstyle === 'spiky') for (let x = 7; x < 24; x += 5) rect(c, a.hair, x, 0, 3, 5); }
  if (dir !== 2) { if (dir !== 3) rect(c, '#293a34', 11, 11, 2, frame === 3 ? 1 : 3); if (dir !== 1) rect(c, '#293a34', 19, 11, 2, frame === 3 ? 1 : 3); rect(c, '#a5695c', dir === 1 ? 10 : 15, 17, 4, 1); if (a.glasses) { rect(c, '#334b51', 9, 10, 14, 1); rect(c, '#334b51', 9, 11, 1, 4); rect(c, '#334b51', 16, 11, 1, 4); rect(c, '#334b51', 23, 11, 1, 4); rect(c, '#334b51', 10, 15, 5, 1); rect(c, '#334b51', 18, 15, 5, 1); } }
  if (a.hat) { rect(c, '#b59564', 8, 0, 15, 5); rect(c, '#ddc58c', 4, 4, 24, 3); }
  if (a.accessory) { rect(c, '#ead891', 21, 21, 3, 4); }
  if (boss) { rect(c, '#dfbc70', 14, 19, 3, 7); rect(c, '#efdb9b', 14, 19, 3, 2); }
  c.restore();
}
export function characterTextures(scene: Phaser.Scene, a: Appearance, boss = false) { const key = `${boss ? 'boss' : 'person'}-${appearanceKey(a)}`; if (!scene.textures.exists(`${key}-0-0`)) for (let dir = 0; dir < 4; dir++) for (let frame = 0; frame < 4; frame++) { texture(scene, `${key}-${dir}-${frame}`, 32, 42, c => drawCharacter(c, a, frame, dir, boss)); if (!boss) texture(scene, `${key}-sit-${dir}-${frame}`, 32, 42, c => drawCharacter(c, a, frame, dir, false, true)); } return key; }
function rug(c: Ctx, x: number, y: number, w: number, h: number, col: string) { rect(c, '#21383125', x + 4, y + 5, w, h); rect(c, col, x, y, w, h); c.strokeStyle = '#efdfb363'; c.lineWidth = 2; c.strokeRect(x + 6, y + 6, w - 12, h - 12); for (let i = x + 15; i < x + w - 8; i += 16) for (let j = y + 15; j < y + h - 8; j += 16) rect(c, '#efe1b532', i, j, 2, 2); }
export function createOfficeArt(scene: Phaser.Scene) {
  texture(scene, 'floor', WORLD.width, WORLD.height, c => {
    rect(c, '#20382e', 0, 0, WORLD.width, WORLD.height);
    for (let i = 0; i < 250; i++) rect(c, i % 3 ? '#405440' : '#667649', i * 137 % 1280, i * 83 % 832, 3, 4);
    rect(c, '#233c3020', 28, 78, 1240, 746); rect(c, '#b6a078', 32, 80, 1216, 736);
    for (let y = 80; y < 816; y += 16) for (let x = 32; x < 1248; x += 48) { const off = y % 32 ? 24 : 0; rect(c, ['#b49b72', '#af9670', '#bba37b', '#b39c76'][(x / 16 + y / 16) % 4], x + off, y, Math.min(47, 1248 - x - off), 15); rect(c, '#dcc29255', x + off + 7, y + 5, 24, 1); }
    rect(c, '#65755b33', 32, 354, 1216, 84);
    for (let x = 64; x < 1240; x += 32) { rect(c, '#e8d5a44a', x, 368, 6, 2); rect(c, '#e8d5a44a', x, 424, 6, 2); }
    for (const room of rooms) { if (room.id === 'torture') { rect(c, '#4c5652', room.x, room.y, room.w, room.h); rug(c, room.x + 12, room.y + 16, room.w - 24, room.h - 34, room.color); for (let x = room.x; x < room.x + room.w; x += 16) rect(c, x % 32 ? '#c7ad6f' : '#3c4140', x, room.y - 4, 10, 5); } else rug(c, room.x + 34, room.y + 92, room.w - 68, room.h - 124, room.color); }
    for (const w of walls) { rect(c, '#24392d30', w.x + 5, w.y + 6, w.w, w.h + 4); rect(c, '#3c584a', w.x, w.y - 20, w.w, w.h + 20); rect(c, '#8ea189', w.x, w.y - 23, w.w, 5); rect(c, '#627e65', w.x, w.y - 18, w.w, 5); }
    for (const x of [104, 416, 736, 1112]) { rect(c, '#293e39', x - 4, 57, 100, 49); rect(c, '#b8cec0', x, 60, 92, 37); rect(c, '#87aaa0', x, 80, 92, 17); for (let i = 0; i < 80; i += 14) rect(c, '#709488', x + i, 76 + i % 9, 11, 21 - i % 9); rect(c, '#e2dbc0', x + 43, 60, 4, 39); rect(c, '#e2dbc0', x, 77, 92, 3); rect(c, '#ddd4b3', x - 6, 100, 104, 5); }
    rect(c, '#20392d', 360, 7, 560, 36); rect(c, '#7e9477', 360, 7, 560, 3); rect(c, '#c1d69b', 372, 14, 37, 24); text(c, 'PT', 379, 32, 17, '#293f30'); text(c, 'ABISENA RAIS JAYA', 424, 32, 19); text(c, 'BUILDING COMPANIES, ONE AGENT AT A TIME.', 428, 52, 8, '#bdd0a8');
    text(c, 'PANTRY', 58, 632, 8, '#435443'); text(c, 'THE LITTLE LOUNGE', 158, 757, 7, '#435443');
    rect(c, '#415947', 360, 465, 122, 35); rect(c, '#e2d4ae', 364, 469, 114, 27); ['#c79481', '#d8bd73', '#84a39e', '#81916d'].forEach((col, i) => rect(c, col, 370 + i * 26, 473, 20, 18));
    rect(c, '#334c3d', 971, 468, 72, 20); rect(c, '#91a17b', 971, 465, 72, 3);
    rect(c, '#334c3d', 1056, 461, 126, 32); text(c, 'PT / DIRECTOR', 1067, 481, 9, '#e6d29b');
    rect(c, '#e0d6b5', 283, 84, 24, 24); rect(c, '#445847', 295, 88, 2, 11); rect(c, '#445847', 291, 98, 6, 2);
    text(c, 'WELCOME, GOOD HUMAN.', 533, 778, 9, '#394b3c'); text(c, 'EXIT →', 1162, 795, 10, '#425543');
    for (const room of rooms) text(c, room.name, room.x + 20, room.y + room.h - (room.y === 80 ? 35 : 15), room.id === 'torture' ? 7 : 9, room.id === 'torture' ? '#dac7a1' : '#3d5142');
  });
  for (const f of furniture) furnitureTexture(scene, f);
}
function furnitureTexture(scene: Phaser.Scene, f: Furniture) {
  texture(scene, `f-${f.id}`, f.w + 16, f.h + 52, c => {
    const x = 8, y = 36, w = f.w, h = f.h;
    rect(c, '#263a3036', x + 4, y + h - 7, w + 2, 12);
    if (f.kind === 'desk' || f.kind === 'reception') {
      rect(c, '#4e4938', x + 4, y + h - 10, 6, 17); rect(c, '#4e4938', x + w - 10, y + h - 10, 6, 17); rect(c, '#826440', x, y + 2, w, h - 3); rect(c, '#c3a278', x, y - 8, w, h); rect(c, '#ddbe8c', x, y - 8, w, 4); rect(c, '#765e45', x, y + h - 10, w, 5);
      if (f.kind === 'reception') { text(c, 'PT / RECEPTION', x + 16, y + 11, 10, '#425441'); return; }
      rect(c, '#354b45', x + w / 2 - 21, y - 31, 46, 31); rect(c, '#142f32', x + w / 2 - 17, y - 27, 38, 22); rect(c, '#79b4a0', x + w / 2 - 13, y - 23, 20, 2); rect(c, '#b0d0a5', x + w / 2 - 13, y - 17, 28, 2); rect(c, '#668e7e', x + w / 2 - 13, y - 11, 14, 2); rect(c, '#435449', x + w / 2 - 2, y, 7, 7); rect(c, '#a3ac98', x + w / 2 - 17, y + 9, 40, 10); for (let i = 0; i < 7; i++) rect(c, '#617668', x + w / 2 - 14 + i * 5, y + 11, 3, 5);
      rect(c, '#f2dfb4', x + 8, y + 4, 9, 10); rect(c, '#604735', x + 10, y + 5, 5, 3); rect(c, '#e5d6b4', x + w - 24, y + 6, 16, 20); rect(c, '#92a090', x + w - 21, y + 10, 10, 2);
      rect(c, '#334b45', x + w / 2 - 15, y + h + 2, 34, 8); rect(c, '#6c8b7c', x + w / 2 - 13, y + h - 2, 30, 7);
    } else if (f.kind === 'plant') {
      rect(c, '#a57855', x + 3, y + 4, w - 6, 18); rect(c, '#dbb985', x, y, w, 7); rect(c, '#4d613e', x + 10, y - 27, 4, 30); rect(c, '#6c925d', x - 3, y - 20, 14, 12); rect(c, '#a6b775', x + 10, y - 28, 13, 11); rect(c, '#547e51', x + 12, y - 10, 17, 11); rect(c, '#8daa69', x - 6, y - 9, 18, 8);
    } else if (f.kind === 'shelf' || f.kind === 'cabinet') {
      rect(c, '#5c523a', x, y - 27, w, h + 26); rect(c, '#ba956b', x, y - 30, w, 5);
      for (const row of [y - 22, y + 1]) { rect(c, '#ab885f', x, row + 17, w, 4); if (f.kind === 'shelf') for (let b = 5; b < w - 5; b += 9) { rect(c, ['#90a486', '#c4917d', '#81969c', '#d0b87e'][b % 4], x + b, row + b % 3, 7, 17 - b % 3); rect(c, '#e1d3ac', x + b + 1, row + 8, 5, 1); } else { rect(c, '#b8a27f', x + 4, row, w - 8, 17); rect(c, '#655d47', x + w / 2 - 5, row + 6, 10, 3); } }
    } else if (f.kind === 'table') {
      rect(c, '#5b5842', x + 10, y + h - 10, 6, 16); rect(c, '#5b5842', x + w - 16, y + h - 10, 6, 16); rect(c, '#927249', x, y - 8, w, h); rect(c, '#cbaa79', x, y - 13, w, h - 1); rect(c, '#debe8b', x + 3, y - 10, w - 6, 3); for (let i = 0; i < 3; i++) { rect(c, '#dfd7b9', x + 18 + i * 43, y + 10, 23, 19); rect(c, '#788f7e', x + 21 + i * 43, y + 14, 15, 2); } text(c, 'PT', x + w / 2 - 9, y + 52, 15, '#715d42');
    } else if (f.kind === 'server') {
      rect(c, '#283f41', x, y - 31, w, h + 28); rect(c, '#63807b', x + 3, y - 28, w - 6, 4); for (let row = 0; row < 6; row++) { rect(c, '#47615e', x + 5, y - 17 + row * 11, w - 10, 9); rect(c, '#9bbb77', x + 9, y - 15 + row * 11, 3, 3); rect(c, '#7db8ad', x + 15, y - 15 + row * 11, 3, 3); rect(c, '#20383d', x + 27, y - 15 + row * 11, w - 37, 3); }
    } else if (f.kind === 'rig') {
      rect(c, '#283d3c', x, y - 28, 7, h + 29); rect(c, '#283d3c', x + w - 7, y - 28, 7, h + 29); rect(c, '#8c9b90', x, y - 29, w, 6);
      rect(c, '#ac7566', x + 5, y - 18, 17, 14); rect(c, '#d1997b', x + 7, y - 20, 14, 5); rect(c, '#b7cfc5', x + 49, y - 21, 3, 17);
      rect(c, '#b49b68', x + 25, y - 2, 23, 25); rect(c, '#526f68', x + 28, y + 2, 17, 18); rect(c, '#8da393', x + 21, y + 23, 31, 8);
      rect(c, '#2b4340', x + 30, y + 29, 4, 8); rect(c, '#2b4340', x + 43, y + 29, 4, 8);
      rect(c, '#d3bf81', x + 27, y - 23, 17, 8); text(c, 'HR', x + 30, y - 17, 6, '#3c4b36');
    } else if (f.kind === 'board') {
      rect(c, '#5c5d46', x + 9, y, 4, h + 10); rect(c, '#5c5d46', x + w - 13, y, 4, h + 10); rect(c, '#6f775d', x, y - 35, w, 51); rect(c, '#e0d8b5', x + 4, y - 31, w - 8, 43);
      text(c, f.id === 'projector' ? 'PT / MEETINGS' : 'GOOD THINGS, DONE.', x + 10, y - 18, 7, '#476451'); for (let i = 0; i < 4; i++) { rect(c, ['#a8be94', '#dab883', '#cd9f8c', '#8ba9a0'][i], x + 10 + i * 29, y - 8, 22, 15); rect(c, '#66745366', x + 13 + i * 29, y - 4, 14, 2); }
    } else if (f.kind === 'sofa') {
      rect(c, '#495f51', x, y - 13, w, h + 4); rect(c, '#78937b', x + 3, y - 19, w - 6, 20); rect(c, '#9fb094', x + 9, y + 4, w - 18, 22); rect(c, '#536d58', x + w / 2, y + 4, 2, 22); rect(c, '#8da484', x, y - 3, 10, 34); rect(c, '#8da484', x + w - 10, y - 3, 10, 34);
    } else if (f.kind === 'mirror') {
      rect(c, '#705b43', x, y - 32, w, 55); rect(c, '#bfd2bd', x + 3, y - 29, w - 6, 47); rect(c, '#e5e3c7', x + 7, y - 25, 3, 27); rect(c, '#e5e3c7', x + 11, y - 21, 3, 27);
    } else {
      const col = f.kind === 'coffee' ? '#a07c56' : f.kind === 'jukebox' ? '#b68b65' : '#99a89a';
      rect(c, '#45594e', x, y - 18, w, h + 15); rect(c, col, x + 2, y - 22, w - 4, h + 15); rect(c, '#2a443e', x + 7, y - 14, w - 14, 17); rect(c, '#aec88f', x + 10, y - 10, w - 20, 3);
      if (f.kind === 'printer') { rect(c, '#e7dfc5', x + 12, y - 34, w - 24, 18); rect(c, '#6e867a', x + 17, y - 28, w - 34, 2); rect(c, '#ebdfbd', x + 11, y + 5, w - 22, 20); } else if (f.kind === 'coffee') { rect(c, '#ead6a6', x + 22, y + 8, 12, 12); rect(c, '#5a4034', x + 24, y + 9, 8, 3); } else { for (let j = 0; j < 4; j++) rect(c, '#485749', x + 6, y + 9 + j * 4, w - 12, 2); }
    }
  });
}
