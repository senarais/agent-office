import Fastify from 'fastify';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Engine, GameError } from './engine';
import { Store } from './database';
import { appearanceSchema, settingsSchema } from './schemas';
import { safeError } from './providers';
import { canStand } from '../../../packages/shared/src/world';
import type { ServerEvent } from '../../../packages/shared/src/types';

export async function createApp(directory = process.env.DATA_DIR || '.local-data', ticking = true) {
  const store = new Store(directory); await store.restore(); const engine = new Engine(store); engine.recover();
  const app = Fastify({ logger: false, bodyLimit: 131072 }); const token = randomBytes(32).toString('hex');
  const equal = (candidate: unknown) => typeof candidate === 'string' && candidate.length === token.length && timingSafeEqual(Buffer.from(candidate), Buffer.from(token));
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff');
    const host = (req.headers.host || '').split(':')[0];
    if (!['localhost', '127.0.0.1'].includes(host)) throw new GameError('Localhost access only', 403);
    const origin = req.headers.origin;
    if (origin) { let url: URL; try { url = new URL(origin); } catch { throw new GameError('Invalid origin', 403); } if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1'].includes(url.hostname) || !['5173', '3001', process.env.GAME_PORT || '5173', process.env.PORT || '3001'].includes(url.port)) throw new GameError('Origin rejected', 403); }
    if (req.headers['sec-fetch-site'] === 'cross-site') throw new GameError('Cross-site request rejected', 403);
    if (!['GET', 'HEAD'].includes(req.method) && !equal(req.headers['x-office-token'])) throw new GameError('Local session expired. Reload the office.', 403);
    if (req.url === '/api/events' && !equal((req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('office_session='))?.slice(15))) throw new GameError('Start the local game first', 403);
  });
  app.setErrorHandler((error, _req, reply) => { const status = error instanceof GameError ? error.status : error instanceof z.ZodError ? 400 : 500; reply.status(status).send({ error: error instanceof z.ZodError ? error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') : safeError(error) }); });
  app.get('/api/health', () => ({ ok: true }));
  app.get('/api/bootstrap', (_req, reply) => { reply.header('Set-Cookie', `office_session=${token}; Path=/api; HttpOnly; SameSite=Strict`); return { state: engine.s, token, demoEnabled: process.env.ENABLE_DEMO_PROVIDER === 'true' }; });
  app.get('/api/state', () => engine.s);
  app.get('/api/events', (req, reply) => {
    reply.hijack(); reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const send = (event: ServerEvent) => { if (!reply.raw.destroyed && reply.raw.writableLength < 1048576) reply.raw.write(`data: ${JSON.stringify(event)}\n\n`); };
    send({ type: 'snapshot', state: engine.s }); engine.bus.on('message', send);
    const heartbeat = setInterval(() => { if (!reply.raw.destroyed) reply.raw.write(': heartbeat\n\n'); }, 15000);
    req.raw.on('close', () => { clearInterval(heartbeat); engine.bus.off('message', send); });
  });
  app.post('/api/employees', req => engine.hire(req.body));
  app.put<{ Params: { id: string } }>('/api/employees/:id', req => engine.edit(req.params.id, req.body));
  app.post<{ Params: { id: string } }>('/api/employees/:id/fire', req => { engine.endEmployment(req.params.id, 'fired'); return { ok: true }; });
  app.post<{ Params: { id: string } }>('/api/employees/:id/interact', req => { const b = z.object({ hold: z.boolean() }).parse(req.body); engine.interact(req.params.id, b.hold); return { ok: true }; });
  app.post<{ Params: { id: string } }>('/api/employees/:id/follow', req => { engine.follow(req.params.id); return { ok: true }; });
  app.post('/api/tasks', req => engine.task(req.body));
  app.post<{ Params: { id: string } }>('/api/tasks/:id/action', req => { const b = z.object({ action: z.enum(['cancel', 'pause', 'retry', 'clarify']), text: z.string().max(10000).optional() }).parse(req.body); return engine.taskAction(req.params.id, b.action, b.text); });
  app.post('/api/chat', req => { const b = z.object({ employeeId: z.string().uuid(), text: z.string().min(1).max(30000), conversationId: z.string().uuid().optional() }).parse(req.body); return engine.chat(b.employeeId, b.text, b.conversationId); });
  app.post<{ Params: { id: string } }>('/api/chat/:id/cancel', req => { engine.cancelChat(req.params.id); return { ok: true }; });
  app.post('/api/providers', req => engine.configureProvider(req.body));
  app.post<{ Params: { id: string } }>('/api/providers/:id/test', req => engine.testProvider(req.params.id));
  app.post<{ Params: { id: string } }>('/api/reports/:id/action', req => { const b = z.object({ action: z.enum(['read', 'approve', 'revise']), instructions: z.string().max(10000).optional() }).parse(req.body); return engine.reportAction(req.params.id, b.action, b.instructions); });
  app.post('/api/meetings', req => { const b = z.object({ topic: z.string().min(1).max(4000), attendeeIds: z.array(z.string().uuid()).min(1).max(6) }).parse(req.body); return engine.meeting(b.topic, b.attendeeIds); });
  app.post<{ Params: { id: string } }>('/api/meetings/:id/cancel', req => { engine.cancelMeeting(req.params.id); return { ok: true }; });
  app.post<{ Params: { id: string } }>('/api/meetings/:id/action', req => engine.meetingAction(req.params.id, z.object({ index: z.number().int().min(0).max(9) }).parse(req.body).index));
  app.post('/api/combat', req => { const b = z.object({ employeeId: z.string().uuid(), weapon: z.enum(['hand', 'whip', 'rifle']) }).parse(req.body); return engine.combat(b.employeeId, b.weapon); });
  app.patch('/api/player', req => {
    const b = z.object({ x: z.number().finite().optional(), y: z.number().finite().optional(), appearance: appearanceSchema.optional(), equipped: z.enum(['hand', 'whip', 'rifle']).optional() }).parse(req.body);
    if (b.x !== undefined && b.y !== undefined) { if (!canStand({ x: b.x, y: b.y })) throw new GameError('Player position is not walkable'); engine.s.player.x = b.x; engine.s.player.y = b.y; }
    if (b.appearance) engine.s.player.appearance = b.appearance;
    if (b.equipped) engine.s.player.equipped = b.equipped;
    if (b.appearance || b.equipped) engine.emit('world.changed', 'Personal file updated.'); return { ok: true };
  });
  app.patch('/api/settings', req => { Object.assign(engine.s.settings, settingsSchema.parse(req.body)); engine.emit('settings.saved', 'Options saved.'); return engine.s.settings; });
  app.patch('/api/company', req => { const b = z.object({ motto: z.string().max(160).optional(), goals: z.string().max(4000).optional(), wallColor: z.string().regex(/^#[a-fA-F0-9]{6}$/).optional(), plants: z.boolean().optional() }).parse(req.body); Object.assign(engine.s.company, b); engine.emit('world.changed', 'Company notice updated.'); return engine.s.company; });
  app.post('/api/coffee', req => { const b = z.object({ source: z.enum(['machine', 'inventory', 'energy']).default('machine') }).parse(req.body || {}); if (b.source === 'inventory') { if (!engine.s.player.coffee) throw new GameError('No coffee left'); engine.s.player.coffee--; } else if (b.source === 'energy') { if (!engine.s.player.energyDrinks) throw new GameError('No energy drinks left'); engine.s.player.energyDrinks--; } else engine.s.player.coffee = Math.min(9, engine.s.player.coffee + 1); if (b.source !== 'machine') engine.s.player.caffeinatedUntil = Date.now() + 60000; engine.emit('world.changed', b.source === 'machine' ? 'Coffee acquired. Productivity is mostly a beverage.' : 'Caffeinated for one minute. Small cup. Big stride.'); return engine.s.player; });
  app.post('/api/save', async () => { engine.save(); await store.sync(true); engine.snapshot(true); return { savedAt: engine.s.savedAt, storage: engine.s.storage }; });
  const timer = ticking ? setInterval(() => engine.tick(.1), 100) : undefined;
  app.addHook('onClose', async () => { if (timer) clearInterval(timer); engine.stop(); });
  return { app, engine };
}
