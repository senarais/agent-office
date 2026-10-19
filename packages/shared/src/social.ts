export const socialPlatforms = ['x', 'instagram', 'facebook', 'linkedin', 'tiktok', 'threads', 'youtube'] as const;
export type SocialPlatform = typeof socialPlatforms[number];

export type SocialCampaignStatus = 'creative' | 'review' | 'revision' | 'publishing' | 'published' | 'failed' | 'cancelled';
export type SocialOptionStatus = 'proposed' | 'selected' | 'rejected' | 'revised';
export type SocialMediaType = 'text' | 'image' | 'video';

export interface SocialOption {
  id: string; label: string; headline: string; caption: string; hashtags: string[];
  mediaType: SocialMediaType; mediaUrl?: string; thumbnailUrl?: string;
  imagePrompt?: string; videoPrompt?: string; script?: string;
  status: SocialOptionStatus; feedback?: string; mediaError?: string; createdAt: string;
}

export interface SocialAccount {
  id: string; platform: SocialPlatform; handle: string; displayName: string;
  connected: boolean; followers?: number; following?: number; posts?: number;
  lastSyncedAt?: string; note?: string;
}

export interface SocialPost {
  id: string; platform: SocialPlatform; externalId?: string; caption: string;
  mediaUrls: string[]; permalink?: string; postedAt: string;
  likes: number; comments: number; shares: number; saves: number;
  impressions: number; reach: number; clicks: number; engagementRate?: number;
  campaignId?: string; source: 'synced' | 'published'; createdAt: string;
}

export interface SocialCampaign {
  id: string; title: string; brief: string; platform: SocialPlatform;
  status: SocialCampaignStatus; creativeEmployeeId: string; socialEmployeeId: string;
  researchReportId?: string; researchText?: string;
  options: SocialOption[]; selectedOptionId?: string;
  feedback: string; revisionCount: number;
  creativeTaskId?: string; revisionTaskId?: string;
  approvedBy?: 'director' | 'telegram'; approvedAt?: string;
  publishedAt?: string; publishId?: string; error?: string;
  createdAt: string; updatedAt: string;
}

export interface SocialPublish {
  id: string; campaignId: string; optionId: string; platform: SocialPlatform;
  status: 'queued' | 'publishing' | 'published' | 'failed' | 'unknown';
  externalId?: string; url?: string; error?: string; attempts: number;
  idempotencyKey: string; createdAt: string; publishedAt?: string;
}

export interface SocialAnalyticsAccountInput {
  platform: SocialPlatform; handle: string; displayName?: string; connected?: boolean;
  followers?: number; following?: number; posts?: number; note?: string;
}

export interface SocialAnalyticsPostInput {
  platform: SocialPlatform; externalId?: string; caption?: string; mediaUrls?: string[];
  permalink?: string; postedAt?: string; likes?: number; comments?: number; shares?: number;
  saves?: number; impressions?: number; reach?: number; clicks?: number;
}

export interface SocialAnalyticsPayload { accounts?: SocialAnalyticsAccountInput[]; posts?: SocialAnalyticsPostInput[] }

export interface ParsedSocialOption {
  label: string; headline: string; caption: string; hashtags: string[];
  mediaType: SocialMediaType; imagePrompt?: string; videoPrompt?: string; script?: string;
}

const asText = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const asList = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean).slice(0, 12)
  : typeof value === 'string' ? value.split(/[\s,]+/).map(item => item.trim()).filter(Boolean).slice(0, 12) : [];

/** Parse a creative agent response into reviewable options, tolerating fences and wrapper objects. */
export function parseSocialOptions(text: string, max = 4): ParsedSocialOption[] {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const parse = (value: string): unknown => { try { return JSON.parse(value); } catch { return undefined; } };
  let value = parse(clean);
  if (value === undefined) {
    const start = clean.search(/[[{]/); const end = Math.max(clean.lastIndexOf(']'), clean.lastIndexOf('}'));
    if (start >= 0 && end > start) value = parse(clean.slice(start, end + 1));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const wrapper = value as Record<string, unknown>;
    value = Array.isArray(wrapper.options) ? wrapper.options : Array.isArray(wrapper.variants) ? wrapper.variants : Array.isArray(wrapper.content) ? wrapper.content : value;
  }
  const items = Array.isArray(value) ? value : [];
  const options: ParsedSocialOption[] = [];
  for (const [index, raw] of items.slice(0, max).entries()) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const media = asText(item.mediaType ?? item.media_type ?? item.media, 20).toLowerCase();
    const caption = asText(item.caption ?? item.copy ?? item.post ?? item.text, 4000);
    const headline = asText(item.headline ?? item.title ?? item.hook, 300);
    if (!caption && !headline) continue;
    options.push({
      label: asText(item.label ?? item.name ?? item.option, 80) || `Option ${String.fromCharCode(65 + index)}`,
      headline, caption, hashtags: asList(item.hashtags ?? item.tags),
      mediaType: media.includes('video') ? 'video' : media.includes('image') || media.includes('photo') || media.includes('picture') ? 'image' : 'text',
      imagePrompt: asText(item.imagePrompt ?? item.image_prompt ?? item.prompt, 2000) || undefined,
      videoPrompt: asText(item.videoPrompt ?? item.video_prompt, 2000) || undefined,
      script: asText(item.script ?? item.storyboard, 6000) || undefined,
    });
  }
  if (options.length) return options;
  return [{ label: 'Option A', headline: '', caption: text.trim().slice(0, 4000) || '(Creative agent returned no text)', hashtags: [], mediaType: 'text' }];
}
