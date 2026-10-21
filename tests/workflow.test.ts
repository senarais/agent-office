import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine } from '../apps/server/src/engine';
import type { SocialBridge } from '../apps/server/src/engine';
import { Store } from '../apps/server/src/database';
import { defaultAppearance, defaultSettings } from '../packages/shared/src/types';
import type { Report } from '../packages/shared/src/types';
import { formatResearchOptions, instantiatePreset, parseResearchOptions, parseSocialPlan, resolvePlanTime } from '../packages/shared/src/workflow';
import type { SocialAnalyticsPayload, SocialBrowserSettings } from '../packages/shared/src/social';
import type { SocialPublishInput } from '../apps/server/src/social';

delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.TELEGRAM_BOT_TOKEN; delete process.env.TELEGRAM_CHAT_ID;

const profile = { name: 'Rani', role: 'Analyst', department: 'Research' as const, appearance: defaultAppearance, systemPrompt: 'Keep evidence and sources.', tools: ['webfetch'] };
const socialProfile = { ...profile, name: 'Sari', role: 'Social Media Manager', department: 'Social Media' as const };

function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'pt-flow-')); let time = Date.parse('2026-10-20T00:00:00Z');
  const engine = new Engine(new Store(directory), () => time);
  t.after(() => { engine.stop(); rmSync(directory, { recursive: true, force: true }); });
  return { directory, engine, advance: (ms: number) => { time += ms; return time; }, time: () => time };
}
async function eventually(check: () => boolean) { for (let index = 0; index < 500; index++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 10)); } assert.fail('Timed out waiting for workflow lifecycle'); }
function walk(engine: Engine, count = 260) { for (let index = 0; index < count; index++) engine.tick(.1); }
async function advanceUntil(engine: Engine, check: () => boolean) {
  for (let round = 0; round < 120; round++) {
    if (check()) return;
    for (let index = 0; index < 20; index++) engine.tick(.1);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('Timed out advancing workflow');
}
const fakeSocial = (published: SocialPublishInput[], overrides: Partial<SocialBridge> = {}): SocialBridge => ({
  publishConfigured: true, analyticsConfigured: true, mediaConfigured: false,
  publish: async input => { published.push(input); return { externalId: 'flow-post-1', url: 'https://x.example/flow-post-1', postedAt: new Date().toISOString() }; },
  fetchAnalytics: async (_settings: SocialBrowserSettings): Promise<SocialAnalyticsPayload> => ({ accounts: [], posts: [] }),
  generateMedia: async () => { throw new Error('Media generation is not part of this fixture'); },
  openLogin: async () => ({ started: true, alreadyOpen: false, profile: '/tmp/profile' }),
  checkSession: async () => ({ loggedIn: true, url: '', profile: '/tmp/profile' }),
  importCookies: async () => ({ imported: 1, profile: '/tmp/profile' }),
  browserStatus: () => ({ available: true, headless: true, executable: '/usr/bin/google-chrome', profiles: { x: true, instagram: true, facebook: false }, loginWindows: [] }),
  ...overrides,
});

test('social plans parse fences, wrappers and real times without inventing a schedule', () => {
  const parsed = parseSocialPlan('```json\n{"posts":[{"time":"09:00","caption":"Morning post","hashtags":["#Abisena"],"mediaType":"text"},{"scheduledAt":"2026-10-20T10:00:00Z","caption":"Second post","mediaType":"image","imagePrompt":"office"}]}\n```');
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].time, '09:00'); assert.deepEqual(parsed[0].hashtags, ['#Abisena']); assert.equal(parsed[0].mediaType, 'text');
  assert.equal(parsed[1].scheduledAt, '2026-10-20T10:00:00Z'); assert.equal(parsed[1].mediaType, 'image');
  assert.equal(resolvePlanTime(parsed[0], Date.parse('2026-10-20T00:00:00Z'), 'Asia/Jakarta'), '2026-10-20T02:00:00.000Z');
  assert.equal(resolvePlanTime(parsed[0], Date.parse('2026-10-20T03:00:00Z'), 'Asia/Jakarta'), '2026-10-21T02:00:00.000Z');
  assert.equal(resolvePlanTime(parsed[1], Date.parse('2026-10-20T00:00:00Z'), 'Asia/Jakarta'), '2026-10-20T10:00:00.000Z');
  assert.deepEqual(parseSocialPlan('I could not build a schedule.'), []);
  const preset = instantiatePreset('social-daily');
  assert.ok(preset); assert.equal(preset.steps.at(-1)!.kind, 'social-plan'); assert.equal(preset.steps.at(-1)!.requiresApproval, true);
});

test('workflow passes research to the social plan, waits for approval, then publishes the approved schedule', async t => {
  const f = fixture(t), p = await f.engine.configureProvider({ name: 'Workflow fixture', kind: 'generic', baseUrl: 'http://127.0.0.1:1/v1', model: 'flow-test' });
  const research = f.engine.hire({ ...profile, providerId: p.id, model: 'flow-test' });
  const social = f.engine.hire({ ...socialProfile, providerId: p.id, model: 'flow-test' });
  research.position = { ...research.home }; social.position = { ...social.home };
  const published: SocialPublishInput[] = []; const prompts: string[] = [];
  const reviews: { step: string; status: string; plan: number }[] = []; const finished: string[] = [];
  f.engine.social = fakeSocial(published);
  f.engine.s.settings.telegramReports = false;
  f.engine.telegram = {
    configured: true,
    notifyReport: async (_office, _report: Report) => undefined,
    notifySocialReview: async () => undefined,
    notifySocialPublish: async () => undefined,
    notifyWorkflowReview: async (_office, _run, step, _report, plan) => { reviews.push({ step: step.name, status: step.status, plan: plan.length }); },
    notifyWorkflowFinished: async (_office, run) => { finished.push(run.status); },
    sendText: async () => undefined,
  };
  const due = new Date(f.time() + 3600000).toISOString();
  f.engine.providerFactory = () => ({
    listModels: async () => ['flow-test'],
    execute: async request => {
      const prompt = request.messages.at(-1)!.content; prompts.push(prompt);
      const text = prompt.includes('Return ONLY valid JSON')
        ? JSON.stringify({ posts: [
          { scheduledAt: due, caption: 'Morning trend post', hashtags: ['#Abisena'], mediaType: 'text' },
          { scheduledAt: new Date(f.time() + 7200000).toISOString(), caption: 'Afternoon trend post', hashtags: ['#Office'], mediaType: 'text' },
        ] })
        : 'Research findings: trend A and trend B with sources.';
      request.onText(text); return { text };
    },
  });
  const workflow = f.engine.createWorkflow({
    name: 'Daily X posting', description: 'Research today, then schedule today.', timezone: 'Asia/Jakarta', schedule: null, enabled: true,
    steps: [
      { id: 'research', name: 'Research trends', employeeId: research.id, instructions: 'Research today’s trends with sources.', expectedOutput: 'Sourced trends.', dependsOn: [], requiresApproval: false, kind: 'agent', tools: ['webfetch'] },
      { id: 'plan', name: 'Build posting schedule', employeeId: social.id, instructions: 'Build today’s complete posting schedule.', expectedOutput: '', dependsOn: ['research'], requiresApproval: true, kind: 'social-plan', platform: 'x', expectedPosts: 2, tools: [] },
    ],
  });
  const run = f.engine.workflowAction(workflow.id, 'run');
  assert.ok(run);
  await advanceUntil(f.engine, () => run!.steps[1].status === 'awaiting_approval');
  const researchStep = run!.steps[0], planStep = run!.steps[1];
  assert.equal(researchStep.status, 'approved'); assert.equal(planStep.status, 'awaiting_approval');
  assert.equal(run!.status, 'waiting_approval');
  assert.ok(prompts.some(prompt => prompt.includes('Research findings: trend A and trend B with sources.')));
  assert.equal(f.engine.s.socialPostPlans.length, 2);
  assert.ok(f.engine.s.socialPostPlans.every(item => item.status === 'proposed'));
  assert.equal(f.engine.s.reports.length, 2);
  assert.ok(f.engine.s.reports.every(report => report.workflow?.runId === run!.id));
  assert.equal(research.reportId, undefined, 'auto-approved steps must not walk to the boss with a stale report');
  assert.deepEqual(reviews.map(review => review.status), ['awaiting_approval']);
  assert.deepEqual(reviews.map(review => review.plan), [2]);
  f.engine.approveWorkflowStep(run!.id, planStep.id, 'telegram', f.engine.office, 'Keep #1 and #3; drop the crypto one.');
  assert.equal(planStep.status, 'approved'); assert.equal(run!.status, 'completed');
  assert.equal(planStep.approvalNote, 'Keep #1 and #3; drop the crypto one.');
  assert.ok(f.engine.s.socialPostPlans.every(item => item.status === 'approved'));
  await eventually(() => reviews.length === 2);
  assert.deepEqual(reviews.map(review => review.status), ['awaiting_approval', 'approved']);
  assert.deepEqual(reviews.map(review => review.plan), [2, 2]);
  assert.deepEqual(finished, []);
  assert.equal(published.length, 0, 'approval alone must wait for the scheduled time');
  for (const item of f.engine.s.socialPostPlans) item.scheduledAt = new Date(f.time() - 1000).toISOString();
  f.advance(1500); f.engine.tick(.1);
  await eventually(() => f.engine.s.socialPostPlans.every(item => item.status === 'published'));
  assert.equal(published.length, 2); assert.equal(f.engine.s.socialPosts.length, 2);
  assert.equal(published[0].platform, 'x'); assert.match(published[0].idempotencyKey, /^plan:/);
});

test('a failed social plan can be revised from Telegram semantics and replaces the cancelled proposal', async t => {
  const f = fixture(t), p = await f.engine.configureProvider({ name: 'Revision fixture', kind: 'generic', baseUrl: 'http://127.0.0.1:1/v1', model: 'flow-test' });
  const research = f.engine.hire({ ...profile, providerId: p.id, model: 'flow-test' });
  const social = f.engine.hire({ ...socialProfile, providerId: p.id, model: 'flow-test' });
  research.position = { ...research.home }; social.position = { ...social.home };
  f.engine.social = fakeSocial([]);
  let calls = 0;
  f.engine.providerFactory = () => ({
    listModels: async () => ['flow-test'],
    execute: async request => {
      const prompt = request.messages.at(-1)!.content;
      calls++;
      const text = !prompt.includes('Return ONLY valid JSON') ? 'Research: one clear trend with a source.'
        : prompt.includes('Move the first post to 14:00') ? JSON.stringify({ posts: [{ time: '14:00', caption: 'Revised schedule', hashtags: ['#Revised'], mediaType: 'text' }] })
          : 'I forgot the JSON format.';
      request.onText(text); return { text };
    },
  });
  const workflow = f.engine.createWorkflow({
    name: 'Revision flow', description: 'Prove revision returns to the same agent.', timezone: 'Asia/Jakarta', schedule: null, enabled: true,
    steps: [
      { id: 'research', name: 'Research', employeeId: research.id, instructions: 'Research.', expectedOutput: 'Brief.', dependsOn: [], requiresApproval: false, kind: 'agent', tools: [] },
      { id: 'plan', name: 'Schedule', employeeId: social.id, instructions: 'Schedule posts.', expectedOutput: '', dependsOn: ['research'], requiresApproval: true, kind: 'social-plan', platform: 'x', expectedPosts: 3, tools: [] },
    ],
  });
  const run = f.engine.workflowAction(workflow.id, 'run')!;
  await advanceUntil(f.engine, () => run.steps[1].status === 'failed');
  assert.equal(run.status, 'failed');
  const report = f.engine.s.reports.find(item => item.workflow?.stepRunId === run.steps[1].id)!;
  assert.ok(report, 'the failure report is still delivered');
  f.engine.reportAction(report.id, 'revise', 'Move the first post to 14:00 and keep the same research.');
  assert.equal(run.steps[1].status, 'revision'); assert.equal(run.steps[1].revisionCount, 1);
  await advanceUntil(f.engine, () => run.steps[1].status === 'awaiting_approval');
  assert.equal(run.status, 'waiting_approval');
  const fresh = f.engine.s.socialPostPlans.filter(item => item.stepRunId === run.steps[1].id && item.status !== 'cancelled');
  assert.equal(fresh.length, 1); assert.equal(fresh[0].caption, 'Revised schedule');
  assert.ok(calls >= 3);
});

test('scheduled workflows claim one run, skip overlap, and compute the next occurrence', async t => {
  const f = fixture(t), employee = f.engine.hire(profile); employee.position = { ...employee.home };
  const workflow = f.engine.createWorkflow({
    name: 'Every minute flow', description: 'Interval test.', timezone: 'Asia/Jakarta', enabled: true,
    schedule: { type: 'interval', timezone: 'Asia/Jakarta', time: '09:00', weekdays: [1, 2, 3, 4, 5], intervalMinutes: 1, cron: '0 9 * * *', runAt: '' },
    steps: [{ id: 'only', name: 'Only step', employeeId: employee.id, instructions: 'Do the work.', expectedOutput: '', dependsOn: [], requiresApproval: false, kind: 'agent', tools: [] }],
  });
  assert.ok(workflow.nextRunAt);
  f.advance(61000); f.engine.scheduler.tick();
  assert.equal(f.engine.s.workflowRuns.length, 1); assert.equal(f.engine.s.workflowRuns[0].status, 'running');
  const afterFirst = workflow.nextRunAt; assert.ok(afterFirst && Date.parse(afterFirst) > f.time());
  f.advance(61000); f.engine.scheduler.tick();
  assert.equal(f.engine.s.workflowRuns.length, 1, 'an active run must not overlap itself');
  f.engine.cancelWorkflowRun(f.engine.s.workflowRuns[0].id);
  assert.equal(f.engine.s.workflowRuns[0].status, 'cancelled');
});

test('server restart marks an active workflow failed instead of silently resuming it', async t => {
  const f = fixture(t), employee = f.engine.hire(profile); employee.position = { ...employee.home };
  const workflow = f.engine.createWorkflow({
    name: 'Restart flow', description: 'Recovery test.', timezone: 'Asia/Jakarta', schedule: null, enabled: true,
    steps: [{ id: 'only', name: 'Only step', employeeId: employee.id, instructions: 'Do the work.', expectedOutput: '', dependsOn: [], requiresApproval: false, kind: 'agent', tools: [] }],
  });
  const run = f.engine.workflowAction(workflow.id, 'run')!;
  run.steps[0].status = 'running';
  const task = f.engine.s.tasks.find(item => item.id === run.steps[0].taskId)!;
  task.status = 'WORKING';
  f.engine.save();
  const disk = new Store(f.directory); const reopened = new Engine(disk, f.time); reopened.recover();
  const restored = reopened.s.workflowRuns[0];
  assert.equal(restored.status, 'failed'); assert.equal(restored.steps[0].status, 'failed');
  assert.match(restored.errors[0], /Server restarted/);
  reopened.stop();
});

test('restart fails a run that was interrupted after task completion instead of leaving it stuck', async t => {
  const f = fixture(t), employee = f.engine.hire(profile); employee.position = { ...employee.home };
  const workflow = f.engine.createWorkflow({
    name: 'Crash window flow', description: 'Recovery test.', timezone: 'Asia/Jakarta', schedule: null, enabled: true,
    steps: [{ id: 'only', name: 'Only step', employeeId: employee.id, instructions: 'Do the work.', expectedOutput: '', dependsOn: [], requiresApproval: false, kind: 'agent', tools: [] }],
  });
  const run = f.engine.workflowAction(workflow.id, 'run')!;
  run.steps[0].status = 'running';
  const task = f.engine.s.tasks.find(item => item.id === run.steps[0].taskId)!;
  task.status = 'COMPLETED';
  f.engine.save();
  const reopened = new Engine(new Store(f.directory), f.time); reopened.recover();
  const restored = reopened.s.workflowRuns[0];
  assert.equal(restored.status, 'failed'); assert.equal(restored.steps[0].status, 'failed');
  reopened.stop();
});

test('restart keeps a waiting-approval run actionable', async t => {
  const f = fixture(t), employee = f.engine.hire(profile); employee.position = { ...employee.home };
  const workflow = f.engine.createWorkflow({
    name: 'Approval survives restart', description: 'Approval recovery.', timezone: 'Asia/Jakarta', schedule: null, enabled: true,
    steps: [{ id: 'only', name: 'Only step', employeeId: employee.id, instructions: 'Do the work.', expectedOutput: '', dependsOn: [], requiresApproval: true, kind: 'agent', tools: [] }],
  });
  const run = f.engine.workflowAction(workflow.id, 'run')!;
  run.steps[0].status = 'awaiting_approval'; run.status = 'waiting_approval';
  f.engine.save();
  const reopened = new Engine(new Store(f.directory), f.time); reopened.recover();
  const restored = reopened.s.workflowRuns[0];
  assert.equal(restored.status, 'waiting_approval'); assert.equal(restored.steps[0].status, 'awaiting_approval');
  reopened.approveWorkflowStep(restored.id, restored.steps[0].id, 'telegram');
  assert.equal(restored.status, 'completed'); assert.equal(restored.steps[0].status, 'approved');
  reopened.stop();
});

test('workflow validation rejects cycles, unknown dependencies, missing starts and unavailable employees', async t => {
  const f = fixture(t), employee = f.engine.hire(profile);
  const base = { id: 'a', name: 'A', employeeId: employee.id, instructions: 'Work.', expectedOutput: '', tools: [], requiresApproval: false, kind: 'agent' as const };
  assert.throws(() => f.engine.createWorkflow({ name: 'Cycle', steps: [{ ...base, dependsOn: ['b'] }, { ...base, id: 'b', name: 'B', dependsOn: ['a'] }] }), /cycle/i);
  assert.throws(() => f.engine.createWorkflow({ name: 'Unknown', steps: [{ ...base, dependsOn: ['missing'] }] }), /unknown step/i);
  assert.throws(() => f.engine.createWorkflow({ name: 'Duplicate', steps: [base, { ...base, name: 'A again' }] }), /Duplicate/);
  f.engine.endEmployment(employee.id, 'fired');
  assert.throws(() => f.engine.createWorkflow({ name: 'Gone', steps: [{ ...base }] }), /Employee is fired/);
});

test('social campaign creation treats an empty research source as absent', async t => {
  const f = fixture(t), p = await f.engine.configureProvider({ name: 'Campaign fixture', kind: 'generic', baseUrl: 'http://127.0.0.1:1/v1', model: 'campaign-test' });
  const creative = f.engine.hire({ ...profile, name: 'Cika', role: 'Creative Lead', department: 'Creative', providerId: p.id, model: 'campaign-test' });
  const social = f.engine.hire({ ...socialProfile, providerId: p.id, model: 'campaign-test' });
  const campaign = f.engine.createSocialCampaign({ title: 'No source', brief: 'Write without a research report.', platform: 'x', creativeEmployeeId: creative.id, socialEmployeeId: social.id, researchReportId: '', expectedOptions: 1 });
  assert.equal(campaign.researchReportId, undefined); assert.equal(campaign.researchText, undefined);
  const second = f.engine.createSocialCampaign({ title: 'Still no source', brief: 'Second campaign.', platform: 'instagram', creativeEmployeeId: creative.id, socialEmployeeId: social.id, expectedOptions: 1 });
  assert.equal(second.researchReportId, undefined);
});

test('recurring task Telegram delivery is on by default and is not disabled by the manual-report setting', async t => {
  const f = fixture(t), p = await f.engine.configureProvider({ name: 'Recurring fixture', kind: 'generic', baseUrl: 'http://127.0.0.1:1/v1', model: 'recurring-test' });
  const employee = f.engine.hire({ ...profile, providerId: p.id, model: 'recurring-test' }); employee.position = { ...employee.home };
  const sent: string[] = [];
  f.engine.telegram = { configured: true, notifyReport: async (_office, report) => { sent.push(report.id); }, notifySocialReview: async () => undefined, notifySocialPublish: async () => undefined, sendText: async () => undefined };
  f.engine.providerFactory = () => ({ listModels: async () => ['recurring-test'], execute: async request => { request.onText('Scheduled report'); return { text: 'Scheduled report' }; } });
  f.engine.s.settings.telegramReports = false;
  const rule = f.engine.scheduler.save({ name: 'Mandatory Telegram schedule', employeeId: employee.id, providerId: p.id, model: 'recurring-test', instructions: 'Report.', schedule: { type: 'interval', timezone: 'Asia/Jakarta', time: '09:00', weekdays: [1, 2, 3, 4, 5], intervalMinutes: 60, cron: '0 9 * * *', runAt: '' }, outputDestination: 'laptop', notify: false, autoDeliver: false, retryOnFailure: false, maxRetries: 1, retryDelayMinutes: 5, enabled: true });
  assert.equal(rule.telegramNotify, true);
  f.engine.scheduler.action(rule.id, 'run'); walk(f.engine);
  await eventually(() => f.engine.s.reports.length === 1 && f.engine.s.reports[0].telegramStatus === 'sent');
  assert.equal(sent.length, 1);
});

test('scheduled publishing fails honestly when the browser bridge is unavailable', async t => {
  const f = fixture(t), employee = f.engine.hire(profile); employee.position = { ...employee.home };
  const workflow = f.engine.createWorkflow({
    name: 'No bridge', description: 'Honest failure.', timezone: 'UTC', schedule: null, enabled: true,
    steps: [{ id: 'plan', name: 'Plan', employeeId: employee.id, instructions: 'Plan.', expectedOutput: '', dependsOn: [], requiresApproval: false, kind: 'social-plan', platform: 'x', expectedPosts: 1, tools: [] }],
  });
  const run = f.engine.workflowAction(workflow.id, 'run')!;
  run.steps[0].status = 'approved';
  f.engine.s.socialPostPlans.push({ id: crypto.randomUUID(), workflowId: workflow.id, runId: run.id, stepRunId: run.steps[0].id, platform: 'x', scheduledAt: new Date(f.time() - 1000).toISOString(), caption: 'Will fail', hashtags: [], mediaType: 'text', status: 'approved', attempts: 0, createdAt: new Date().toISOString() });
  f.engine.social = fakeSocial([], { publishConfigured: false, publish: async () => { throw new Error('Playwright browser automation is unavailable. Run `npx playwright install chromium` on the local server.'); } });
  f.advance(1500); f.engine.tick(.1);
  await eventually(() => f.engine.s.socialPostPlans[0].status === 'failed');
  assert.match(f.engine.s.socialPostPlans[0].error || '', /Playwright/);
  assert.equal(f.engine.s.socialPosts.length, 0);
  assert.equal(f.engine.s.settings.telegramReports, defaultSettings.telegramReports);
});


test('research options parse from fenced agent JSON and ignore unsafe media', () => {
  const text = '```json\n' + JSON.stringify({ options: [
    { category: 'tech', text: 'AI tool baru buat bikin video.', author: '@someone', imageUrl: 'https://pbs.twimg.com/media/abc.jpg', sourceUrl: 'https://x.com/someone/status/1' },
    { category: 'meme', text: 'Ketika deploy Jumat sore.', image: 'javascript:alert(1)', source: 'not-a-url' },
    { category: 'unknown', text: '  ', imageUrl: 'https://x.com/broken' },
  ] }) + '\n```';
  const options = parseResearchOptions(text);
  assert.equal(options.length, 2);
  assert.deepEqual(options.map(option => option.category), ['TECH', 'MEME']);
  assert.equal(options[0].imageUrl, 'https://pbs.twimg.com/media/abc.jpg');
  assert.equal(options[0].sourceUrl, 'https://x.com/someone/status/1');
  assert.equal(options[1].imageUrl, undefined);
  assert.equal(options[1].sourceUrl, undefined);
  assert.equal(formatResearchOptions(options), 'TECH\n1. AI tool baru buat bikin video.\n\nMEME\n1. Ketika deploy Jumat sore.');
});

test('review step requires a real selection and honours only valid option ids', async t => {
  const f = fixture(t), p = await f.engine.configureProvider({ name: 'Review fixture', kind: 'generic', baseUrl: 'http://127.0.0.1:1/v1', model: 'review-test' });
  const reviewer = f.engine.hire({ ...profile, providerId: p.id, model: 'review-test' });
  f.engine.providerFactory = () => ({
    listModels: async () => ['review-test'],
    execute: async request => {
      const text = JSON.stringify({ options: [
        { category: 'TECH', text: 'Tweet tech satu.', imageUrl: 'https://127.0.0.1/private.jpg' },
        { category: 'TRENDS', text: 'Tweet tren dua.' },
        { category: 'MEME', text: 'Tweet meme tiga.' },
      ] });
      request.onText(text); return { text };
    },
  });
  const workflow = f.engine.createWorkflow({
    name: 'Research merge', description: 'Merge and select.', timezone: 'UTC', schedule: null, enabled: true,
    steps: [{ id: 'review', name: 'Merge research', employeeId: reviewer.id, instructions: 'Return research JSON.', expectedOutput: 'Options.', dependsOn: [], requiresApproval: true, kind: 'review', tools: [] }],
  });
  const run = f.engine.workflowAction(workflow.id, 'run')!;
  await advanceUntil(f.engine, () => run.steps[0].status === 'awaiting_approval');
  const step = run.steps[0];
  assert.equal(step.options?.length, 3);
  assert.equal(step.reportId ? f.engine.s.reports.find(report => report.id === step.reportId)?.media?.length : -1, 0);
  assert.match(f.engine.s.reports.find(report => report.id === step.reportId)!.text, /^TECH\n1\. Tweet tech satu\./);
  assert.throws(() => f.engine.approveWorkflowStep(run.id, step.id, 'director', f.engine.office, '', ['not-a-real-id']), /Select at least one/);
  const chosen = [step.options![0].id, step.options![2].id];
  f.engine.approveWorkflowStep(run.id, step.id, 'director', f.engine.office, 'Keep the funny one.', chosen);
  assert.deepEqual(step.selectedOptionIds, chosen);
  assert.equal(step.status, 'approved');
  assert.equal(run.status, 'completed');
});
