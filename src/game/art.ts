import type Phaser from 'phaser';
import { WORLD, ROOMS, WALLS, FURNITURE } from '../data/office';
import type { Furniture } from '../data/office';
import type { Agent } from '../types';

type Ctx = CanvasRenderingContext2D;
const rect = (c: Ctx, color: string, x: number, y: number, w: number, h: number) => { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), w, h); };
const text = (c: Ctx, value: string, x: number, y: number, size = 10, color = '#e8dfc6') => {
  c.font = `${size}px Silkscreen`; c.fillStyle = color; c.fillText(value, x, y);
};
function texture(scene: Phaser.Scene, key: string, width: number, height: number, draw: (ctx: Ctx) => void) {
  if (scene.textures.exists(key)) return;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const c = canvas.getContext('2d')!; c.imageSmoothingEnabled = false; draw(c); scene.textures.addCanvas(key, canvas);
}

export function drawCharacter(c: Ctx, agent: Pick<Agent, 'skin' | 'hair' | 'color' | 'id'>, frame = 0, direction = 0, director = false) {
  const step = frame === 1 ? 2 : frame === 2 ? -2 : 0;
  const bob = frame === 1 || frame === 2 ? -1 : 0;
  c.save(); c.translate(0, bob);
  rect(c, '#182624', 6, 31, 14, 3);
  rect(c, '#28383c', 8, 26, 5, 6 + Math.max(step, 0));
  rect(c, '#28383c', 15, 26, 5, 6 - Math.min(step, 0));
  rect(c, '#e0d9c3', 7, 31 + Math.max(step, 0), 6, 2);
  rect(c, '#e0d9c3', 15, 31 - Math.min(step, 0), 6, 2);
  rect(c, director ? '#ece4cf' : agent.color, 6, 17, 16, 12);
  rect(c, director ? '#cfc5ad' : '#00000024', 6, 26, 16, 3);
  rect(c, director ? '#e1d6bc' : agent.color, 3, 18 + step, 4, 7);
  rect(c, agent.skin, 3, 24 + step, 4, 4);
  rect(c, director ? '#e1d6bc' : agent.color, 21, 18 - step, 4, 7);
  rect(c, agent.skin, 21, 24 - step, 4, 4);
  rect(c, agent.skin, 7, 5, 15, 13);
  rect(c, '#00000018', 7, 15, 15, 3);
  rect(c, agent.hair, 7, 3, 15, 5);
  rect(c, agent.hair, 5, 6, 4, 7);
  rect(c, agent.hair, 20, 6, 4, direction === 2 ? 13 : 5);
  if (direction === 2) rect(c, agent.hair, 7, 7, 15, 9);
  else {
    if (direction !== 3) rect(c, '#2e3030', 11, frame === 3 ? 11 : 10, 2, frame === 3 ? 1 : 3);
    if (direction !== 1) rect(c, '#2e3030', 18, frame === 3 ? 11 : 10, 2, frame === 3 ? 1 : 3);
    rect(c, '#ad735f', direction === 1 ? 10 : 15, 15, 4, 1);
  }
  if (agent.id === 'nisa' || agent.id === 'sari') {
    rect(c, agent.hair, 4, 8, 3, 13); rect(c, agent.hair, 22, 9, 3, 12);
  }
  if (agent.id === 'bima' && direction !== 2) {
    rect(c, '#395152', 9, 9, 12, 1); rect(c, '#395152', 9, 9, 1, 5); rect(c, '#395152', 15, 9, 1, 5); rect(c, '#395152', 21, 9, 1, 5);
  }
  if (director) {
    rect(c, '#556350', 13, 18, 3, 9); rect(c, '#e6ba68', 18, 20, 3, 3);
    rect(c, '#d4ad63', 7, 1, 16, 4); rect(c, '#f3d897', 8, 0, 3, 3); rect(c, '#f3d897', 14, 0, 3, 3); rect(c, '#f3d897', 20, 0, 3, 3);
  }
  c.restore();
}

export function createCharacterTextures(scene: Phaser.Scene, agents: Agent[]) {
  for (const agent of [...agents, { id: 'director', skin: '#dca986', hair: '#413731', color: '#ece4cf' }]) {
    for (let dir = 0; dir < 4; dir++) for (let frame = 0; frame < 4; frame++) {
      texture(scene, `${agent.id}-${dir}-${frame}`, 28, 38, c => drawCharacter(c, agent, frame, dir, agent.id === 'director'));
    }
  }
}

function rug(c: Ctx, x: number, y: number, w: number, h: number, color: string) {
  rect(c, '#0000001c', x + 3, y + 4, w, h); rect(c, color, x, y, w, h);
  c.strokeStyle = '#e8dcc23b'; c.lineWidth = 2; c.strokeRect(x + 5, y + 5, w - 10, h - 10);
  for (let i = x + 12; i < x + w - 10; i += 12) for (let j = y + 12; j < y + h - 10; j += 12) rect(c, '#ead9bb1c', i, j, 2, 2);
}
function windowArt(c: Ctx, x: number, y: number, w: number) {
  rect(c, '#293c39', x - 4, y - 4, w + 8, 42); rect(c, '#739795', x, y, w, 30);
  rect(c, '#aac1ac', x, y, w, 12);
  for (let i = 0; i < w - 4; i += 16) rect(c, i % 32 ? '#789d92' : '#87a798', x + i, y + 15 - i % 7, 12, 15 + i % 7);
  rect(c, '#c6c7ad', x + w / 2 - 2, y, 4, 30); rect(c, '#c6c7ad', x, y + 14, w, 3);
  rect(c, '#d2c3a1', x - 5, y + 30, w + 10, 5); rect(c, '#3d5552', x - 5, y + 35, w + 10, 3);
}

export function createOfficeArt(scene: Phaser.Scene) {
  texture(scene, 'office-floor', WORLD.width, WORLD.height, c => {
    rect(c, '#1c2824', 0, 0, WORLD.width, WORLD.height);
    // A quiet little garden around the office.
    for (let i = 0; i < 180; i++) {
      const x = (i * 127 + 17) % WORLD.width, y = (i * 73 + 29) % WORLD.height;
      if (x < 28 || x > 1018 || y > 638 || y < 66) rect(c, i % 3 ? '#324534' : '#496041', x, y, 3, 4);
    }
    rect(c, '#0c171980', 38, 90, 980, 560);
    rect(c, '#8b775a', 32, 82, 976, 550);
    for (let y = 88; y < 624; y += 16) {
      for (let x = 36; x < 1004; x += 48) {
        const offset = y % 32 ? 0 : 24;
        const shade = ['#a38d69', '#a9916c', '#b09a76', '#a88f6a', '#b69e79'][((x / 12) + y / 8) % 5];
        rect(c, shade, x + offset, y, Math.min(46, 1004 - x - offset), 15);
        rect(c, '#c9b38930', x + offset + 4, y + 3, 26, 1);
        rect(c, '#79694e30', x + offset + 20, y + 11, 16, 1);
      }
    }
    rect(c, '#6e786848', 36, 290, 968, 64);
    for (let x = 44; x < 996; x += 16) { rect(c, '#d9ca9b32', x, 300, 6, 1); rect(c, '#d9ca9b32', x, 346, 6, 1); }
    rug(c, 72, 168, 168, 92, '#8d9070'); rug(c, 300, 136, 200, 112, '#637d75');
    rug(c, 576, 148, 184, 112, '#77898a'); rug(c, 56, 490, 144, 118, '#948276');
    rug(c, 304, 420, 144, 120, '#a18178'); rug(c, 552, 420, 220, 118, '#7e8c69');
    rug(c, 824, 404, 152, 100, '#7b8064');
    // Upper back wall, windows, and little framed pictures.
    rect(c, '#3b5149', 32, 78, 976, 32); rect(c, '#718174', 32, 76, 976, 6);
    rect(c, '#2d403a', 32, 106, 976, 7);
    windowArt(c, 322, 100, 76); windowArt(c, 414, 100, 76); windowArt(c, 610, 100, 112);
    text(c, 'READ. WONDER. REPEAT.', 78, 103, 9, '#d8d3b3');
    text(c, 'THE ENGINE ROOM', 840, 102, 9, '#b3c1b3');
    for (const wall of WALLS.filter(w => w.y >= 88 && w.x !== 24 && w.x !== 1004 && w.y !== 624)) {
      rect(c, '#00000025', wall.x + 4, wall.y + 5, wall.w, wall.h);
      rect(c, '#3a4f45', wall.x, wall.y - 12, wall.w, wall.h + 12);
      rect(c, '#809080', wall.x, wall.y - 14, wall.w, 4);
      rect(c, '#536959', wall.x, wall.y - 10, wall.w, 3);
    }
    for (const room of ROOMS.filter(r => !['pantry', 'manager', 'lobby', 'server'].includes(r.id))) {
      const labels: Partial<Record<typeof room.id, string>> = { research: '01 / RESEARCH', developer: '02 / DEVELOPMENT', meeting: '03 / MEETING ROOM', lounge: 'COFFEE & GOOD COMPANY', design: '04 / CREATIVE STUDIO', workspace: '05 / WORKSPACE' };
      const label = labels[room.id];
      text(c, label ?? '', room.x + 9, room.id === 'lounge' ? 612 : room.y + room.h - 12, 10, '#39483b');
    }
    text(c, 'DIRECTOR', 848, 500, 10, '#39483b'); text(c, 'WELCOME, GOOD HUMAN.', 819, 616, 9, '#39483b');
    // Central company marque: PT is deliberately prominent.
    rect(c, '#101f1a', 300, 13, 450, 53); rect(c, '#516445', 300, 13, 450, 3);
    rect(c, '#c1d69e', 312, 23, 47, 32); text(c, 'PT', 319, 47, 23, '#283b2c');
    text(c, 'ABISENA RAIS JAYA', 372, 40, 18, '#e5dfbe'); text(c, 'SMALL TEAM. GOOD THINGS.', 373, 54, 8, '#9aaf88');
    rect(c, '#d9c38e', 278, 26, 6, 14); rect(c, '#d9c38e', 765, 26, 6, 14);
    // Wall moodboard and framed mountain print.
    rect(c, '#4a5040', 312, 377, 94, 35); rect(c, '#d2bf98', 316, 380, 86, 28);
    ['#b7bd91', '#c78f7d', '#96afa7', '#e4ca92'].forEach((col, i) => rect(c, col, 322 + i * 19, 384, 14, 18));
    rect(c, '#4a5040', 576, 376, 74, 35); rect(c, '#9bb4a0', 580, 380, 66, 27);
    c.fillStyle = '#5c7b6b'; c.beginPath(); c.moveTo(580, 407); c.lineTo(605, 385); c.lineTo(627, 407); c.fill();
    rect(c, '#e6ca85', 629, 384, 7, 7);
    // Clock, hooks, pantry tile splashback.
    rect(c, '#c3bca1', 870, 373, 24, 24); rect(c, '#eee2bc', 873, 376, 18, 18);
    rect(c, '#394b3d', 832, 196, 144, 38); rect(c, '#718166', 832, 193, 144, 3);
    for (let x = 56; x < 194; x += 12) for (let y = 375; y < 401; y += 10) rect(c, (x + y) % 4 ? '#9da68d' : '#bbc2a4', x, y, 11, 9);
    text(c, 'BUT FIRST, COFFEE.', 69, 391, 8, '#34473b');
    rect(c, '#35483a', 940, 376, 38, 30); text(c, 'GOOD', 944, 387, 7, '#d6c292'); text(c, 'THINGS', 942, 399, 7, '#d6c292');
    // Bottom cutaway wall.
    rect(c, '#354a3d', 24, 624, 992, 14); rect(c, '#8d9a7b', 24, 621, 992, 5);
    rect(c, '#283a30', 24, 638, 992, 4);
  });
  for (const furniture of FURNITURE) createFurnitureArt(scene, furniture);
}

function createFurnitureArt(scene: Phaser.Scene, f: Furniture) {
  texture(scene, `f-${f.id}`, f.w + 20, f.h + 52, c => {
    const x = 10, y = 34, w = f.w, h = f.h;
    rect(c, '#17251d38', x + 5, y + 5, w, h);
    if (f.kind === 'desk') {
      rect(c, '#4b4438', x + 5, y + h - 2, 6, 12); rect(c, '#4b4438', x + w - 12, y + h - 2, 6, 12);
      rect(c, '#786044', x, y + 3, w, h); rect(c, '#cfb289', x, y - 2, w, h - 4);
      rect(c, '#e2c39a', x, y - 2, w, 3); rect(c, '#ad8e64', x + 2, y + h - 7, w - 4, 4);
      rect(c, '#4b5550', x + w / 2 - 5, y + 9, 10, 8);
      rect(c, '#283a38', x + w / 2 - 23, y - 20, 44, 30); rect(c, '#172c2c', x + w / 2 - 20, y - 17, 38, 23);
      const screenColor = f.agentId === 'tita' ? '#c194b7' : '#92bb9b';
      for (let i = 0; i < 4; i++) { rect(c, i % 2 ? '#4e7f76' : screenColor, x + w / 2 - 16 + i % 2 * 4, y - 13 + i * 4, 12 + i % 3 * 6, 2); }
      rect(c, '#d4d2b9', x + w / 2 - 18, y + 20, 34, 8);
      for (let i = 0; i < 7; i++) rect(c, '#969c8a', x + w / 2 - 16 + i * 4, y + 22, 2, 4);
      rect(c, '#e0dec5', x + w - 15, y + 17, 7, 9); rect(c, '#766447', x + w - 14, y + 17, 5, 2);
      rect(c, '#a7b59a', x + 8, y + 15, 15, 18); rect(c, '#e5d7ac', x + 10, y + 18, 11, 2);
      // Desk chair, tucked in.
      rect(c, '#3b4840', x + w / 2 - 14, y + h + 4, 28, 11); rect(c, '#66816c', x + w / 2 - 14, y + h + 1, 28, 8);
    } else if (f.kind === 'plant') {
      rect(c, '#785b46', x + 3, y + 6, w - 6, h - 6); rect(c, '#bc9872', x + 1, y + 4, w - 2, 6);
      rect(c, '#997650', x + 6, y + 12, 4, h - 12); rect(c, '#667846', x + 8, y - 16, 4, 22);
      [[-3, -17, 14, 10], [9, -24, 13, 10], [-6, -5, 16, 10], [8, -9, 16, 10], [2, -28, 10, 11]].forEach(([a, b, cw, ch], i) => { rect(c, ['#71915b', '#8faa6f', '#4d744e'][i % 3], x + a, y + b, cw, ch); rect(c, '#b1c28260', x + a + 2, y + b + 2, cw - 4, 2); });
    } else if (f.kind === 'shelf') {
      rect(c, '#5b4939', x, y - 30, w, h + 30); rect(c, '#ad8b60', x, y - 32, w, 4);
      for (let row = 0; row < 2; row++) {
        for (let i = 0; i < w - 10; i += 9) {
          const col = ['#9ba580', '#b7806f', '#769b96', '#d0b37e', '#8d8594'][(i + row) % 5];
          rect(c, col, x + 5 + i, y - 26 + row * 23 + (i % 3), 6, 17 - i % 3);
          rect(c, '#e2d0a866', x + 6 + i, y - 23 + row * 23 + i % 3, 4, 2);
        }
        rect(c, '#a38762', x, y - 6 + row * 24, w, 4);
      }
    } else if (f.kind === 'table') {
      rect(c, '#6d5841', x + 8, y + h - 2, 8, 9); rect(c, '#6d5841', x + w - 16, y + h - 2, 8, 9);
      rect(c, '#8b6e50', x, y, w, h); rect(c, '#c3a47a', x, y - 5, w, h - 5);
      rect(c, '#dac194', x + 3, y - 5, w - 6, 3);
      if (f.id === 'meeting-table') {
        for (let i = 0; i < 3; i++) {
          rect(c, '#3f5049', x + 12 + i * 40, y - 17, 24, 10); rect(c, '#819484', x + 12 + i * 40, y - 21, 24, 7);
          rect(c, '#56675a', x + 12 + i * 40, y + h - 2, 24, 13); rect(c, '#899980', x + 12 + i * 40, y + h, 24, 5);
          rect(c, '#e0d5b7', x + 18 + i * 35, y + 12, 15, 20); rect(c, '#8e9c81', x + 21 + i * 35, y + 15, 9, 2);
        }
        rect(c, '#465b49', x + 60, y + 28, 13, 12); rect(c, '#85a16d', x + 57, y + 22, 18, 9);
      } else { rect(c, '#d9d0ab', x + 10, y + 4, 14, 16); rect(c, '#bf9478', x + 29, y + 7, 9, 10); }
    } else if (f.kind === 'sofa') {
      rect(c, '#596b4e', x, y - 10, w, h + 10); rect(c, '#8d9a70', x + 4, y - 12, w - 8, 15);
      for (let i = 0; i < 3; i++) { rect(c, '#a5ae82', x + 8 + i * 30, y + 7, 27, 24); rect(c, '#b6ba8d', x + 8 + i * 30, y + 7, 27, 3); }
      rect(c, '#7e8d63', x - 3, y - 2, 10, h); rect(c, '#7e8d63', x + w - 7, y - 2, 10, h);
      rect(c, '#d6b287', x + 12, y + 2, 18, 18);
    } else if (f.kind === 'coffee') {
      rect(c, '#798373', x, y - 3, w, h + 3); rect(c, '#d9c8a0', x, y - 7, w, 7);
      for (let i = 0; i < 3; i++) { rect(c, '#9ba48b', x + 3 + i * 39, y + 3, 35, 22); rect(c, '#4f6152', x + 27 + i * 39, y + 7, 5, 3); }
      rect(c, '#344443', x + 8, y - 32, 31, 25); rect(c, '#688178', x + 11, y - 29, 25, 9); rect(c, '#c6d6a3', x + 28, y - 26, 4, 4);
      rect(c, '#172d2a', x + 15, y - 17, 15, 10); rect(c, '#e8dac0', x + 19, y - 14, 8, 7);
      rect(c, '#b3b99c', x + 61, y - 10, 24, 4); rect(c, '#e6dec7', x + 64, y - 18, 7, 8); rect(c, '#e6dec7', x + 76, y - 18, 7, 8);
      rect(c, '#ad835e', x + 101, y - 22, 12, 15); rect(c, '#c7a375', x + 100, y - 25, 14, 4);
    } else if (f.kind === 'server') {
      rect(c, '#273936', x, y - 24, w, h + 24); rect(c, '#697b70', x, y - 28, w, 5);
      for (let i = 0; i < 5; i++) {
        rect(c, '#43554e', x + 4, y - 19 + i * 13, w - 8, 10); rect(c, '#a5c184', x + 8, y - 16 + i * 13, 3, 3);
        for (let j = 0; j < 5; j++) rect(c, '#283d36', x + 18 + j * 4, y - 17 + i * 13, 2, 5);
      }
    } else if (f.kind === 'printer') {
      rect(c, '#65776a', x, y - 10, w, h + 10); rect(c, '#bcc1a7', x, y - 14, w, 22);
      rect(c, '#263d36', x + 7, y - 19, w - 14, 7); rect(c, '#ebe5c8', x + 10, y - 31, w - 20, 18);
      rect(c, '#94ad86', x + 29, y - 8, 5, 4); rect(c, '#233a31', x + 5, y + 9, w - 10, 8); rect(c, '#dfd8bb', x + 10, y + 10, 20, 11);
    } else if (f.kind === 'jukebox') {
      rect(c, '#5c5145', x - 2, y - 24, w + 4, h + 24); rect(c, '#e2b677', x, y - 26, w, 5);
      rect(c, '#83aa8c', x + 3, y - 19, w - 6, 22); rect(c, '#d9cd9d', x + 7, y - 15, 10, 10);
      rect(c, '#c59376', x + 4, y + 8, w - 8, 20); for (let i = 0; i < 4; i++) rect(c, '#685948', x + 6, y + 11 + i * 4, w - 12, 2);
    } else if (f.kind === 'board') {
      rect(c, '#526550', x, y - 35, w, 50); rect(c, '#e3dfbf', x + 4, y - 31, w - 8, 40);
      text(c, 'GOOD THINGS AHEAD', x + 10, y - 21, 7, '#546249');
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { rect(c, ['#b0bf92', '#dbbf8b', '#c7a89c'][i], x + 12 + i * 35, y - 14 + j * 10, 24, 7); }
      rect(c, '#8d987b', x - 2, y + 10, w + 4, 4);
    } else if (f.kind === 'cabinet') {
      rect(c, '#69796c', x, y - 17, w, h + 17); rect(c, '#a4ad95', x, y - 20, w, 4);
      for (let i = 0; i < 3; i++) { rect(c, '#8b9881', x + 3, y - 12 + i * 15, w - 6, 12); rect(c, '#d3ceb0', x + 12, y - 8 + i * 15, 9, 3); }
    }
  });
}
