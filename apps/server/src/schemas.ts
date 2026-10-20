import { z } from 'zod';
import { departments } from '../../../packages/shared/src/types';
import { socialPlatforms } from '../../../packages/shared/src/social';
export const weaponSchema = z.enum(['hand', 'whip', 'knife', 'rifle']);
export const punishmentSchema = z.enum(['whip', 'punch', 'knife', 'target', 'shock', 'meeting', 'paperwork']);
export function parseSettings(input: unknown) {
  return settingsSchema.extend({ blood: z.boolean().optional(), weaponDamage: z.object({ hand: z.number().int().min(1).max(100), whip: z.number().int().min(1).max(100), knife: z.number().int().min(1).max(100), rifle: z.number().int().min(1).max(100) }).optional() }).parse(input);
}
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const appearanceSchema = z.object({ skin: color, hair: color, hairstyle: z.enum(['short', 'long', 'spiky', 'bald']), shirt: color, jacket: color, bottom: color, shoes: color, skirt: z.boolean(), glasses: z.boolean(), hat: z.boolean(), accessory: z.boolean() });
export const employeeSchema = z.object({ name: z.string().trim().min(1).max(40), role: z.string().trim().min(1).max(80), department: z.enum(departments), personality: z.string().max(2000).default(''), responsibilities: z.string().max(4000).default(''), systemPrompt: z.string().max(12000).default(''), providerId: z.string().max(80).default(''), model: z.string().max(160).default(''), tools: z.array(z.enum(['read', 'glob', 'grep', 'webfetch', 'bash', 'write', 'edit', 'task', 'todowrite', 'question'])).max(10).default([]), skills: z.array(z.string().max(160)).max(30).default([]), appearance: appearanceSchema });
export const taskSchema = z.object({ employeeId: z.string().uuid(), title: z.string().trim().min(1).max(160), instructions: z.string().trim().min(1).max(30000), priority: z.enum(['Low', 'Normal', 'High']).default('Normal'), expectedOutput: z.string().max(3000).default(''), projectPath: z.string().max(1024).default(''), deadline: z.string().max(32).default(''), tools: z.array(z.string().max(30)).max(10).default([]) });
export const providerSchema = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(60), kind: z.enum(['openai', 'opencode', 'commandcode', 'generic', 'demo']), baseUrl: z.string().max(500).default(''), enabled: z.boolean().default(true), apiKey: z.string().max(4000).optional(), headers: z.record(z.string().max(4000)).optional(), model: z.string().max(160).default('') }).superRefine((v, ctx) => {
  if (['generic', 'opencode'].includes(v.kind)) { try { const u = new URL(v.baseUrl); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash) throw new Error(); } catch { ctx.addIssue({ code: 'custom', message: 'Base URL must be HTTP(S), without credentials, query or fragment', path: ['baseUrl'] }); } }
});
export const officeSchema = z.object({ name: z.string().trim().min(1).max(60), industry: z.string().trim().min(1).max(60).default('General') });
export const socialSettingsSchema = z.object({
  xEnabled: z.boolean(), xHandle: z.string().trim().max(120),
  instagramEnabled: z.boolean(), instagramHandle: z.string().trim().max(120),
  facebookEnabled: z.boolean(), facebookHandle: z.string().trim().max(120),
});
export const socialCampaignSchema = z.object({
  title: z.string().trim().min(1).max(140), brief: z.string().trim().min(1).max(20000),
  platform: z.enum(socialPlatforms), creativeEmployeeId: z.string().uuid(), socialEmployeeId: z.string().uuid(),
  // The UI historically sent "" for "no research report"; treat it as absent instead of rejecting the campaign.
  researchReportId: z.preprocess(value => value === '' || value === null ? undefined : value, z.string().uuid().optional()),
  expectedOptions: z.number().int().min(1).max(4).default(3),
});
export const scheduleSchema = z.object({
  type: z.enum(['once', 'daily', 'weekly', 'interval', 'cron']), timezone: z.string().min(1).max(80),
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).default('09:00'), weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([1, 2, 3, 4, 5]),
  intervalMinutes: z.number().int().min(1).max(525600).default(30), cron: z.string().max(120).default('0 9 * * *'), runAt: z.string().max(40).default(''),
});
export const workflowStepSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(140),
  employeeId: z.string().uuid(),
  instructions: z.string().trim().min(1).max(30000),
  expectedOutput: z.string().max(3000).default(''),
  tools: z.array(z.string().max(30)).max(10).default([]),
  dependsOn: z.array(z.string().max(80)).max(12).default([]),
  requiresApproval: z.boolean().default(false),
  kind: z.enum(['agent', 'social-plan']).default('agent'),
  platform: z.enum(socialPlatforms).optional(),
  expectedPosts: z.number().int().min(1).max(12).default(3),
});
export const workflowSchema = z.object({
  name: z.string().trim().min(1).max(140),
  description: z.string().max(4000).default(''),
  preset: z.string().max(80).optional(),
  timezone: z.string().min(1).max(80).default('UTC'),
  schedule: scheduleSchema.nullable().default(null),
  enabled: z.boolean().default(true),
  telegramNotify: z.boolean().default(true),
  steps: z.array(workflowStepSchema).min(1).max(12),
});
export const settingsSchema = z.object({ master: z.number().min(0).max(1), music: z.number().min(0).max(1), sfx: z.number().min(0).max(1), ambient: z.number().min(0).max(1), dialogue: z.number().min(0).max(1), muted: z.boolean(), musicOn: z.boolean(), sfxOn: z.boolean(), ambientOn: z.boolean(), track: z.number().int().min(0).max(2), shuffle: z.boolean(), repeat: z.boolean(), time: z.enum(['local', 'day', 'night']), playerSpeed: z.enum(['normal', 'fast', 'very fast']), npcSpeed: z.enum(['normal', 'fast', 'very fast']), textSpeed: z.enum(['slow', 'normal', 'fast', 'instant']), animationSpeed: z.enum(['normal', 'fast']), pixelScale: z.number().int().min(1).max(3), windowScale: z.number().min(.8).max(1.5), cameraSmoothness: z.number().min(.01).max(1), shake: z.boolean(), crt: z.boolean(), scanlines: z.boolean(), glow: z.boolean(), weather: z.boolean(), reducedMotion: z.boolean(), damageFlash: z.boolean(), highContrast: z.boolean(), violence: z.enum(['full', 'slapstick', 'disabled']), telegramReports: z.boolean(), keys: z.object({ up: z.string().length(1), down: z.string().length(1), left: z.string().length(1), right: z.string().length(1), interact: z.string().length(1), action: z.string().length(1) }) }).partial();
