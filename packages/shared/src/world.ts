import type { Department, Point, Rect } from './types';
export const WORLD = { width: 1280, height: 832, tile: 32, cell: 16 };
export const rooms = [
  { id: 'research', name: 'RESEARCH', x: 32, y: 80, w: 288, h: 272, color: '#85957a' },
  { id: 'development', name: 'DEVELOPMENT', x: 336, y: 80, w: 288, h: 272, color: '#738f8b' },
  { id: 'meeting', name: 'MEETING ROOM', x: 640, y: 80, w: 288, h: 272, color: '#9191a1' },
  { id: 'server', name: 'IT / AGENT NETWORK', x: 944, y: 80, w: 304, h: 272, color: '#7e8d97' },
  { id: 'hr', name: 'PEOPLE & CULTURE', x: 32, y: 448, w: 288, h: 320, color: '#a48d91' },
  { id: 'creative', name: 'CREATIVE / QA', x: 336, y: 448, w: 288, h: 320, color: '#a39277' },
  { id: 'operations', name: 'OPEN OFFICE / OPS', x: 640, y: 448, w: 288, h: 320, color: '#8a9773' },
  { id: 'boss', name: 'DIRECTOR', x: 944, y: 448, w: 304, h: 184, color: '#9b926e' },
  { id: 'torture', name: 'TORTURE / HR BASEMENT-ISH', x: 944, y: 648, w: 304, h: 120, color: '#695861' },
] as const;
export interface Furniture extends Rect { id: string; kind: 'desk' | 'shelf' | 'plant' | 'table' | 'sofa' | 'coffee' | 'server' | 'printer' | 'jukebox' | 'board' | 'cabinet' | 'mirror' | 'reception' | 'rig'; label?: string; action?: string; point?: Point }
export const furniture: Furniture[] = [
  { id: 'books', kind: 'shelf', x: 56, y: 118, w: 112, h: 28 }, { id: 'books2', kind: 'shelf', x: 192, y: 118, w: 96, h: 28 },
  { id: 'research-desk', kind: 'desk', x: 96, y: 208, w: 136, h: 40 },
  { id: 'dev-desk', kind: 'desk', x: 368, y: 160, w: 96, h: 40 }, { id: 'dev-desk2', kind: 'desk', x: 496, y: 224, w: 96, h: 40 },
  { id: 'meeting', kind: 'table', x: 704, y: 176, w: 152, h: 72, action: 'meetings', label: 'Meeting table', point: { x: 784, y: 280 } },
  { id: 'projector', kind: 'board', x: 718, y: 108, w: 128, h: 12 },
  { id: 'rack', kind: 'server', x: 968, y: 120, w: 64, h: 60 }, { id: 'rack2', kind: 'server', x: 1056, y: 120, w: 64, h: 60 },
  { id: 'network', kind: 'desk', x: 1064, y: 240, w: 112, h: 40, action: 'network', label: 'Agent network', point: { x: 1112, y: 304 } },
  { id: 'hr', kind: 'desk', x: 80, y: 520, w: 144, h: 40, action: 'hr', label: 'HR terminal', point: { x: 152, y: 584 } },
  { id: 'files', kind: 'cabinet', x: 56, y: 472, w: 48, h: 24 },
  { id: 'coffee', kind: 'coffee', x: 64, y: 648, w: 56, h: 32, action: 'coffee', label: 'Coffee · critical infrastructure', point: { x: 88, y: 704 } },
  { id: 'sofa', kind: 'sofa', x: 184, y: 688, w: 96, h: 40 },
  { id: 'jukebox', kind: 'jukebox', x: 248, y: 616, w: 32, h: 40, action: 'audio', label: 'Lounge radio', point: { x: 264, y: 680 } },
  { id: 'creative-desk', kind: 'desk', x: 368, y: 520, w: 96, h: 40 }, { id: 'qa-desk', kind: 'desk', x: 496, y: 648, w: 96, h: 40 },
  { id: 'ops-desk', kind: 'desk', x: 680, y: 520, w: 160, h: 40 },
  { id: 'whiteboard', kind: 'board', x: 712, y: 664, w: 136, h: 20, action: 'board', label: 'Company whiteboard', point: { x: 776, y: 712 } },
  { id: 'boss', kind: 'desk', x: 1040, y: 528, w: 144, h: 48, action: 'computer', label: 'Director’s laptop', point: { x: 1112, y: 600 } },
  { id: 'mirror', kind: 'mirror', x: 1200, y: 480, w: 24, h: 24, action: 'character', label: 'Wardrobe & mirror', point: { x: 1208, y: 536 } },
  { id: 'printer', kind: 'printer', x: 656, y: 688, w: 48, h: 32, action: 'reports', label: 'Report printer', point: { x: 680, y: 744 } },
  { id: 'punishment-rig', kind: 'rig', x: 968, y: 680, w: 72, h: 32 },
  { id: 'torture-control', kind: 'server', x: 1136, y: 688, w: 48, h: 24, action: 'torture', label: 'Torture room controls', point: { x: 1160, y: 744 } },
  { id: 'reception', kind: 'reception', x: 568, y: 784, w: 160, h: 32, action: 'company', label: 'Reception', point: { x: 648, y: 760 } },
  ...[{ x: 272, y: 240 }, { x: 576, y: 112 }, { x: 880, y: 288 }, { x: 1200, y: 160 }, { x: 368, y: 704 }, { x: 880, y: 488 }, { x: 1200, y: 704 }].map((p, i) => ({ ...p, id: `plant${i}`, kind: 'plant' as const, w: 24, h: 24, ...(i === 6 ? { action: 'plant', label: 'Suspiciously resilient fern', point: { x: 1208, y: 744 } } : {}) })),
];
export const walls: Rect[] = [
  { x: 16, y: 64, w: 1248, h: 16 }, { x: 16, y: 64, w: 16, h: 752 }, { x: 1248, y: 64, w: 16, h: 752 }, { x: 16, y: 816, w: 1248, h: 16 },
  ...[320, 624, 928].flatMap(x => [{ x, y: 80, w: 16, h: 272 }, { x, y: 448, w: 16, h: 320 }]),
  ...rooms.flatMap(r => [{ x: r.x, y: r.id === 'torture' ? 636 : r.y === 80 ? 344 : 440, w: 104, h: 8 }, { x: r.x + 184, y: r.id === 'torture' ? 636 : r.y === 80 ? 344 : 440, w: r.w - 184, h: 8 }]),
];
export const obstacles = [...walls, ...furniture];
export const spawn = { x: 648, y: 744 };
export const exit = { x: 1208, y: 792 };
export const punishmentSpot = { x: 1000, y: 728 };
export const workstations: Record<Department, Point[]> = {
  Research: [{ x: 136, y: 280 }, { x: 200, y: 280 }, { x: 72, y: 280 }, { x: 248, y: 312 }],
  Development: [{ x: 408, y: 232 }, { x: 536, y: 296 }, { x: 360, y: 264 }, { x: 488, y: 296 }],
  Creative: [{ x: 408, y: 584 }, { x: 456, y: 584 }, { x: 360, y: 616 }, { x: 456, y: 616 }],
  QA: [{ x: 536, y: 712 }, { x: 584, y: 712 }, { x: 488, y: 744 }, { x: 584, y: 744 }],
  Operations: [{ x: 712, y: 592 }, { x: 776, y: 592 }, { x: 840, y: 592 }, { x: 888, y: 624 }],
};
export const meetingSpots: Point[] = [{ x: 680, y: 184 }, { x: 680, y: 248 }, { x: 728, y: 280 }, { x: 792, y: 280 }, { x: 872, y: 248 }, { x: 872, y: 184 }];
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function canStand(p: Point, radius = 6) {
  return p.x >= 38 && p.y >= 88 && p.x <= 1242 && p.y <= 808 && !obstacles.some(o => p.x + radius > o.x && p.x - radius < o.x + o.w && p.y + radius > o.y && p.y - radius < o.y + o.h);
}
export function moveWithCollision(p: Point, dx: number, dy: number): Point {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4)); let next = { ...p };
  for (let i = 0; i < steps; i++) { if (canStand({ x: next.x + dx / steps, y: next.y })) next.x += dx / steps; if (canStand({ x: next.x, y: next.y + dy / steps })) next.y += dy / steps; }
  return next;
}
/** A* on one shared collision grid. Unreachable goals return an empty path. */
export function findPath(start: Point, goal: Point): Point[] {
  const cols = WORLD.width / WORLD.cell, cell = WORLD.cell;
  const key = (p: Point) => Math.floor(p.y / cell) * cols + Math.floor(p.x / cell);
  const point = (k: number) => ({ x: (k % cols) * cell + cell / 2, y: Math.floor(k / cols) * cell + cell / 2 });
  const clearLine = (a: Point, b: Point) => { const steps = Math.max(1, Math.ceil(distance(a, b) / 3)); return Array.from({ length: steps }, (_, i) => canStand({ x: a.x + (b.x - a.x) * (i + 1) / steps, y: a.y + (b.y - a.y) * (i + 1) / steps })).every(Boolean); };
  const from = key(start), to = key(goal); if (!canStand(goal) || !canStand(point(to)) || !clearLine(point(to), goal)) return [];
  const open = new Set([from]), parents = new Map<number, number>(), g = new Map([[from, 0]]);
  const h = (k: number) => { const p = point(k); return (Math.abs(p.x - goal.x) + Math.abs(p.y - goal.y)) / cell; };
  while (open.size) {
    let current = -1, best = Infinity;
    for (const k of open) { const f = (g.get(k) ?? Infinity) + h(k); if (f < best) { current = k; best = f; } }
    if (current === to) { const path: Point[] = []; let k = to; while (k !== from) { path.push(point(k)); k = parents.get(k)!; } path.reverse(); if (distance(path.at(-1) || start, goal) > .01) path.push({ ...goal }); return path; }
    open.delete(current);
    for (const n of [current - cols, current + cols, current - 1, current + 1]) {
      if (!canStand(point(n)) || (current === from && !clearLine(start, point(n)))) continue;
      const cost = g.get(current)! + 1;
      if (cost >= (g.get(n) ?? Infinity)) continue;
      parents.set(n, current); g.set(n, cost); open.add(n);
    }
  }
  return [];
}
export function nearbyWalkable(p: Point, slot = 0): Point {
  const offsets = [{ x: -32, y: 0 }, { x: 32, y: 0 }, { x: 0, y: -32 }, { x: 0, y: 32 }, { x: -32, y: 32 }, { x: 32, y: -32 }];
  for (let i = 0; i < offsets.length; i++) { const o = offsets[(i + slot) % offsets.length]; const q = { x: Math.floor((p.x + o.x) / 16) * 16 + 8, y: Math.floor((p.y + o.y) / 16) * 16 + 8 }; if (canStand(q)) return q; }
  return { ...spawn };
}
