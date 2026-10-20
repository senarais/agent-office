import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { IntegrationStatus, Settings } from '../../../packages/shared/src/types';

export const telegramChatIds = () => (process.env.TELEGRAM_CHAT_ID || '').split(',').map(value => value.trim()).filter(Boolean);
export const telegramConfigured = () => !!process.env.TELEGRAM_BOT_TOKEN && telegramChatIds().length > 0;

const dataDirectory = () => process.env.DATA_DIR || '.local-data';

/** Playwright is available when a browser binary or the Playwright cache exists. */
export function browserAutomationAvailable() {
  if (process.env.SOCIAL_BROWSER_DISABLED === 'true') return false;
  const explicit = process.env.SOCIAL_BROWSER_EXECUTABLE || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (explicit) return existsSync(explicit);
  const home = process.env.HOME || '';
  return ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].some(path => existsSync(path))
    || (!!home && existsSync(join(home, '.cache', 'ms-playwright')));
}

export function browserProfileExists(platform: 'x' | 'instagram' | 'facebook') {
  return existsSync(join(dataDirectory(), 'browser', platform));
}

/** Safe, secret-free integration summary sent to the browser with every snapshot. */
export function integrationStatus(settings: Settings): IntegrationStatus {
  const browser = browserAutomationAvailable();
  return {
    telegram: { configured: telegramConfigured(), chats: telegramChatIds().length, reportsDefault: settings.telegramReports },
    social: {
      browser,
      headless: process.env.SOCIAL_BROWSER_HEADLESS !== 'false',
      profiles: { x: browserProfileExists('x'), instagram: browserProfileExists('instagram'), facebook: browserProfileExists('facebook') },
      media: !!process.env.OPENAI_IMAGE_MODEL,
      imageGeneration: !!process.env.OPENAI_IMAGE_MODEL,
    },
  };
}
