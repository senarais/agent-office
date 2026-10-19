import { CronExpressionParser } from 'cron-parser';
import { z } from 'zod';
import type { RecurringTask, Schedule, ScheduleRun } from '../../../packages/shared/src/automation';
import type { Office } from '../../../packages/shared/src/types';
import type { Engine } from './engine';
import { GameError } from './engine';
import { id } from './database';

const scheduleSchema = z.object({
  type: z.enum(['once', 'daily', 'weekly', 'interval', 'cron']), timezone: z.string().min(1).max(80),
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).default('09:00'), weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([1, 2, 3, 4, 5]),
  intervalMinutes: z.number().int().min(1).max(525600).default(30), cron: z.string().max(120).default('0 9 * * *'), runAt: z.string().max(40).default(''),
});
export const recurringSchema = z.object({
  name: z.string().trim().min(1).max(140), description: z.string().max(2000).default(''), employeeId: z.string().uuid(), providerId: z.string().max(80).default(''), model: z.string().max(160).default(''),
  instructions: z.string().trim().min(1).max(30000), expectedOutput: z.string().max(3000).default(''), projectPath: z.string().max(1024).default(''), tools: z.array(z.string().max(30)).max(10).default([]), priority: z.enum(['Low', 'Normal', 'High']).default('Normal'),
  schedule: scheduleSchema, outputDestination: z.enum(['printer', 'laptop', 'both']).default('both'), notify: z.boolean().default(true), autoDeliver: z.boolean().default(true), telegramNotify: z.boolean().default(false),
  retryOnFailure: z.boolean().default(false), maxRetries: z.number().int().min(0).max(3).default(1), retryDelayMinutes: z.number().int().min(1).max(1440).default(5), enabled: z.boolean().default(true),
});

export function nextOccurrence(schedule: Schedule, after: number, anchor: number): string | undefined {
  try {
    new Intl.DateTimeFormat('en', { timeZone: schedule.timezone }).format();
    if (schedule.type === 'once') { const at = Date.parse(schedule.runAt); if (!Number.isFinite(at) || !/(?:Z|[+-]\d\d:\d\d)$/.test(schedule.runAt)) throw new Error('One-time date needs an ISO timestamp with timezone'); return at > after ? new Date(at).toISOString() : undefined; }
    if (schedule.type === 'interval') { const step = schedule.intervalMinutes * 60000; return new Date(anchor + (Math.max(0, Math.floor((after - anchor) / step)) + 1) * step).toISOString(); }
    const [hour, minute] = schedule.time.split(':');
    if (schedule.type === 'weekly' && !schedule.weekdays.length) throw new Error('Choose at least one weekday');
    const expression = schedule.type === 'cron' ? schedule.cron : `${minute} ${hour} * * ${schedule.type === 'weekly' ? [...new Set(schedule.weekdays)].join(',') : '*'}`;
    if (schedule.type === 'cron' && expression.trim().split(/\s+/).length !== 5) throw new Error('Use five-field cron: minute hour day month weekday');
    return CronExpressionParser.parse(expression, { currentDate: new Date(after), tz: schedule.timezone }).next().toISOString()!;
  } catch (error) { throw new GameError(`Invalid schedule: ${(error as Error).message}`); }
}

/** Single-writer durable scheduler. Schedules run for every business office, even while another is active. */
export class Scheduler {
  constructor(private engine: Engine) {}
  private get s() { return this.engine.s.active; }
  private get time() { return this.engine.clock(); }
  save(input: unknown, ruleId?: string) {
    const data = recurringSchema.parse(input); const office = this.s; const employee = this.engine.employee(data.employeeId);
    if (data.providerId && !this.engine.s.providers.some(p => p.id === data.providerId)) throw new GameError('Provider not found');
    if (!ruleId && office.recurringTasks.filter(r => !r.deletedAt).length >= 100) throw new GameError('Local schedule capacity: 100 definitions');
    const old = ruleId ? this.get(ruleId) : undefined, time = this.time;
    const rule: RecurringTask = { ...data, tools: data.tools.filter(t => employee.tools.includes(t)), id: old?.id || id(), createdAt: old?.createdAt || new Date(time).toISOString(), updatedAt: new Date(time).toISOString() };
    const after = rule.schedule.type === 'once' ? Math.min(time, Date.parse(rule.schedule.runAt) - 1) : time;
    const next = nextOccurrence(rule.schedule, after, Date.parse(rule.createdAt)); rule.nextRunAt = rule.enabled ? next : undefined;
    if (old) Object.assign(old, rule, { pausedReason: undefined }); else office.recurringTasks.push(rule);
    this.engine.emit('schedule.updated', `Schedule saved: ${rule.name}`, rule.id); return old || rule;
  }
  get(ruleId: string) { const r = this.s.recurringTasks.find(r => r.id === ruleId && !r.deletedAt); if (!r) throw new GameError('Schedule not found', 404); return r; }
  action(ruleId: string, action: 'pause' | 'resume' | 'delete' | 'run') {
    const office = this.s; const r = this.get(ruleId), stamp = new Date(this.time).toISOString();
    if (action === 'run') return this.launch(r, stamp, office);
    if (action === 'delete') r.deletedAt = stamp;
    r.enabled = action === 'resume'; r.pausedReason = r.enabled ? undefined : 'Paused by Boss';
    if (r.enabled) { this.engine.employee(r.employeeId); const after = r.schedule.type === 'once' && !r.lastRunAt ? Math.min(this.time, Date.parse(r.schedule.runAt) - 1) : this.time; r.nextRunAt = nextOccurrence(r.schedule, after, Date.parse(r.createdAt)); }
    else { r.nextRunAt = undefined; for (const pending of office.scheduleRuns.filter(s => s.recurringTaskId === r.id && s.nextRetryAt)) { pending.nextRetryAt = undefined; const task = office.tasks.find(t => t.id === pending.taskId); if (task?.status === 'BLOCKED') task.status = 'FAILED'; } }
    r.updatedAt = stamp; this.engine.emit('schedule.updated', `${r.name}: ${action}`, r.id); return r;
  }
  private launch(rule: RecurringTask, scheduledAt: string, office: Office) {
    const duplicate = office.scheduleRuns.find(r => r.recurringTaskId === rule.id && r.scheduledAt === scheduledAt);
    if (duplicate) return duplicate;
    const run: ScheduleRun = { id: id(), recurringTaskId: rule.id, employeeId: rule.employeeId, scheduledAt, createdAt: new Date(this.time).toISOString(), status: 'queued', attempt: 1, errors: [] };
    const employee = office.employees.find(e => e.id === rule.employeeId);
    const overlapping = office.scheduleRuns.some(r => r.recurringTaskId === rule.id && (['queued', 'running'].includes(r.status) || !!r.nextRetryAt));
    if (!employee || employee.employmentStatus !== 'active' || employee.tortureId || overlapping) {
      run.status = 'skipped'; run.errors.push(overlapping ? 'Previous run is still active; overlap skipped.' : 'Employee unavailable (deceased, terminated or in torture room).'); run.completedAt = new Date(this.time).toISOString(); office.scheduleRuns.push(run); this.engine.emit('schedule.updated', `${rule.name}: ${run.errors[0]}`, rule.id, rule.notify); return run;
    }
    this.engine.task({ ...rule, title: rule.name, deadline: '' }, { definition: rule, run, office }); return run;
  }
  pauseEmployee(employeeId: string, reason: string, office: Office = this.s) {
    for (const r of office.recurringTasks.filter(r => r.employeeId === employeeId && r.enabled && !r.deletedAt)) { r.enabled = false; r.pausedReason = reason; r.nextRunAt = undefined; }
    for (const r of office.scheduleRuns.filter(r => r.employeeId === employeeId)) r.nextRetryAt = undefined;
  }
  reviveEmployee(employeeId: string) {
    const office = this.s;
    for (const r of office.recurringTasks.filter(r => r.employeeId === employeeId && r.pausedReason === 'Employee deceased' && !r.deletedAt)) { r.enabled = true; r.pausedReason = undefined; r.nextRunAt = nextOccurrence(r.schedule, this.time, Date.parse(r.createdAt)); }
  }
  copyTemplates(previousId: string, employeeId: string) {
    const office = this.s, stamp = new Date(this.time).toISOString();
    for (const old of office.recurringTasks.filter(r => r.employeeId === previousId && !r.deletedAt)) {
      const rule = structuredClone(old); rule.id = id(); rule.employeeId = employeeId; rule.copiedFromId = old.id; rule.createdAt = stamp; rule.updatedAt = stamp; rule.lastRunAt = undefined; rule.enabled = old.enabled || old.pausedReason?.startsWith('Employee ') === true; rule.pausedReason = rule.enabled ? undefined : old.pausedReason;
      if (rule.schedule.type === 'once' && Date.parse(rule.schedule.runAt) <= this.time) { rule.enabled = false; rule.pausedReason = 'Expired one-time template; run manually or edit its date'; }
      rule.nextRunAt = rule.enabled ? nextOccurrence(rule.schedule, this.time, this.time) : undefined;
      old.enabled = false; old.nextRunAt = undefined; old.pausedReason = 'Employee replaced'; old.deletedAt = stamp; office.recurringTasks.push(rule);
    }
  }
  tick(time = this.time) {
    let changed = false;
    for (const office of this.engine.s.offices) {
      for (const run of office.scheduleRuns) {
        const task = office.tasks.find(t => t.id === run.taskId); if (!task || run.status === 'skipped') continue;
        const pausedByBoss = task.status === 'BLOCKED' && task.error?.startsWith('Paused by Boss');
        const status = task.status === 'COMPLETED' ? 'completed' : task.status === 'CANCELLED' || pausedByBoss ? 'cancelled' : ['FAILED', 'BLOCKED'].includes(task.status) ? 'failed' : ['QUEUED', 'WALKING_TO_WORKSTATION'].includes(task.status) ? 'queued' : 'running';
        const rule = office.recurringTasks.find(r => r.id === run.recurringTaskId);
        if (status !== run.status) {
          run.status = status; changed = true;
          if (['completed', 'failed', 'cancelled'].includes(status)) run.completedAt = new Date(time).toISOString();
          if (status === 'failed') { run.errors.push(task.error || 'Execution failed'); if (rule?.enabled && !rule.deletedAt && rule.retryOnFailure && run.attempt <= rule.maxRetries && !task.error?.includes('Server restarted')) run.nextRetryAt = new Date(time + rule.retryDelayMinutes * 60000).toISOString(); if (!run.nextRetryAt && task.status === 'BLOCKED') task.status = 'FAILED'; }
          if (status === 'cancelled' || status === 'completed') run.nextRetryAt = undefined;
          if (status === 'cancelled' && task.error) run.errors.push(task.error);
        }
        if (run.nextRetryAt && Date.parse(run.nextRetryAt) <= time && rule?.enabled && !rule.deletedAt) {
          const employee = office.employees.find(e => e.id === run.employeeId);
          if (employee?.employmentStatus !== 'active' || employee.tortureId || this.engine.running.has(task.id)) continue;
          run.nextRetryAt = undefined; run.attempt++; run.status = 'queued'; run.completedAt = undefined;
          task.status = 'QUEUED'; task.result = ''; task.error = undefined; task.completedAt = undefined; changed = true;
        }
      }
      for (const rule of office.recurringTasks) {
        if (!rule.enabled || rule.deletedAt || !rule.nextRunAt || Date.parse(rule.nextRunAt) > time) continue;
        const due = rule.nextRunAt; rule.lastRunAt = due;
        // One catch-up run after downtime, never a burst of missed paid requests.
        rule.nextRunAt = nextOccurrence(rule.schedule, time, Date.parse(rule.createdAt));
        this.launch(rule, due, office); changed = true;
      }
    }
    if (changed) { this.engine.save(); this.engine.snapshot(true); }
  }
}
