import { OBSTACLES, WORLD } from '../data/office';
import type { Point, Rect } from '../types';

export function canStand(p: Point, obstacles: Rect[] = OBSTACLES, radius = 6): boolean {
  return p.x >= 40 && p.x <= WORLD.width - 40 && p.y >= 96 && p.y <= 616 &&
    !obstacles.some(r => p.x + radius > r.x && p.x - radius < r.x + r.w && p.y + radius > r.y && p.y - radius < r.y + r.h);
}

/** Grid BFS: office-sized map, uniform costs, deterministic shortest walkable path. */
export function findPath(start: Point, goal: Point): Point[] {
  const cell = WORLD.cell;
  const cols = WORLD.width / cell;
  const key = (p: Point) => Math.floor(p.y / cell) * cols + Math.floor(p.x / cell);
  const point = (k: number) => ({ x: (k % cols) * cell + cell / 2, y: Math.floor(k / cols) * cell + cell / 2 });
  const target = key(goal), origin = key(start);
  const parents = new Map<number, number>([[origin, -1]]);
  const queue = [origin];
  let reached = -1, closest = origin, distance = Infinity;
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i], p = point(cur);
    const d = Math.hypot(p.x - goal.x, p.y - goal.y);
    if (d < distance) { distance = d; closest = cur; }
    if (cur === target) { reached = cur; break; }
    for (const n of [cur - cols, cur + cols, cur - 1, cur + 1]) {
      if (parents.has(n) || !canStand(point(n))) continue;
      const from = cur === origin ? start : p, to = point(n);
      const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 4);
      if (Array.from({ length: steps }, (_, i) => canStand({ x: from.x + (to.x - from.x) * (i + 1) / steps, y: from.y + (to.y - from.y) * (i + 1) / steps })).every(Boolean)) {
        parents.set(n, cur); queue.push(n);
      }
    }
  }
  const path: Point[] = [];
  let cursor = reached === -1 ? closest : reached;
  while (cursor !== origin && cursor !== -1) { path.push(point(cursor)); cursor = parents.get(cursor) ?? -1; }
  return path.reverse();
}

export function moveWithCollision(p: Point, dx: number, dy: number): Point {
  // Substeps prevent tunnelling at high speed or after a slow frame.
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4));
  let next = { ...p };
  for (let i = 0; i < steps; i++) {
    const x = { ...next, x: next.x + dx / steps };
    if (canStand(x)) next = x;
    const y = { ...next, y: next.y + dy / steps };
    if (canStand(y)) next = y;
  }
  return next;
}
