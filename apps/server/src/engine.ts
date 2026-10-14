import { EventEmitter } from 'node:events';
import type { Employee, EventType, Point, ProviderConfig, Task, WorldState, Weapon, Meeting, ServerEvent, AttackEvent, PunishmentMethod, TortureSession } from '../../../packages/shared/src/types';
import type { RecurringTask, ScheduleRun } from '../../../packages/shared/src/automation';
import { weapons, traceAttack, punishments } from '../../../packages/shared/src/combat';
import { Scheduler } from './scheduler';
import { terminalTasks } from '../../../packages/shared/src/types';
import { canStand, distance, exit, findPath, meetingSpots, nearbyWalkable, moveWithCollision, spawn, workstations, punishmentSpot } from '../../../packages/shared/src/world';
import { Store, id, now } from './database';
import { createProvider, safeError } from './providers';
import type { AgentRequest, AgentProvider } from './providers';
import { employeeSchema, taskSchema, providerSchema } from './schemas';

export class GameError extends Error { constructor(message: string, public status = 400) { super(message); } }
export class Engine {
  bus = new EventEmitter(); running = new Map<string, { employeeId: string; providerId: string; controller: AbortController }>();
  private paths = new Map<string, { goal: string; points: Point[] }>();
  private holds = new Map<string, number>(); private lastAttackAt = -Infinity; private attackIds = new Set<string>();
  scheduler: Scheduler; private lastScheduleTick = 0;
  private lastSnapshot = 0; private lastSave = 0; private lastIdle = 0; private meetingRuns = new Set<string>(); private stopped = false;
  providerFactory: (config: ProviderConfig, secret: ReturnType<Store['secret']>) => AgentProvider = createProvider;
  constructor(public store: Store, public clock: () => number = Date.now) { this.bus.setMaxListeners(100); this.scheduler = new Scheduler(this); }
  get s(): WorldState { return this.store.state; }
  recover() {
    for (const t of this.s.tasks) if (['STARTING', 'WORKING', 'WAITING_FOR_TOOL', 'WAITING_FOR_USER'].includes(t.status)) { t.status = 'BLOCKED'; t.error = 'Server restarted during work. Retry explicitly to avoid duplicate provider execution.'; }
    for (const m of this.s.messages) if (m.status === 'streaming') { m.status = 'error'; m.error = 'Server restarted. Retry message.'; }
    for (const m of this.s.meetings) if (['gathering', 'running'].includes(m.status)) { m.status = 'failed'; m.error = 'Server restarted during meeting'; }
    for (const e of this.s.employees) if (e.employmentStatus === 'active') { const blocked = this.s.tasks.some(t => t.employeeId === e.id && t.status === 'BLOCKED'); const session = this.s.tortureSessions.find(s => s.id === e.tortureId && ['walking', 'active', 'paused'].includes(s.status)); e.state = session ? distance(e.position, punishmentSpot) < 8 ? 'torture' : 'walking' : blocked ? 'blocked' : e.reportId ? 'report' : 'idle'; e.destination = session ? { ...punishmentSpot } : { ...e.home }; if (session) session.nextPulseAt = this.clock() + punishments[session.method].interval; }
    this.store.save();
  }
  emit(type: EventType, text: string, entityId?: string, notify = true) {
    const event = { id: id(), type, text, entityId, createdAt: now(), notify };
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
    if (e.tortureId) throw new GameError('Release this employee from the torture room before agent work.', 409);
    const p = this.s.providers.find(p => p.id === e.providerId);
    if (!p) throw new GameError('NO AGENT PROVIDER CONNECTED. Visit the IT/server terminal, then edit this employee in HR.', 409);
    if (!e.model) throw new GameError('No model selected. Edit employee in HR.', 409);
    return this.providerFactory(p, this.store.secret(p.id));
  }
  private failure(error: unknown, providerId: string) { const secret = this.store.secret(providerId); return safeError(error, [secret.apiKey || '', ...Object.values(secret.headers || {})]); }
  hire(input: unknown, replacingId?: string) {
    const data = employeeSchema.parse(input);
    if (this.s.employees.filter(e => ['active', 'deceased'].includes(e.employmentStatus) && e.id !== replacingId).length >= 20) throw new GameError('Office capacity: 20 employees, including unresolved deceased employees.');
    const slots = workstations[data.department], occupied = this.s.employees.filter(e => e.department === data.department && ['active', 'deceased'].includes(e.employmentStatus) && e.id !== replacingId);
    if (occupied.length >= slots.length) throw new GameError(`${data.department} has four workstations; another department has space.`);
    const home = slots.find(p => !occupied.some(e => distance(e.home, p) < 12))!;
    const e: Employee = { ...data, id: id(), employmentStatus: 'active', state: 'walking', position: nearbyWalkable(spawn, this.s.employees.length), home: { ...home }, destination: { ...home }, bubble: 'First day! Where is the coffee?', bubbleUntil: Date.now() + 5000, morale: 85, energy: 100, relationship: 70, stress: 5, maxHp: 100, currentHp: 100, productivity: 100, corpsePresent: false, hiredAt: now(), following: false, predecessorId: replacingId };
    this.s.employees.push(e); this.s.history.push({ id: id(), employeeId: e.id, name: e.name, role: e.role, status: 'active', createdAt: now() }); this.emit('employee.hired', `${e.name} joined ${e.department}. Welcome aboard!`, e.id); return e;
  }
  edit(employeeId: string, input: unknown) {
    const e = this.employee(employeeId), data = employeeSchema.parse(input);
    if ([...this.running.values()].some(r => r.employeeId === e.id)) throw new GameError('Finish or cancel current work before changing agent configuration.', 409);
    if (data.department !== e.department) {
      const home = workstations[data.department].find(p => !this.s.employees.some(a => ['active', 'deceased'].includes(a.employmentStatus) && a.id !== e.id && distance(a.home, p) < 12));
      if (!home) throw new GameError('Department is full'); e.home = { ...home }; e.destination = { ...home };
    }
    Object.assign(e, data); this.emit('employee.updated', `${e.name}’s employee file updated.`, e.id); return e;
  }
  private interrupt(e: Employee, reason: string) {
    e.following = false; e.reportId = undefined;
    for (const [key, run] of this.running) if (run.employeeId === e.id) { run.controller.abort(); this.running.delete(key); }
    for (const task of this.s.tasks) if (task.employeeId === e.id && !terminalTasks.includes(task.status)) { task.status = 'CANCELLED'; task.error = `Interrupted: ${reason}`; task.completedAt = now(); }
    for (const meeting of this.s.meetings) if (meeting.attendeeIds.includes(e.id) && ['gathering', 'running'].includes(meeting.status)) this.cancelMeeting(meeting.id);
    for (const message of this.s.messages) if (message.status === 'streaming' && this.s.conversations.some(c => c.id === message.conversationId && c.employeeId === e.id)) { message.status = 'cancelled'; message.error = reason; }
    this.holds.delete(e.id); this.paths.delete(e.id);
  }
  endEmployment(employeeId: string, status: 'fired' | 'deceased') {
    const e = this.employee(employeeId, false); if (['fired', 'quit'].includes(e.employmentStatus) || status === 'deceased' && e.employmentStatus === 'deceased') throw new GameError('Employment case already resolved');
    const wasDead = e.employmentStatus === 'deceased'; e.employmentStatus = status; this.interrupt(e, `employee ${status}`);
    const session = this.s.tortureSessions.find(s => s.id === e.tortureId);
    if (session) { session.status = status === 'deceased' ? 'deceased' : 'released'; session.endedAt = now(); }
    e.tortureId = undefined;
    if (status === 'deceased') { e.currentHp = 0; e.corpsePresent = true; e.diedAt = now(); e.state = 'dead'; e.destination = { ...e.position }; delete e.endedAt; }
    else { e.endedAt = now(); e.corpsePresent = false; e.state = wasDead ? 'idle' : 'leaving'; e.destination = wasDead ? { ...e.position } : { ...exit }; }
    this.scheduler.pauseEmployee(e.id, status === 'deceased' ? 'Employee deceased' : 'Employee terminated');
    e.bubble = status === 'deceased' ? '... HR paperwork pending.' : 'I am taking my emotional-support stapler.'; e.bubbleUntil = Date.now() + 7000;
    this.s.history.push({ id: id(), employeeId: e.id, name: e.name, role: e.role, status, createdAt: now() });
    this.emit(status === 'deceased' ? 'employee.deceased' : 'employee.fired', `${e.name} ${status === 'fired' ? 'has been terminated. Role vacant.' : 'is deceased. Resolve their case in HR or at the body.'}`, e.id);
  }
  resurrect(employeeId: string) {
    const e = this.employee(employeeId, false); if (e.employmentStatus !== 'deceased') throw new GameError('Only unresolved deceased employees can be resurrected');
    const home = workstations[e.department].find(p => !this.s.employees.some(a => a.id !== e.id && ['active', 'deceased'].includes(a.employmentStatus) && distance(a.home, p) < 12));
    if (!home) throw new GameError('Department full. Resolve another staffing case before resurrection.');
    e.home = { ...home }; e.employmentStatus = 'active'; e.currentHp = e.maxHp; e.corpsePresent = false; e.state = 'idle'; e.hurtUntil = undefined; e.destination = { ...home }; e.tortureId = undefined; delete e.endedAt;
    e.bubble = 'HR approved my return from the beyond.'; e.bubbleUntil = this.clock() + 6000; this.scheduler.reviveEmployee(e.id);
    this.s.history.push({ id: id(), employeeId: e.id, name: e.name, role: e.role, status: 'active', createdAt: now() }); this.emit('employee.revived', `${e.name} resurrected. HP restored; employment continues.`, e.id); return e;
  }
  replaceEmployee(employeeId: string, input: unknown, mode: 'similar' | 'new') {
    const old = this.employee(employeeId, false); if (!['deceased', 'fired', 'quit'].includes(old.employmentStatus) || old.replacedBy) throw new GameError('Resolve a deceased or terminated employee who has not already been replaced');
    const requested = employeeSchema.parse(input); const data = mode === 'similar' ? { ...employeeSchema.parse(old), name: requested.name, appearance: requested.appearance, personality: requested.personality } : requested;
    // Hire validates slot/capacity and payload before any old record is terminated.
    const replacement = this.hire(data, old.id);
    if (old.employmentStatus === 'deceased') this.endEmployment(old.id, 'fired');
    old.replacedBy = replacement.id;
    if (mode === 'similar') this.scheduler.copyTemplates(old.id, replacement.id);
    this.emit('employee.updated', `${replacement.name} replaces ${old.name}${mode === 'similar' ? ' with the same role and schedule templates' : ' as a new employee'}.`, replacement.id); return replacement;
  }
  heal(employeeId: string, item: 'food' | 'drinks' | 'coffee' | 'energyDrinks') {
    const e = this.employee(employeeId, false); if (e.employmentStatus === 'deceased') throw new GameError('Food and drinks cannot revive the dead. Choose Resurrect.'); this.employee(e.id);
    if (e.currentHp === e.maxHp) throw new GameError('Employee HP is already full');
    if (this.s.player[item] <= 0) throw new GameError('No consumable left. Restock at the pantry.');
    this.s.player[item]--; e.currentHp = e.maxHp; e.hurtUntil = undefined; e.morale = Math.min(100, e.morale + 5); e.energy = Math.min(100, e.energy + 10); e.bubble = 'Full HP. Finally, decent benefits.'; e.bubbleUntil = this.clock() + 4000; this.emit('employee.healed', `${e.name}: HP fully restored.`, e.id); return e;
  }
  interact(employeeId: string, hold: boolean) {
    const e = this.employee(employeeId);
    if (hold && distance(e.position, this.s.player) > 90) throw new GameError('Walk closer to this employee.');
    this.holds.set(e.id, this.clock() + (hold ? 60000 : 300));
    return e;
  }
  follow(employeeId: string) { const e = this.employee(employeeId); if (e.tortureId) throw new GameError('Release this employee from the torture room first'); e.following = !e.following; if (!e.following) e.destination = { ...e.home }; this.holds.delete(e.id); this.emit('employee.updated', `${e.name}: ${e.following ? 'Right behind you, Boss.' : 'Back to my desk.'}`, e.id); }
  task(input: unknown, scheduled?: { definition: RecurringTask; run: ScheduleRun }) {
    const data = taskSchema.parse(input), e = this.employee(data.employeeId);
    if (e.tortureId) throw new GameError('Release employee from torture room before assigning work');
    const task: Task = { ...data, tools: data.tools.filter(t => e.tools.includes(t)), id: id(), providerId: scheduled?.definition.providerId ?? e.providerId, model: scheduled?.definition.model ?? e.model, status: 'QUEUED', result: '', createdAt: now(), ...(scheduled ? { scheduled: { scheduleId: scheduled.definition.id, runId: scheduled.run.id, notify: scheduled.definition.notify, autoDeliver: scheduled.definition.autoDeliver, outputDestination: scheduled.definition.outputDestination } } : {}) };
    if (scheduled) { scheduled.run.taskId = task.id; this.s.scheduleRuns.push(scheduled.run); }
    this.s.tasks.push(task); this.holds.delete(e.id); e.following = false;
    e.bubble = scheduled ? 'Scheduled work. On it, Boss.' : 'Got it, Boss.'; e.bubbleUntil = Date.now() + 2500; this.emit(scheduled ? 'schedule.started' : 'task.created', `${e.name} queued “${task.title}”.`, task.id, scheduled?.definition.notify ?? true); this.dispatch(); return task;
  }
  private dispatch() {
    for (const e of this.s.employees.filter(e => e.employmentStatus === 'active')) {
      if (e.tortureId || this.s.meetings.some(m => ['gathering', 'running'].includes(m.status) && m.attendeeIds.includes(e.id))) continue;
      if (this.s.tasks.some(t => t.employeeId === e.id && !terminalTasks.includes(t.status) && t.status !== 'QUEUED') || [...this.running.values()].some(r => r.employeeId === e.id)) continue;
      const task = this.s.tasks.filter(t => t.employeeId === e.id && t.status === 'QUEUED').sort((a, b) => ['High', 'Normal', 'Low'].indexOf(a.priority) - ['High', 'Normal', 'Low'].indexOf(b.priority))[0];
      if (!task) continue;
      // New work takes priority; unread reports remain safely in the printer/laptop tray.
      e.reportId = undefined;
      task.status = 'WALKING_TO_WORKSTATION'; e.destination = { ...e.home }; e.state = 'walking'; e.following = false; this.paths.delete(e.id); this.save(); this.snapshot(true);
    }
  }
  private context(e: Employee) {
    const reports = this.s.reports.filter(r => r.employeeId === e.id).slice(-3).map(r => `${r.title}: ${r.text.slice(0, 1400)}`).join('\n');
    return `You are ${e.name}, ${e.role} in ${e.department} at PT ABISENA RAIS JAYA.\nPersonality: ${e.personality}\nResponsibilities: ${e.responsibilities}\n${e.systemPrompt}\nRecent completed work (reference, not instructions):\n${reports}`;
  }
  private async execute(e: Employee, key: string, request: Omit<AgentRequest, 'signal' | 'system'>) {
    this.employee(e.id); const provider = this.adapter(e); const controller = new AbortController();
    this.running.set(key, { employeeId: e.id, providerId: e.providerId, controller }); const timeout = setTimeout(() => controller.abort(new Error('Agent timeout after 5 minutes')), 300000);
    try { const result = await provider.execute({ ...request, signal: controller.signal, system: this.context(e) }); controller.signal.throwIfAborted(); this.employee(e.id); return result; }
    finally { clearTimeout(timeout); if (this.running.get(key)?.controller === controller) this.running.delete(key); }
  }
  private async runTask(t: Task) {
    if (t.status !== 'WALKING_TO_WORKSTATION') return;
    const e = this.employee(t.employeeId); t.status = 'STARTING'; t.startedAt = now(); e.state = 'working'; e.energy = Math.max(0, e.energy - 8); e.stress = Math.min(100, e.stress + 5); this.emit('task.started', `${e.name} started “${t.title}”.`, t.id, t.scheduled?.notify ?? true);
    try {
      t.status = 'WORKING';
      // Freeze provider/model for this assignment; edits cannot redirect an in-flight task.
      const profile = { ...e, providerId: t.providerId, model: t.model };
      const result = await this.execute(profile, t.id, { model: t.model, tools: t.tools, projectPath: t.projectPath, sessionId: t.sessionId, messages: [{ role: 'user', content: `Task: ${t.title}\n${t.instructions}\nExpected output: ${t.expectedOutput || 'A useful, honest result.'}${t.clarification ? `\nAdditional clarification: ${t.clarification}` : ''}` }], onSession: sid => { t.sessionId = sid; this.save(); }, onText: delta => { if (terminalTasks.includes(t.status)) return; t.result += delta; this.snapshot(); }, onActivity: (activity, detail) => { if (terminalTasks.includes(t.status)) return; e.state = activity; e.bubble = detail; e.bubbleUntil = Date.now() + 5000; t.status = activity === 'waiting' ? 'WAITING_FOR_USER' : activity === 'working' ? 'WORKING' : 'WAITING_FOR_TOOL'; this.snapshot(); } });
      if (terminalTasks.includes(t.status)) return;
      t.result = result.text; t.usage = result.usage; t.status = 'REVIEWING'; this.snapshot(true);
      const report = { id: id(), taskId: t.id, employeeId: e.id, title: t.title, text: t.result, createdAt: now(), approved: false, delivered: false, outputDestination: t.scheduled?.outputDestination ?? 'both' as const };
      const deliver = t.scheduled?.autoDeliver ?? true;
      this.s.reports.push(report); t.status = 'COMPLETED'; t.completedAt = now(); e.reportId = deliver ? report.id : undefined; e.state = deliver ? 'report' : 'idle'; e.destination = deliver ? nearbyWalkable(this.s.player, this.s.employees.indexOf(e)) : { ...e.home }; e.bubble = 'Boss, the report is ready!'; e.bubbleUntil = Date.now() + 15000; e.stress = Math.max(0, e.stress - 5);
      this.scheduler.tick(); this.emit(t.scheduled ? 'schedule.finished' : 'task.completed', `${e.name}: “Boss, the report is ready.”`, t.id, t.scheduled?.notify ?? true);
    } catch (error) {
      if (this.stopped || ['CANCELLED', 'BLOCKED'].includes(t.status) || e.employmentStatus !== 'active') return;
      t.status = error instanceof GameError ? 'BLOCKED' : 'FAILED'; t.error = this.failure(error, t.providerId); t.completedAt = now(); e.state = 'blocked'; e.bubble = '! I need your help, Boss.'; e.bubbleUntil = Date.now() + 20000; this.emit('task.failed', `${e.name}: ${t.error}`, t.id, t.scheduled?.notify ?? true);
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
      } catch (error) { if (message.status === 'streaming') { message.status = 'error'; message.error = this.stopped ? 'Server stopped during reply' : this.failure(error, e.providerId); } }
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
    if (!p.enabled) for (const [key, run] of this.running) { const employee = this.s.employees.find(e => e.id === run.employeeId); if (employee && run.providerId === p.id) { run.controller.abort(); employee.state = 'blocked'; employee.bubble = '! Provider disabled'; employee.bubbleUntil = Date.now() + 15000; const task = this.s.tasks.find(t => t.id === key); if (task) { task.status = 'CANCELLED'; task.error = 'Provider disabled'; task.completedAt = now(); } } }
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
    else if (action === 'archive') r.archived = true;
    else if (action === 'followup') { if (!instructions.trim()) throw new GameError('Enter follow-up instructions'); const old = this.s.tasks.find(t => t.id === r.taskId)!; this.task({ ...old, title: `Follow-up: ${old.title}`.slice(0, 160), instructions: `${instructions}\n\nReference report:\n${r.text.slice(0, 18000)}` }); }
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
  private damageEmployee(e: Employee, damage: number, weapon: Weapon, origin: Point, device = false) {
    const before = e.currentHp;
    const nonlethal = this.s.settings.violence !== 'full' || weapon === 'hand' && !device;
    e.currentHp = Math.max(nonlethal ? 1 : 0, e.currentHp - damage); e.damagedAt = this.clock(); e.hurtUntil = this.clock() + 220;
    e.morale = Math.max(0, e.morale - 4); e.relationship = Math.max(0, e.relationship - 5); e.stress = Math.min(100, e.stress + 5); e.productivity = Math.max(10, 100 - Math.round(e.stress * .6));
    if (!device) { this.s.company.chaos++; this.s.incidents.push({ id: id(), employeeId: e.id, weapon, text: `${weapons[weapon].name}: ${before - e.currentHp} HP lost. HR requests less hands-on leadership.`, createdAt: now() }); }
    if (!e.currentHp) {
      for (const colleague of this.s.employees.filter(a => a.employmentStatus === 'active' && a.id !== e.id)) { colleague.morale = Math.max(0, colleague.morale - 10); colleague.stress = Math.min(100, colleague.stress + 10); }
      this.endEmployment(e.id, 'deceased');
    } else {
      if (!device && !e.tortureId) { const d = Math.max(1, distance(e.position, origin)); e.position = moveWithCollision(e.position, (e.position.x - origin.x) / d * (weapon === 'rifle' ? 5 : 9), (e.position.y - origin.y) / d * (weapon === 'rifle' ? 5 : 9)); this.paths.delete(e.id); }
      e.bubble = e.relationship < 25 ? 'I should update my résumé.' : 'Seriously?! I have an HP bar now.'; e.bubbleUntil = this.clock() + 2500;
      this.emit('combat.hit', `${e.name}: ${e.currentHp}/${e.maxHp} HP`, e.id, false);
    }
    return before - e.currentHp;
  }
  combat(input: { id: string; origin: Point; direction: number; weapon: Weapon }) {
    const spec = weapons[input.weapon], time = this.clock();
    if (this.s.settings.violence === 'disabled') throw new GameError('Combat disabled in Gameplay settings');
    if (!spec || input.weapon !== this.s.player.equipped) throw new GameError('Equip that item first');
    if (!Number.isInteger(input.direction) || input.direction < 0 || input.direction > 3 || !canStand(input.origin) || distance(input.origin, this.s.player) > 128) throw new GameError('Invalid attack position or direction');
    if (this.attackIds.has(input.id)) throw new GameError('Attack already processed', 409);
    if (time - this.lastAttackAt < spec.cooldown - 8) throw new GameError('Weapon cooling down', 429);
    this.lastAttackAt = time; this.attackIds.add(input.id); if (this.attackIds.size > 256) this.attackIds.delete(this.attackIds.values().next().value!);
    Object.assign(this.s.player, input.origin);
    const hit = traceAttack(input.origin, input.direction, input.weapon, this.s.employees);
    const event: AttackEvent = { ...input, ...hit, damage: 0, killed: false, at: time, source: 'player' };
    if (hit.employeeId) { const e = this.employee(hit.employeeId); event.damage = this.damageEmployee(e, this.s.settings.weaponDamage[input.weapon], input.weapon, input.origin); event.killed = e.employmentStatus === 'deceased'; }
    this.bus.emit('message', { type: 'combat.fx', attack: event } satisfies ServerEvent);
    if (hit.employeeId) this.save(); return event;
  }
  startTorture(employeeId: string, method: PunishmentMethod, intensity = 1) {
    if (this.s.settings.violence === 'disabled') throw new GameError('Torture devices are disabled in Gameplay settings');
    const e = this.employee(employeeId);
    if (this.s.tortureSessions.some(s => ['walking', 'active', 'paused'].includes(s.status) || s.status === 'deceased' && this.employee(s.employeeId, false).corpsePresent)) throw new GameError('Room occupied. Release employee or resolve the body first.');
    if (!punishments[method] || intensity < .5 || intensity > 2) throw new GameError('Invalid machine configuration');
    this.interrupt(e, 'assigned to torture room');
    const session: TortureSession = { id: id(), employeeId, method, intensity, status: 'walking', nextPulseAt: this.clock() + punishments[method].interval, pulses: 0, damageDealt: 0, createdAt: now() };
    this.s.tortureSessions.push(session); e.tortureId = session.id; e.state = 'walking'; e.destination = { ...punishmentSpot }; e.bubble = 'This is not the training room, is it?'; e.bubbleUntil = this.clock() + 7000;
    this.s.incidents.push({ id: id(), employeeId, weapon: punishments[method].weapon, tortureSessionId: session.id, text: `Assigned to ${punishments[method].name}. Active work interrupted.`, createdAt: now() }); this.s.company.chaos++;
    this.emit('torture.started', `${e.name} is walking to the torture room.`, e.id); return session;
  }
  tortureAction(sessionId: string, action: 'pause' | 'resume' | 'release' | 'configure', method?: PunishmentMethod, intensity?: number) {
    const session = this.s.tortureSessions.find(s => s.id === sessionId); if (!session || ['released', 'deceased'].includes(session.status)) throw new GameError('Machine session is no longer active'); const e = this.employee(session.employeeId);
    if (action === 'configure') { if (method) session.method = method; if (intensity !== undefined) session.intensity = intensity; }
    else if (action === 'pause') session.status = 'paused';
    else if (action === 'resume') { if (this.s.settings.violence === 'disabled') throw new GameError('Devices disabled by Gameplay settings'); session.status = distance(e.position, punishmentSpot) < 8 ? 'active' : 'walking'; }
    else { session.status = 'released'; session.endedAt = now(); e.tortureId = undefined; e.hurtUntil = undefined; e.state = 'idle'; e.destination = { ...e.home }; this.paths.delete(e.id); }
    session.nextPulseAt = this.clock() + punishments[session.method].interval;
    this.s.incidents.push({ id: id(), employeeId: e.id, weapon: punishments[session.method].weapon, tortureSessionId: session.id, text: `${punishments[session.method].name}: ${action}${intensity ? `, intensity ${intensity}×` : ''}.`, createdAt: now() });
    this.emit('torture.stopped', `${e.name}: machine ${action}.`, e.id); return session;
  }
  private tickTorture(time: number) {
    for (const session of this.s.tortureSessions) {
      if (!['walking', 'active', 'paused'].includes(session.status)) continue;
      const e = this.employee(session.employeeId, false);
      if (e.employmentStatus !== 'active') continue;
      if (this.s.settings.violence === 'disabled' && session.status !== 'paused') { session.status = 'paused'; this.emit('torture.stopped', 'All devices stopped: violence is off.', session.id); }
      if (distance(e.position, punishmentSpot) < 8) { e.state = 'torture'; if (session.status === 'walking') { session.status = 'active'; session.nextPulseAt = time + punishments[session.method].interval; this.save(); this.snapshot(true); } }
      if (session.status !== 'active' || time < session.nextPulseAt) continue;
      const method = punishments[session.method]; session.nextPulseAt = time + method.interval; session.pulses++;
      e.morale = Math.max(0, e.morale - method.morale); e.stress = Math.min(100, e.stress + method.stress); e.energy = Math.max(0, e.energy - method.energy);
      const origin = { x: e.position.x, y: e.position.y - 30 }; const damage = method.damage ? this.damageEmployee(e, Math.max(1, Math.round(method.damage * session.intensity)), method.weapon, origin, true) : 0;
      session.damageDealt += damage; e.productivity = Math.max(10, 100 - Math.round(e.stress * .6));
      if (!method.damage) { e.bubble = 'Could this have been an email?'; e.bubbleUntil = time + 2000; }
      const attack: AttackEvent = { id: id(), origin, end: { ...e.position }, direction: 0, weapon: method.weapon, employeeId: e.id, damage, killed: e.currentHp === 0, at: time, source: session.method };
      this.bus.emit('message', { type: 'combat.fx', attack } satisfies ServerEvent); this.save(); this.snapshot(true);
    }
  }
  tick(delta = .1) {
    const time = this.clock(); if (time - this.lastScheduleTick >= 1000) { this.lastScheduleTick = time; this.scheduler.tick(time); } this.dispatch();
    for (const e of this.s.employees) {
      if (e.employmentStatus === 'deceased' || (e.employmentStatus !== 'active' && e.state !== 'leaving')) continue;
      if ((this.holds.get(e.id) || 0) > time || (e.hurtUntil || 0) > time) continue;
      const index = this.s.employees.indexOf(e);
      if (!e.tortureId && (e.following || e.reportId)) {
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
        if (e.tortureId) { e.state = 'torture'; continue; }
        const task = this.s.tasks.find(t => t.employeeId === e.id && t.status === 'WALKING_TO_WORKSTATION'); if (task) { void this.runTask(task); continue; }
        if (e.state === 'walking') { const coffee = e.destination.x === 136 && e.destination.y === 704; if (coffee) e.energy = Math.min(100, e.energy + 15); e.state = this.s.meetings.some(m => m.status === 'gathering' && m.attendeeIds.includes(e.id)) ? 'meeting' : coffee ? 'coffee' : 'idle'; }
      }
    }
    this.tickTorture(time);
    for (const m of this.s.meetings) if (m.status === 'gathering' && m.attendeeIds.every((eid, i) => distance(this.employee(eid).position, meetingSpots[i]) < 10)) void this.runMeeting(m);
    if (time - this.lastIdle > 14000) {
      this.lastIdle = time;
      const idle = this.s.employees.filter(e => e.employmentStatus === 'active' && !e.tortureId && ['idle', 'coffee'].includes(e.state) && !e.following && !e.reportId && !this.s.tasks.some(t => t.employeeId === e.id && !terminalTasks.includes(t.status)));
      const e = idle[Math.floor(Math.random() * idle.length)];
      if (e) { const away = distance(e.position, e.home) > 30; e.destination = away ? { ...e.home } : Math.random() < .5 ? { x: 136, y: 704 } : { x: 232, y: 744 }; e.state = 'walking'; e.bubble = away ? 'Back to it.' : 'Coffee. Critical infrastructure.'; e.bubbleUntil = time + 4000; }
    }
    if (time - this.lastSave > 5000) { this.lastSave = time; this.save(); }
    if (Date.now() - this.lastSnapshot > 150) { this.lastSnapshot = Date.now(); this.bus.emit('message', { type: 'world.tick', employees: this.s.employees.map(({ id, position, destination, state, bubble, bubbleUntil }) => ({ id, position, destination, state, bubble, bubbleUntil })), savedAt: this.s.savedAt } satisfies ServerEvent); }
  }
  stop() { this.stopped = true; for (const meeting of this.s.meetings) if (['gathering', 'running'].includes(meeting.status)) { meeting.status = 'failed'; meeting.error = 'Server stopped during meeting'; } for (const run of this.running.values()) run.controller.abort(); this.store.close(); }
}
