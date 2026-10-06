import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialAgents, initialTasks, MEETING_SPOTS, FURNITURE } from '../src/data/office';
import { canStand, findPath, moveWithCollision } from '../src/game/pathfinding';
import { advanceSimulation } from '../src/lib/simulation';
import type { Point, Meeting } from '../src/types';

test('every desk, meeting seat, coffee destination and report handoff is reachable without crossing furniture', () => {
  const destinations = [...initialAgents().map(a => a.home), ...MEETING_SPOTS, { x: 200, y: 456 }, { x: 952, y: 504 }];
  const starts = [{ x: 648, y: 328 }, ...initialAgents().map(a => a.home)];
  for (const start of starts) for (const goal of destinations) {
    assert.ok(canStand(start), `start ${JSON.stringify(start)} must be walkable`);
    assert.ok(canStand(goal), `goal ${JSON.stringify(goal)} must be walkable`);
    const path = findPath(start, goal);
    if (start.x === goal.x && start.y === goal.y) continue;
    assert.ok(path.length > 0, `path exists from ${JSON.stringify(start)} to ${JSON.stringify(goal)}`);
    const last = path.at(-1)!;
    assert.ok(Math.hypot(last.x - goal.x, last.y - goal.y) <= 12, 'path reaches destination');
    let previous = start;
    for (const next of path) {
      const distance = Math.hypot(next.x - previous.x, next.y - previous.y);
      for (let i = 1; i <= Math.ceil(distance); i++) {
        const t = Math.min(1, i / distance);
        assert.ok(canStand({ x: previous.x + (next.x - previous.x) * t, y: previous.y + (next.y - previous.y) * t }), 'every point on path respects collision footprints');
      }
      previous = next;
    }
  }
});

test('director cannot tunnel through a desk, a wall, or the office boundary', () => {
  const desk = FURNITURE.find(f => f.id === 'nisa-desk')!;
  const p = moveWithCollision({ x: 152, y: 248 }, 0, -400);
  assert.ok(p.y >= desk.y + desk.h + 6, 'stopped below desk');
  assert.ok(canStand(p));
  const wall = moveWithCollision({ x: 248, y: 216 }, 1000, 0);
  assert.ok(wall.x <= 258, 'stopped at room partition');
  const boundary = moveWithCollision({ x: 80, y: 320 }, -1000, 0);
  assert.ok(boundary.x >= 40);
});

test('blocked, paused and travelling agents make no hidden task progress', () => {
  const agents = initialAgents(), tasks = initialTasks();
  agents.find(a => a.id === 'bima')!.paused = true;
  agents.find(a => a.id === 'nisa')!.position = { x: 200, y: 328 };
  const result = advanceSimulation(agents, tasks, [], 1000, 1000);
  for (const id of ['T-101', 'T-102', 'T-104']) assert.equal(result.tasks.find(t => t.id === id)!.progress, tasks.find(t => t.id === id)!.progress);
  assert.equal(result.agents.find(a => a.id === 'nisa')!.state, 'walking');
  assert.equal(result.agents.find(a => a.id === 'damar')!.state, 'blocked');
  assert.ok(result.tasks.find(t => t.id === 'T-103')!.progress > tasks.find(t => t.id === 'T-103')!.progress);
});

test('completed simulated work creates an honest report, awaits review and heads to the director', () => {
  const agents = initialAgents(), tasks = initialTasks();
  tasks.find(t => t.id === 'T-102')!.progress = 99.9;
  const result = advanceSimulation(agents, tasks, [], 1000, 1000);
  const task = result.tasks.find(t => t.id === 'T-102')!;
  assert.equal(task.status, 'review'); assert.equal(task.progress, 100);
  assert.match(task.output!, /Local simulation/); assert.match(task.output!, /Build something delightful/);
  assert.ok(result.events.some(e => e.type === 'report.generated'));
  assert.deepEqual(result.agents.find(a => a.id === 'bima')!.destination, { x: 952, y: 504 });
  assert.equal(tasks.find(t => t.id === 'T-102')!.progress, 99.9, 'input objects are not mutated');
});

test('task category determines the work room, even when assigned across specialties', () => {
  const agents = initialAgents(), tasks = initialTasks();
  tasks.find(t => t.id === 'T-102')!.type = 'Research';
  const result = advanceSimulation(agents, tasks, [], 1000, 1000);
  const bima = result.agents.find(a => a.id === 'bima')!;
  assert.deepEqual(bima.destination, agents.find(a => a.id === 'nisa')!.home);
  assert.equal(bima.state, 'walking');
  assert.equal(result.tasks.find(t => t.id === 'T-102')!.progress, 42);
});

test('a meeting temporarily holds work, ends with notes and sends agents home', () => {
  const agents = initialAgents(), tasks = initialTasks();
  const meeting: Meeting = { id: 'meeting-test', agentIds: ['bima', 'nisa'], active: true, startedAt: 0, endsAt: 90000, notes: '' };
  const during = advanceSimulation(agents, tasks, [meeting], 1000, 1000);
  assert.equal(during.tasks.find(t => t.id === 'T-102')!.progress, 42);
  assert.deepEqual(during.agents.find(a => a.id === 'bima')!.destination, MEETING_SPOTS[0]);
  const after = advanceSimulation(during.agents, during.tasks, during.meetings, 90001, 1000);
  assert.equal(after.meetings[0].active, false); assert.ok(after.meetings[0].notes.length > 0);
  assert.ok(after.events.some(e => e.type === 'meeting.ended'));
  assert.deepEqual(after.agents.find(a => a.id === 'bima')!.destination, agents.find(a => a.id === 'bima')!.home);
});

test('unreachable targets produce a safe nearest path, never an obstacle endpoint', () => {
  const start: Point = { x: 648, y: 328 };
  const path = findPath(start, { x: 650, y: 180 });
  assert.ok(path.length > 0); assert.ok(path.every(p => canStand(p)));
  assert.ok(Math.hypot(path.at(-1)!.x - 650, path.at(-1)!.y - 180) > 6);
});
