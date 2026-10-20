import type { Engine } from './engine';
import type { Office, Report } from '../../../packages/shared/src/types';
import type { SocialCampaign, SocialPublish } from '../../../packages/shared/src/social';
import type { SocialPlanItem, WorkflowRun, WorkflowStepRun } from '../../../packages/shared/src/workflow';
import { telegramChatIds, telegramConfigured } from './integrations';
import { safeError } from './providers';

interface TelegramUpdate {
  update_id: number;
  message?: { message_id: number; chat: { id: number | string }; text?: string };
  callback_query?: { id: string; data?: string; message?: { message_id: number; chat: { id: number | string } } };
}
interface TelegramResponse { ok: boolean; result?: TelegramUpdate[]; description?: string }

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Telegram stopped', 'AbortError')); }, { once: true });
});
const chunks = (text: string, size = 3800) => {
  const value = text.trim() || '(empty)'; const output: string[] = [];
  for (let i = 0; i < value.length; i += size) output.push(value.slice(i, i + size));
  return output;
};
const short = (id: string) => id.slice(0, 8);
const planTime = (iso: string, timeZone: string) => {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: '2-digit', month: 'short' }).format(date);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  const label = timeZone === 'Asia/Jakarta' ? 'WIB' : timeZone;
  return `${day} · ${time} ${label}`;
};

/**
 * Local-first Telegram bridge. Outbound notifications use the Bot API; inbound updates are
 * long-polled, so no public webhook or tunnel is required. Only TELEGRAM_CHAT_ID may act.
 */
export class TelegramService {
  private offset = 0; private controller?: AbortController; private running = false;
  private pending = new Map<string, { kind: 'report' | 'campaign'; id: string; officeId: string }>();
  constructor(private engine: Engine) {}
  get configured() { return telegramConfigured(); }
  start() {
    if (!this.configured || this.running) return;
    this.running = true; this.controller = new AbortController();
    void this.loop(this.controller.signal);
  }
  stop() { this.running = false; this.controller?.abort(); this.controller = undefined; }

  private async loop(signal: AbortSignal) {
    while (!signal.aborted) {
      try { await this.poll(signal); }
      catch (error) { if (signal.aborted) return; await sleep(2500, signal).catch(() => undefined); }
    }
  }
  private async poll(signal: AbortSignal) {
    const data = await this.api<TelegramUpdate[]>('getUpdates', {
      offset: this.offset, timeout: 20,
      allowed_updates: ['message', 'callback_query'],
    }, signal);
    for (const update of data) {
      this.offset = Math.max(this.offset, update.update_id + 1);
      try { await this.handle(update); }
      catch (error) { await this.sendText(`⚠️ ${safeError(error)}`).catch(() => undefined); }
    }
  }
  private async api<T = unknown>(method: string, payload?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}),
      signal: signal || AbortSignal.timeout(30000),
    });
    const data = await response.json().catch(() => ({ ok: false, description: `HTTP ${response.status}` })) as TelegramResponse & { result?: T };
    if (!response.ok || !data.ok) throw new Error(`Telegram ${method}: ${data.description || `HTTP ${response.status}`}`);
    return data.result as T;
  }

  async sendText(text: string, chatId?: string) {
    const targets = chatId ? [chatId] : telegramChatIds();
    if (!targets.length) throw new Error('TELEGRAM_CHAT_ID is not configured.');
    for (const chat of targets) for (const part of chunks(text)) await this.api('sendMessage', { chat_id: chat, text: part, disable_web_page_preview: true });
  }
  async sendTest() {
    await this.sendText('PT ABISENA RAIS JAYA · Telegram is connected. Reports and social approvals can be handled here.');
  }

  async notifyReport(office: Office, report: Report) {
    const employee = office.employees.find(e => e.id === report.employeeId);
    const header = `📄 REPORT · ${office.name}\n${report.title}\n${employee?.name || 'Employee'} · ${new Date(report.createdAt).toLocaleString()}\n\n`;
    const parts = chunks(header + report.text);
    for (let index = 0; index < parts.length; index++) {
      const keyboard = index === parts.length - 1 ? { inline_keyboard: [[{ text: '✅ Approve', callback_data: `ra:${report.id}` }, { text: '✏️ Request revision', callback_data: `rr:${report.id}` }]] } : undefined;
      for (const chat of telegramChatIds()) await this.api('sendMessage', { chat_id: chat, text: parts[index], disable_web_page_preview: true, ...(keyboard ? { reply_markup: keyboard } : {}) });
    }
  }

  async notifySocialReview(office: Office, campaign: SocialCampaign) {
    const creative = office.employees.find(e => e.id === campaign.creativeEmployeeId)?.name || 'Creative';
    await this.sendText(`🎨 SOCIAL REVIEW · ${office.name}\n${campaign.title}\n${campaign.platform.toUpperCase()} · by ${creative}\n\n${campaign.brief}\n\nChoose an option below. Approving posts it through your automation connector.`);
    for (let index = 0; index < campaign.options.length; index++) {
      const option = campaign.options[index];
      const caption = `${option.label}: ${option.headline}\n\n${option.caption}${option.hashtags.length ? `\n\n${option.hashtags.join(' ')}` : ''}`;
      const keyboard = { inline_keyboard: [[{ text: `✅ Approve ${option.label}`.slice(0, 60), callback_data: `ap:${campaign.id}:${index}` }]] };
      const remote = option.mediaUrl && /^https:\/\//i.test(option.mediaUrl);
      let sent = false;
      if (remote && option.mediaType === 'image') {
        try { for (const chat of telegramChatIds()) await this.api('sendPhoto', { chat_id: chat, photo: option.mediaUrl, caption: caption.slice(0, 1000), reply_markup: keyboard }); sent = true; } catch { sent = false; }
      } else if (remote && option.mediaType === 'video') {
        try { for (const chat of telegramChatIds()) await this.api('sendVideo', { chat_id: chat, video: option.mediaUrl, caption: caption.slice(0, 1000), reply_markup: keyboard }); sent = true; } catch { sent = false; }
      }
      if (!sent) {
        const body = `${caption}${option.mediaUrl ? '\n\n(Media preview is available in the office app.)' : ''}`;
        const parts = chunks(body, 3900);
        for (const chat of telegramChatIds()) for (let part = 0; part < parts.length; part++) await this.api('sendMessage', { chat_id: chat, text: parts[part], disable_web_page_preview: true, ...(part === parts.length - 1 ? { reply_markup: keyboard } : {}) });
      }
    }
    for (const chat of telegramChatIds()) await this.api('sendMessage', {
      chat_id: chat, text: `Need changes to “${campaign.title}”?`,
      reply_markup: { inline_keyboard: [[{ text: '✏️ Request revision', callback_data: `rv:${campaign.id}` }]] },
    });
  }

  async notifySocialPublish(office: Office, campaign: SocialCampaign, publish: SocialPublish) {
    if (publish.status === 'published') await this.sendText(`✅ PUBLISHED · ${office.name}\n${campaign.title}\n${campaign.platform.toUpperCase()}${publish.url ? `\n${publish.url}` : ''}`);
    else await this.sendText(`⚠️ PUBLISH FAILED · ${office.name}\n${campaign.title}\n${publish.error || 'Unknown publishing error'}`);
  }

  async notifyWorkflowReview(office: Office, run: WorkflowRun, step: WorkflowStepRun, report: Report, plan: SocialPlanItem[]) {
    const approval = step.status === 'awaiting_approval';
    const failed = step.status === 'failed';
    const revisionAllowed = approval || failed;
    const timeZone = office.workflows.find(item => item.id === run.workflowId)?.timezone || 'UTC';

    if (plan.length) {
      const title = approval ? '🗓️ SCHEDULE REVIEW' : failed ? '⚠️ SCHEDULE FAILED' : '✅ SCHEDULED';
      const body = [
        `${title} · ${office.name}`,
        `${run.workflowName} · ${plan.length} posts · ${timeZone}`,
        ...plan.map((item, position) => `${position + 1}. ${planTime(item.scheduledAt, timeZone)}\n${item.caption}${item.hashtags.length ? `\n${item.hashtags.join(' ')}` : ''}`),
      ].join('\n\n');
      const parts = chunks(body);
      for (let index = 0; index < parts.length; index++) {
        const keyboard = revisionAllowed && index === parts.length - 1
          ? { inline_keyboard: [[...(approval ? [{ text: '✅ Approve', callback_data: `ra:${report.id}` }] : []), { text: '✏️ Request revision', callback_data: `rr:${report.id}` }]] }
          : undefined;
        for (const chat of telegramChatIds()) await this.api('sendMessage', { chat_id: chat, text: parts[index], disable_web_page_preview: true, ...(keyboard ? { reply_markup: keyboard } : {}) });
      }
      return;
    }

    if (failed) {
      await this.sendText(`⚠️ WORKFLOW FAILED · ${office.name}\n${run.workflowName} · ${step.name}\n${step.error || 'Unknown workflow error'}`);
      return;
    }
    if (!approval) return;

    const employee = office.employees.find(item => item.id === step.employeeId)?.name || 'Employee';
    const index = run.steps.findIndex(item => item.id === step.id) + 1;
    const body = `🔁 WORKFLOW · ${office.name}\n${run.workflowName} · step ${index}/${run.steps.length}\n${step.name} · ${employee} · WAITING FOR APPROVAL\n\n${report.text}`;
    const parts = chunks(body);
    for (let index = 0; index < parts.length; index++) {
      const keyboard = index === parts.length - 1
        ? { inline_keyboard: [[{ text: '✅ Approve', callback_data: `ra:${report.id}` }, { text: '✏️ Request revision', callback_data: `rr:${report.id}` }]] }
        : undefined;
      for (const chat of telegramChatIds()) await this.api('sendMessage', { chat_id: chat, text: parts[index], disable_web_page_preview: true, ...(keyboard ? { reply_markup: keyboard } : {}) });
    }
  }

  async notifyWorkflowFinished(office: Office, run: WorkflowRun) {
    const icon = run.status === 'completed' ? '✅' : run.status === 'cancelled' ? '⏹️' : '⚠️';
    const lines = [`${icon} WORKFLOW ${run.status.toUpperCase()} · ${office.name}`, run.workflowName, `Scheduled: ${new Date(run.scheduledAt).toLocaleString()}`];
    if (run.errors.length) lines.push('', ...run.errors);
    await this.sendText(lines.join('\n'));
  }

  private async handle(update: TelegramUpdate) {
    if (update.callback_query) return this.callback(update.callback_query);
    if (update.message?.text) return this.message(String(update.message.chat.id), update.message.text);
  }
  private authorized(chatId: string) { return telegramChatIds().includes(chatId); }

  private async callback(query: NonNullable<TelegramUpdate['callback_query']>) {
    const chatId = String(query.message?.chat.id || '');
    if (!this.authorized(chatId)) return this.answer(query.id, 'Not authorized.');
    const data = query.data || '';
    const [action, id, index] = data.split(':');
    if (action === 'ra') {
      const found = this.findReport(id); if (!found) return this.answer(query.id, 'Report not found.');
      this.engine.reportAction(found.report.id, 'approve', '', found.office);
      await this.answer(query.id, 'Report approved.'); await this.sendText(`✅ Approved: ${found.report.title}`, chatId); return;
    }
    if (action === 'rr') {
      const found = this.findReport(id); if (!found) return this.answer(query.id, 'Report not found.');
      this.pending.set(chatId, { kind: 'report', id: found.report.id, officeId: found.office.id });
      await this.answer(query.id, 'Send revision instructions.');
      await this.sendText(`Send the revision instructions for “${found.report.title}”. Your next message will be used.`, chatId); return;
    }
    if (action === 'ap') {
      const found = this.findCampaign(id); if (!found) return this.answer(query.id, 'Campaign not found.');
      const option = found.campaign.options[Number(index)]; if (!option) return this.answer(query.id, 'Option not found.');
      await this.answer(query.id, `Publishing ${option.label}...`);
      await this.engine.approveSocialCampaign(found.campaign.id, option.id, 'telegram', found.office);
      return;
    }
    if (action === 'rv') {
      const found = this.findCampaign(id); if (!found) return this.answer(query.id, 'Campaign not found.');
      this.pending.set(chatId, { kind: 'campaign', id: found.campaign.id, officeId: found.office.id });
      await this.answer(query.id, 'Send revision instructions.');
      await this.sendText(`Send the creative revision instructions for “${found.campaign.title}”. Your next message will be used.`, chatId); return;
    }
    await this.answer(query.id, 'Unknown action.');
  }
  private async answer(callbackId: string, text: string) { await this.api('answerCallbackQuery', { callback_query_id: callbackId, text: text.slice(0, 190) }).catch(() => undefined); }

  private async message(chatId: string, raw: string) {
    if (!this.authorized(chatId)) return;
    const text = raw.trim();
    const pending = this.pending.get(chatId);
    if (pending && !text.startsWith('/')) {
      this.pending.delete(chatId);
      if (pending.kind === 'report') {
        const found = this.findReport(pending.id); if (!found) return this.sendText('Report no longer exists.', chatId);
        this.engine.reportAction(found.report.id, 'revise', text, found.office);
        return this.sendText(`✏️ Revision assigned for “${found.report.title}”.`, chatId);
      }
      const found = this.findCampaign(pending.id); if (!found) return this.sendText('Campaign no longer exists.', chatId);
      this.engine.reviseSocialCampaign(found.campaign.id, text, found.office);
      return this.sendText(`✏️ Creative revision requested for “${found.campaign.title}”.`, chatId);
    }
    if (!text.startsWith('/')) return this.sendText('Use /help to see available commands.', chatId);
    const [rawCommand, ...args] = text.split(/\s+/);
    const command = rawCommand.split('@')[0];
    const rest = text.slice(rawCommand.length).trim();
    if (['/start', '/help'].includes(command)) return this.sendText([
      'PT ABISENA · DIRECTOR BOT', '',
      '/pending — reports, workflows and social reviews waiting',
      '/reports — recent reports', '/campaigns — social campaigns', '/workflows — recent workflow runs',
      '/approve <report-id> — approve a report or workflow step',
      '/post <campaign-id> [option-number] — approve and publish',
      '/revise <report-or-campaign-id> <instructions> — request changes',
      '/status — integration status',
      'Inline buttons on notifications work too.',
    ].join('\n'), chatId);
    if (command === '/status') {
      const office = this.engine.office; const status = this.engine.integrationStatus();
      return this.sendText(`ACTIVE: ${office.name}\nTelegram: ${status.telegram.configured ? 'connected' : 'not configured'}\nBrowser automation: ${status.social.browser ? `available (${status.social.headless ? 'headless' : 'headed'})` : 'unavailable'}\nX: ${office.socialSettings.xEnabled ? 'enabled' : 'off'} · ${status.social.profiles.x ? 'profile exists' : 'no profile'}\nInstagram: ${office.socialSettings.instagramEnabled ? 'enabled' : 'off'} · ${status.social.profiles.instagram ? 'profile exists' : 'no profile'}\nImages: ${status.social.media ? 'configured' : 'not configured'}\nActive workflows: ${office.workflowRuns.filter(r => ['queued', 'running', 'waiting_approval', 'revision'].includes(r.status)).length}\nPending reports: ${office.reports.filter(r => !r.delivered && !r.archived).length}\nSocial reviews: ${office.socialCampaigns.filter(c => c.status === 'review').length}`, chatId);
    }
    if (command === '/workflows') {
      const runs = this.engine.office.workflowRuns.slice(0, 10);
      return this.sendText(['WORKFLOW RUNS', ...runs.map(run => `${short(run.id)} · ${run.workflowName} · ${run.status}${run.steps.some(step => step.status === 'awaiting_approval') ? ' · NEEDS APPROVAL' : ''}`), runs.length ? '' : 'No workflow runs yet.'].filter(Boolean).join('\n'), chatId);
    }
    if (command === '/pending') {
      const office = this.engine.office;
      const reports = office.reports.filter(r => !r.delivered && !r.archived).slice(-8);
      const campaigns = office.socialCampaigns.filter(c => c.status === 'review').slice(-8);
      const workflows = office.workflowRuns.filter(run => run.status === 'waiting_approval').slice(-8);
      return this.sendText([`PENDING · ${office.name}`, '', ...reports.map(r => `REPORT ${short(r.id)} · ${r.title}`), ...workflows.map(run => `WORKFLOW ${short(run.id)} · ${run.workflowName} · ${run.steps.find(step => step.status === 'awaiting_approval')?.name || 'approval'}`), ...campaigns.map(c => `SOCIAL ${short(c.id)} · ${c.title} · ${c.platform}`), !reports.length && !campaigns.length && !workflows.length ? 'Nothing waiting.' : '', 'Use /approve, /post or /revise.'].filter(Boolean).join('\n'), chatId);
    }
    if (command === '/reports') {
      const reports = this.engine.office.reports.slice(-10).reverse();
      return this.sendText(['RECENT REPORTS', ...reports.map(r => `${short(r.id)} · ${r.title} · ${r.delivered ? 'read' : 'new'}${r.approved ? ' · approved' : ''}`), reports.length ? '' : 'No reports yet.'].filter(Boolean).join('\n'), chatId);
    }
    if (command === '/campaigns') {
      const campaigns = this.engine.office.socialCampaigns.slice(-10).reverse();
      return this.sendText(['SOCIAL CAMPAIGNS', ...campaigns.map(c => `${short(c.id)} · ${c.title} · ${c.platform} · ${c.status}`), campaigns.length ? '' : 'No campaigns yet.'].filter(Boolean).join('\n'), chatId);
    }
    if (command === '/approve') {
      const found = this.findReport(args[0] || ''); if (!found) return this.sendText('Report not found. Use /pending or /reports.', chatId);
      this.engine.reportAction(found.report.id, 'approve', '', found.office);
      return this.sendText(`✅ Approved: ${found.report.title}`, chatId);
    }
    if (command === '/post') {
      const found = this.findCampaign(args[0] || ''); if (!found) return this.sendText('Campaign not found. Use /campaigns.', chatId);
      if (!['review', 'revision', 'failed'].includes(found.campaign.status)) return this.sendText(`Campaign is ${found.campaign.status}; it cannot be published now.`, chatId);
      const proposed = found.campaign.options.filter(o => o.status === 'proposed' || o.status === 'selected');
      const option = args[1] ? proposed[Number(args[1]) - 1] : proposed.length === 1 ? proposed[0] : undefined;
      if (!option) return this.sendText(`Choose an option: /post ${short(found.campaign.id)} <number>\n${proposed.map((o, i) => `${i + 1}. ${o.label} · ${o.headline}`).join('\n')}`, chatId);
      await this.engine.approveSocialCampaign(found.campaign.id, option.id, 'telegram', found.office);
      return;
    }
    if (command === '/revise') {
      const id = args[0] || ''; const instructions = rest.slice(id.length).trim();
      if (!instructions) return this.sendText('Usage: /revise <id> <instructions>', chatId);
      const report = this.findReport(id);
      if (report) { this.engine.reportAction(report.report.id, 'revise', instructions, report.office); return this.sendText(`✏️ Revision assigned for “${report.report.title}”.`, chatId); }
      const campaign = this.findCampaign(id);
      if (campaign) { this.engine.reviseSocialCampaign(campaign.campaign.id, instructions, campaign.office); return this.sendText(`✏️ Creative revision requested for “${campaign.campaign.title}”.`, chatId); }
      return this.sendText('No report or campaign matches that id.', chatId);
    }
    return this.sendText('Unknown command. Use /help.', chatId);
  }

  private findReport(prefix: string) {
    for (const office of this.engine.s.offices) {
      const report = office.reports.find(r => r.id === prefix) || office.reports.find(r => r.id.startsWith(prefix));
      if (report) return { office, report };
    }
    return undefined;
  }
  private findCampaign(prefix: string) {
    for (const office of this.engine.s.offices) {
      const campaign = office.socialCampaigns.find(c => c.id === prefix) || office.socialCampaigns.find(c => c.id.startsWith(prefix));
      if (campaign) return { office, campaign };
    }
    return undefined;
  }
}
