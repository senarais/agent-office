import Fastify from 'fastify';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { Engine, GameError } from './engine';
import { Store } from './database';
import { appearanceSchema, parseSettings, weaponSchema, punishmentSchema } from './schemas';
import { safeError } from './providers';
import { view } from './gamestate';
import { SocialService } from './social';
import { TelegramService } from './telegram';
import { skillCatalog, skillPreview } from './skills';
import { canStand } from '../../../packages/shared/src/world';
import type { ServerEvent } from '../../../packages/shared/src/types';
import { socialPlatforms } from '../../../packages/shared/src/social';

export async function createApp(directory = process.env.DATA_DIR || '.local-data', ticking = true) {
  const store = new Store(directory); await store.restore(); const engine = new Engine(store); engine.recover();
  const openai = engine.s.providers.find(p => p.kind === 'openai');
  engine.social = new SocialService({
    directory, openaiKey: process.env.OPENAI_API_KEY || (openai ? store.secret(openai.id).apiKey : ''), imageModel: process.env.OPENAI_IMAGE_MODEL || '',
    headless: process.env.SOCIAL_BROWSER_HEADLESS !== 'false', executablePath: process.env.SOCIAL_BROWSER_EXECUTABLE || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  });
  const telegram = new TelegramService(engine); engine.telegram = telegram; telegram.start();
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
  app.get('/api/bootstrap', (_req, reply) => { reply.header('Set-Cookie', `office_session=${token}; Path=/api; HttpOnly; SameSite=Strict`); return { state: view(engine.s), token, demoEnabled: process.env.ENABLE_DEMO_PROVIDER === 'true' }; });
  app.get('/api/state', () => view(engine.s));
  app.get('/api/events', (req, reply) => {
    reply.hijack(); reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const send = (event: ServerEvent) => { if (!reply.raw.destroyed && reply.raw.writableLength < 1048576) reply.raw.write(`data: ${JSON.stringify(event)}\n\n`); };
    send({ type: 'snapshot', state: view(engine.s) }); engine.bus.on('message', send);
    const heartbeat = setInterval(() => { if (!reply.raw.destroyed) reply.raw.write(': heartbeat\n\n'); }, 15000);
    req.raw.on('close', () => { clearInterval(heartbeat); engine.bus.off('message', send); });
  });
  app.post('/api/employees', req => engine.hire(req.body));
  app.put<{ Params: { id: string } }>('/api/employees/:id', req => engine.edit(req.params.id, req.body));
  app.post<{ Params: { id: string } }>('/api/employees/:id/fire', req => { engine.endEmployment(req.params.id, 'fired'); return { ok: true }; });
  app.post<{ Params: { id: string } }>('/api/employees/:id/resurrect', req => engine.resurrect(req.params.id));
  app.post<{ Params: { id: string } }>('/api/employees/:id/heal', req => engine.heal(req.params.id, z.object({ item: z.enum(['food', 'drinks', 'coffee', 'energyDrinks']) }).parse(req.body).item));
  app.post<{ Params: { id: string } }>('/api/employees/:id/replace', req => { const b = z.object({ mode: z.enum(['similar', 'new']), profile: z.unknown() }).parse(req.body); return engine.replaceEmployee(req.params.id, b.profile, b.mode); });
  app.post<{ Params: { id: string } }>('/api/employees/:id/interact', req => { const b = z.object({ hold: z.boolean() }).parse(req.body); return { ok: true, employee: engine.interact(req.params.id, b.hold) }; });
  app.post<{ Params: { id: string } }>('/api/employees/:id/follow', req => { engine.follow(req.params.id); return { ok: true }; });
  app.post('/api/tasks', req => engine.task(req.body));
  app.post('/api/schedules', req => engine.scheduler.save(req.body));
  app.put<{ Params: { id: string } }>('/api/schedules/:id', req => engine.scheduler.save(req.body, req.params.id));
  app.post<{ Params: { id: string } }>('/api/schedules/:id/action', req => engine.scheduler.action(req.params.id, z.object({ action: z.enum(['pause', 'resume', 'delete', 'run']) }).parse(req.body).action));
  app.post('/api/workflows', req => engine.createWorkflow(req.body));
  app.put<{ Params: { id: string } }>('/api/workflows/:id', req => engine.updateWorkflow(req.params.id, req.body));
  app.post<{ Params: { id: string } }>('/api/workflows/:id/action', req => engine.workflowAction(req.params.id, z.object({ action: z.enum(['pause', 'resume', 'delete', 'run']) }).parse(req.body).action));
  app.post<{ Params: { id: string } }>('/api/workflows/runs/:id/approve', req => { const b = z.object({ stepRunId: z.string().uuid(), note: z.string().trim().max(10000).optional() }).parse(req.body); return engine.approveWorkflowStep(req.params.id, b.stepRunId, 'director', engine.office, b.note || ''); });
  app.post<{ Params: { id: string } }>('/api/workflows/runs/:id/revise', req => { const b = z.object({ stepRunId: z.string().uuid(), instructions: z.string().trim().min(1).max(10000) }).parse(req.body); return engine.reviseWorkflowStep(req.params.id, b.stepRunId, b.instructions); });
  app.post<{ Params: { id: string } }>('/api/workflows/runs/:id/cancel', req => engine.cancelWorkflowRun(req.params.id));
  app.post<{ Params: { id: string } }>('/api/social/plans/:id/action', req => engine.socialPlanAction(req.params.id, z.object({ action: z.enum(['retry', 'cancel']) }).parse(req.body).action));
  app.post('/api/torture', req => { const b = z.object({ employeeId: z.string().uuid(), method: punishmentSchema, intensity: z.number().min(.5).max(2).default(1) }).parse(req.body); return engine.startTorture(b.employeeId, b.method, b.intensity); });
  app.post<{ Params: { id: string } }>('/api/torture/:id/action', req => { const b = z.object({ action: z.enum(['pause', 'resume', 'release', 'configure']), method: punishmentSchema.optional(), intensity: z.number().min(.5).max(2).optional() }).parse(req.body); return engine.tortureAction(req.params.id, b.action, b.method, b.intensity); });
  app.post<{ Params: { id: string } }>('/api/tasks/:id/action', req => { const b = z.object({ action: z.enum(['cancel', 'pause', 'retry', 'clarify']), text: z.string().max(10000).optional() }).parse(req.body); return engine.taskAction(req.params.id, b.action, b.text); });
  app.post('/api/chat', req => { const b = z.object({ employeeId: z.string().uuid(), text: z.string().min(1).max(30000), conversationId: z.string().uuid().optional() }).parse(req.body); return engine.chat(b.employeeId, b.text, b.conversationId); });
  app.post<{ Params: { id: string } }>('/api/chat/:id/cancel', req => { engine.cancelChat(req.params.id); return { ok: true }; });
  app.post('/api/providers', req => engine.configureProvider(req.body));
  app.post<{ Params: { id: string } }>('/api/providers/:id/test', req => engine.testProvider(req.params.id));
  app.post('/api/offices', req => engine.createOffice(req.body));
  app.post('/api/offices/switch', req => engine.switchOffice(z.object({ id: z.string().max(80) }).parse(req.body).id));
  app.put<{ Params: { id: string } }>('/api/offices/:id', req => engine.renameOffice(req.params.id, req.body));
  app.post<{ Params: { id: string } }>('/api/reports/:id/action', req => { const b = z.object({ action: z.enum(['read', 'approve', 'revise', 'archive', 'followup']), instructions: z.string().max(10000).optional() }).parse(req.body); return engine.reportAction(req.params.id, b.action, b.instructions); });
  app.post<{ Params: { id: string } }>('/api/reports/:id/telegram', req => engine.sendReportToTelegram(req.params.id));
  app.post('/api/telegram/test', async () => { if (!engine.telegram?.configured) throw new GameError('Telegram is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID, then restart the local server.', 409); await engine.telegram.sendText('PT ABISENA RAIS JAYA · Telegram test successful.'); return { ok: true }; });
  app.post('/api/social/campaigns', req => engine.createSocialCampaign(req.body));
  app.post<{ Params: { id: string } }>('/api/social/campaigns/:id/approve', req => { const b = z.object({ optionId: z.string().uuid() }).parse(req.body); return engine.approveSocialCampaign(req.params.id, b.optionId, 'director'); });
  app.post<{ Params: { id: string } }>('/api/social/campaigns/:id/revise', req => { const b = z.object({ instructions: z.string().trim().min(1).max(10000) }).parse(req.body); return engine.reviseSocialCampaign(req.params.id, b.instructions); });
  app.post<{ Params: { id: string } }>('/api/social/campaigns/:id/cancel', req => engine.cancelSocialCampaign(req.params.id));
  app.post('/api/social/analytics/sync', () => engine.syncSocialAnalytics());
  app.put('/api/social/settings', req => engine.saveSocialSettings(req.body));
  app.get('/api/social/browser/status', () => { if (!engine.social) throw new GameError('Browser automation unavailable', 503); return engine.social.browserStatus(); });
  app.post('/api/social/browser/login', req => { if (!engine.social) throw new GameError('Browser automation unavailable', 503); return engine.social.openLogin(z.object({ platform: z.enum(socialPlatforms) }).parse(req.body).platform); });
  app.post('/api/social/browser/check', req => { if (!engine.social) throw new GameError('Browser automation unavailable', 503); return engine.social.checkSession(z.object({ platform: z.enum(socialPlatforms) }).parse(req.body).platform); });
  app.post('/api/social/browser/cookies', { bodyLimit: 1024 * 1024 }, req => {
    if (!engine.social) throw new GameError('Browser automation unavailable', 503);
    const b = z.object({ platform: z.enum(socialPlatforms), cookies: z.array(z.any()).min(1).max(500) }).parse(req.body);
    return engine.social.importCookies(b.platform, b.cookies);
  });
  app.get('/api/skills', () => ({ skills: skillCatalog() }));
  app.post('/api/skills/preview', req => skillPreview(z.object({ id: z.string().max(200) }).parse(req.body).id));
  app.post('/api/skills/refresh', () => ({ skills: engine.refreshSkills() }));
  app.get<{ Params: { file: string } }>('/api/media/:file', (req, reply) => {
    if (!/^[a-f0-9-]+\.(png|jpe?g|webp|mp4)$/i.test(req.params.file)) throw new GameError('Media not found', 404);
    const path = join(directory, 'media', req.params.file);
    if (!existsSync(path)) throw new GameError('Media not found', 404);
    const extension = req.params.file.split('.').pop()!.toLowerCase();
    return reply.type(extension === 'mp4' ? 'video/mp4' : `image/${extension === 'jpg' ? 'jpeg' : extension}`).send(readFileSync(path));
  });
  app.post('/api/meetings', req => { const b = z.object({ topic: z.string().min(1).max(4000), attendeeIds: z.array(z.string().uuid()).min(1).max(6) }).parse(req.body); return engine.meeting(b.topic, b.attendeeIds); });
  app.post<{ Params: { id: string } }>('/api/meetings/:id/cancel', req => { engine.cancelMeeting(req.params.id); return { ok: true }; });
  app.post<{ Params: { id: string } }>('/api/meetings/:id/action', req => engine.meetingAction(req.params.id, z.object({ index: z.number().int().min(0).max(9) }).parse(req.body).index));
  app.post('/api/combat', req => engine.combat(z.object({ id: z.string().uuid(), weapon: weaponSchema, direction: z.number().int().min(0).max(3), origin: z.object({ x: z.number().finite(), y: z.number().finite() }) }).parse(req.body)));
  app.patch('/api/player', req => {
    const b = z.object({ x: z.number().finite().optional(), y: z.number().finite().optional(), appearance: appearanceSchema.optional(), equipped: weaponSchema.optional() }).parse(req.body);
    if (b.x !== undefined && b.y !== undefined) { if (!canStand({ x: b.x, y: b.y })) throw new GameError('Player position is not walkable'); engine.s.player.x = b.x; engine.s.player.y = b.y; }
    if (b.appearance) engine.s.player.appearance = b.appearance;
    if (b.equipped) engine.s.player.equipped = b.equipped;
    if (b.appearance || b.equipped) engine.emit('world.changed', 'Personal file updated.'); return { ok: true };
  });
  app.patch('/api/settings', req => { Object.assign(engine.s.settings, parseSettings(req.body)); engine.emit('settings.saved', 'Options saved.'); return engine.s.settings; });
  app.post('/api/supplies', req => { const { item } = z.object({ item: z.enum(['food', 'drinks']) }).parse(req.body); engine.s.player[item] = Math.min(20, engine.s.player[item] + 1); engine.emit('world.changed', `${item === 'food' ? 'Lunch box' : 'Drink'} added to inventory.`, undefined, false); return engine.s.player; });
  app.patch('/api/company', req => { const b = z.object({ motto: z.string().max(160).optional(), goals: z.string().max(4000).optional(), wallColor: z.string().regex(/^#[a-fA-F0-9]{6}$/).optional(), plants: z.boolean().optional() }).parse(req.body); Object.assign(engine.s.company, b); engine.emit('world.changed', 'Company notice updated.'); return engine.s.company; });
  app.post('/api/coffee', req => { const b = z.object({ source: z.enum(['machine', 'inventory', 'energy']).default('machine') }).parse(req.body || {}); if (b.source === 'inventory') { if (!engine.s.player.coffee) throw new GameError('No coffee left'); engine.s.player.coffee--; } else if (b.source === 'energy') { if (!engine.s.player.energyDrinks) throw new GameError('No energy drinks left'); engine.s.player.energyDrinks--; } else engine.s.player.coffee = Math.min(9, engine.s.player.coffee + 1); if (b.source !== 'machine') engine.s.player.caffeinatedUntil = Date.now() + 60000; engine.emit('world.changed', b.source === 'machine' ? 'Coffee acquired. Productivity is mostly a beverage.' : 'Caffeinated for one minute. Small cup. Big stride.'); return engine.s.player; });
  app.post('/api/save', async () => { engine.save(); await store.sync(true); engine.snapshot(true); return { savedAt: engine.s.savedAt, storage: engine.s.storage }; });
  const timer = ticking ? setInterval(() => engine.tick(.1), 100) : undefined;
  app.addHook('onClose', async () => { if (timer) clearInterval(timer); telegram.stop(); engine.stop(); });
  return { app, engine };
}
