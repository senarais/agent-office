import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine } from '../apps/server/src/engine';
import { Store } from '../apps/server/src/database';
import { createApp } from '../apps/server/src/api';
import { defaultAppearance } from '../packages/shared/src/types';
import type { Report } from '../packages/shared/src/types';
import { parseSocialOptions } from '../packages/shared/src/social';
import type { SocialAnalyticsPayload } from '../packages/shared/src/social';
import type { SocialPublishInput } from '../apps/server/src/social';

delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.TELEGRAM_BOT_TOKEN; delete process.env.TELEGRAM_CHAT_ID;

const profile = { name: 'Rani', role: 'Analyst', department: 'Research', appearance: defaultAppearance };
function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'pt-social-')); const engine = new Engine(new Store(directory));
  t.after(() => { engine.stop(); rmSync(directory, { recursive: true, force: true }); });
  return { directory, engine };
}
async function eventually(check: () => boolean) { for (let i = 0; i < 400; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 10)); } assert.fail('Timed out waiting for social lifecycle'); }
function walk(engine: Engine) { for (let i = 0; i < 220; i++) engine.tick(.1); }
const options = (count = 3) => Array.from({ length: count }, (_, index) => ({ label: `Option ${String.fromCharCode(65 + index)}`, headline: `Hook ${index + 1}`, caption: `Caption ${index + 1}`, hashtags: ['#Abisena'], mediaType: 'image', imagePrompt: `Editorial image ${index + 1}` }));

test('creative responses parse from fences, wrappers and plain text fallback', () => {
  const fenced = parseSocialOptions('```json\n[{"label":"A","headline":"Launch","caption":"Hello","hashtags":["#one"],"mediaType":"image","imagePrompt":"photo"}]\n```');
  assert.equal(fenced.length, 1); assert.equal(fenced[0].headline, 'Launch'); assert.equal(fenced[0].mediaType, 'image'); assert.deepEqual(fenced[0].hashtags, ['#one']);
  const wrapped = parseSocialOptions('{"options":[{"label":"B","caption":"Second","mediaType":"video","videoPrompt":"clip"}]}');
  assert.equal(wrapped[0].mediaType, 'video'); assert.equal(wrapped[0].videoPrompt, 'clip');
  assert.equal(parseSocialOptions('No structured response here.')[0].caption, 'No structured response here.');
});

test('creative options become reviewable media, approval publishes, and revisions add options', async t => {
  const f = fixture(t), p = await f.engine.configureProvider({ name: 'Social fixture', kind: 'generic', baseUrl: 'http://127.0.0.1:1/v1', model: 'social-test' });
  const creative = f.engine.hire({ ...profile, name: 'Cika', role: 'Creative Lead', department: 'Creative', providerId: p.id, model: 'social-test' });
  const social = f.engine.hire({ ...profile, name: 'Sari', role: 'Social Media Manager', department: 'Social Media', providerId: p.id, model: 'social-test' });
  const published: SocialPublishInput[] = []; let generated = 0;
  f.engine.social = {
    publishConfigured: true, analyticsConfigured: true, mediaConfigured: true,
    publish: async input => { published.push(input); return { externalId: 'post-42', url: 'https://social.example/post-42', postedAt: '2026-10-19T10:00:00Z' }; },
    fetchAnalytics: async () => ({}),
    generateMedia: async () => { generated++; return { url: `https://cdn.example/media-${generated}.png` }; },
  };
  f.engine.providerFactory = () => ({
    listModels: async () => ['social-test'],
    execute: async request => {
      const prompt = request.messages.at(-1)!.content;
      const text = JSON.stringify(prompt.includes('The director requested revisions') ? options(2) : options(3));
      request.onText(text); return { text };
    },
  });
  const campaign = f.engine.createSocialCampaign({ title: 'Morning product story', brief: 'Tease the new release.', platform: 'x', creativeEmployeeId: creative.id, socialEmployeeId: social.id, expectedOptions: 3 });
  assert.equal(campaign.status, 'creative');
  walk(f.engine); await eventually(() => campaign.status === 'review');
  assert.equal(campaign.options.length, 3); assert.equal(generated, 3); assert.ok(campaign.options.every(option => option.mediaUrl?.startsWith('https://cdn.example/')));
  await f.engine.approveSocialCampaign(campaign.id, campaign.options[1].id, 'telegram');
  assert.equal(campaign.status, 'published'); assert.equal(published.length, 1); assert.equal(published[0].optionId, campaign.options[1].id); assert.equal(f.engine.s.socialPosts.length, 1);
  assert.equal(f.engine.s.socialPosts[0].externalId, 'post-42'); assert.equal(f.engine.s.socialPosts[0].platform, 'x');
  const second = f.engine.createSocialCampaign({ title: 'Second story', brief: 'Another angle.', platform: 'instagram', creativeEmployeeId: creative.id, socialEmployeeId: social.id, expectedOptions: 3 });
  walk(f.engine); await eventually(() => second.status === 'review');
  f.engine.reviseSocialCampaign(second.id, 'Make it warmer and more editorial.');
  assert.equal(second.status, 'revision');
  walk(f.engine); await eventually(() => second.options.length === 5 && second.status === 'review');
  assert.equal(second.revisionCount, 1); assert.ok(second.options.slice(0, 3).every(option => option.status === 'revised'));
  const disk = new Store(f.directory); assert.equal(disk.state.socialCampaigns.length, 2); assert.equal(disk.state.socialPosts.length, 1); disk.close();
});

test('manual and per-schedule Telegram report delivery are togglable and honest when sent', async t => {
  const f = fixture(t), p = await f.engine.configureProvider({ name: 'Report fixture', kind: 'generic', baseUrl: 'http://127.0.0.1:1/v1', model: 'report-test' });
  const e = f.engine.hire({ ...profile, providerId: p.id, model: 'report-test' }); e.position = { ...e.home };
  const sent: string[] = [];
  f.engine.telegram = { configured: true, notifyReport: async (_office, report: Report) => { sent.push(report.id); }, notifySocialReview: async () => {}, notifySocialPublish: async () => {}, sendText: async () => {} };
  f.engine.providerFactory = () => ({ listModels: async () => ['report-test'], execute: async request => { request.onText('Real report body'); return { text: 'Real report body' }; } });
  f.engine.s.settings.telegramReports = true;
  f.engine.task({ employeeId: e.id, title: 'Manual report', instructions: 'Write it' }); walk(f.engine);
  await eventually(() => f.engine.s.reports.length === 1); await eventually(() => f.engine.s.reports[0].telegramStatus === 'sent');
  assert.equal(sent.length, 1);
  f.engine.s.settings.telegramReports = false;
  f.engine.task({ employeeId: e.id, title: 'Quiet report', instructions: 'Keep it in the tray' }); walk(f.engine);
  await eventually(() => f.engine.s.reports.length === 2); await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(sent.length, 1); assert.equal(f.engine.s.reports[1].telegramStatus, undefined);
  const rule = f.engine.scheduler.save({ name: 'Scheduled Telegram briefing', employeeId: e.id, providerId: p.id, model: 'report-test', instructions: 'Scheduled report', schedule: { type: 'interval', timezone: 'Asia/Jakarta', time: '09:00', weekdays: [1, 2, 3, 4, 5], intervalMinutes: 60, cron: '0 9 * * *', runAt: '' }, outputDestination: 'laptop', notify: false, autoDeliver: false, telegramNotify: true, retryOnFailure: false, maxRetries: 1, retryDelayMinutes: 5, enabled: true });
  f.engine.scheduler.action(rule.id, 'run'); walk(f.engine);
  await eventually(() => f.engine.s.reports.length === 3); await eventually(() => f.engine.s.reports[2].telegramStatus === 'sent');
  assert.equal(sent.length, 2); assert.equal(f.engine.s.tasks.at(-1)!.scheduled?.telegramNotify, true);
});

test('analytics ingestion updates engagement without duplicating posts', t => {
  const f = fixture(t);
  const payload: SocialAnalyticsPayload = {
    accounts: [{ platform: 'x', handle: 'abisena', displayName: 'Abisena', followers: 1200 }],
    posts: [
      { platform: 'x', externalId: 'p1', caption: 'First', postedAt: '2026-10-18T09:00:00Z', likes: 10, comments: 2, shares: 1, saves: 1, reach: 1000 },
      { platform: 'instagram', externalId: 'p2', caption: 'Second', postedAt: '2026-10-17T09:00:00Z', likes: 5, comments: 1, shares: 0, saves: 0, reach: 500 },
    ],
  };
  assert.deepEqual(f.engine.ingestSocialAnalytics(f.engine.office, payload), { accounts: 1, posts: 2 });
  assert.equal(f.engine.s.socialPosts[0].engagementRate, 0.014);
  f.engine.ingestSocialAnalytics(f.engine.office, { posts: [{ platform: 'x', externalId: 'p1', caption: 'First', likes: 20, comments: 2, shares: 1, saves: 1, reach: 1000 }] });
  assert.equal(f.engine.s.socialPosts.length, 2); assert.equal(f.engine.s.socialPosts.find(post => post.externalId === 'p1')!.likes, 20);
  assert.equal(f.engine.s.socialAccounts[0].followers, 1200);
});

test('signed automation callback accepts analytics without the browser token and rejects a bad secret', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pt-social-api-')); const previous = process.env.SOCIAL_WEBHOOK_SECRET;
  process.env.SOCIAL_WEBHOOK_SECRET = 'social-test-secret';
  try {
    const { app } = await createApp(directory, false);
    const payload = { accounts: [{ platform: 'x', handle: 'office', followers: 10 }], posts: [] };
    assert.equal((await app.inject({ method: 'POST', url: '/api/social/analytics', payload, headers: { 'x-social-secret': 'wrong' } })).statusCode, 403);
    const accepted = await app.inject({ method: 'POST', url: '/api/social/analytics', payload, headers: { 'x-social-secret': 'social-test-secret' } });
    assert.equal(accepted.statusCode, 200); assert.deepEqual(accepted.json(), { accounts: 1, posts: 0 });
    await app.close();
  } finally {
    if (previous) process.env.SOCIAL_WEBHOOK_SECRET = previous; else delete process.env.SOCIAL_WEBHOOK_SECRET;
    rmSync(directory, { recursive: true, force: true });
  }
});
