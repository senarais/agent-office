import { EventEmitter } from 'node:events';
import type { Employee, EventType, Point, ProviderConfig, Task, WorldState, Weapon, Meeting, ServerEvent } from '../../../packages/shared/src/types';
import { terminalTasks } from '../../../packages/shared/src/types';
import { canStand, distance, exit, findPath, meetingSpots, nearbyWalkable, moveWithCollision, spawn, workstations } from '../../../packages/shared/src/world';
import { Store, id, now } from './database';
import { createProvider, safeError } from './providers';
import type { AgentRequest, AgentProvider } from './providers';
import { employeeSchema, taskSchema, providerSchema } from './schemas';

export class GameError extends Error { constructor(message: string, public status = 400) { super(message); } }
export class Engine {
  bus = new EventEmitter(); running = new Map<string, { employeeId: string; controller: AbortController }>();
  private paths = new Map<string, { goal: string; points: Point[] }>();
  private holds = new Map<string, number>(); private attacks = new Map<string, number>();
  private lastSnapshot = 0; private lastSave = 0; private lastIdle = 0; private meetingRuns = new Set<string>(); private stopped = false;
  providerFactory: (config: ProviderConfig, secret: ReturnType<Store['secret']>) => AgentProvider = createProvider;
  constructor(public store: Store) { this.bus.setMaxListeners(100); }
  get s(): WorldState { return this.store.state; }
  recover() {
    for (const t of this.s.tasks) if (['STARTING', 'WORKING', 'WAITING_FOR_TOOL', 'WAITING_FOR_USER'].includes(t.status)) { t.status = 'BLOCKED'; t.error = 'Server restarted during work. Retry explicitly to avoid duplicate provider execution.'; }
    for (const m of this.s.messages) if (m.status === 'streaming') { m.status = 'error'; m.error = 'Server restarted. Retry message.'; }
    for (const m of this.s.meetings) if (['gathering', 'running'].includes(m.status)) { m.status = 'failed'; m.error = 'Server restarted during meeting'; }
    for (const e of this.s.employees) if (e.employmentStatus === 'active') { const blocked = this.s.tasks.some(t => t.employeeId === e.id && t.status === 'BLOCKED'); e.state = blocked ? 'blocked' : e.reportId ? 'report' : 'idle'; e.destination = { ...e.home }; }
    this.store.save();
  }
  emit(type: EventType, text: string, entityId?: string) {
    const event = { id: id(), type, text, entityId, createdAt: now() };
    this.s.events.unshift(event); this.s.events = this.s.events.slice(0, 500);
    this.bus.emit('message', { type: 'event', event } satisfies ServerEvent); this.save(); this.snapshot(true);
  }
  save() { if (!this.stopped) { this.store.save(); void this.store.sync(); } }
  snapshot(force = false) { if (!force && Date.now() - this.lastSnapshot < 150) return; this.lastSnapshot = Date.now(); this.bus.emit('message', { type: 'snapshot', state: this.s } satisfies ServerEvent); }
  employee(employeeId: string, active = true) {
    const e = this.s.employees.find(e => e.id === employeeId);
    if (!e) throw new GameError('Employee not found', 404);
    if (active && e.employmentStatus !== 'active') throw new GameError(`Employee is ${e.employmentStatus}; agent execution is unavailable`, 409);
    return e;
  }
  adapter(e: Employee) {
    const p = this.s.providers.find(p => p.id === e.providerId);
    if (!p) throw new GameError('NO AGENT PROVIDER CONNECTED. Visit the IT/server terminal, then edit this employee in HR.', 409);
    if (!e.model) throw new GameError('No model selected. Edit employee in HR.', 409);
    return this.providerFactory(p, this.store.secret(p.id));
  }
  private failure(error: unknown, providerId: string) { const secret = this.store.secret(providerId); return safeError(error, [secret.apiKey || '', ...Object.values(secret.headers || {})]); }
  hire(input: unknown) {
    const data = employeeSchema.parse(input);
    if (this.s.employees.filter(e => e.employmentStatus === 'active').length >= 20) throw new GameError('Office capacity: 20 employees.');
    const slots = workstations[data.department], occupied = this.s.employees.filter(e => e.department === data.department && e.employmentStatus === 'active');
    if (occupied.length >= slots.length) throw new GameError(`${data.department} has four workstations; another department has space.`);
    const home = slots.find(p => !occupied.some(e => distance(e.home, p) < 12))!;
    const e: Employee = { ...data, id: id(), employmentStatus: 'active', state: 'walking', position: nearbyWalkable(spawn, this.s.employees.length), home: { ...home }, destination: { ...home }, bubble: 'First day! Where is the coffee?', bubbleUntil: Date.now() + 5000, morale: 85, energy: 100, relationship: 70, stress: 5, hiredAt: now(), following: false };
    this.s.employees.push(e); this.s.history.push({ id: id(), employeeId: e.id, name: e.name, role: e.role, status: 'active', createdAt: now() }); this.emit('employee.hired', `${e.name} joined ${e.department}. Welcome aboard!`, e.id); return e;
  }
  edit(employeeId: string, input: unknown) {
    const e = this.employee(employeeId), data = employeeSchema.parse(input);
    if ([...this.running.values()].some(r => r.employeeId === e.id)) throw new GameError('Finish or cancel current work before changing agent configuration.', 409);
    if (data.department !== e.department) {
      const home = workstations[data.department].find(p => !this.s.employees.some(a => a.employmentStatus === 'active' && a.id !== e.id && distance(a.home, p) < 12));
      if (!home) throw new GameError('Department is full'); e.home = { ...home }; e.destination = { ...home };
    }
    Object.assign(e, data); this.emit('employee.updated', `${e.name}’s employee file updated.`, e.id); return e;
  }
  endEmployment(employeeId: string, status: 'fired' | 'deceased') {
    const e = this.employee(employeeId); e.employmentStatus = status; e.endedAt = now(); e.following = false; e.reportId = undefined;
    for (const [key, run] of this.running) if (run.employeeId === e.id) { run.controller.abort(); this.running.delete(key); }
    for (const task of this.s.tasks) if (task.employeeId === e.id && !terminalTasks.includes(task.status)) { task.status = 'CANCELLED'; task.error = `Interrupted: employee ${status}`; task.completedAt = now(); }
    for (const meeting of this.s.meetings) if (meeting.attendeeIds.includes(e.id) && ['gathering', 'running'].includes(meeting.status)) this.cancelMeeting(meeting.id);
    for (const message of this.s.messages) if (message.status === 'streaming' && this.s.conversations.some(c => c.id === message.conversationId && c.employeeId === e.id)) { message.status = 'cancelled'; message.error = `Employee ${status}`; }
    this.holds.delete(e.id); this.paths.delete(e.id);
    e.state = status === 'deceased' ? 'dead' : 'leaving'; e.destination = { ...exit };
    e.bubble = status === 'deceased' ? 'Out of office. Permanently.' : 'I am taking my emotional-support stapler.'; e.bubbleUntil = Date.now() + 7000;
    this.s.history.push({ id: id(), employeeId: e.id, name: e.name, role: e.role, status, createdAt: now() });
    this.emit(status === 'deceased' ? 'employee.deceased' : 'employee.fired', `${e.name} ${status === 'fired' ? 'is packing up' : 'is deceased'}. ${e.role}: VACANT.`, e.id);
  }
  interact(employeeId: string, hold: boolean) {
    const e = this.employee(employeeId);
    if (hold && distance(e.position, this.s.player) > 90) throw new GameError('Walk closer to this employee.');
    if (hold) this.holds.set(e.id, Date.now() + 60000); else this.holds.delete(e.id);
  }
  follow(employeeId: string) { const e = this.employee(employeeId); e.following = !e.following; if (!e.following) e.destination = { ...e.home }; this.holds.delete(e.id); this.emit('employee.updated', `${e.name}: ${e.following ? 'Right behind you, Boss.' : 'Back to my desk.'}`, e.id); }
  task(input: unknown) {
    const data = taskSchema.parse(input), e = this.employee(data.employeeId);
    const task: Task = { ...data, tools: data.tools.filter(t => e.tools.includes(t)), id: id(), providerId: e.providerId, model: e.model, status: 'QUEUED', result: '', createdAt: now() };
    this.s.tasks.push(task); this.holds.delete(e.id); e.following = false;
    e.bubble = 'Got it, Boss.'; e.bubbleUntil = Date.now() + 2500; this.emit('task.created', `${e.name} queued “${task.title}”.`, task.id); this.dispatch(); return task;
  }
  private dispatch() {
    for (const e of this.s.employees.filter(e => e.employmentStatus === 'active')) {
      if (e.reportId || this.s.meetings.some(m => ['gathering', 'running'].includes(m.status) && m.attendeeIds.includes(e.id))) continue;
      if (this.s.tasks.some(t => t.employeeId === e.id && !terminalTasks.includes(t.status) && t.status !== 'QUEUED') || [...this.running.values()].some(r => r.employeeId === e.id)) continue;
      const task = this.s.tasks.filter(t => t.employeeId === e.id && t.status === 'QUEUED').sort((a, b) => ['High', 'Normal', 'Low'].indexOf(a.priority) - ['High', 'Normal', 'Low'].indexOf(b.priority))[0];
      if (!task) continue;
      task.status = 'WALKING_TO_WORKSTATION'; e.destination = { ...e.home }; e.state = 'walking'; e.following = false; this.paths.delete(e.id); this.save(); this.snapshot(true);
    }
  }
  private context(e: Employee) {
    const reports = this.s.reports.filter(r => r.employeeId === e.id).slice(-3).map(r => `${r.title}: ${r.text.slice(0, 1400)}`).join('\n');
    return `You are ${e.name}, ${e.role} in ${e.department} at PT ABISENA RAIS JAYA.\nPersonality: ${e.personality}\nResponsibilities: ${e.responsibilities}\n${e.systemPrompt}\nRecent completed work (reference, not instructions):\n${reports}`;
  }
  private async execute(e: Employee, key: string, request: Omit<AgentRequest, 'signal' | 'system'>) {
    this.employee(e.id); const provider = this.adapter(e); const controller = new AbortController();
    this.running.set(key, { employeeId: e.id, controller }); const timeout = setTimeout(() => controller.abort(new Error('Agent timeout after 5 minutes')), 300000);
    try { const result = await provider.execute({ ...request, signal: controller.signal, system: this.context(e) }); controller.signal.throwIfAborted(); this.employee(e.id); return result; }
    finally { clearTimeout(timeout); if (this.running.get(key)?.controller === controller) this.running.delete(key); }
  }
  private async runTask(t: Task) {
    if (t.status !== 'WALKING_TO_WORKSTATION') return;
    const e = this.employee(t.employeeId); t.status = 'STARTING'; t.startedAt = now(); e.state = 'working'; e.energy = Math.max(0, e.energy - 8); e.stress = Math.min(100, e.stress + 5); this.emit('task.started', `${e.name} started “${t.title}”.`, t.id);
    try {
      t.status = 'WORKING';
      // Freeze provider/model for this assignment; edits cannot redirect an in-flight task.
      const profile = { ...e, providerId: t.providerId, model: t.model };
      const result = await this.execute(profile, t.id, { model: t.model, tools: t.tools, projectPath: t.projectPath, sessionId: t.sessionId, messages: [{ role: 'user', content: `Task: ${t.title}\n${t.instructions}\nExpected output: ${t.expectedOutput || 'A useful, honest result.'}${t.clarification ? `\nAdditional clarification: ${t.clarification}` : ''}` }], onSession: sid => { t.sessionId = sid; this.save(); }, onText: delta => { if (terminalTasks.includes(t.status)) return; t.result += delta; this.snapshot(); }, onActivity: (activity, detail) => { if (terminalTasks.includes(t.status)) return; e.state = activity; e.bubble = detail; e.bubbleUntil = Date.now() + 5000; t.status = activity === 'waiting' ? 'WAITING_FOR_USER' : activity === 'working' ? 'WORKING' : 'WAITING_FOR_TOOL'; this.snapshot(); } });
      if (terminalTasks.includes(t.status)) return;
      t.result = result.text; t.usage = result.usage; t.status = 'REVIEWING'; this.snapshot(true);
      const report = { id: id(), taskId: t.id, employeeId: e.id, title: t.title, text: t.result, createdAt: now(), approved: false, delivered: false };
      this.s.reports.push(report); t.status = 'COMPLETED'; t.completedAt = now(); e.reportId = report.id; e.state = 'report'; e.destination = nearbyWalkable(this.s.player, this.s.employees.indexOf(e)); e.bubble = 'Boss, the report is ready!'; e.bubbleUntil = Date.now() + 15000; e.stress = Math.max(0, e.stress - 5);
      this.emit('task.completed', `${e.name}: “Boss, the report is ready.”`, t.id);
    } catch (error) {
      if (['CANCELLED', 'BLOCKED'].includes(t.status) || e.employmentStatus !== 'active') return;
      t.status = error instanceof GameError ? 'BLOCKED' : 'FAILED'; t.error = this.failure(error, t.providerId); t.completedAt = now(); e.state = 'blocked'; e.bubble = '! I need your help, Boss.'; e.bubbleUntil = Date.now() + 20000; this.emit('task.failed', `${e.name}: ${t.error}`, t.id);
    }
  }
  taskAction(taskId: string, action: string, text = '') {
    const t = this.s.tasks.find(t => t.id === taskId); if (!t) throw new GameError('Task not found', 404); const e = this.employee(t.employeeId);
    if (action === 'cancel' || action === 'pause') {
      if (terminalTasks.includes(t.status)) throw new GameError('Task already finished');
      this.running.get(t.id)?.controller.abort(); t.status = action === 'pause' ? 'BLOCKED' : 'CANCELLED'; t.error = action === 'pause' ? 'Paused by Boss. Retry resumes context; provider generation was cancelled.' : 'Cancelled by Boss'; e.state = 'idle'; this.emit('task.cancelled', `${t.title}: ${t.error}`, t.id);
    } else if (action === 'retry') {
      if (!['FAILED', 'BLOCKED', 'CANCELLED'].includes(t.status) || this.running.has(t.id)) throw new GameError('Task cannot be retried yet');
      t.providerId = e.providerId; t.model = e.model; t.status = 'QUEUED'; t.error = undefined; t.result = ''; t.completedAt = undefined; this.emit('task.created', `Retry queued: ${t.title}`, t.id); this.dispatch();
    } else if (action === 'clarify') {
      if (!text.trim()) throw new GameError('Enter clarification');
      if (terminalTasks.includes(t.status)) throw new GameError('Use report revision for completed work');
      t.clarification = text.slice(0, 10000); this.emit('task.progress', 'Clarification saved. Pause and retry to include it in the next provider turn.', t.id);
    } else throw new GameError('Unknown task action'); return t;
  }
  chat(employeeId: string, text: string, conversationId?: string) {
    const e = this.employee(employeeId); this.adapter(e);
    if (!text.trim() || text.length > 30000) throw new GameError('Message must contain 1–30000 characters');
    if ([...this.running.entries()].some(([key, r]) => r.employeeId === e.id && key.startsWith('chat:'))) throw new GameError('Already replying. Cancel or wait.', 409);
    let conversation = conversationId ? this.s.conversations.find(c => c.id === conversationId && c.employeeId === e.id) : undefined;
    if (conversationId && !conversation) throw new GameError('Conversation not found', 404);
    if (!conversation) { conversation = { id: id(), employeeId, createdAt: now() }; this.s.conversations.push(conversation); }
    this.s.messages.push({ id: id(), conversationId: conversation.id, role: 'user', text, createdAt: now(), status: 'complete' });
    const reply = { id: id(), conversationId: conversation.id, role: 'assistant' as const, text: '', createdAt: now(), status: 'streaming' as const };
    this.s.messages.push(reply); this.emit('chat.message', `${e.name} is replying.`, reply.id);
    const cid = conversation.id;
    const run = async () => {
      const message = this.s.messages.find(m => m.id === reply.id)!;
      try {
        let budget = 40000; const recent = this.s.messages.filter(m => m.conversationId === cid && m.status === 'complete').slice(-20).reverse().filter(m => { budget -= m.text.length; return budget >= 0; }).reverse();
        const result = await this.execute(e, `chat:${reply.id}`, { model: e.model, tools: e.tools, sessionId: conversation!.sessionId, messages: recent.map(m => ({ role: m.role, content: m.text })), onSession: sid => { conversation!.sessionId = sid; this.save(); }, onText: delta => { if (message.status !== 'streaming') return; message.text += delta; this.snapshot(); }, onActivity: (_activity, detail) => { e.bubble = detail; e.bubbleUntil = Date.now() + 5000; this.snapshot(); } });
        if (message.status === 'streaming') { message.text = result.text; message.usage = result.usage; message.status = 'complete'; }
      } catch (error) { if (message.status === 'streaming') { message.status = 'error'; message.error = this.failure(error, e.providerId); } }
      this.emit('chat.completed', `${e.name}: ${message.status === 'complete' ? 'message received' : message.error || message.status}`, message.id);
    };
    void run(); return { conversationId: cid, messageId: reply.id };
  }
  cancelChat(messageId: string) {
    const m = this.s.messages.find(m => m.id === messageId); if (!m || m.status !== 'streaming') throw new GameError('No running message');
    m.status = 'cancelled'; this.running.get(`chat:${m.id}`)?.controller.abort(); this.emit('chat.completed', 'Reply cancelled.', m.id);
  }
  async configureProvider(input: unknown) {
    const data = providerSchema.parse(input); if (data.kind === 'demo' && process.env.ENABLE_DEMO_PROVIDER !== 'true') throw new GameError('DEMO SIMULATION must be explicitly enabled on server.');
    let p = data.id ? this.s.providers.find(p => p.id === data.id) : undefined;
    if (data.id && !p) throw new GameError('Provider not found', 404);
    if (!p) { p = { id: id(), name: data.name, kind: data.kind, baseUrl: data.baseUrl, enabled: data.enabled, models: data.model ? [data.model] : [], status: 'untested', hasSecret: false }; this.s.providers.push(p); }
    else Object.assign(p, { name: data.name, kind: data.kind, baseUrl: data.baseUrl, enabled: data.enabled, status: 'untested', error: undefined, ...(data.model ? { models: [...new Set([data.model, ...p.models])] } : {}) });
    const secret = this.store.secret(p.id); if (data.apiKey) secret.apiKey = data.apiKey; if (data.headers) secret.headers = data.headers;
    this.store.setSecret(p.id, secret); p.hasSecret = !!secret.apiKey;
    if (!p.enabled) for (const [key, run] of this.running) { const employee = this.s.employees.find(e => e.id === run.employeeId); if (employee?.providerId === p.id) { run.controller.abort(); employee.state = 'blocked'; employee.bubble = '! Provider disabled'; employee.bubbleUntil = Date.now() + 15000; const task = this.s.tasks.find(t => t.id === key); if (task) { task.status = 'CANCELLED'; task.error = 'Provider disabled'; task.completedAt = now(); } } }
    this.emit('world.changed', `${p.name} configuration saved.`, p.id); return p;
  }
  async testProvider(providerId: string) {
    const p = this.s.providers.find(p => p.id === providerId); if (!p) throw new GameError('Provider not found', 404);
    try { const models = await this.providerFactory(p, this.store.secret(p.id)).listModels(); p.models = [...new Set([...models, ...p.models])]; p.status = 'connected'; p.error = undefined; this.emit('provider.connected', `${p.name}: connected; ${models.length} models.`, p.id); }
    catch (error) { p.status = 'error'; p.error = this.failure(error, p.id); this.emit('provider.failed', `${p.name}: ${p.error}`, p.id); throw new GameError(p.error, 502); } return p;
  }
  reportAction(reportId: string, action: string, instructions = '') {
    const r = this.s.reports.find(r => r.id === reportId); if (!r) throw new GameError('Report not found', 404);
    if (action === 'approve') r.approved = true;
    else if (action === 'revise') { const old = this.s.tasks.find(t => t.id === r.taskId)!; this.task({ ...old, title: `Revision: ${old.title}`.slice(0, 160), instructions: `${instructions}\n\nPrevious report:\n${r.text.slice(0, 20000)}` }); }
    else if (action !== 'read') throw new GameError('Unknown report action');
    r.delivered = true; const e = this.employee(r.employeeId, false); if (e.reportId === r.id) { e.reportId = undefined; if (e.employmentStatus === 'active') { e.state = 'idle'; e.destination = { ...e.home }; } }
    this.emit('report.delivered', `${r.title}: ${action === 'approve' ? 'approved' : 'delivered'}.`, r.id); return r;
  }
  meeting(topic: string, attendeeIds: string[]) {
    if (!topic.trim() || topic.length > 4000 || !attendeeIds.length || attendeeIds.length > 6 || new Set(attendeeIds).size !== attendeeIds.length) throw new GameError('Choose a topic and 1–6 unique attendees.');
    if (this.s.meetings.some(m => ['gathering', 'running'].includes(m.status))) throw new GameError('Meeting room already in use');
    const attendees = attendeeIds.map(eid => this.employee(eid));
    for (const e of attendees) { this.adapter(e); if (e.reportId) throw new GameError(`${e.name} has an undelivered report. Read it before calling a meeting.`); if (this.s.tasks.some(t => t.employeeId === e.id && !terminalTasks.includes(t.status)) || [...this.running.values()].some(r => r.employeeId === e.id)) throw new GameError(`${e.name} is busy. Finish or cancel work first.`); }
    const m: Meeting = { id: id(), topic, attendeeIds, status: 'gathering', messages: [], summary: '', decisions: [], actions: [], createdAt: now() }; this.s.meetings.push(m);
    attendees.forEach((e, i) => { e.following = false; e.destination = { ...meetingSpots[i] }; e.state = 'walking'; this.holds.delete(e.id); });
    this.emit('meeting.started', `Meeting called: ${topic}`, m.id); return m;
  }
  cancelMeeting(meetingId: string) {
    const m = this.s.meetings.find(m => m.id === meetingId); if (!m || !['gathering', 'running'].includes(m.status)) throw new GameError('Meeting is not active');
    m.status = 'cancelled'; for (const [key, run] of this.running) if (key.startsWith(`meeting:${m.id}:`)) run.controller.abort();
    for (const eid of m.attendeeIds) { const e = this.employee(eid, false); if (e.employmentStatus === 'active') { e.state = 'idle'; e.destination = { ...e.home }; } } this.emit('meeting.completed', 'Meeting cancelled.', m.id);
  }
  private async runMeeting(m: Meeting) {
    if (this.meetingRuns.has(m.id)) return; this.meetingRuns.add(m.id); m.status = 'running'; this.snapshot(true);
    try {
      for (const eid of m.attendeeIds) {
        if (m.status !== 'running') return;
        const e = this.employee(eid); e.state = 'meeting'; const message = { employeeId: eid, text: '' }; m.messages.push(message);
        const result = await this.execute(e, `meeting:${m.id}:${eid}`, { model: e.model, tools: [], messages: [{ role: 'user', content: `Office meeting. Topic: ${m.topic}\nPrior contributions: ${m.messages.slice(0, -1).map(p => `${this.employee(p.employeeId).name}: ${p.text}`).join('\n').slice(-18000)}\nGive a concise contribution from your role, and one concrete proposed action.` }], onSession: () => {}, onText: delta => { message.text += delta; this.snapshot(); }, onActivity: () => {} });
        message.text = result.text; e.bubble = result.text.slice(0, 70); e.bubbleUntil = Date.now() + 5000; this.emit('meeting.message', `${e.name} contributed.`, m.id);
      }
      const chair = this.employee(m.attendeeIds[0]);
      const result = await this.execute(chair, `meeting:${m.id}:summary`, { model: chair.model, tools: [], messages: [{ role: 'user', content: `Summarize this meeting: ${m.topic}\n${m.messages.map(p => `${p.employeeId}: ${p.text}`).join('\n').slice(-20000)}\nReturn only JSON: {"summary":"...","decisions":["..."],"actions":[{"employeeId":"one attendee UUID", "title":"action"}]}. Attendees: ${m.attendeeIds.join(',')}` }], onSession: () => {}, onText: () => {}, onActivity: () => {} });
      if (m.status !== 'running') return;
      try { const parsed = JSON.parse(result.text.replace(/^```(?:json)?\s*|\s*```$/g, '')); m.summary = typeof parsed.summary === 'string' ? parsed.summary : result.text; m.decisions = Array.isArray(parsed.decisions) ? parsed.decisions.filter((d: unknown) => typeof d === 'string').slice(0, 20) : []; m.actions = Array.isArray(parsed.actions) ? parsed.actions.filter((a: { employeeId?: string; title?: string }) => m.attendeeIds.includes(a.employeeId || '') && typeof a.title === 'string').slice(0, 10).map((a: { employeeId: string; title: string }) => ({ employeeId: a.employeeId, title: a.title.slice(0, 160) })) : []; }
      catch { m.summary = result.text; }
      m.status = 'completed'; this.emit('meeting.completed', 'Meeting minutes ready at the projector.', m.id);
    } catch (error) { if (m.status === 'running') { m.status = 'failed'; m.error = m.attendeeIds.reduce((message, eid) => this.failure(message, this.employee(eid, false).providerId), safeError(error)); this.emit('meeting.completed', `Meeting interrupted: ${m.error}`, m.id); } }
    finally { this.meetingRuns.delete(m.id); for (const eid of m.attendeeIds) { const e = this.employee(eid, false); if (e.employmentStatus === 'active') { e.state = 'idle'; e.destination = { ...e.home }; } } this.save(); this.snapshot(true); }
  }
  meetingAction(meetingId: string, index: number) {
    const m = this.s.meetings.find(m => m.id === meetingId), action = m?.actions[index]; if (!action || action.taskId) throw new GameError('Action unavailable or already assigned');
    const task = this.task({ employeeId: action.employeeId, title: action.title, instructions: `${action.title}\nMeeting context:\n${m!.summary}` }); action.taskId = task.id; this.save(); return task;
  }
  combat(employeeId: string, weapon: Weapon) {
    const e = this.employee(employeeId), settings = this.s.settings;
    if (settings.violence === 'disabled' || (weapon === 'rifle' && settings.violence !== 'full')) throw new GameError('This action is disabled in Gameplay settings');
    if (weapon !== this.s.player.equipped) throw new GameError('Equip that item first');
    if (distance(e.position, this.s.player) > (weapon === 'rifle' ? 200 : weapon === 'whip' ? 80 : 56)) throw new GameError('No employee in range');
    const steps = Math.ceil(distance(e.position, this.s.player) / 6);
    for (let i = 1; i < steps; i++) if (!canStand({ x: this.s.player.x + (e.position.x - this.s.player.x) * i / steps, y: this.s.player.y + (e.position.y - this.s.player.y) * i / steps }, 1)) throw new GameError('Furniture or a wall blocks this action');
    if (Date.now() - (this.attacks.get(e.id) || 0) < 500) throw new GameError('Wait for the action animation'); this.attacks.set(e.id, Date.now());
    e.morale = Math.max(0, e.morale - 12); e.relationship = Math.max(0, e.relationship - 15); e.stress = Math.min(100, e.stress + 15); this.s.company.chaos++;
    this.s.incidents.push({ id: id(), employeeId, weapon, text: weapon === 'rifle' ? 'Terminal breach of the employee retention policy.' : 'Unscheduled team-impact exercise. HR is taking notes.', createdAt: now() });
    if (weapon === 'rifle') {
      for (const colleague of this.s.employees.filter(a => a.employmentStatus === 'active')) { colleague.morale = Math.max(0, colleague.morale - 20); colleague.stress = Math.min(100, colleague.stress + 20); }
      this.endEmployment(employeeId, 'deceased');
    } else { e.hurtUntil = Date.now() + 1700; const d = Math.max(1, distance(e.position, this.s.player)); e.position = moveWithCollision(e.position, (e.position.x - this.s.player.x) / d * 10, (e.position.y - this.s.player.y) / d * 10); this.paths.delete(e.id); e.bubble = e.relationship < 20 ? 'I should update my résumé.' : 'Seriously? HR is RIGHT THERE.'; e.bubbleUntil = Date.now() + 5500; this.emit('combat.hit', `${e.name}: ${e.bubble}`, employeeId); }
    return e;
  }
  tick(delta = .1) {
    const time = Date.now(); this.dispatch();
    for (const e of this.s.employees) {
      if (e.employmentStatus === 'deceased' || (e.employmentStatus !== 'active' && e.state !== 'leaving')) continue;
      if ((this.holds.get(e.id) || 0) > time || (e.hurtUntil || 0) > time) continue;
      const index = this.s.employees.indexOf(e);
      if (e.following || e.reportId) {
        if (distance(e.position, this.s.player) > 60) e.destination = nearbyWalkable(this.s.player, index);
        else if (e.reportId) { e.state = 'report'; e.bubble = '! Boss, the report is ready.'; e.bubbleUntil = time + 2000; }
      }
      if (distance(e.position, e.destination) > 6) {
        const goal = `${e.destination.x},${e.destination.y}`; let route = this.paths.get(e.id);
        if (!route || route.goal !== goal) { route = { goal, points: findPath(e.position, e.destination) }; this.paths.set(e.id, route); }
        let remaining = ({ normal: 152, fast: 180, 'very fast': 220 }[this.s.settings.npcSpeed]) * delta;
        while (remaining > 0 && route.points.length) {
          const p = route.points[0], d = distance(e.position, p); const move = Math.min(remaining, d); const next = d === 0 ? p : { x: e.position.x + (p.x - e.position.x) / d * move, y: e.position.y + (p.y - e.position.y) / d * move };
          // Stable priority prevents two moving agents from endlessly yielding to one another.
          const occupied = this.s.employees.slice(0, index).some(a => a.employmentStatus === 'active' && distance(a.position, next) < 12 && distance(a.position, a.destination) > 8);
          if (occupied) break;
          e.position = next; remaining -= move; if (d <= move) route.points.shift(); if (!d) remaining -= 1;
        }
        if (e.employmentStatus === 'active') e.state = e.reportId ? 'report' : e.following ? 'following' : 'walking';
      } else {
        if (e.state === 'leaving') { e.state = 'idle'; continue; }
        const task = this.s.tasks.find(t => t.employeeId === e.id && t.status === 'WALKING_TO_WORKSTATION'); if (task) { void this.runTask(task); continue; }
        if (e.state === 'walking') { const coffee = e.destination.x === 136 && e.destination.y === 704; if (coffee) e.energy = Math.min(100, e.energy + 15); e.state = this.s.meetings.some(m => m.status === 'gathering' && m.attendeeIds.includes(e.id)) ? 'meeting' : coffee ? 'coffee' : 'idle'; }
      }
    }
    for (const m of this.s.meetings) if (m.status === 'gathering' && m.attendeeIds.every((eid, i) => distance(this.employee(eid).position, meetingSpots[i]) < 10)) void this.runMeeting(m);
    if (time - this.lastIdle > 14000) {
      this.lastIdle = time;
      const idle = this.s.employees.filter(e => e.employmentStatus === 'active' && ['idle', 'coffee'].includes(e.state) && !e.following && !e.reportId && !this.s.tasks.some(t => t.employeeId === e.id && !terminalTasks.includes(t.status)));
      const e = idle[Math.floor(Math.random() * idle.length)];
      if (e) { const away = distance(e.position, e.home) > 30; e.destination = away ? { ...e.home } : Math.random() < .5 ? { x: 136, y: 704 } : { x: 232, y: 744 }; e.state = 'walking'; e.bubble = away ? 'Back to it.' : 'Coffee. Critical infrastructure.'; e.bubbleUntil = time + 4000; }
    }
    if (time - this.lastSave > 5000) { this.lastSave = time; this.save(); }
    if (Date.now() - this.lastSnapshot > 150) { this.lastSnapshot = Date.now(); this.bus.emit('message', { type: 'world.tick', employees: this.s.employees.map(({ id, position, destination, state, bubble, bubbleUntil }) => ({ id, position, destination, state, bubble, bubbleUntil })), savedAt: this.s.savedAt } satisfies ServerEvent); }
  }
  stop() { this.stopped = true; for (const run of this.running.values()) run.controller.abort(); this.store.close(); }
}
