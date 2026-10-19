import type { IntegrationStatus, Settings } from '../../../packages/shared/src/types';

export const telegramChatIds = () => (process.env.TELEGRAM_CHAT_ID || '').split(',').map(value => value.trim()).filter(Boolean);
export const telegramConfigured = () => !!process.env.TELEGRAM_BOT_TOKEN && telegramChatIds().length > 0;
export const socialWebhookConfigured = () => !!process.env.SOCIAL_WEBHOOK_URL;
export const socialAnalyticsConfigured = () => !!(process.env.SOCIAL_ANALYTICS_URL || process.env.SOCIAL_WEBHOOK_URL);
export const socialMediaConfigured = () => !!(process.env.MEDIA_WEBHOOK_URL || process.env.SOCIAL_WEBHOOK_URL);
export const imageGenerationConfigured = () => !!(process.env.OPENAI_IMAGE_MODEL && process.env.OPENAI_API_KEY);

/** Safe, secret-free integration summary sent to the browser with every snapshot. */
export function integrationStatus(settings: Settings): IntegrationStatus {
  return {
    telegram: { configured: telegramConfigured(), chats: telegramChatIds().length, reportsDefault: settings.telegramReports },
    social: {
      publisher: socialWebhookConfigured(), analytics: socialAnalyticsConfigured(),
      media: socialMediaConfigured() || imageGenerationConfigured(), imageGeneration: imageGenerationConfigured(),
    },
  };
}
