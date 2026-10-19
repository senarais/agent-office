import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SocialAnalyticsPayload, SocialMediaType, SocialPlatform } from '../../../packages/shared/src/social';
import { safeError } from './providers';

export interface SocialPublishInput {
  campaignId: string; optionId: string; platform: SocialPlatform; caption: string;
  mediaUrls: string[]; idempotencyKey: string; approvedBy: 'director' | 'telegram';
}
export interface SocialPublishResult { externalId?: string; url?: string; postedAt?: string }
export interface SocialMediaInput { type: SocialMediaType; prompt: string; campaignId: string; label: string }
export interface SocialMediaResult { url?: string; thumbnailUrl?: string; note?: string }

interface SocialServiceOptions { directory: string; openaiKey?: string; imageModel?: string }

const signature = (secret: string, body: string) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

async function postJson(url: string, payload: unknown, secret?: string, timeout = 60000) {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret) {
    headers['X-Social-Signature'] = signature(secret, body);
    // Convenience for a self-hosted n8n on this machine: n8n's Webhook node can use
    // Header Auth directly. The raw secret is never sent to a non-local endpoint.
    try { const host = new URL(url).hostname; if (['localhost', '127.0.0.1', '::1'].includes(host)) headers['X-Social-Secret'] = secret; } catch { /* URL validation happens at fetch */ }
  }
  const response = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(timeout) });
  const text = await response.text();
  let data: unknown = undefined;
  if (text.trim()) { try { data = JSON.parse(text); } catch { data = { text }; } }
  if (!response.ok) throw new Error(`Automation webhook returned HTTP ${response.status}${text.trim() ? `: ${text.slice(0, 300)}` : ''}`);
  return data as Record<string, unknown> | undefined;
}

/**
 * Platform-neutral social connector. Actual account credentials and platform-specific
 * posting live in the user's automation workflow (n8n or any signed HTTP endpoint).
 */
export class SocialService {
  constructor(private options: SocialServiceOptions) {}
  get publishConfigured() { return !!process.env.SOCIAL_WEBHOOK_URL; }
  get analyticsConfigured() { return !!(process.env.SOCIAL_ANALYTICS_URL || process.env.SOCIAL_WEBHOOK_URL); }
  get mediaConfigured() { return !!(process.env.MEDIA_WEBHOOK_URL || process.env.SOCIAL_WEBHOOK_URL || (this.options.openaiKey && this.options.imageModel)); }
  private get secret() { return process.env.SOCIAL_WEBHOOK_SECRET || ''; }

  async publish(input: SocialPublishInput): Promise<SocialPublishResult> {
    if (!process.env.SOCIAL_WEBHOOK_URL) throw new Error('SOCIAL_WEBHOOK_URL is not configured. Add your automation publish webhook and restart the local server.');
    const data = await postJson(process.env.SOCIAL_WEBHOOK_URL, {
      action: 'publish', platform: input.platform, caption: input.caption, mediaUrls: input.mediaUrls,
      campaignId: input.campaignId, optionId: input.optionId, idempotencyKey: input.idempotencyKey,
      approvedBy: input.approvedBy,
    }, this.secret);
    return {
      externalId: typeof data?.externalId === 'string' ? data.externalId : undefined,
      url: typeof data?.url === 'string' ? data.url : typeof data?.permalink === 'string' ? data.permalink : undefined,
      postedAt: typeof data?.postedAt === 'string' && !Number.isNaN(Date.parse(data.postedAt)) ? new Date(data.postedAt).toISOString() : new Date().toISOString(),
    };
  }

  async fetchAnalytics(): Promise<SocialAnalyticsPayload> {
    if (process.env.SOCIAL_ANALYTICS_URL) {
      const data = await postJson(process.env.SOCIAL_ANALYTICS_URL, { action: 'analytics' }, this.secret);
      return (data || {}) as SocialAnalyticsPayload;
    }
    if (process.env.SOCIAL_WEBHOOK_URL) return (await postJson(process.env.SOCIAL_WEBHOOK_URL, { action: 'analytics' }, this.secret) || {}) as SocialAnalyticsPayload;
    throw new Error('No analytics connector. Set SOCIAL_ANALYTICS_URL or SOCIAL_WEBHOOK_URL.');
  }

  async generateMedia(input: SocialMediaInput): Promise<SocialMediaResult> {
    const mediaUrl = process.env.MEDIA_WEBHOOK_URL;
    if (mediaUrl) return this.webhookMedia(mediaUrl, input);
    if (this.options.openaiKey && this.options.imageModel) {
      if (input.type !== 'image') throw new Error('Video generation needs MEDIA_WEBHOOK_URL. The direct OpenAI image endpoint only makes images.');
      return this.openaiImage(input.prompt);
    }
    if (process.env.SOCIAL_WEBHOOK_URL) return this.webhookMedia(process.env.SOCIAL_WEBHOOK_URL, input);
    throw new Error('No media generator. Set MEDIA_WEBHOOK_URL or OPENAI_IMAGE_MODEL with OPENAI_API_KEY.');
  }

  private async webhookMedia(url: string, input: SocialMediaInput): Promise<SocialMediaResult> {
    const data = await postJson(url, { action: 'generate_media', type: input.type, prompt: input.prompt, campaignId: input.campaignId, label: input.label }, process.env.MEDIA_WEBHOOK_SECRET || this.secret, 180000);
    const mediaUrl = typeof data?.url === 'string' ? data.url : typeof data?.mediaUrl === 'string' ? data.mediaUrl : undefined;
    if (!mediaUrl) throw new Error('Media webhook returned no url.');
    return { url: mediaUrl, thumbnailUrl: typeof data?.thumbnailUrl === 'string' ? data.thumbnailUrl : undefined, note: typeof data?.note === 'string' ? data.note : undefined };
  }

  private async openaiImage(prompt: string): Promise<SocialMediaResult> {
    const model = this.options.imageModel!;
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST', signal: AbortSignal.timeout(180000),
      headers: { Authorization: `Bearer ${this.options.openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, n: 1, size: '1024x1024', ...(model.startsWith('dall-e') ? { response_format: 'b64_json' } : {}) }),
    });
    const data = await response.json().catch(() => ({})) as { data?: { url?: string; b64_json?: string }[]; error?: { message?: string } };
    if (!response.ok) throw new Error(safeError(data.error?.message || `OpenAI Images HTTP ${response.status}`, [this.options.openaiKey || '']));
    const image = data.data?.[0];
    if (image?.url) return { url: image.url, note: `Generated with ${model}` };
    if (image?.b64_json) {
      const directory = join(this.options.directory, 'media');
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      const filename = `${randomUUID()}.png`;
      writeFileSync(join(directory, filename), Buffer.from(image.b64_json, 'base64'), { mode: 0o600 });
      return { url: `/api/media/${filename}`, note: `Generated with ${model}` };
    }
    throw new Error('OpenAI Images returned no media.');
  }
}

/** Inbound automation callbacks use a shared secret header; they never receive the local session token. */
export function verifySocialSecret(header: unknown): boolean {
  const secret = process.env.SOCIAL_WEBHOOK_SECRET || '';
  if (!secret || typeof header !== 'string' || header.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(secret));
}
