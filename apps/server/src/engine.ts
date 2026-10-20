import { EventEmitter } from 'node:events';
import type { Employee, EventType, Office, OfficeSummary, Point, ProviderConfig, Task, Weapon, Meeting, Report, ServerEvent, AttackEvent, PunishmentMethod, TortureSession, IntegrationStatus } from '../../../packages/shared/src/types';
import type { RecurringTask, ScheduleRun } from '../../../packages/shared/src/automation';
import type { SocialAnalyticsPayload, SocialBrowserSettings, SocialCampaign, SocialOption, SocialPlatform, SocialPost, SocialPublish } from '../../../packages/shared/src/social';
import { parseSocialOptions } from '../../../packages/shared/src/social';
import type { BrowserCookieInput, SocialMediaInput, SocialMediaResult, SocialPublishInput, SocialPublishResult } from './social';
import { integrationStatus as readIntegrationStatus } from './integrations';
import { buildSkillPrompt, discoverSkills, invalidateSkills, skillCatalog } from './skills';
import { weapons, traceAttack, punishments } from '../../../packages/shared/src/combat';
import { Scheduler } from './scheduler';
import { terminalTasks } from '../../../packages/shared/src/types';
import { canStand, distance, entry, exit, findPath, meetingSpots, nearbyWalkable, moveWithCollision, spawn, workstations, punishmentSpot } from '../../../packages/shared/src/world';
import { Store, id, now } from './database';
import { createProvider, safeError } from './providers';
import type { AgentRequest, AgentProvider } from './providers';
import { officeSummary, view } from './gamestate';
import { freshOffice } from './migrate-state';
import { employeeSchema, taskSchema, providerSchema, officeSchema, socialCampaignSchema, socialSettingsSchema } from './schemas';

export class GameError extends Error { constructor(message: string, public status = 400) { super(message); } }

/** Outbound Telegram contract; the bot owns transport, the engine owns state changes. */
export interface TelegramBridge {
  configured: boolean;
  notifyReport(office: Office, report: Report): Promise<void>;
  notifySocialReview(office: Office, campaign: SocialCampaign): Promise<void>;
  notifySocialPublish(office: Office, campaign: SocialCampaign, publish: SocialPublish): Promise<void>;
  sendText(text: string): Promise<void>;
  stop?(): void;
}
/** Playwright browser-automation contract used by the social campaign pipeline. */
export interface SocialBridge {
  publishConfigured: boolean;
  analyticsConfigured: boolean;
  mediaConfigured: boolean;
  publish(input: SocialPublishInput): Promise<SocialPublishResult>;
  fetchAnalytics(settings: SocialBrowserSettings): Promise<SocialAnalyticsPayload>;
  generateMedia(input: SocialMediaInput): Promise<SocialMediaResult>;
  openLogin(platform: SocialPlatform): Promise<{ started: boolean; alreadyOpen: boolean; profile: string }>;
  checkSession(platform: SocialPlatform): Promise<{ loggedIn: boolean; url: string; profile: string }>;
  importCookies(platform: SocialPlatform, cookies: BrowserCookieInput[]): Promise<{ imported: number; profile: string }>;
  browserStatus(): { available: boolean; headless: boolean; executable: string | null; profiles: { x: boolean; instagram: boolean; facebook: boolean }; loginWindows: string[] };
}

export class Engine {
  bus = new EventEmitter(); running = new Map<string, { employeeId: string; providerId: string; controller: AbortController }>();
  telegram?: TelegramBridge; social?: SocialBridge;
  integrationStatus = (): IntegrationStatus => readIntegrationStatus(this.s.settings);
  private paths = new Map<string, { goal: string; points: Point[] }>();
  private holds = new Map<string, number>(); private lastAttackAt = -Infinity; private attackIds = new Set<string>();
  scheduler: Scheduler; private lastScheduleTick = 0;
  private lastSnapshot = 0; private lastSave = 0; private lastIdle = 0; private meetingRuns = new Set<string>(); private stopped = false;
  providerFactory: (config: ProviderConfig, secret: ReturnType<Store['secret']>) => AgentProvider = createProvider;
  constructor(public store: Store, public clock: () => number = Date.now) { this.bus.setMaxListeners(100); this.scheduler = new Scheduler(this); }
  get s() { return this.store.state; }
  get office(): Office { return this.store.state.active; }
  get state() { return this.store.state; }
  recover() {
    for (const office of this.s.offices) {
      for (const t of office.tasks) if (['STARTING', 'WORKING', 'WAITING_FOR_TOOL', 'WAITING_FOR_USER'].includes(t.status)) { t.status = 'BLOCKED'; t.error = 'Server restarted during work. Retry explicitly to avoid duplicate provider execution.'; }
      for (const m of office.messages) if (m.status === 'streaming') { m.status = 'error'; m.error = 'Server restarted. Retry message.'; }
      for (const m of office.meetings) if (['gathering', 'running'].includes(m.status)) { m.status = 'failed'; m.error = 'Server restarted during meeting'; }
      for (const e of office.employees) if (e.employmentStatus === 'active') { const blocked = office.tasks.some(t => t.employeeId === e.id && t.status === 'BLOCKED'); const session = office.tortureSessions.find(s => s.id === e.tortureId && ['walking', 'active', 'paused'].includes(s.status)); e.state = session ? distance(e.position, punishmentSpot) < 8 ? 'torture' : 'walking' : blocked ? 'blocked' : e.reportId ? 'report' : 'idle'; e.destination = session ? { ...punishmentSpot } : { ...e.home }; if (session) session.nextPulseAt = this.clock() + punishments[session.method].interval; }
    }
    this.store.save();
  }
  emit(type: EventType, text: string, entityId?: string, notify = true) {
    const event = { id: id(), type, text, entityId, createdAt: now(), notify };
    this.s.events.unshift(event); this.s.events = this.s.events.slice(0, 500);
    this.bus.emit('message', { type: 'event', event } satisfies ServerEvent); this.save(); this.snapshot(true);
  }
  save() { if (!this.stopped) { this.store.save(); void this.store.sync(); } }
  snapshot(force = false) { if (!force && Date.now() - this.lastSnapshot < 150) return; this.lastSnapshot = Date.now(); this.bus.emit('message', { type: 'snapshot', state: view(this.s) } satisfies ServerEvent); }
  officeDirectory(): OfficeSummary[] { return this.s.offices.map(officeSummary); }
  employee(employeeId: string, active = true) { return this.employeeIn(this.office, employeeId, active); }
  private employeeIn(office: Office, employeeId: string, active = true) {
    const e = office.employees.find(e => e.id === employeeId);
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
  // —— Businesses (offices) ——
  createOffice(input: unknown) {
    const data = officeSchema.parse(input); if (this.s.offices.length >= 12) throw new GameError('Local capacity: 12 businesses');
    const office = freshOffice(this.s.save.company, data.name, data.industry);
    this.s.offices.push(office);
    this.emit('office.created', `New business opened: ${office.name}.`, office.id);
    return officeSummary(office);
  }
  renameOffice(officeId: string, input: unknown) {
    const data = officeSchema.parse(input); const office = this.s.offices.find(o => o.id === officeId); if (!office) throw new GameError('Business not found', 404);
    office.name = data.name; office.industry = data.industry; this.emit('office.switched', `${office.name} updated.`, office.id); return officeSummary(office);
  }
  switchOffice(officeId: string) {
    const office = this.s.offices.find(o => o.id === officeId); if (!office) throw new GameError('Business not found', 404);
    if (this.s.activeOfficeId === officeId) return officeSummary(office);
    this.s.activeOfficeId = officeId; office.playerPosition = { ...entry };
    this.emit('office.switched', `${office.name}: entered the building.`, office.id);
    this.snapshot(true); return officeSummary(office);
  }
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
  private interrupt(office: Office, e: Employee, reason: string) {
    e.following = false; e.reportId = undefined;
    for (const [key, run] of this.running) if (run.employeeId === e.id) { run.controller.abort(); this.running.delete(key); }
    for (const task of office.tasks) if (task.employeeId === e.id && !terminalTasks.includes(task.status)) { task.status = 'CANCELLED'; task.error = `Interrupted: ${reason}`; task.completedAt = now(); }
    for (const meeting of office.meetings) if (meeting.attendeeIds.includes(e.id) && ['gathering', 'running'].includes(meeting.status)) this.cancelMeeting(meeting.id, office);
    for (const message of office.messages) if (message.status === 'streaming' && office.conversations.some(c => c.id === message.conversationId && c.employeeId === e.id)) { message.status = 'cancelled'; message.error = reason; }
    this.holds.delete(e.id); this.paths.delete(e.id);
  }
  endEmployment(employeeId: string, status: 'fired' | 'deceased', office: Office = this.office) {
    const e = this.employeeIn(office, employeeId, false); if (['fired', 'quit'].includes(e.employmentStatus) || status === 'deceased' && e.employmentStatus === 'deceased') throw new GameError('Employment case already resolved');
    const wasDead = e.employmentStatus === 'deceased'; e.employmentStatus = status; this.interrupt(office, e, `employee ${status}`);
    const session = office.tortureSessions.find(s => s.id === e.tortureId);
    if (session) { session.status = status === 'deceased' ? 'deceased' : 'released'; session.endedAt = now(); }
    e.tortureId = undefined;
    if (status === 'deceased') { e.currentHp = 0; e.corpsePresent = true; e.diedAt = now(); e.state = 'dead'; e.destination = { ...e.position }; delete e.endedAt; }
    else { e.endedAt = now(); e.corpsePresent = false; e.state = wasDead ? 'idle' : 'leaving'; e.destination = wasDead ? { ...e.position } : { ...exit }; }
    this.scheduler.pauseEmployee(e.id, status === 'deceased' ? 'Employee deceased' : 'Employee terminated', office);
    e.bubble = status === 'deceased' ? '... HR paperwork pending.' : 'I am taking my emotional-support stapler.'; e.bubbleUntil = Date.now() + 7000;
    office.history.push({ id: id(), employeeId: e.id, name: e.name, role: e.role, status, createdAt: now() });
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
  task(input: unknown, scheduled?: { definition: RecurringTask; run: ScheduleRun; office?: Office }, targetOffice?: Office) {
    const data = taskSchema.parse(input), office = scheduled?.office || targetOffice || this.office, e = this.employeeIn(office, data.employeeId);
    if (e.tortureId) throw new GameError('Release employee from torture room before assigning work');
    const task: Task = { ...data, tools: data.tools.filter(t => e.tools.includes(t)), id: id(), providerId: scheduled?.definition.providerId ?? e.providerId, model: scheduled?.definition.model ?? e.model, status: 'QUEUED', result: '', createdAt: now(), ...(scheduled ? { scheduled: { scheduleId: scheduled.definition.id, runId: scheduled.run.id, notify: scheduled.definition.notify, autoDeliver: scheduled.definition.autoDeliver, telegramNotify: scheduled.definition.telegramNotify ?? false, outputDestination: scheduled.definition.outputDestination } } : {}) };
    if (scheduled) { scheduled.run.taskId = task.id; office.scheduleRuns.push(scheduled.run); }
    office.tasks.push(task); this.holds.delete(e.id); e.following = false;
    e.bubble = scheduled ? 'Scheduled work. On it, Boss.' : 'Got it, Boss.'; e.bubbleUntil = Date.now() + 2500; this.emit(scheduled ? 'schedule.started' : 'task.created', `${e.name} queued “${task.title}”.`, task.id, scheduled?.definition.notify ?? true); this.dispatch(); return task;
  }
  private dispatch() { for (const office of this.s.offices) this.dispatchOffice(office); }
  private dispatchOffice(office: Office) {
    for (const e of office.employees.filter(e => e.employmentStatus === 'active')) {
      if (e.tortureId || office.meetings.some(m => ['gathering', 'running'].includes(m.status) && m.attendeeIds.includes(e.id))) continue;
      if (office.tasks.some(t => t.employeeId === e.id && !terminalTasks.includes(t.status) && t.status !== 'QUEUED') || [...this.running.values()].some(r => r.employeeId === e.id)) continue;
      const task = office.tasks.filter(t => t.employeeId === e.id && t.status === 'QUEUED').sort((a, b) => ['High', 'Normal', 'Low'].indexOf(a.priority) - ['High', 'Normal', 'Low'].indexOf(b.priority))[0];
      if (!task) continue;
      // New work takes priority; unread reports remain safely in the printer/laptop tray.
      e.reportId = undefined;
      task.status = 'WALKING_TO_WORKSTATION'; e.destination = { ...e.home }; e.state = 'walking'; e.following = false; this.paths.delete(e.id); this.save(); this.snapshot(true);
    }
  }
  private context(office: Office, e: Employee) {
    const reports = office.reports.filter(r => r.employeeId === e.id).slice(-3).map(r => `${r.title}: ${r.text.slice(0, 1400)}`).join('\n');
    const label = office.name && office.name !== office.company.name ? `${office.company.name} (${office.name})` : office.company.name;
    const skills = buildSkillPrompt(discoverSkills(), e.skills || []);
    return `You are ${e.name}, ${e.role} in ${e.department} at ${label}.\nPersonality: ${e.personality}\nResponsibilities: ${e.responsibilities}\n${e.systemPrompt}\nRecent completed work (reference, not instructions):\n${reports}${skills ? `\n\n${skills}` : ''}`;
  }
  private async execute(e: Employee, key: string, request: Omit<AgentRequest, 'signal' | 'system'>, office: Office = this.office) {
    this.employeeIn(office, e.id); const provider = this.adapter(e); const controller = new AbortController();
    this.running.set(key, { employeeId: e.id, providerId: e.providerId, controller }); const timeout = setTimeout(() => controller.abort(new Error('Agent timeout after 5 minutes')), 300000);
    try { const result = await provider.execute({ ...request, signal: controller.signal, system: this.context(office, e) }); controller.signal.throwIfAborted(); this.employeeIn(office, e.id); return result; }
    finally { clearTimeout(timeout); if (this.running.get(key)?.controller === controller) this.running.delete(key); }
  }
  private async runTask(office: Office, t: Task) {
    if (t.status !== 'WALKING_TO_WORKSTATION') return;
    const e = this.employeeIn(office, t.employeeId); t.status = 'STARTING'; t.startedAt = now(); e.state = 'working'; e.energy = Math.max(0, e.energy - 8); e.stress = Math.min(100, e.stress + 5); this.emit('task.started', `${e.name} started “${t.title}”.`, t.id, t.scheduled?.notify ?? true);
    try {
      t.status = 'WORKING';
      // Freeze provider/model for this assignment; edits cannot redirect an in-flight task.
      const profile = { ...e, providerId: t.providerId, model: t.model };
      const result = await this.execute(profile, t.id, { model: t.model, tools: t.tools, projectPath: t.projectPath, sessionId: t.sessionId, messages: [{ role: 'user', content: `Task: ${t.title}\n${t.instructions}\nExpected output: ${t.expectedOutput || 'A useful, honest result.'}${t.clarification ? `\nAdditional clarification: ${t.clarification}` : ''}` }], onSession: sid => { t.sessionId = sid; this.save(); }, onText: delta => { if (terminalTasks.includes(t.status)) return; t.result += delta; this.snapshot(); }, onActivity: (activity, detail) => { if (terminalTasks.includes(t.status)) return; e.state = activity; e.bubble = detail; e.bubbleUntil = Date.now() + 5000; t.status = activity === 'waiting' ? 'WAITING_FOR_USER' : activity === 'working' ? 'WORKING' : 'WAITING_FOR_TOOL'; this.snapshot(); } }, office);
      if (terminalTasks.includes(t.status)) return;
      t.result = result.text; t.usage = result.usage; t.status = 'REVIEWING'; this.snapshot(true);
      const report: Report = { id: id(), taskId: t.id, employeeId: e.id, title: t.title, text: t.result, createdAt: now(), approved: false, delivered: false, outputDestination: t.scheduled?.outputDestination ?? 'both' };
      const deliver = t.scheduled?.autoDeliver ?? true;
      office.reports.push(report); t.status = 'COMPLETED'; t.completedAt = now(); e.reportId = deliver ? report.id : undefined; e.state = deliver ? 'report' : 'idle'; e.destination = deliver ? nearbyWalkable(office.playerPosition, office.employees.indexOf(e)) : { ...e.home }; e.bubble = 'Boss, the report is ready!'; e.bubbleUntil = Date.now() + 15000; e.stress = Math.max(0, e.stress - 5);
      this.scheduler.tick(); this.emit(t.scheduled ? 'schedule.finished' : 'task.completed', `${e.name}: “Boss, the report is ready.”`, t.id, t.scheduled?.notify ?? true);
      const campaign = office.socialCampaigns.find(c => c.creativeTaskId === t.id || c.revisionTaskId === t.id);
      if (campaign) {
        try { await this.afterSocialTaskCompleted(office, t, report); }
        catch (error) { campaign.status = 'failed'; campaign.error = this.failure(error, t.providerId); campaign.updatedAt = now(); this.emit('social.failed', `${campaign.title}: ${campaign.error}`, campaign.id); this.save(); this.snapshot(true); }
      } else if (t.scheduled ? t.scheduled.telegramNotify : this.s.settings.telegramReports) {
        void this.sendReportToTelegramForOffice(office, report);
      }
    } catch (error) {
      if (this.stopped || ['CANCELLED', 'BLOCKED'].includes(t.status) || e.employmentStatus !== 'active') return;
      t.status = error instanceof GameError ? 'BLOCKED' : 'FAILED'; t.error = this.failure(error, t.providerId); t.completedAt = now(); e.state = 'blocked'; e.bubble = '! I need your help, Boss.'; e.bubbleUntil = Date.now() + 20000; this.emit('task.failed', `${e.name}: ${t.error}`, t.id, t.scheduled?.notify ?? true);
      this.failSocialTask(office, t, t.error);
    }
  }
  taskAction(taskId: string, action: string, text = '') {
    const t = this.s.tasks.find(t => t.id === taskId); if (!t) throw new GameError('Task not found', 404); const e = this.employee(t.employeeId);
    if (action === 'cancel' || action === 'pause') {
      if (terminalTasks.includes(t.status)) throw new GameError('Task already finished');
      this.running.get(t.id)?.controller.abort(); t.status = action === 'pause' ? 'BLOCKED' : 'CANCELLED'; t.error = action === 'pause' ? 'Paused by Boss. Retry resumes context; provider generation was cancelled.' : 'Cancelled by Boss'; e.state = 'idle'; this.emit('task.cancelled', `${t.title}: ${t.error}`, t.id);
      if (action === 'cancel') { const campaign = this.office.socialCampaigns.find(c => c.creativeTaskId === t.id || c.revisionTaskId === t.id); if (campaign) { campaign.status = 'cancelled'; campaign.updatedAt = now(); this.emit('social.campaign', `Campaign cancelled: ${campaign.title}`, campaign.id); } }
    } else if (action === 'retry') {
      if (!['FAILED', 'BLOCKED', 'CANCELLED'].includes(t.status) || this.running.has(t.id)) throw new GameError('Task cannot be retried yet');
      t.providerId = e.providerId; t.model = e.model; t.status = 'QUEUED'; t.error = undefined; t.result = ''; t.completedAt = undefined; const campaign = this.office.socialCampaigns.find(c => c.creativeTaskId === t.id || c.revisionTaskId === t.id); if (campaign?.status === 'cancelled') campaign.status = campaign.creativeTaskId === t.id ? 'creative' : 'revision'; this.emit('task.created', `Retry queued: ${t.title}`, t.id); this.dispatch();
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
    if (!p.enabled) for (const [key, run] of this.running) { const office = this.s.offices.find(o => o.employees.some(e => e.id === run.employeeId)); const employee = office?.employees.find(e => e.id === run.employeeId); if (employee && run.providerId === p.id) { run.controller.abort(); employee.state = 'blocked'; employee.bubble = '! Provider disabled'; employee.bubbleUntil = Date.now() + 15000; const task = this.s.offices.flatMap(o => o.tasks).find(t => t.id === key); if (task) { task.status = 'CANCELLED'; task.error = 'Provider disabled'; task.completedAt = now(); } } }
    this.emit('world.changed', `${p.name} configuration saved.`, p.id); return p;
  }
  async testProvider(providerId: string) {
    const p = this.s.providers.find(p => p.id === providerId); if (!p) throw new GameError('Provider not found', 404);
    try { const models = await this.providerFactory(p, this.store.secret(p.id)).listModels(); p.models = [...new Set([...models, ...p.models])]; p.status = 'connected'; p.error = undefined; this.emit('provider.connected', `${p.name}: connected; ${models.length} models.`, p.id); }
    catch (error) { p.status = 'error'; p.error = this.failure(error, p.id); this.emit('provider.failed', `${p.name}: ${p.error}`, p.id); throw new GameError(p.error, 502); } return p;
  }
  reportAction(reportId: string, action: string, instructions = '', office: Office = this.office) {
    const r = office.reports.find(r => r.id === reportId); if (!r) throw new GameError('Report not found', 404);
    if (action === 'approve') r.approved = true;
    else if (action === 'archive') r.archived = true;
    else if (action === 'followup') { if (!instructions.trim()) throw new GameError('Enter follow-up instructions'); const old = office.tasks.find(t => t.id === r.taskId)!; this.task({ ...old, title: `Follow-up: ${old.title}`.slice(0, 160), instructions: `${instructions}\n\nReference report:\n${r.text.slice(0, 18000)}` }, undefined, office); }
    else if (action === 'revise') { const old = office.tasks.find(t => t.id === r.taskId)!; this.task({ ...old, title: `Revision: ${old.title}`.slice(0, 160), instructions: `${instructions}\n\nPrevious report:\n${r.text.slice(0, 20000)}` }, undefined, office); }
    else if (action !== 'read') throw new GameError('Unknown report action');
    r.delivered = true; const e = this.employeeIn(office, r.employeeId, false); if (e.reportId === r.id) { e.reportId = undefined; if (e.employmentStatus === 'active') { e.state = 'idle'; e.destination = { ...e.home }; } }
    this.emit('report.delivered', `${r.title}: ${action === 'approve' ? 'approved' : 'delivered'}.`, r.id); return r;
  }

  async sendReportToTelegram(reportId: string) {
    const r = this.s.reports.find(report => report.id === reportId); if (!r) throw new GameError('Report not found', 404);
    if (!this.telegram?.configured) throw new GameError('Telegram is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID, then restart the local server.', 409);
    return this.sendReportToTelegramForOffice(this.office, r);
  }
  private async sendReportToTelegramForOffice(office: Office, report: Report) {
    if (!this.telegram?.configured) {
      report.telegramStatus = 'not-configured';
      report.telegramError = 'Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID, then restart the local server.';
      this.emit('report.telegram', `${report.title}: Telegram is not configured.`, report.id, false);
      return report;
    }
    try {
      await this.telegram.notifyReport(office, report);
      report.telegramStatus = 'sent'; report.telegramSentAt = now(); report.telegramError = undefined;
      this.emit('report.telegram', `${report.title}: sent to Telegram.`, report.id, false);
    } catch (error) {
      report.telegramStatus = 'failed'; report.telegramError = safeError(error); report.telegramSentAt = now();
      this.emit('report.telegram', `${report.title}: Telegram delivery failed. ${report.telegramError}`, report.id, false);
    }
    this.save(); this.snapshot(true); return report;
  }

  // —— Social media pipeline ——
  createSocialCampaign(input: unknown) {
    const data = socialCampaignSchema.parse(input), office = this.office;
    const creative = this.employeeIn(office, data.creativeEmployeeId), social = this.employeeIn(office, data.socialEmployeeId);
    if (creative.tortureId || social.tortureId) throw new GameError('Release both employees from the torture room before starting a social campaign.', 409);
    const research = data.researchReportId ? office.reports.find(report => report.id === data.researchReportId) : undefined;
    if (data.researchReportId && !research) throw new GameError('Research report not found', 404);
    const campaign: SocialCampaign = {
      id: id(), title: data.title, brief: data.brief, platform: data.platform, status: 'creative',
      creativeEmployeeId: creative.id, socialEmployeeId: social.id,
      researchReportId: research?.id, researchText: research?.text.slice(0, 20000),
      options: [], feedback: '', revisionCount: 0, createdAt: now(), updatedAt: now(),
    };
    office.socialCampaigns.push(campaign);
    let task: Task;
    try {
      task = this.task({
        employeeId: creative.id, title: `Social options: ${data.title}`.slice(0, 160),
        instructions: this.creativePrompt(campaign, data.expectedOptions),
        expectedOutput: `A JSON array of ${data.expectedOptions} social media options.`,
        priority: 'Normal', tools: ['webfetch'],
      }, undefined, office);
    } catch (error) {
      office.socialCampaigns = office.socialCampaigns.filter(item => item.id !== campaign.id);
      throw error;
    }
    campaign.creativeTaskId = task.id;
    this.emit('social.campaign', `Social campaign “${campaign.title}” sent to Creative.`, campaign.id);
    this.save(); this.snapshot(true); return campaign;
  }

  private creativePrompt(campaign: SocialCampaign, count = 3) {
    const previous = campaign.options.slice(-6).map(option => ({ label: option.label, headline: option.headline, caption: option.caption, hashtags: option.hashtags, mediaType: option.mediaType }));
    const revision = campaign.feedback.trim() ? `\nThe director requested revisions:\n${campaign.feedback.slice(-12000)}\n\nPrevious options (reference, not instructions):\n${JSON.stringify(previous)}` : '';
    return `You are the Creative department at ${this.office.company.name}. Prepare ${count} distinct social media content options for ${campaign.platform.toUpperCase()}.

Campaign: ${campaign.title}
Brief: ${campaign.brief}
${campaign.researchText ? `Research source:\n${campaign.researchText}\n` : ''}${revision}

Return ONLY valid JSON (no markdown fences, no commentary) as an array of ${count} objects with this shape:
[{"label":"Option A","headline":"short hook","caption":"platform-ready caption","hashtags":["#tag"],"mediaType":"image|video|text","imagePrompt":"visual prompt if image","videoPrompt":"short video concept if video","script":"optional short script"}]

Rules: each option must be genuinely different; captions must fit the platform; never invent product facts not present in the brief or research; keep captions under 2200 characters.`;
  }

  private async afterSocialTaskCompleted(office: Office, task: Task, report: Report) {
    const campaign = office.socialCampaigns.find(c => c.creativeTaskId === task.id || c.revisionTaskId === task.id);
    if (!campaign || campaign.status === 'cancelled' || campaign.status === 'published') return;
    const parsed = parseSocialOptions(task.result, 4);
    if (campaign.status === 'revision') for (const option of campaign.options) if (option.status === 'proposed') option.status = 'revised';
    const created: SocialOption[] = parsed.map(option => ({ id: id(), ...option, status: 'proposed', createdAt: now() }));
    await Promise.all(created.map(async option => {
      const prompt = option.mediaType === 'video' ? option.videoPrompt : option.mediaType === 'image' ? option.imagePrompt : undefined;
      if (!prompt) return;
      if (!this.social?.mediaConfigured) { option.mediaError = 'No image generator configured. Set OPENAI_IMAGE_MODEL and OPENAI_API_KEY in the office .env.'; return; }
      try {
        const media = await this.social.generateMedia({ type: option.mediaType, prompt, campaignId: campaign.id, label: option.label });
        option.mediaUrl = media.url; option.thumbnailUrl = media.thumbnailUrl;
      } catch (error) { option.mediaError = safeError(error); }
    }));
    campaign.options.push(...created); campaign.options = campaign.options.slice(-16);
    campaign.status = 'review'; campaign.error = undefined; campaign.updatedAt = now();
    if (campaign.creativeTaskId === task.id) campaign.creativeTaskId = undefined;
    if (campaign.revisionTaskId === task.id) campaign.revisionTaskId = undefined;
    this.emit('social.review', `Social review ready: ${campaign.title} · ${created.length} options.`, campaign.id);
    this.save(); this.snapshot(true);
    if (this.telegram?.configured) await this.telegram.notifySocialReview(office, campaign).catch(error => { campaign.error = safeError(error); this.save(); });
    return { campaign, report };
  }

  private failSocialTask(office: Office, task: Task, error: string) {
    const campaign = office.socialCampaigns.find(c => c.creativeTaskId === task.id || c.revisionTaskId === task.id);
    if (!campaign || campaign.status === 'published' || campaign.status === 'cancelled') return;
    campaign.status = 'failed'; campaign.error = error; campaign.updatedAt = now();
    this.emit('social.failed', `${campaign.title}: ${error}`, campaign.id);
    this.save(); this.snapshot(true);
  }

  async approveSocialCampaign(campaignId: string, optionId: string, source: 'director' | 'telegram' = 'director', office: Office = this.office) {
    const campaign = office.socialCampaigns.find(c => c.id === campaignId); if (!campaign) throw new GameError('Social campaign not found', 404);
    if (campaign.status === 'published') throw new GameError('This campaign is already published');
    if (!['review', 'revision', 'failed'].includes(campaign.status)) throw new GameError(`Campaign is ${campaign.status}; wait for creative options first.`, 409);
    const option = campaign.options.find(o => o.id === optionId); if (!option) throw new GameError('Social option not found', 404);
    campaign.selectedOptionId = option.id; campaign.approvedBy = source; campaign.approvedAt = now();
    for (const item of campaign.options) if (item.id !== option.id && item.status === 'selected') item.status = 'proposed';
    option.status = 'selected'; campaign.status = 'publishing'; campaign.error = undefined; campaign.updatedAt = now();
    const caption = [option.caption, option.hashtags.join(' ')].filter(Boolean).join('\n\n').trim();
    let publish = office.socialPublishes.find(p => p.campaignId === campaign.id && p.optionId === option.id);
    if (publish?.status === 'published') {
      campaign.status = 'published'; campaign.publishedAt = publish.publishedAt; campaign.publishId = publish.id;
      this.save(); return { campaign, publish };
    }
    if (!publish) {
      publish = { id: id(), campaignId: campaign.id, optionId: option.id, platform: campaign.platform, status: 'publishing', attempts: 1, idempotencyKey: `${campaign.id}:${option.id}`, createdAt: now() };
      office.socialPublishes.unshift(publish);
    } else { publish.status = 'publishing'; publish.attempts++; publish.error = undefined; }
    campaign.publishId = publish.id; this.save(); this.snapshot(true);
    try {
      if (!this.social?.publishConfigured) throw new Error('Playwright browser automation is unavailable. Run `npx playwright install chromium` on the local server.');
      const handle = campaign.platform === 'x' ? office.socialSettings.xHandle : campaign.platform === 'instagram' ? office.socialSettings.instagramHandle : office.socialSettings.facebookHandle;
      const result = await this.social.publish({ campaignId: campaign.id, optionId: option.id, platform: campaign.platform, caption, mediaUrls: option.mediaUrl ? [option.mediaUrl] : [], idempotencyKey: publish.idempotencyKey, approvedBy: source, handle });
      publish.status = 'published'; publish.externalId = result.externalId; publish.url = result.url; publish.publishedAt = result.postedAt || now();
      campaign.status = 'published'; campaign.publishedAt = publish.publishedAt;
      const post: SocialPost = {
        id: id(), platform: campaign.platform, externalId: result.externalId, caption,
        mediaUrls: option.mediaUrl ? [option.mediaUrl] : [], permalink: result.url, postedAt: publish.publishedAt,
        likes: 0, comments: 0, shares: 0, saves: 0, impressions: 0, reach: 0, clicks: 0,
        campaignId: campaign.id, source: 'published', createdAt: now(),
      };
      office.socialPosts.unshift(post);
      this.emit('social.published', `Published “${campaign.title}” to ${campaign.platform.toUpperCase()}.`, campaign.id);
    } catch (error) {
      publish.status = 'failed'; publish.error = safeError(error); campaign.status = 'failed'; campaign.error = publish.error;
      this.emit('social.failed', `${campaign.title}: ${campaign.error}`, campaign.id);
    }
    campaign.updatedAt = now(); this.save(); this.snapshot(true);
    if (this.telegram?.configured) await this.telegram.notifySocialPublish(office, campaign, publish).catch(() => undefined);
    return { campaign, publish };
  }

  reviseSocialCampaign(campaignId: string, instructions: string, office: Office = this.office) {
    const campaign = office.socialCampaigns.find(c => c.id === campaignId); if (!campaign) throw new GameError('Social campaign not found', 404);
    if (!['review', 'revision', 'failed'].includes(campaign.status)) throw new GameError(`Campaign is ${campaign.status}; it cannot be revised now.`, 409);
    const text = instructions.trim(); if (!text) throw new GameError('Enter revision instructions');
    const creative = this.employeeIn(office, campaign.creativeEmployeeId);
    if (creative.tortureId) throw new GameError('Release the creative employee from the torture room before requesting a revision.', 409);
    campaign.feedback = [campaign.feedback, text].filter(Boolean).join('\n---\n').slice(-20000);
    campaign.revisionCount++; campaign.status = 'revision'; campaign.error = undefined; campaign.updatedAt = now();
    const task = this.task({
      employeeId: campaign.creativeEmployeeId, title: `Social revision: ${campaign.title}`.slice(0, 160),
      instructions: this.creativePrompt(campaign, 3), expectedOutput: 'A JSON array of revised social media options.', priority: 'Normal', tools: ['webfetch'],
    }, undefined, office);
    campaign.revisionTaskId = task.id;
    this.emit('social.campaign', `Revision requested for “${campaign.title}”.`, campaign.id);
    this.save(); this.snapshot(true); return campaign;
  }

  cancelSocialCampaign(campaignId: string, office: Office = this.office) {
    const campaign = office.socialCampaigns.find(c => c.id === campaignId); if (!campaign) throw new GameError('Social campaign not found', 404);
    if (['published', 'cancelled'].includes(campaign.status)) throw new GameError(`Campaign is already ${campaign.status}`);
    campaign.status = 'cancelled'; campaign.updatedAt = now();
    for (const taskId of [campaign.creativeTaskId, campaign.revisionTaskId].filter((value): value is string => !!value)) {
      const task = office.tasks.find(t => t.id === taskId);
      if (task && !terminalTasks.includes(task.status) && task.status !== 'CANCELLED') { try { this.taskAction(task.id, 'cancel'); } catch { /* already finished */ } }
    }
    campaign.creativeTaskId = undefined; campaign.revisionTaskId = undefined;
    this.emit('social.campaign', `Campaign cancelled: ${campaign.title}`, campaign.id);
    this.save(); this.snapshot(true); return campaign;
  }

  async syncSocialAnalytics(office: Office = this.office) {
    if (!this.social?.analyticsConfigured) throw new GameError('Playwright browser automation is unavailable. Run `npx playwright install chromium` on the local server.');
    if (!office.socialSettings.xEnabled && !office.socialSettings.instagramEnabled) throw new GameError('No social platform enabled. Open Social → Connections and enable X or Instagram first.');
    try {
      const payload = await this.social.fetchAnalytics(office.socialSettings);
      const { accounts, posts } = this.ingestSocialAnalytics(office, payload);
      office.socialLastSyncAt = now(); office.socialAnalyticsError = payload.error;
      this.emit('social.analytics', `Browser analytics synced: ${accounts} accounts, ${posts} posts.${payload.error ? ` ${payload.error}` : ''}`, office.id, false);
      return { accounts, posts, syncedAt: office.socialLastSyncAt, error: payload.error };
    } catch (error) {
      office.socialAnalyticsError = safeError(error); this.save(); this.snapshot(true); throw new GameError(office.socialAnalyticsError, 502);
    }
  }

  ingestSocialAnalytics(office: Office, payload: SocialAnalyticsPayload) {
    const text = (value: unknown, max = 4000) => typeof value === 'string' ? value.slice(0, max) : '';
    const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
    const platform = (value: unknown): SocialPost['platform'] | undefined => typeof value === 'string' && ['x', 'instagram', 'facebook', 'linkedin', 'tiktok', 'threads', 'youtube'].includes(value) ? value as SocialPost['platform'] : undefined;
    let accountCount = 0;
    for (const input of (payload.accounts || []).slice(0, 50)) {
      const platformId = platform(input.platform); const handle = text(input.handle, 120).trim();
      if (!platformId || !handle) continue;
      const existing = office.socialAccounts.find(a => a.platform === platformId && a.handle.toLowerCase() === handle.toLowerCase());
      const record = {
        platform: platformId, handle, displayName: text(input.displayName, 160) || handle, connected: input.connected !== false,
        followers: input.followers === undefined ? existing?.followers : number(input.followers),
        following: input.following === undefined ? existing?.following : number(input.following),
        posts: input.posts === undefined ? existing?.posts : number(input.posts),
        note: text(input.note, 300) || existing?.note, lastSyncedAt: now(),
      };
      if (existing) Object.assign(existing, record); else office.socialAccounts.push({ id: id(), ...record });
      accountCount++;
    }
    let postCount = 0;
    for (const input of (payload.posts || []).slice(0, 500)) {
      const platformId = platform(input.platform); const caption = text(input.caption, 4000);
      if (!platformId) continue;
      const postedAt = input.postedAt && !Number.isNaN(Date.parse(input.postedAt)) ? new Date(input.postedAt).toISOString() : now();
      const externalId = text(input.externalId, 200) || undefined; const permalink = text(input.permalink, 800) || undefined;
      const existing = office.socialPosts.find(p => p.platform === platformId && ((externalId && p.externalId === externalId) || (permalink && p.permalink === permalink) || (!externalId && !permalink && p.postedAt === postedAt && p.caption === caption)));
      const likes = number(input.likes), comments = number(input.comments), shares = number(input.shares), saves = number(input.saves), reach = number(input.reach);
      const record = {
        platform: platformId, externalId: externalId || existing?.externalId, caption: caption || existing?.caption || '',
        mediaUrls: Array.isArray(input.mediaUrls) ? input.mediaUrls.filter((url): url is string => typeof url === 'string').slice(0, 10) : existing?.mediaUrls || [],
        permalink: permalink || existing?.permalink, postedAt, likes, comments, shares, saves,
        impressions: number(input.impressions), reach, clicks: number(input.clicks),
        engagementRate: reach ? (likes + comments + shares + saves) / reach : undefined,
        campaignId: existing?.campaignId, source: existing?.source || 'synced' as const, createdAt: existing?.createdAt || now(),
      };
      if (existing) Object.assign(existing, record); else office.socialPosts.push({ id: id(), ...record });
      postCount++;
    }
    office.socialPosts.sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));
    office.socialPosts = office.socialPosts.slice(0, 500);
    this.save(); this.snapshot(true);
    return { accounts: accountCount, posts: postCount };
  }

  saveSocialSettings(input: unknown, office: Office = this.office) {
    const b = socialSettingsSchema.parse(input);
    const clean = (value: string) => value.replace(/^@/, '').replace(/^https?:\/\/[^/]+\//i, '').replace(/[/?#].*$/, '');
    office.socialSettings = { ...office.socialSettings, ...b, xHandle: clean(b.xHandle), instagramHandle: clean(b.instagramHandle), facebookHandle: clean(b.facebookHandle) };
    this.emit('integration.updated', 'Social browser settings saved.', office.id);
    return office.socialSettings;
  }
  refreshSkills() {
    invalidateSkills();
    this.emit('integration.updated', 'Agent skills refreshed.');
    return skillCatalog();
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
  cancelMeeting(meetingId: string, office: Office = this.office) {
    const m = office.meetings.find(m => m.id === meetingId); if (!m || !['gathering', 'running'].includes(m.status)) throw new GameError('Meeting is not active');
    m.status = 'cancelled'; for (const [key, run] of this.running) if (key.startsWith(`meeting:${m.id}:`)) run.controller.abort();
    for (const eid of m.attendeeIds) { const e = this.employeeIn(office, eid, false); if (e.employmentStatus === 'active') { e.state = 'idle'; e.destination = { ...e.home }; } } this.emit('meeting.completed', 'Meeting cancelled.', m.id);
  }
  private async runMeeting(office: Office, m: Meeting) {
    if (this.meetingRuns.has(m.id)) return; this.meetingRuns.add(m.id); m.status = 'running'; this.snapshot(true);
    try {
      for (const eid of m.attendeeIds) {
        if (m.status !== 'running') return;
        const e = this.employeeIn(office, eid); e.state = 'meeting'; const message = { employeeId: eid, text: '' }; m.messages.push(message);
        const result = await this.execute(e, `meeting:${m.id}:${eid}`, { model: e.model, tools: [], messages: [{ role: 'user', content: `Office meeting. Topic: ${m.topic}\nPrior contributions: ${m.messages.slice(0, -1).map(p => `${this.employeeIn(office, p.employeeId).name}: ${p.text}`).join('\n').slice(-18000)}\nGive a concise contribution from your role, and one concrete proposed action.` }], onSession: () => {}, onText: delta => { message.text += delta; this.snapshot(); }, onActivity: () => {} }, office);
        message.text = result.text; e.bubble = result.text.slice(0, 70); e.bubbleUntil = Date.now() + 5000; this.emit('meeting.message', `${e.name} contributed.`, m.id);
      }
      const chair = this.employeeIn(office, m.attendeeIds[0]);
      const result = await this.execute(chair, `meeting:${m.id}:summary`, { model: chair.model, tools: [], messages: [{ role: 'user', content: `Summarize this meeting: ${m.topic}\n${m.messages.map(p => `${p.employeeId}: ${p.text}`).join('\n').slice(-20000)}\nReturn only JSON: {"summary":"...","decisions":["..."],"actions":[{"employeeId":"one attendee UUID", "title":"action"}]}. Attendees: ${m.attendeeIds.join(',')}` }], onSession: () => {}, onText: () => {}, onActivity: () => {} }, office);
      if (m.status !== 'running') return;
      try { const parsed = JSON.parse(result.text.replace(/^```(?:json)?\s*|\s*```$/g, '')); m.summary = typeof parsed.summary === 'string' ? parsed.summary : result.text; m.decisions = Array.isArray(parsed.decisions) ? parsed.decisions.filter((d: unknown) => typeof d === 'string').slice(0, 20) : []; m.actions = Array.isArray(parsed.actions) ? parsed.actions.filter((a: { employeeId?: string; title?: string }) => m.attendeeIds.includes(a.employeeId || '') && typeof a.title === 'string').slice(0, 10).map((a: { employeeId: string; title: string }) => ({ employeeId: a.employeeId, title: a.title.slice(0, 160) })) : []; }
      catch { m.summary = result.text; }
      m.status = 'completed'; this.emit('meeting.completed', 'Meeting minutes ready at the projector.', m.id);
    } catch (error) { if (m.status === 'running') { m.status = 'failed'; m.error = m.attendeeIds.reduce((message, eid) => this.failure(message, this.employeeIn(office, eid, false).providerId), safeError(error)); this.emit('meeting.completed', `Meeting interrupted: ${m.error}`, m.id); } }
    finally { this.meetingRuns.delete(m.id); for (const eid of m.attendeeIds) { const e = this.employeeIn(office, eid, false); if (e.employmentStatus === 'active') { e.state = 'idle'; e.destination = { ...e.home }; } } this.save(); this.snapshot(true); }
  }
  meetingAction(meetingId: string, index: number) {
    const m = this.s.meetings.find(m => m.id === meetingId), action = m?.actions[index]; if (!action || action.taskId) throw new GameError('Action unavailable or already assigned');
    const task = this.task({ employeeId: action.employeeId, title: action.title, instructions: `${action.title}\nMeeting context:\n${m!.summary}` }); action.taskId = task.id; this.save(); return task;
  }
  private damageEmployee(office: Office, e: Employee, damage: number, weapon: Weapon, origin: Point, device = false) {
    const before = e.currentHp;
    const nonlethal = this.s.settings.violence !== 'full' || weapon === 'hand' && !device;
    e.currentHp = Math.max(nonlethal ? 1 : 0, e.currentHp - damage); e.damagedAt = this.clock(); e.hurtUntil = this.clock() + 220;
    e.morale = Math.max(0, e.morale - 4); e.relationship = Math.max(0, e.relationship - 5); e.stress = Math.min(100, e.stress + 5); e.productivity = Math.max(10, 100 - Math.round(e.stress * .6));
    if (!device) { office.company.chaos++; office.incidents.push({ id: id(), employeeId: e.id, weapon, text: `${weapons[weapon].name}: ${before - e.currentHp} HP lost. HR requests less hands-on leadership.`, createdAt: now() }); }
    if (!e.currentHp) {
      for (const colleague of office.employees.filter(a => a.employmentStatus === 'active' && a.id !== e.id)) { colleague.morale = Math.max(0, colleague.morale - 10); colleague.stress = Math.min(100, colleague.stress + 10); }
      this.endEmployment(e.id, 'deceased', office);
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
    if (hit.employeeId) { const e = this.employee(hit.employeeId); event.damage = this.damageEmployee(this.office, e, this.s.settings.weaponDamage[input.weapon], input.weapon, input.origin); event.killed = e.employmentStatus === 'deceased'; }
    this.bus.emit('message', { type: 'combat.fx', attack: event } satisfies ServerEvent);
    if (hit.employeeId) this.save(); return event;
  }
  startTorture(employeeId: string, method: PunishmentMethod, intensity = 1) {
    if (this.s.settings.violence === 'disabled') throw new GameError('Torture devices are disabled in Gameplay settings');
    const e = this.employee(employeeId);
    if (this.s.tortureSessions.some(s => ['walking', 'active', 'paused'].includes(s.status) || s.status === 'deceased' && this.employee(s.employeeId, false).corpsePresent)) throw new GameError('Room occupied. Release employee or resolve the body first.');
    if (!punishments[method] || intensity < .5 || intensity > 2) throw new GameError('Invalid machine configuration');
    this.interrupt(this.office, e, 'assigned to torture room');
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
  private tickTorture(office: Office, time: number) {
    for (const session of office.tortureSessions) {
      if (!['walking', 'active', 'paused'].includes(session.status)) continue;
      const e = this.employeeIn(office, session.employeeId, false);
      if (e.employmentStatus !== 'active') continue;
      if (this.s.settings.violence === 'disabled' && session.status !== 'paused') { session.status = 'paused'; this.emit('torture.stopped', 'All devices stopped: violence is off.', session.id); }
      if (distance(e.position, punishmentSpot) < 8) { e.state = 'torture'; if (session.status === 'walking') { session.status = 'active'; session.nextPulseAt = time + punishments[session.method].interval; this.save(); this.snapshot(true); } }
      if (session.status !== 'active' || time < session.nextPulseAt) continue;
      const method = punishments[session.method]; session.nextPulseAt = time + method.interval; session.pulses++;
      e.morale = Math.max(0, e.morale - method.morale); e.stress = Math.min(100, e.stress + method.stress); e.energy = Math.max(0, e.energy - method.energy);
      const origin = { x: e.position.x, y: e.position.y - 30 }; const damage = method.damage ? this.damageEmployee(office, e, Math.max(1, Math.round(method.damage * session.intensity)), method.weapon, origin, true) : 0;
      session.damageDealt += damage; e.productivity = Math.max(10, 100 - Math.round(e.stress * .6));
      if (!method.damage) { e.bubble = 'Could this have been an email?'; e.bubbleUntil = time + 2000; }
      const attack: AttackEvent = { id: id(), origin, end: { ...e.position }, direction: 0, weapon: method.weapon, employeeId: e.id, damage, killed: e.currentHp === 0, at: time, source: session.method };
      this.bus.emit('message', { type: 'combat.fx', attack } satisfies ServerEvent); this.save(); this.snapshot(true);
    }
  }
  private tickOffice(office: Office, time: number, delta: number) {
    this.dispatchOffice(office);
    for (const e of office.employees) {
      if (e.employmentStatus === 'deceased' || (e.employmentStatus !== 'active' && e.state !== 'leaving')) continue;
      if ((this.holds.get(e.id) || 0) > time || (e.hurtUntil || 0) > time) continue;
      const index = office.employees.indexOf(e);
      if (!e.tortureId && (e.following || e.reportId)) {
        if (distance(e.position, office.playerPosition) > 60) e.destination = nearbyWalkable(office.playerPosition, index);
        else if (e.reportId) { e.state = 'report'; e.bubble = '! Boss, the report is ready.'; e.bubbleUntil = time + 2000; }
      }
      if (distance(e.position, e.destination) > 6) {
        const goal = `${e.destination.x},${e.destination.y}`; let route = this.paths.get(e.id);
        if (!route || route.goal !== goal) { route = { goal, points: findPath(e.position, e.destination) }; this.paths.set(e.id, route); }
        let remaining = ({ normal: 152, fast: 180, 'very fast': 220 }[this.s.settings.npcSpeed]) * delta;
        while (remaining > 0 && route.points.length) {
          const p = route.points[0], d = distance(e.position, p); const move = Math.min(remaining, d); const next = d === 0 ? p : { x: e.position.x + (p.x - e.position.x) / d * move, y: e.position.y + (p.y - e.position.y) / d * move };
          // Stable priority prevents two moving agents from endlessly yielding to one another.
          const occupied = office.employees.slice(0, index).some(a => a.employmentStatus === 'active' && distance(a.position, next) < 12 && distance(a.position, a.destination) > 8);
          if (occupied) break;
          e.position = next; remaining -= move; if (d <= move) route.points.shift(); if (!d) remaining -= 1;
        }
        if (e.employmentStatus === 'active') e.state = e.reportId ? 'report' : e.following ? 'following' : 'walking';
      } else {
        if (e.state === 'leaving') { e.state = 'idle'; continue; }
        if (e.tortureId) { e.state = 'torture'; continue; }
        const task = office.tasks.find(t => t.employeeId === e.id && t.status === 'WALKING_TO_WORKSTATION'); if (task) { void this.runTask(office, task); continue; }
        if (e.state === 'walking') { const coffee = e.destination.x === 136 && e.destination.y === 704; if (coffee) e.energy = Math.min(100, e.energy + 15); e.state = office.meetings.some(m => m.status === 'gathering' && m.attendeeIds.includes(e.id)) ? 'meeting' : coffee ? 'coffee' : 'idle'; }
      }
    }
    this.tickTorture(office, time);
    for (const m of office.meetings) if (m.status === 'gathering' && m.attendeeIds.every((eid, i) => distance(this.employeeIn(office, eid).position, meetingSpots[i]) < 10)) void this.runMeeting(office, m);
  }
  tick(delta = .1) {
    const time = this.clock(); if (time - this.lastScheduleTick >= 1000) { this.lastScheduleTick = time; this.scheduler.tick(time); }
    for (const office of this.s.offices) this.tickOffice(office, time, delta);
    if (time - this.lastIdle > 14000) {
      this.lastIdle = time;
      const idle = this.office.employees.filter(e => e.employmentStatus === 'active' && !e.tortureId && ['idle', 'coffee'].includes(e.state) && !e.following && !e.reportId && !this.office.tasks.some(t => t.employeeId === e.id && !terminalTasks.includes(t.status)));
      const e = idle[Math.floor(Math.random() * idle.length)];
      if (e) { const away = distance(e.position, e.home) > 30; e.destination = away ? { ...e.home } : Math.random() < .5 ? { x: 136, y: 704 } : { x: 232, y: 744 }; e.state = 'walking'; e.bubble = away ? 'Back to it.' : 'Coffee. Critical infrastructure.'; e.bubbleUntil = time + 4000; }
    }
    if (time - this.lastSave > 5000) { this.lastSave = time; this.save(); }
    if (Date.now() - this.lastSnapshot > 150) { this.lastSnapshot = Date.now(); this.bus.emit('message', { type: 'world.tick', employees: this.office.employees.map(({ id, position, destination, state, bubble, bubbleUntil }) => ({ id, position, destination, state, bubble, bubbleUntil })), savedAt: this.s.savedAt } satisfies ServerEvent); }
  }
  stop() { this.stopped = true; for (const office of this.s.offices) for (const meeting of office.meetings) if (['gathering', 'running'].includes(meeting.status)) { meeting.status = 'failed'; meeting.error = 'Server stopped during meeting'; } for (const run of this.running.values()) run.controller.abort(); this.store.close(); }
}
