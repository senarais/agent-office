import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReportMedia } from '../../../packages/shared/src/types';
import type { ResearchOption } from '../../../packages/shared/src/workflow';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function publicImageUrl(value: string) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return undefined;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host === '::1' || host === '[::1]') return undefined;
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return undefined;
    return url;
  } catch { return undefined; }
}

async function cacheImage(url: string, directory: string): Promise<{ path: string; mime: string } | undefined> {
  const parsed = publicImageUrl(url);
  if (!parsed) return undefined;
  try {
    const response = await fetch(parsed, { signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'Mozilla/5.0 senaoffice-media/1.0' } });
    if (!response.ok) return undefined;
    const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return undefined;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return undefined;
    const extension = type.includes('png') ? '.png' : type.includes('webp') ? '.webp' : '.jpg';
    const name = `${createHash('sha256').update(url).digest('hex').slice(0, 24)}${extension}`;
    const path = join(directory, name);
    if (!existsSync(path)) writeFileSync(path, buffer, { mode: 0o600 });
    return { path: name, mime: type };
  } catch { return undefined; }
}

/** Download the first image for each option, mutating imagePath and returning de-duplicated report media. */
export async function cacheResearchImages(options: ResearchOption[], directory: string): Promise<ReportMedia[]> {
  const mediaDirectory = join(directory, 'media');
  mkdirSync(mediaDirectory, { recursive: true, mode: 0o700 });
  const media: ReportMedia[] = [];
  const seen = new Set<string>();
  const work = options.filter(option => option.imageUrl && !seen.has(option.imageUrl) && seen.add(option.imageUrl));
  for (let index = 0; index < work.length; index += 4) {
    const batch = work.slice(index, index + 4);
    await Promise.all(batch.map(async option => {
      const cached = await cacheImage(option.imageUrl!, mediaDirectory);
      if (!cached) return;
      option.imagePath = cached.path;
      media.push({ url: option.imageUrl!, path: cached.path, alt: option.text.slice(0, 140) });
    }));
  }
  return media;
}
