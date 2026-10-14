import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { Store } from '../apps/server/src/database';
import { Engine } from '../apps/server/src/engine';
import { createApp } from '../apps/server/src/api';
import { createProvider } from '../apps/server/src/providers';
import { defaultAppearance } from '../packages/shared/src/types';
import type { ProviderConfig } from '../packages/shared/src/types';
import { canStand, distance, findPath, furniture, meetingSpots, moveWithCollision, spawn, workstations } from '../packages/shared/src/world';

const profile = { name: 'Nisa', role: 'Research Analyst', department: 'Research', appearance: defaultAppearance };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const fixture = () => { const dir = mkdtempSync(join(tmpdir(), 'pt-office-test-')); const engine = new Engine(new Store(dir)); return { dir, engine, close: () => { engine.stop(); rmSync(dir, { recursive: true, force: true }); } }; };
async function eventually(check: () => boolean, timeout = 8000) { const start = Date.now(); while (!check()) { if (Date.now() - start > timeout) assert.fail('Condition timed out'); await new Promise(r => setTimeout(r, 15)); } }

test('all rooms, interactables, workstations and meeting seats are reachable; movement never tunnels', () => {
  for (const p of [...furniture.flatMap(f => f.point ? [f.point] : []), ...Object.values(workstations).flat(), ...meetingSpots]) {
    assert.ok(canStand(p), `Blocked destination ${JSON.stringify(p)}`); const path = findPath(spawn, p); assert.ok(path.length, `No path to ${JSON.stringify(p)}`);
    assert.ok(path.every(canStandPoint => canStand(canStandPoint))); assert.ok(distance(path.at(-1)!, p) <= 12);
    for (let i = 1; i < path.length; i++) assert.ok(distance(path[i], path[i - 1]) <= 16.1);
  }
  const p = moveWithCollision(spawn, -9000, 0); assert.ok(canStand(p)); assert.ok(p.x >= 38);
  assert.deepEqual(findPath(spawn, { x: 136, y: 704 }).at(-1), { x: 136, y: 704 }, 'Off-grid coffee destination must arrive exactly, not stall eight pixels away');
});

test('hire, edit appearance, settings and employee persistence; no seeded roster', () => {
  const f = fixture(); assert.equal(f.engine.s.employees.length, 0);
  const e = f.engine.hire(profile); f.engine.edit(e.id, { ...profile, name: 'Nisa Putri', appearance: { ...defaultAppearance, glasses: true } }); f.engine.s.settings.music = .15; f.engine.save();
  const reload = new Store(f.dir); assert.equal(reload.state.employees[0].name, 'Nisa Putri'); assert.equal(reload.state.employees[0].appearance.glasses, true); assert.equal(reload.state.settings.music, .15); reload.close(); f.close();
});

test('provider-less task becomes honestly blocked after actual walk', async () => {
  const f = fixture(); const e = f.engine.hire(profile); const task = f.engine.task({ employeeId: e.id, title: 'Real research', instructions: 'Find evidence.' }); assert.equal(task.status, 'WALKING_TO_WORKSTATION'); const start = { ...e.position };
  f.engine.tick(.1); assert.ok(distance(e.position, start) > 0);
  for (let i = 0; i < 150; i++) f.engine.tick(.1);
  await eventually(() => task.status === 'BLOCKED'); assert.match(task.error!, /NO AGENT PROVIDER CONNECTED/); assert.equal(task.result, ''); assert.equal(f.engine.s.reports.length, 0); f.close();
});

test('generic adapter performs real HTTP models/chat; task completes, report returns and conversation persists', async () => {
  let requests = 0; let authorization = ''; const server = createServer(async (req, res) => {
    authorization = req.headers.authorization || '';
    if (req.url === '/v1/models') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ data: [{ id: 'test-model' }] })); return; }
    if (req.url === '/v1/chat/completions') { requests++; let body = ''; for await (const chunk of req) body += chunk; assert.ok(JSON.parse(body).messages.length >= 2); res.writeHead(200, { 'Content-Type': 'text/event-stream' }); for (const delta of ['Actual ', 'HTTP ', 'result.']) res.write(`data: ${JSON.stringify({ id: 'test', choices: [{ index: 0, delta: { content: delta } }] })}\n\n`); res.end('data: [DONE]\n\n'); return; }
    res.writeHead(404).end();
  }); await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const f = fixture();
  try {
    const p = await f.engine.configureProvider({ name: 'Test HTTP endpoint', kind: 'generic', baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, apiKey: 'test-secret-value' }); await f.engine.testProvider(p.id); assert.deepEqual(p.models, ['test-model']);
    const e = f.engine.hire({ ...profile, providerId: p.id, model: 'test-model' }); const task = f.engine.task({ employeeId: e.id, title: 'Research', instructions: 'Read this request' }); for (let i = 0; i < 150; i++) f.engine.tick(.1);
    await eventually(() => task.status === 'COMPLETED'); assert.equal(task.result, 'Actual HTTP result.'); assert.equal(authorization, 'Bearer test-secret-value'); assert.equal(e.state, 'report'); assert.ok(e.reportId); assert.equal(f.engine.s.reports.length, 1); assert.ok(distance(e.destination, f.engine.s.player) < 60);
    const conversation = f.engine.chat(e.id, 'Hello, real endpoint'); await eventually(() => f.engine.s.messages.find(m => m.id === conversation.messageId)?.status === 'complete'); assert.equal(requests, 2);
    const reload = new Store(f.dir); assert.equal(reload.state.messages.at(-1)?.text, 'Actual HTTP result.'); assert.equal(reload.state.tasks[0].status, 'COMPLETED'); assert.equal(reload.state.conversations[0].id, conversation.conversationId); reload.close();
    assert.ok(!JSON.stringify(f.engine.s).includes('test-secret-value')); assert.ok(!readFileSync(join(f.dir, 'office.sqlite')).includes(Buffer.from('test-secret-value')));
    f.engine.reportAction(e.reportId!, 'approve'); assert.equal(f.engine.s.reports[0].approved, true); assert.equal(e.reportId, undefined);
  } finally { f.close(); await new Promise<void>(r => server.close(() => r())); }
});

test('OpenCode SDK adapter uses sessions, selected model, tool allowlist, streamed events and abort', async () => {
  const events = new Set<import('node:http').ServerResponse>(); let promptBody: Record<string, unknown> = {}; let aborted = false; let pending: import('node:http').ServerResponse | undefined;
  const server = createServer(async (req, res) => {
    const path = req.url?.split('?')[0];
    if (path === '/event') { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write(': connected\n\n'); events.add(res); req.on('close', () => events.delete(res)); return; }
    res.setHeader('Content-Type', 'application/json');
    if (path === '/config/providers') return res.end(JSON.stringify({ providers: [{ id: 'local', models: { coder: { id: 'coder' } } }], default: {} }));
    if (path === '/experimental/tool/ids') return res.end(JSON.stringify(['read', 'bash', 'plugin_write']));
    if (path === '/session' && req.method === 'POST') return res.end(JSON.stringify({ id: 'session-test', title: 'Test', time: { created: 0, updated: 0 } }));
    if (path === '/session/session-test/abort') { aborted = true; pending?.end('{}'); return res.end('true'); }
    if (path === '/session/session-test/message') {
      let body = ''; for await (const chunk of req) body += chunk; promptBody = JSON.parse(body);
      if ((promptBody.parts as { text: string }[])[0].text === 'slow') { pending = res; return; }
      const part = { id: 'part-1', sessionID: 'session-test', messageID: 'msg-1', type: 'text', text: 'OpenCode protocol result' };
      for (const event of events) event.write(`data: ${JSON.stringify({ type: 'message.part.updated', properties: { part } })}\n\n`);
      return res.end(JSON.stringify({ info: { role: 'assistant', tokens: { input: 3, output: 4 }, cost: .001 }, parts: [part] }));
    }
    res.statusCode = 404; res.end('{}');
  }); await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const p: ProviderConfig = { id: 'test', kind: 'opencode', name: 'Test', baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, enabled: true, models: [], status: 'untested', hasSecret: false };
  try { const adapter = createProvider(p, {}); assert.deepEqual(await adapter.listModels(), ['local/coder']); let text = ''; let session = ''; const result = await adapter.execute({ model: 'local/coder', system: 'Test', messages: [{ role: 'user', content: 'Do work' }], signal: new AbortController().signal, tools: ['read'], onSession: s => session = s, onText: t => text += t, onActivity: () => {} }); assert.equal(session, 'session-test'); assert.equal(result.text, 'OpenCode protocol result'); assert.match(text, /OpenCode/); assert.deepEqual(promptBody.model, { providerID: 'local', modelID: 'coder' }); assert.equal((promptBody.tools as Record<string, boolean>).bash, false); assert.equal((promptBody.tools as Record<string, boolean>).read, true); assert.equal((promptBody.tools as Record<string, boolean>).plugin_write, false); assert.equal(aborted, false);
    const controller = new AbortController(); const slow = adapter.execute({ model: 'local/coder', system: 'Test', messages: [{ role: 'user', content: 'slow' }], sessionId: session, signal: controller.signal, tools: [], onSession: () => {}, onText: () => {}, onActivity: () => {} }); const rejected = assert.rejects(slow); await eventually(() => !!pending); controller.abort(); await rejected; await eventually(() => aborted);
  }
  finally { for (const event of events) event.end(); server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); }
});

test('Command Code CLI adapter lists models, streams NDJSON, resumes sessions, enables tools and aborts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pt-commandcode-')); const script = join(dir, 'cmd.mjs'); const capture = join(dir, 'capture.json');
  writeFileSync(script, `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (args.includes('--list-models')) { process.stdout.write('Available models  ·  2 models\\n\\nOpen Source\\n\\nlocal/coder               a coder\\nclaude-sonnet-4-6         frontier coding\\n'); process.exit(0); }
let input = ''; process.stdin.on('data', chunk => input += chunk); process.stdin.on('end', () => {
  if (input.includes('slow')) { setInterval(() => {}, 1000); return; }
  writeFileSync(process.env.CC_CAPTURE, JSON.stringify({ argv: args, stdin: input }));
  const frame = value => process.stdout.write(JSON.stringify(value) + '\\n');
  frame({ type: 'event', event: { type: 'run_start', sessionId: 'cc-session-1' } });
  frame({ type: 'event', event: { type: 'text_delta', delta: 'Command ' } });
  frame({ type: 'event', event: { type: 'tool_running', toolName: 'read_file', description: 'reading' } });
  frame({ type: 'event', event: { type: 'text_delta', delta: 'Code result' } });
  frame({ type: 'result', subtype: 'success', sessionId: 'cc-session-1', usage: { inputTokens: 12, outputTokens: 5 }, finalText: 'Command Code result' });
});\n`);
  chmodSync(script, 0o755); process.env.CC_CAPTURE = capture;
  const p: ProviderConfig = { id: 'cc', kind: 'commandcode', name: 'Command Code', baseUrl: script, enabled: true, models: [], status: 'untested', hasSecret: false };
  const inspect = () => JSON.parse(readFileSync(capture, 'utf8')) as { argv: string[]; stdin: string };
  try {
    const adapter = createProvider(p, {}); assert.deepEqual(await adapter.listModels(), ['local/coder', 'claude-sonnet-4-6']);
    let text = ''; let session = ''; const activity: string[] = [];
    const result = await adapter.execute({ model: 'local/coder', system: 'SYSTEM PROMPT', messages: [{ role: 'user', content: 'Do work' }], signal: new AbortController().signal, tools: ['read'], onSession: s => session = s, onText: t => text += t, onActivity: (a, d) => activity.push(`${a}|${d}`) });
    assert.equal(session, 'cc-session-1'); assert.equal(text, 'Command Code result'); assert.equal(result.text, 'Command Code result'); assert.equal(result.usage?.totalTokens, 17);
    const meta = inspect();
    assert.ok(meta.argv.includes('--model') && meta.argv.includes('local/coder')); assert.ok(!meta.argv.includes('--yolo')); assert.match(meta.stdin, /SYSTEM PROMPT/); assert.ok(activity.some(a => a.startsWith('reading|')));
    await adapter.execute({ model: 'local/coder', sessionId: 'cc-session-1', system: 'ignored', messages: [{ role: 'user', content: 'again' }], signal: new AbortController().signal, tools: ['edit'], onSession: () => {}, onText: () => {}, onActivity: () => {} });
    const meta2 = inspect();
    assert.ok(meta2.argv.includes('--resume') && meta2.argv.includes('cc-session-1')); assert.ok(meta2.argv.includes('--yolo')); assert.equal(meta2.stdin, 'again');
    const controller = new AbortController(); const slow = adapter.execute({ model: 'local/coder', system: 'x', messages: [{ role: 'user', content: 'slow' }], signal: controller.signal, tools: [], onSession: () => {}, onText: () => {}, onActivity: () => {} });
    const rejected = assert.rejects(slow, /cancelled/i); await new Promise(r => setTimeout(r, 150)); controller.abort(); await rejected;
    await assert.rejects(createProvider({ ...p, baseUrl: join(dir, 'missing-cmd') }, {}).listModels(), /not found/i);
  } finally { delete process.env.CC_CAPTURE; rmSync(dir, { recursive: true, force: true }); }
});

test('death and firing interrupt execution; multiple rifle hits create a persistent unresolved body', async (t) => {
  const f = fixture(); let wasAborted = false;
  t.after(f.close); let clock = Date.now(); f.engine.clock = () => clock;
  const p = await f.engine.configureProvider({ kind: 'generic', name: 'Slow provider', baseUrl: 'http://127.0.0.1:1/v1', model: 'slow' });
  f.engine.providerFactory = () => ({ listModels: async () => ['slow'], execute: r => new Promise((_resolve, reject) => { r.signal.addEventListener('abort', () => { wasAborted = true; reject(new DOMException('Aborted', 'AbortError')); }); }) });
  const e = f.engine.hire({ ...profile, providerId: p.id, model: 'slow' }); e.position = { ...e.home }; f.engine.s.player.x = e.position.x - 32; f.engine.s.player.y = e.position.y;
  const task = f.engine.task({ employeeId: e.id, title: 'Long work', instructions: 'Wait for cancellation' }); f.engine.tick(.1); await eventually(() => f.engine.running.has(task.id));
  const hit = (weapon: 'hand' | 'rifle') => { clock += 1000; f.engine.s.player.equipped = weapon; return f.engine.combat({ id: randomUUID(), weapon, origin: { x: f.engine.s.player.x, y: f.engine.s.player.y }, direction: 3 }); };
  hit('hand'); assert.equal(e.employmentStatus, 'active'); assert.ok(e.morale < 85);
  hit('rifle'); assert.equal(e.employmentStatus, 'active'); assert.equal(e.currentHp, 69);
  for (let i = 0; i < 3; i++) hit('rifle'); assert.equal(e.employmentStatus, 'deceased'); assert.equal(task.status, 'CANCELLED'); assert.ok(wasAborted); assert.equal(e.corpsePresent, true); assert.equal(e.endedAt, undefined);
  assert.throws(() => f.engine.chat(e.id, 'You cannot respond'), /deceased/); assert.throws(() => f.engine.task({ employeeId: e.id, title: 'No', instructions: 'No' }), /deceased/);
  const other = f.engine.hire({ ...profile, name: 'Bima' }); f.engine.endEmployment(other.id, 'fired'); assert.equal(other.state, 'leaving'); for (let i = 0; i < 150; i++) f.engine.tick(.1); assert.equal(other.state, 'idle');
  await new Promise(r => setTimeout(r, 30)); const reload = new Store(f.dir); assert.equal(reload.state.employees[0].employmentStatus, 'deceased'); assert.equal(reload.state.employees[0].corpsePresent, true); assert.equal(reload.state.employees[1].employmentStatus, 'fired'); assert.ok(reload.state.history.some(h => h.status === 'deceased')); reload.close();
});

test('violence accessibility settings enforce Off and nonlethal Reduced mode server-side', async (t) => {
  const f = fixture(); t.after(f.close); const e = f.engine.hire(profile); f.engine.s.player.x = e.position.x; f.engine.s.player.y = e.position.y; f.engine.s.settings.violence = 'disabled';
  const shot = { id: randomUUID(), weapon: 'rifle' as const, origin: { ...e.position }, direction: 0 }; f.engine.s.player.equipped = 'rifle';
  assert.throws(() => f.engine.combat(shot), /disabled/); f.engine.s.settings.violence = 'slapstick'; e.currentHp = 3; f.engine.combat(shot); assert.equal(e.currentHp, 1); assert.equal(e.employmentStatus, 'active');
});

test('task pause/cancel and restart recovery never silently re-execute', async () => {
  const f = fixture(); const e = f.engine.hire(profile); const task = f.engine.task({ employeeId: e.id, title: 'Queued work', instructions: 'Do not start twice' }); f.engine.taskAction(task.id, 'pause'); assert.equal(task.status, 'BLOCKED'); f.engine.taskAction(task.id, 'retry'); assert.equal(task.status, 'WALKING_TO_WORKSTATION'); f.engine.taskAction(task.id, 'cancel'); assert.equal(task.status, 'CANCELLED');
  task.status = 'WORKING'; f.engine.recover(); assert.equal(task.status, 'BLOCKED'); assert.match(task.error!, /Server restarted/); f.close();
});

test('API validates data, rejects cross-site mutations, and returns honest provider errors', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pt-api-test-')); const { app } = await createApp(dir, false);
  const bootstrap = await app.inject({ method: 'GET', url: '/api/bootstrap' }); assert.equal(bootstrap.statusCode, 200); const token = bootstrap.json().token; const headers = { 'x-office-token': token };
  assert.equal((await app.inject({ method: 'POST', url: '/api/employees', payload: profile })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: '/api/employees', payload: profile, headers: { ...headers, origin: 'https://evil.example' } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: '/api/employees', payload: { ...profile, name: '' }, headers })).statusCode, 400);
  const hire = await app.inject({ method: 'POST', url: '/api/employees', payload: profile, headers }); assert.equal(hire.statusCode, 200);
  const chat = await app.inject({ method: 'POST', url: '/api/chat', payload: { employeeId: hire.json().id, text: 'Hi' }, headers }); assert.equal(chat.statusCode, 409); assert.match(chat.json().error, /NO AGENT PROVIDER CONNECTED/);
  const saved = await app.inject({ method: 'PATCH', url: '/api/settings', payload: { time: 'night', music: .1 }, headers }); assert.equal(saved.json().time, 'night');
  assert.equal((await app.inject({ method: 'PATCH', url: '/api/settings', payload: { music: 7 }, headers })).statusCode, 400);
  assert.equal((await app.inject({ method: 'POST', url: '/api/providers', payload: { kind: 'generic', name: 'Bad URL', baseUrl: 'file:///etc/passwd' }, headers })).statusCode, 400);
  await app.close(); const reload = new Store(dir); assert.equal(reload.state.settings.time, 'night'); reload.close(); rmSync(dir, { recursive: true, force: true });
});

test('bad credentials and offline provider are surfaced, never turned into successful AI output', async () => {
  const server = createServer((_req, res) => { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'Incorrect API key provided: sk-secret-private', type: 'invalid_request_error' } })); }); await new Promise<void>(r => server.listen(0, '127.0.0.1', r)); const f = fixture();
  try { const p = await f.engine.configureProvider({ name: 'Bad credentials', kind: 'generic', baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, apiKey: 'sk-secret-private' }); await assert.rejects(() => f.engine.testProvider(p.id), /Incorrect API key/); assert.equal(p.status, 'error'); assert.ok(!p.error!.includes('sk-secret-private')); }
  finally { f.close(); await new Promise<void>(r => server.close(() => r())); }
});

test('meetings gather actual actors, share agent context, persist minutes and create action tasks once', async () => {
  const f = fixture(); const p = await f.engine.configureProvider({ name: 'Meeting fixture', kind: 'generic', baseUrl: 'http://127.0.0.1:1/v1', model: 'meeting-test' });
  const first = f.engine.hire({ ...profile, providerId: p.id, model: 'meeting-test' }); const second = f.engine.hire({ ...profile, name: 'Bima', department: 'Development', providerId: p.id, model: 'meeting-test' }); const prompts: string[] = [];
  f.engine.providerFactory = () => ({ listModels: async () => ['meeting-test'], execute: async r => { const prompt = r.messages.at(-1)!.content; prompts.push(prompt); const text = prompt.includes('Return only JSON') ? JSON.stringify({ summary: 'Prototype first; verify it.', decisions: ['Test before launch'], actions: [{ employeeId: second.id, title: 'Implement smoke test' }] }) : prompts.length === 1 ? 'Research contribution with evidence.' : 'Developer contribution using the research.'; r.onText(text); return { text }; } });
  const meeting = f.engine.meeting('Launch readiness', [first.id, second.id]); assert.equal(meeting.status, 'gathering'); for (let i = 0; i < 200; i++) f.engine.tick(.1); await eventually(() => meeting.status === 'completed'); assert.equal(meeting.messages.length, 2); assert.match(prompts[1], /Research contribution/); assert.equal(meeting.summary, 'Prototype first; verify it.');
  const task = f.engine.meetingAction(meeting.id, 0); assert.equal(task.employeeId, second.id); assert.equal(meeting.actions[0].taskId, task.id); assert.throws(() => f.engine.meetingAction(meeting.id, 0), /already assigned/);
  const reload = new Store(f.dir); assert.equal(reload.state.meetings[0].decisions[0], 'Test before launch'); reload.close(); f.close();
});

test('cancelled chat remains cancelled, and a maximal current message is not lost by context budgeting', async () => {
  const f = fixture(); const p = await f.engine.configureProvider({ name: 'Chat fixture', kind: 'generic', baseUrl: 'http://127.0.0.1:1/v1', model: 'test' }); const e = f.engine.hire({ ...profile, providerId: p.id, model: 'test' }); let received = '';
  f.engine.providerFactory = () => ({ listModels: async () => ['test'], execute: r => new Promise((_resolve, reject) => { received = r.messages.at(-1)!.content; r.onText('Partial response'); r.signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError'))); }) });
  const chat = f.engine.chat(e.id, 'x'.repeat(30000)); await eventually(() => received.length > 0); assert.equal(received.length, 30000); f.engine.cancelChat(chat.messageId); await eventually(() => !f.engine.running.size); assert.equal(f.engine.s.messages.at(-1)?.status, 'cancelled'); assert.equal(f.engine.s.messages.at(-1)?.text, 'Partial response'); f.close();
});

test('Supabase replica uses secret-free records and restores permanent state into an empty local save', async () => {
  const rows = new Map<string, unknown[]>(); const server = createServer(async (req, res) => { const table = req.url!.split('?')[0].split('/').at(-1)!; res.setHeader('Content-Type', 'application/json'); if (req.method === 'GET') return res.end(JSON.stringify(rows.get(table) || [])); let raw = ''; for await (const chunk of req) raw += chunk; const data = JSON.parse(raw); assert.ok(!raw.includes('super-secret-key')); rows.set(table, Array.isArray(data) ? data : [data]); res.statusCode = 201; res.end(); }); await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const oldUrl = process.env.SUPABASE_URL, oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; const f = fixture(); const otherDir = mkdtempSync(join(tmpdir(), 'pt-restore-'));
  try { const p = await f.engine.configureProvider({ name: 'Remote fixture', kind: 'generic', baseUrl: 'http://127.0.0.1:1/v1', apiKey: 'super-secret-key' }); const e = f.engine.hire({ ...profile, providerId: p.id }); f.engine.endEmployment(e.id, 'deceased'); process.env.SUPABASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'; await f.engine.store.sync(true); assert.equal(f.engine.s.storage.mode, 'supabase'); assert.ok(rows.has('employee_appearance')); assert.ok(rows.has('employee_provider_config')); assert.ok(rows.has('inventory'));
    const restored = new Store(otherDir); await restored.restore(); assert.equal(restored.state.employees[0].employmentStatus, 'deceased'); assert.equal(restored.state.providers[0].hasSecret, false); assert.deepEqual(restored.secret(p.id), {}); restored.close();
  } finally { if (oldUrl) process.env.SUPABASE_URL = oldUrl; else delete process.env.SUPABASE_URL; if (oldKey) process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey; else delete process.env.SUPABASE_SERVICE_ROLE_KEY; f.close(); rmSync(otherDir, { recursive: true, force: true }); await new Promise<void>(r => server.close(() => r())); }
});

test('failed initial cloud restore cannot overwrite an existing remote backup with an empty local fallback', async () => {
  let writes = 0; const server = createServer((req, res) => { if (req.method === 'POST') writes++; res.writeHead(503); res.end('unavailable'); }); await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const oldUrl = process.env.SUPABASE_URL, oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY; const dir = mkdtempSync(join(tmpdir(), 'pt-cloud-outage-'));
  try { process.env.SUPABASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'; const store = new Store(dir); await store.restore(); assert.equal(store.state.storage.restoreBlocked, true); store.save(); await store.sync(true); assert.equal(writes, 0); store.close(); const reloaded = new Store(dir); await reloaded.sync(true); assert.equal(writes, 0); assert.equal(reloaded.state.storage.restoreBlocked, true); reloaded.close(); }
  finally { if (oldUrl) process.env.SUPABASE_URL = oldUrl; else delete process.env.SUPABASE_URL; if (oldKey) process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey; else delete process.env.SUPABASE_SERVICE_ROLE_KEY; rmSync(dir, { recursive: true, force: true }); await new Promise<void>(r => server.close(() => r())); }
});

test('disabling a provider cancels real work and clears the employee working animation', async () => {
  const f = fixture(); const p = await f.engine.configureProvider({ name: 'Disable fixture', kind: 'generic', baseUrl: 'http://127.0.0.1:1/v1', model: 'test' }); const e = f.engine.hire({ ...profile, providerId: p.id, model: 'test' }); e.position = { ...e.home }; let aborted = false;
  f.engine.providerFactory = () => ({ listModels: async () => ['test'], execute: r => new Promise((_resolve, reject) => { r.signal.addEventListener('abort', () => { aborted = true; reject(new DOMException('Stopped', 'AbortError')); }); }) });
  const task = f.engine.task({ employeeId: e.id, title: 'Working', instructions: 'Wait' }); f.engine.tick(.1); await eventually(() => f.engine.running.has(task.id)); await f.engine.configureProvider({ id: p.id, name: p.name, kind: p.kind, baseUrl: p.baseUrl, enabled: false }); await eventually(() => !f.engine.running.size); assert.ok(aborted); assert.equal(task.status, 'CANCELLED'); assert.ok(task.completedAt); assert.equal(e.state, 'blocked'); assert.match(e.bubble, /Provider disabled/); f.close();
});
