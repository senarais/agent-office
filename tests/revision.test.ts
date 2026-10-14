import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Engine } from '../apps/server/src/engine';
import { Store, freshState } from '../apps/server/src/database';
import { migrateState } from '../apps/server/src/migrate-state';
import { nextOccurrence } from '../apps/server/src/scheduler';
import { defaultAppearance } from '../packages/shared/src/types';
import type { Employee, Weapon, PunishmentMethod, WorldState } from '../packages/shared/src/types';
import type { Schedule } from '../packages/shared/src/automation';
import { directions, weapons, punishments, traceAttack } from '../packages/shared/src/combat';
import { distance, punishmentSpot } from '../packages/shared/src/world';

const profile = { name: 'Rani', role: 'Analyst', department: 'Research', appearance: defaultAppearance, systemPrompt: 'Keep evidence and sources.', tools: ['read'] };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const daily: Schedule = { type: 'daily', timezone: 'Asia/Jakarta', time: '09:00', weekdays: [1, 2, 3, 4, 5], intervalMinutes: 30, cron: '0 9 * * 1-5', runAt: '' };
function fixture(t: TestContext) {
  const dir = mkdtempSync(join(tmpdir(), 'pt-v2-')); let time = Date.parse('2026-10-05T00:00:00Z'); const engine = new Engine(new Store(dir), () => time);
  t.after(() => { engine.stop(); rmSync(dir, { recursive: true, force: true }); });
  return { dir, engine, advance: (ms: number) => { time += ms; return time; }, time: () => time };
}
async function eventually(check: () => boolean) { for (let i = 0; i < 300; i++) { if (check()) return; await new Promise(r => setTimeout(r, 10)); } assert.fail('Timed out waiting for provider lifecycle'); }
function aim(engine: Engine, e: Employee, weapon: Weapon) { e.position = { x: 680, y: 400 }; e.destination = { ...e.position }; engine.s.player.x = 648; engine.s.player.y = 400; engine.s.player.equipped = weapon; }
function shoot(engine: Engine, weapon: Weapon, direction = 3) { return engine.combat({ id: randomUUID(), weapon, direction, origin: { x: engine.s.player.x, y: engine.s.player.y } }); }
async function provider(engine: Engine) { return engine.configureProvider({ name: 'Deterministic provider fixture', kind: 'generic', baseUrl: 'http://127.0.0.1:1/v1', model: 'test-model' }); }
function definition(e: Employee, schedule: Schedule = daily) { return { name: 'Morning report', employeeId: e.id, providerId: e.providerId, model: e.model, instructions: 'Create a concise report.', schedule, autoDeliver: false, notify: false, outputDestination: 'laptop', tools: ['read'] }; }
function walkAll(engine: Engine) { for (let i = 0; i < 180; i++) engine.tick(.1); }

test('timezone daily, weekly, interval, one-time and cron scheduling use exact boundaries', () => {
  const anchor = Date.parse('2026-10-05T00:00:00Z');
  assert.equal(nextOccurrence(daily, anchor, anchor), '2026-10-05T02:00:00.000Z');
  assert.equal(nextOccurrence({ ...daily, type: 'weekly', weekdays: [1] }, Date.parse('2026-10-05T03:00:00Z'), anchor), '2026-10-12T02:00:00.000Z');
  assert.equal(nextOccurrence({ ...daily, type: 'interval' }, anchor + 90 * 60000, anchor), '2026-10-05T02:00:00.000Z');
  assert.equal(nextOccurrence({ ...daily, type: 'once', runAt: '2026-10-05T01:00:00Z' }, anchor, anchor), '2026-10-05T01:00:00.000Z');
  assert.equal(nextOccurrence({ ...daily, type: 'once', runAt: '2026-10-05T01:00:00Z' }, anchor + 3600000, anchor), undefined);
  assert.equal(nextOccurrence({ ...daily, type: 'cron', cron: '30 10 * * 1-5' }, anchor, anchor), '2026-10-05T03:30:00.000Z');
  assert.throws(() => nextOccurrence({ ...daily, timezone: 'not/a/timezone' }, anchor, anchor), /Invalid schedule/);
  assert.throws(() => nextOccurrence({ ...daily, type: 'cron', cron: '* * * * * *' }, anchor, anchor), /five-field/);
});

test('calendar schedules follow DST instead of drifting by 24-hour additions', () => {
  const s = { ...daily, timezone: 'America/New_York', time: '09:00' };
  assert.equal(nextOccurrence(s, Date.parse('2026-03-07T15:00:00Z'), 0), '2026-03-08T13:00:00.000Z');
  assert.equal(nextOccurrence(s, Date.parse('2026-10-31T14:00:00Z'), 0), '2026-11-01T14:00:00.000Z');
});

test('scheduled work auto-queues, walks, executes and stores report with no manual assignment or browser', async t => {
  const f = fixture(t), p = await provider(f.engine), e = f.engine.hire({ ...profile, providerId: p.id, model: 'test-model' }); let calls = 0;
  f.engine.providerFactory = () => ({ listModels: async () => ['test-model'], execute: async r => { calls++; r.onText('Scheduled actual adapter result'); return { text: 'Scheduled actual adapter result' }; } });
  const rule = f.engine.scheduler.save(definition(e, { ...daily, type: 'once', runAt: new Date(f.time() + 1000).toISOString() }));
  f.engine.scheduler.tick(); assert.equal(f.engine.s.tasks.length, 0); f.advance(1000); f.engine.tick(.1); assert.equal(f.engine.s.tasks[0].status, 'WALKING_TO_WORKSTATION');
  assert.ok(distance(e.position, e.home) > 0); walkAll(f.engine); await eventually(() => f.engine.s.tasks[0].status === 'COMPLETED');
  assert.equal(calls, 1); assert.equal(f.engine.s.reports[0].outputDestination, 'laptop'); assert.equal(e.reportId, undefined); assert.equal(f.engine.s.scheduleRuns[0].status, 'completed'); assert.equal(rule.nextRunAt, undefined);
  assert.ok(f.engine.s.events.filter(event => event.entityId === f.engine.s.tasks[0].id).every(event => event.notify === false));
  const reload = new Store(f.dir); assert.equal(reload.state.scheduleRuns[0].taskId, reload.state.tasks[0].id); assert.equal(reload.state.reports[0].text, 'Scheduled actual adapter result'); reload.close();
  f.engine.scheduler.tick(); assert.equal(f.engine.s.tasks.length, 1);
});

test('downtime coalesces missed slots; persisted occurrence claims prevent duplicate work', t => {
  const f = fixture(t), e = f.engine.hire(profile), rule = f.engine.scheduler.save(definition(e, { ...daily, type: 'interval' }));
  f.advance(24 * 3600000); f.engine.scheduler.tick(); assert.equal(f.engine.s.tasks.length, 1); assert.ok(Date.parse(rule.nextRunAt!) > f.time());
  const claimed = f.engine.s.scheduleRuns[0]; rule.nextRunAt = claimed.scheduledAt; f.engine.save();
  const disk = new Store(f.dir), reopened = new Engine(disk, f.time); reopened.recover(); reopened.scheduler.tick(); assert.equal(reopened.s.scheduleRuns.filter(r => r.scheduledAt === claimed.scheduledAt).length, 1); assert.equal(reopened.s.tasks.length, 1); reopened.stop();
});

test('pause/resume/edit/delete are durable; no overlapping runs; deleted histories remain', t => {
  const f = fixture(t), e = f.engine.hire(profile); const rule = f.engine.scheduler.save(definition(e, { ...daily, type: 'interval', intervalMinutes: 1 }));
  f.engine.scheduler.action(rule.id, 'pause'); f.advance(120000); f.engine.scheduler.tick(); assert.equal(f.engine.s.tasks.length, 0);
  f.engine.scheduler.action(rule.id, 'resume'); f.advance(60000); f.engine.scheduler.tick(); assert.equal(f.engine.s.tasks.length, 1);
  f.advance(60000); f.engine.scheduler.tick(); assert.equal(f.engine.s.tasks.length, 1); assert.equal(f.engine.s.scheduleRuns.at(-1)!.status, 'skipped');
  f.engine.scheduler.save({ ...rule, name: 'Edited report' }, rule.id); assert.equal(rule.name, 'Edited report'); f.engine.scheduler.action(rule.id, 'delete');
  const disk = new Store(f.dir); assert.ok(disk.state.recurringTasks[0].deletedAt); assert.equal(disk.state.scheduleRuns.length, 2); disk.close();
});

test('automatic failure retry is bounded and exhausted blocked work cannot clog the employee queue', async t => {
  const f = fixture(t), e = f.engine.hire(profile); const rule = f.engine.scheduler.save({ ...definition(e, { ...daily, type: 'interval', intervalMinutes: 10 }), retryOnFailure: true, maxRetries: 1, retryDelayMinutes: 1 });
  f.engine.scheduler.action(rule.id, 'run'); walkAll(f.engine); await eventually(() => f.engine.s.tasks[0].status === 'BLOCKED'); f.engine.scheduler.tick(); assert.ok(f.engine.s.scheduleRuns[0].nextRetryAt);
  f.advance(60000); f.engine.scheduler.tick(); walkAll(f.engine); await eventually(() => f.engine.s.tasks[0].status === 'BLOCKED'); f.engine.scheduler.tick();
  assert.equal(f.engine.s.scheduleRuns[0].attempt, 2); assert.equal(f.engine.s.scheduleRuns[0].errors.length, 2); assert.equal(f.engine.s.scheduleRuns[0].nextRetryAt, undefined); assert.equal(f.engine.s.tasks[0].status, 'FAILED');
  f.advance(9 * 60000); f.engine.scheduler.tick(); assert.equal(f.engine.s.tasks.length, 2); assert.equal(f.engine.s.tasks[1].status, 'WALKING_TO_WORKSTATION');
});

test('empty-space fire is immediate server work, directional, occluded, replay-safe and cooldown-limited', t => {
  const f = fixture(t); f.engine.s.player.x = 648; f.engine.s.player.y = 400; f.engine.s.player.equipped = 'rifle';
  const attack = { id: randomUUID(), weapon: 'rifle' as const, direction: 3, origin: { x: 648, y: 400 } };
  const empty = f.engine.combat(attack); assert.equal(empty.employeeId, undefined); assert.ok(empty.end.x > 900); assert.equal(empty.damage, 0);
  assert.throws(() => f.engine.combat(attack), /already processed/); assert.throws(() => shoot(f.engine, 'rifle'), /cooling down/);
  const e = f.engine.hire(profile); e.position = { x: 616, y: 400 }; f.advance(200); assert.equal(shoot(f.engine, 'rifle').employeeId, undefined); assert.equal(e.currentHp, 100);
  f.advance(200); assert.equal(shoot(f.engine, 'rifle', 1).employeeId, e.id); assert.equal(e.currentHp, 75);
  e.position = { x: 400, y: 250 }; assert.equal(traceAttack({ x: 200, y: 250 }, 3, 'rifle', [e]).employeeId, undefined, 'Wall blocks hitscan');
});

for (const [weapon, expectedHits] of [['rifle', 4], ['knife', 6], ['whip', 10]] as const) test(`${weapon} takes ${expectedHits} default hits, then leaves an unresolved persistent corpse`, t => {
  const f = fixture(t), e = f.engine.hire(profile); aim(f.engine, e, weapon);
  for (let i = 1; i <= expectedHits; i++) { aim(f.engine, e, weapon); f.advance(1000); const hit = shoot(f.engine, weapon); assert.equal(hit.employeeId, e.id); assert.equal(e.employmentStatus, i === expectedHits ? 'deceased' : 'active'); }
  assert.equal(e.currentHp, 0); assert.equal(e.corpsePresent, true); assert.equal(e.endedAt, undefined); assert.ok(!f.engine.s.history.some(h => h.employeeId === e.id && h.status === 'fired'));
  const disk = new Store(f.dir); assert.deepEqual(disk.state.employees[0].position, e.position); assert.equal(disk.state.employees[0].corpsePresent, true); disk.close();
});

test('food and drinks fully heal living employees, consume stock, and cannot revive a corpse', t => {
  const f = fixture(t), e = f.engine.hire(profile); e.currentHp = 7; const initial = f.engine.s.player.food; f.engine.heal(e.id, 'food'); assert.equal(e.currentHp, 100); assert.equal(f.engine.s.player.food, initial - 1);
  e.currentHp = 19; f.engine.heal(e.id, 'drinks'); assert.equal(e.currentHp, 100); f.engine.endEmployment(e.id, 'deceased'); const stock = f.engine.s.player.food; assert.throws(() => f.engine.heal(e.id, 'food'), /Resurrect/); assert.equal(f.engine.s.player.food, stock);
});

test('resurrection continues same employment and resumes death-paused schedules; firing resolves body', t => {
  const f = fixture(t), e = f.engine.hire(profile), rule = f.engine.scheduler.save(definition(e)); f.engine.endEmployment(e.id, 'deceased'); assert.equal(rule.enabled, false); assert.throws(() => f.engine.chat(e.id, 'No'), /deceased/);
  f.engine.resurrect(e.id); assert.equal(e.employmentStatus, 'active'); assert.equal(e.currentHp, 100); assert.equal(e.corpsePresent, false); assert.equal(rule.enabled, true);
  f.engine.endEmployment(e.id, 'deceased'); f.engine.endEmployment(e.id, 'fired'); assert.equal(e.corpsePresent, false); assert.equal(e.employmentStatus, 'fired'); assert.throws(() => f.engine.resurrect(e.id), /Only unresolved/);
});

test('similar replacement copies profile/schedule templates safely, while new replacement starts fresh', async t => {
  const f = fixture(t), p = await provider(f.engine), old = f.engine.hire({ ...profile, providerId: p.id, model: 'test-model' }); const rule = f.engine.scheduler.save(definition(old)); const expired = f.engine.scheduler.save({ ...definition(old, { ...daily, type: 'once', runAt: new Date(f.time() - 60000).toISOString() }), name: 'Old one-time work' }); f.engine.endEmployment(old.id, 'deceased');
  assert.throws(() => f.engine.replaceEmployee(old.id, { ...profile, name: '' }, 'similar')); assert.equal(old.employmentStatus, 'deceased');
  const replacement = f.engine.replaceEmployee(old.id, { ...profile, name: 'Sinta', appearance: { ...defaultAppearance, glasses: true } }, 'similar');
  assert.notEqual(old.id, replacement.id); assert.equal(old.employmentStatus, 'fired'); assert.equal(old.replacedBy, replacement.id); assert.equal(replacement.providerId, p.id); assert.deepEqual(replacement.tools, ['read']); assert.equal(replacement.systemPrompt, profile.systemPrompt);
  const cloned = f.engine.s.recurringTasks.find(r => r.employeeId === replacement.id)!; assert.equal(cloned.copiedFromId, rule.id); assert.equal(cloned.enabled, true); assert.equal(rule.enabled, false);
  const expiredCopy = f.engine.s.recurringTasks.find(r => r.employeeId === replacement.id && r.copiedFromId === expired.id)!; assert.equal(expiredCopy.enabled, false); assert.equal(expiredCopy.schedule.runAt, expired.schedule.runAt); f.engine.scheduler.tick(); assert.equal(f.engine.s.tasks.length, 0);
  f.engine.endEmployment(replacement.id, 'deceased'); const fresh = f.engine.replaceEmployee(replacement.id, { ...profile, name: 'Dewi', department: 'Creative', systemPrompt: 'New instructions', tools: [] }, 'new'); assert.equal(fresh.providerId, ''); assert.equal(fresh.department, 'Creative'); assert.equal(f.engine.s.recurringTasks.filter(r => r.employeeId === fresh.id).length, 0);
});

test('seven machines persist, damage/stress over time, stop/release, and never catch up offline damage', async t => {
  const f = fixture(t), e = f.engine.hire(profile); assert.equal(Object.keys(punishments).length, 7);
  for (const method of Object.keys(punishments) as PunishmentMethod[]) {
    const s = f.engine.startTorture(e.id, method, 1); e.position = { ...punishmentSpot }; f.engine.tick(.1); assert.equal(s.status, 'active');
    const hp = e.currentHp, stress = e.stress; f.advance(punishments[method].interval + 1); f.engine.tick(.1); assert.equal(s.pulses, 1); assert.ok(e.stress >= stress); assert.equal(e.currentHp, hp - punishments[method].damage);
    f.engine.tortureAction(s.id, 'pause'); const pausedHp = e.currentHp; f.advance(60000); f.engine.tick(.1); assert.equal(e.currentHp, pausedHp);
    f.engine.tortureAction(s.id, 'resume'); f.engine.save(); const disk = new Store(f.dir), restored = new Engine(disk, () => f.time() + 86400000); restored.recover(); restored.tick(.1); assert.equal(restored.s.employees[0].currentHp, pausedHp); assert.equal(restored.s.tortureSessions.at(-1)!.status, 'active'); restored.stop();
    f.engine.tortureAction(s.id, 'release'); assert.equal(e.tortureId, undefined); assert.equal(s.status, 'released'); assert.ok(f.engine.s.incidents.some(i => i.tortureSessionId === s.id)); e.currentHp = 100;
  }
});

test('torture interrupts agents, blocks scheduled work, can kill, and Off stops devices', async t => {
  const f = fixture(t), p = await provider(f.engine), e = f.engine.hire({ ...profile, providerId: p.id, model: 'test' }); let aborted = false;
  f.engine.providerFactory = () => ({ listModels: async () => ['test'], execute: r => new Promise((_resolve, reject) => r.signal.addEventListener('abort', () => { aborted = true; reject(new Error('cancelled')); })) });
  e.position = { ...e.home }; const task = f.engine.task({ employeeId: e.id, title: 'Active work', instructions: 'Wait' }); f.engine.tick(.1); await eventually(() => f.engine.running.has(task.id));
  const session = f.engine.startTorture(e.id, 'target', 2); assert.ok(aborted); assert.equal(task.status, 'CANCELLED'); assert.throws(() => f.engine.chat(e.id, 'Work'), /Release/);
  const rule = f.engine.scheduler.save(definition(e)); f.engine.scheduler.action(rule.id, 'run'); assert.equal(f.engine.s.scheduleRuns[0].status, 'skipped');
  e.position = { ...punishmentSpot }; f.engine.tick(.1); f.engine.s.settings.violence = 'disabled'; f.advance(3000); f.engine.tick(.1); assert.equal(session.status, 'paused'); assert.equal(e.currentHp, 100);
  f.engine.s.settings.violence = 'full'; f.engine.tortureAction(session.id, 'resume'); for (let i = 0; i < 5; i++) { f.advance(2200); f.engine.tick(.1); } assert.equal(e.employmentStatus, 'deceased'); assert.equal(session.status, 'deceased'); assert.equal(e.corpsePresent, true); assert.equal(rule.enabled, false);
});

test('old local snapshots upgrade without resetting employees, provider IDs, death history or inventory', () => {
  const old = freshState(); old.version = 1; const employee = { ...profile, id: randomUUID(), employmentStatus: 'deceased', endedAt: '2026-01-01T00:00:00Z', position: { x: 680, y: 400 }, home: { x: 136, y: 280 }, destination: { x: 680, y: 400 }, providerId: 'preserved-provider', model: 'preserved-model' };
  const raw = JSON.parse(JSON.stringify(old)); raw.employees = [employee]; delete raw.recurringTasks; delete raw.scheduleRuns; delete raw.tortureSessions; delete raw.settings.weaponDamage; delete raw.settings.blood; delete raw.player.food; delete raw.player.drinks; raw.player.inventory = raw.player.inventory.filter((item: string) => item !== 'Knife');
  const upgraded = migrateState(raw as WorldState); assert.equal(upgraded.version, 2); assert.equal(upgraded.employees[0].providerId, 'preserved-provider'); assert.equal(upgraded.employees[0].corpsePresent, true); assert.equal(upgraded.employees[0].currentHp, 0); assert.equal(upgraded.employees[0].diedAt, '2026-01-01T00:00:00Z'); assert.equal(upgraded.settings.weaponDamage.knife, 18); assert.equal(upgraded.player.food, 3); assert.ok(upgraded.player.inventory.includes('Knife'));
});

test('weapon direction basis and configured damage remain deterministic', t => {
  assert.deepEqual(directions, [{ x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }, { x: 1, y: 0 }]); const f = fixture(t), e = f.engine.hire(profile); aim(f.engine, e, 'rifle'); f.engine.s.settings.weaponDamage.rifle = 10; shoot(f.engine, 'rifle'); assert.equal(e.currentHp, 90); assert.ok(weapons.rifle.cooldown < weapons.knife.cooldown);
});

test('a deliberately paused scheduled task is not automatically resumed by failure retry', async t => {
  const f = fixture(t), p = await provider(f.engine), e = f.engine.hire({ ...profile, providerId: p.id, model: 'test' }); e.position = { ...e.home };
  f.engine.providerFactory = () => ({ listModels: async () => ['test'], execute: r => new Promise((_resolve, reject) => r.signal.addEventListener('abort', () => reject(new Error('stopped')))) });
  const rule = f.engine.scheduler.save({ ...definition(e), retryOnFailure: true }); f.engine.scheduler.action(rule.id, 'run'); f.engine.tick(.1); await eventually(() => f.engine.running.size > 0);
  const task = f.engine.s.tasks[0]; f.engine.taskAction(task.id, 'pause'); await eventually(() => !f.engine.running.size); f.engine.scheduler.tick(); f.advance(10 * 60000); f.engine.scheduler.tick();
  assert.equal(task.status, 'BLOCKED'); assert.equal(f.engine.s.scheduleRuns[0].status, 'cancelled'); assert.equal(f.engine.s.scheduleRuns[0].nextRetryAt, undefined); assert.equal(f.engine.s.scheduleRuns[0].attempt, 1);
});

test('scheduled provider override is honored and disabling that provider aborts the request', async t => {
  const f = fixture(t), first = await provider(f.engine), second = await f.engine.configureProvider({ name: 'Override provider', kind: 'generic', baseUrl: 'http://127.0.0.1:2/v1', model: 'override-model' }); const e = f.engine.hire({ ...profile, providerId: first.id, model: 'employee-model' }); e.position = { ...e.home }; let received = ''; let aborted = false;
  f.engine.providerFactory = config => ({ listModels: async () => ['override-model'], execute: r => new Promise((_resolve, reject) => { received = `${config.id}:${r.model}`; r.signal.addEventListener('abort', () => { aborted = true; reject(new Error('cancelled')); }); }) });
  const rule = f.engine.scheduler.save({ ...definition(e), providerId: second.id, model: 'override-model' }); f.engine.scheduler.action(rule.id, 'run'); f.engine.tick(.1); await eventually(() => !!received); assert.equal(received, `${second.id}:override-model`);
  await f.engine.configureProvider({ id: second.id, name: second.name, kind: second.kind, baseUrl: second.baseUrl, enabled: false }); await eventually(() => !f.engine.running.size); assert.equal(aborted, true); assert.equal(f.engine.s.tasks[0].status, 'CANCELLED'); assert.equal(first.enabled, true);
});

test('report archiving and follow-up creation change durable records, not only the UI', async t => {
  const f = fixture(t), p = await provider(f.engine), e = f.engine.hire({ ...profile, providerId: p.id, model: 'test' }); e.position = { ...e.home };
  f.engine.providerFactory = () => ({ listModels: async () => ['test'], execute: async r => { r.onText('Verified source report'); return { text: 'Verified source report' }; } });
  const task = f.engine.task({ employeeId: e.id, title: 'Original', instructions: 'Make a report' }); f.engine.tick(.1); await eventually(() => task.status === 'COMPLETED');
  const report = f.engine.s.reports[0]; f.engine.reportAction(report.id, 'archive'); assert.equal(report.archived, true); f.engine.reportAction(report.id, 'followup', 'Expand the findings'); assert.equal(f.engine.s.tasks[1].title, 'Follow-up: Original'); assert.match(f.engine.s.tasks[1].instructions, /Verified source report/);
  const disk = new Store(f.dir); assert.equal(disk.state.reports[0].archived, true); assert.equal(disk.state.tasks.length, 2); disk.close();
});

test('interaction returns authoritative stopped position and releases without a one-frame walking race', t => {
  const f = fixture(t), e = f.engine.hire(profile); e.position = { x: 680, y: 400 }; e.destination = { x: 744, y: 400 }; e.state = 'walking'; f.engine.s.player.x = 648; f.engine.s.player.y = 400;
  const acknowledged = f.engine.interact(e.id, true); const stopped = { ...acknowledged.position }; f.advance(1000); f.engine.tick(.1); assert.deepEqual(e.position, stopped);
  f.engine.interact(e.id, false); f.advance(200); f.engine.tick(.1); assert.deepEqual(e.position, stopped); f.advance(101); f.engine.tick(.1); assert.ok(distance(e.position, stopped) > 0);
});
