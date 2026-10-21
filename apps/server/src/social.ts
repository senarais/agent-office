import { chromium, type BrowserContext, type Page } from 'playwright';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import type { SocialAnalyticsPayload, SocialBrowserSettings, SocialMediaType, SocialPlatform } from '../../../packages/shared/src/social';
import { safeError } from './providers';

export interface SocialPublishInput {
  campaignId: string; optionId: string; platform: SocialPlatform; caption: string;
  mediaUrls: string[]; idempotencyKey: string; approvedBy: 'director' | 'telegram'; handle?: string;
}
export interface SocialPublishResult { externalId?: string; url?: string; postedAt?: string }
export interface SocialMediaInput { type: SocialMediaType; prompt: string; campaignId: string; label: string }
export interface SocialMediaResult { url?: string; thumbnailUrl?: string; note?: string }

interface SocialServiceOptions { directory: string; openaiKey?: string; imageModel?: string; headless?: boolean; executablePath?: string }
type BrowserPlatform = 'x' | 'instagram';
type ScrapeResult = { accounts: NonNullable<SocialAnalyticsPayload['accounts']>; posts: NonNullable<SocialAnalyticsPayload['posts']> };
export interface BrowserCookieInput { name: string; value: string; domain: string; path?: string; expirationDate?: number; expires?: number; httpOnly?: boolean; secure?: boolean; sameSite?: string }
const SUPPORTED: BrowserPlatform[] = ['x', 'instagram'];
const COOKIE_SAME_SITE = (value: unknown): 'Strict' | 'Lax' | 'None' => {
  const text = String(value || '').toLowerCase();
  if (text.includes('no_restriction') || text.includes('none')) return 'None';
  if (text.includes('strict')) return 'Strict';
  return 'Lax';
};
/** Convert a Cookie-Editor / browser-extension export into Playwright cookies. */
export function normalizeBrowserCookies(input: BrowserCookieInput[]) {
  return input.filter(cookie => cookie && typeof cookie.name === 'string' && cookie.name.trim() && typeof cookie.value === 'string' && cookie.value && typeof cookie.domain === 'string' && cookie.domain.trim()).slice(0, 500).map(cookie => {
    const expires = typeof cookie.expirationDate === 'number' ? cookie.expirationDate : typeof cookie.expires === 'number' ? cookie.expires : undefined;
    return {
      name: cookie.name.trim().slice(0, 200), value: cookie.value.slice(0, 20000), domain: cookie.domain.trim().slice(0, 200), path: (cookie.path || '/').slice(0, 500),
      ...(expires && expires > 0 ? { expires } : {}), httpOnly: cookie.httpOnly === true, secure: cookie.secure !== false, sameSite: COOKIE_SAME_SITE(cookie.sameSite),
    };
  });
}
const HOME_URL: Record<BrowserPlatform, string> = { x: 'https://x.com/home', instagram: 'https://www.instagram.com/' };
const LOGIN_URL: Record<BrowserPlatform, string> = { x: 'https://x.com/i/flow/login', instagram: 'https://www.instagram.com/accounts/login/' };

const stripHandle = (handle: string) => handle.trim().replace(/^@/, '').replace(/^https?:\/\/[^/]+\//i, '').replace(/[/?#].*$/, '');
const isSupported = (platform: SocialPlatform): platform is BrowserPlatform => SUPPORTED.includes(platform as BrowserPlatform);

/** Parse "12", "1,234", "1.2K" or "3M" into a number. */
export function parseCount(value: string | null | undefined): number {
  if (!value) return 0;
  const match = value.replace(/,/g, '').match(/([\d.]+)\s*([KMB])?/i);
  if (!match) return 0;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return 0;
  const suffix = (match[2] || '').toUpperCase();
  return Math.round(number * (suffix === 'K' ? 1e3 : suffix === 'M' ? 1e6 : suffix === 'B' ? 1e9 : 1));
}

export function parseInstagramAccount(description: string | null, handle: string) {
  const match = (description || '').match(/([\d,.]+[KMB]?)\s+Followers,\s*([\d,.]+[KMB]?)\s+Following,\s*([\d,.]+[KMB]?)\s+Posts/i);
  return {
    platform: 'instagram' as const, handle: stripHandle(handle), displayName: stripHandle(handle), connected: true,
    followers: parseCount(match?.[1]), following: parseCount(match?.[2]), posts: parseCount(match?.[3]),
  };
}

export function parseInstagramPost(description: string | null) {
  const value = description || '';
  const counts = value.match(/([\d,.]+[KMB]?)\s+likes?,\s*([\d,.]+[KMB]?)\s+comments?/i);
  const caption = value.match(/on Instagram:\s*["“]([\s\S]*?)["”]\s*$/i)?.[1]
    || value.replace(/^[\s\S]*?on Instagram:\s*/i, '').replace(/^["“]|["”]\s*$/g, '').trim();
  return { likes: parseCount(counts?.[1] || (/(\d[\d,.]*)\s+likes?/i.exec(value)?.[1])), comments: parseCount(counts?.[2] || (/(\d[\d,.]*)\s+comments?/i.exec(value)?.[1])), caption: caption.slice(0, 4000) };
}

/**
 * Local Playwright social worker. It drives the real X/Instagram web UI using persistent
 * Chromium profiles. The user logs in once in a headed window; cookies stay under DATA_DIR.
 */
export class SocialService {
  private queues = new Map<string, Promise<unknown>>();
  private logins = new Map<BrowserPlatform, BrowserContext>();
  constructor(private options: SocialServiceOptions) {}

  get headless() { return this.options.headless ?? process.env.SOCIAL_BROWSER_HEADLESS !== 'false'; }
  get browserAvailable() {
    if (process.env.SOCIAL_BROWSER_DISABLED === 'true') return false;
    return !!this.executable();
  }
  get publishConfigured() { return this.browserAvailable; }
  get analyticsConfigured() { return this.browserAvailable; }
  get mediaConfigured() { return !!(this.options.openaiKey && this.options.imageModel); }

  private executable(): string | undefined {
    const explicit = this.options.executablePath || process.env.SOCIAL_BROWSER_EXECUTABLE || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
    const candidates = [explicit, (() => { try { return chromium.executablePath(); } catch { return undefined; } })(), '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
    return candidates.find((path): path is string => !!path && existsSync(path));
  }
  private launchOptions(headless: boolean) {
    const executablePath = this.executable();
    return {
      headless, ...(executablePath && !headless ? { executablePath } : {}), viewport: { width: 1280, height: 900 },
      locale: 'en-US', timeout: Math.min(this.timeout(), 180000), chromiumSandbox: false,
      args: ['--disable-dev-shm-usage', '--disable-gpu', '--blink-settings=imagesEnabled=false'],
    };
  }
  private timeout() { return Number(process.env.SOCIAL_BROWSER_TIMEOUT_MS) || 60000; }
  private profileDir(platform: BrowserPlatform) {
    const directory = join(this.options.directory, 'browser', platform);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    try { chmodSync(directory, 0o700); } catch { /* best effort */ }
    return directory;
  }
  private withProfile<T>(platform: BrowserPlatform, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(platform) || Promise.resolve();
    const run = previous.catch(() => undefined).then(task);
    this.queues.set(platform, run.catch(() => undefined));
    return run;
  }
  /** A crashed publish can leave Chromium's singleton symlinks behind; a stale one blocks the next launch forever. */
  private clearStaleLock(platform: BrowserPlatform) {
    const directory = this.profileDir(platform);
    try {
      const target = readlinkSync(join(directory, 'SingletonLock'));
      const pid = Number(target.slice(target.lastIndexOf('-') + 1));
      if (Number.isInteger(pid) && pid > 0) { try { process.kill(pid, 0); return; } catch { /* dead owner */ } }
    } catch { /* no lock */ }
    for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) { try { unlinkSync(join(directory, name)); } catch { /* already gone */ } }
  }
  /** A timed-out launch can leave an orphan Chromium that keeps the profile locked; kill only this profile's processes. */
  private clearBrowserProcesses(platform: BrowserPlatform) {
    const directory = resolve(this.profileDir(platform));
    try {
      const pids = execFileSync('pgrep', ['-f', directory], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).map(Number);
      for (const pid of pids) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
    } catch { /* no matches */ }
    this.clearStaleLock(platform);
  }
  private async launch(platform: BrowserPlatform, headless: boolean) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      this.clearBrowserProcesses(platform);
      try { return await chromium.launchPersistentContext(this.profileDir(platform), this.launchOptions(headless)); }
      catch (error) {
        lastError = error;
        this.clearBrowserProcesses(platform);
        if (attempt < 2) await new Promise(done => setTimeout(done, 3000));
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Browser launch failed.');
  }
  private async withDeadline<T>(platform: BrowserPlatform, run: () => Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        run(),
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => {
            this.clearBrowserProcesses(platform);
            reject(new Error('Browser automation exceeded its time limit; check the account before retrying.'));
          }, this.timeout() + 60000);
        }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
  }
  /** domcontentloaded can stall behind X's challenge/analytics; commit + a bounded DOM wait is more reliable. */
  private async gotoPage(page: Page, url: string, timeout = this.timeout()) {
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout }); return; }
    catch (first) {
      try { await page.goto(url, { waitUntil: 'commit', timeout }); }
      catch { throw first; }
      await page.waitForLoadState('domcontentloaded', { timeout: Math.min(timeout, 30000) }).catch(() => undefined);
    }
  }

  async openLogin(platform: SocialPlatform) {
    if (!isSupported(platform)) throw new Error(`Browser automation for ${platform} is not implemented. Currently supported: X and Instagram.`);
    if (!this.browserAvailable) throw new Error('Playwright browser is not installed. Run: npx playwright install chromium');
    if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) throw new Error('No graphical display. Browser login needs a desktop session; set SOCIAL_BROWSER_EXECUTABLE or log in on a machine with a display.');
    if (this.logins.has(platform)) return { started: true, alreadyOpen: true, profile: this.profileDir(platform) };
    this.clearStaleLock(platform);
    const context = await this.launch(platform, false);
    this.logins.set(platform, context);
    context.on('close', () => this.logins.delete(platform));
    const page = context.pages()[0] || await context.newPage();
    await page.goto(LOGIN_URL[platform], { waitUntil: 'domcontentloaded', timeout: this.timeout() }).catch(() => undefined);
    return { started: true, alreadyOpen: false, profile: this.profileDir(platform) };
  }

  async checkSession(platform: SocialPlatform) {
    if (!isSupported(platform)) throw new Error(`Browser automation for ${platform} is not implemented.`);
    if (!this.browserAvailable) throw new Error('Playwright browser is not installed. Run: npx playwright install chromium');
    if (this.logins.has(platform)) throw new Error('Close the login window before checking the session.');
    return this.withProfile(platform, () => this.withDeadline(platform, async () => {
      this.clearStaleLock(platform);
      const context = await this.launch(platform, this.headless);
      try {
        const page = context.pages()[0] || await context.newPage();
        await this.gotoPage(page, HOME_URL[platform]);
        await this.waitForApp(page);
        return { loggedIn: await this.isLoggedIn(page, platform), url: page.url(), profile: this.profileDir(platform) };
      } finally { await context.close().catch(() => undefined); this.clearBrowserProcesses(platform); }
    }));
  }

  async importCookies(platform: SocialPlatform, input: BrowserCookieInput[]) {
    if (!isSupported(platform)) throw new Error(`Browser automation for ${platform} is not implemented.`);
    if (!this.browserAvailable) throw new Error('Playwright browser is not installed. Run: npx playwright install chromium');
    if (this.logins.has(platform)) throw new Error('Close the login window before importing cookies.');
    const cookies = normalizeBrowserCookies(input);
    if (!cookies.length) throw new Error('No valid cookies supplied. Export x.com cookies as JSON from the logged-in browser.');
    return this.withProfile(platform, async () => {
      this.clearStaleLock(platform);
      const context = await this.launch(platform, this.headless);
      try { await context.addCookies(cookies); return { imported: cookies.length, profile: this.profileDir(platform) }; }
      finally { await context.close(); }
    });
  }

  browserStatus() {
    const profileExists = (platform: BrowserPlatform) => existsSync(join(this.options.directory, 'browser', platform));
    return {
      available: this.browserAvailable, headless: this.headless, executable: this.executable() || null,
      profiles: { x: profileExists('x'), instagram: profileExists('instagram'), facebook: false },
      loginWindows: [...this.logins.keys()],
    };
  }

  async publish(input: SocialPublishInput): Promise<SocialPublishResult> {
    const platform = input.platform;
    if (!isSupported(platform)) throw new Error(`Browser automation for ${platform} is not implemented. Currently supported: X and Instagram.`);
    if (!this.browserAvailable) throw new Error('Playwright browser is not installed. Run: npx playwright install chromium');
    if (this.logins.has(platform)) throw new Error(`Close the ${platform} login window before publishing.`);
    const media = await this.prepareMedia(input.mediaUrls);
    try {
      return await this.withProfile(platform, () => this.withDeadline(platform, async () => {
        this.clearStaleLock(platform);
        const context = await this.launch(platform, this.headless);
        try {
          const page = context.pages()[0] || await context.newPage();
          return platform === 'x' ? await this.publishX(page, input, media.files) : await this.publishInstagram(page, input, media.files);
        } finally { await context.close().catch(() => undefined); this.clearBrowserProcesses(platform); }
      }));
    } finally { this.cleanupMedia(media.temp); }
  }

  async fetchAnalytics(settings: SocialBrowserSettings): Promise<SocialAnalyticsPayload> {
    const tasks: { platform: BrowserPlatform; handle: string }[] = [];
    if (settings.xEnabled && settings.xHandle.trim()) tasks.push({ platform: 'x', handle: settings.xHandle });
    if (settings.instagramEnabled && settings.instagramHandle.trim()) tasks.push({ platform: 'instagram', handle: settings.instagramHandle });
    if (!tasks.length) return { accounts: [], posts: [] };
    if (!this.browserAvailable) throw new Error('Playwright browser is not installed. Run: npx playwright install chromium');
    const accounts: SocialAnalyticsPayload['accounts'] = []; const posts: SocialAnalyticsPayload['posts'] = []; const errors: string[] = [];
    for (const task of tasks) {
      try {
        const result = await this.withProfile(task.platform, () => task.platform === 'x' ? this.scrapeX(task.handle) : this.scrapeInstagram(task.handle));
        accounts.push(...result.accounts); posts.push(...result.posts);
      } catch (error) { errors.push(`${task.platform}: ${safeError(error)}`); }
    }
    if (!accounts.length && errors.length) throw new Error(errors.join(' | '));
    return { accounts, posts, ...(errors.length ? { error: errors.join(' | ') } : {}) };
  }

  async generateMedia(input: SocialMediaInput): Promise<SocialMediaResult> {
    if (!this.options.openaiKey || !this.options.imageModel) throw new Error('Image generation is not configured. Set OPENAI_IMAGE_MODEL and OPENAI_API_KEY in the office .env.');
    if (input.type !== 'image') throw new Error('Video generation is not implemented. Use an image, or attach a video URL manually.');
    return this.openaiImage(input.prompt);
  }

  private async prepareMedia(urls: string[]) {
    const files: string[] = []; const temp: string[] = [];
    const directory = join(this.options.directory, 'browser', 'tmp');
    for (const url of urls.filter(Boolean).slice(0, 4)) {
      if (url.startsWith('/api/media/')) {
        const path = join(this.options.directory, 'media', basename(url));
        if (!existsSync(path)) throw new Error(`Media file not found: ${basename(url)}`);
        files.push(path); continue;
      }
      if (url.startsWith('file://')) { const path = url.slice(7); if (!existsSync(path)) throw new Error('Local media file not found.'); files.push(path); continue; }
      const data = /^data:([^;]+);base64,(.+)$/s.exec(url);
      if (data) {
        mkdirSync(directory, { recursive: true, mode: 0o700 });
        const extension = data[1].includes('video') ? '.mp4' : data[1].includes('png') ? '.png' : data[1].includes('webp') ? '.webp' : '.jpg';
        const path = join(directory, `${randomUUID()}${extension}`); writeFileSync(path, Buffer.from(data[2], 'base64'), { mode: 0o600 }); files.push(path); temp.push(path); continue;
      }
      if (!/^https?:\/\//i.test(url)) throw new Error(`Unsupported media URL: ${url.slice(0, 80)}`);
      const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error(`Media download failed: HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > 60 * 1024 * 1024) throw new Error('Media exceeds the 60 MB browser limit.');
      const type = response.headers.get('content-type') || '';
      const extension = type.includes('video') ? '.mp4' : type.includes('png') ? '.png' : type.includes('webp') ? '.webp' : '.jpg';
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      const path = join(directory, `${randomUUID()}${extension}`); writeFileSync(path, buffer, { mode: 0o600 }); files.push(path); temp.push(path);
    }
    return { files, temp };
  }
  private cleanupMedia(paths: string[]) { for (const path of paths) { try { unlinkSync(path); } catch { /* already gone */ } } }

  private async isLoggedIn(page: Page, platform: BrowserPlatform) {
    const url = page.url();
    if (platform === 'x') {
      if (/\/(login|i\/flow\/login)/i.test(url)) return false;
      return (await page.locator('[data-testid="SideNav_AccountSwitcher_Button"], [data-testid="tweetTextarea_0"], a[href="/compose/post"]').count()) > 0;
    }
    if (/\/accounts\/login/i.test(url)) return false;
    return (await page.locator('svg[aria-label="New post"], a[href*="/create/"], a[href*="/direct/inbox/"]').count()) > 0;
  }
  private async waitForApp(page: Page) {
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(2500);
  }
  private async assertLoggedIn(page: Page, platform: BrowserPlatform) {
    if (await this.isLoggedIn(page, platform)) return;
    await page.waitForTimeout(2500);
    if (!(await this.isLoggedIn(page, platform))) throw new Error(`${platform}: not logged in. Open Social → Connections → Open login browser and finish the login first.`);
  }
  private async pageError(page: Page) {
    const candidates = page.locator('[role="alert"], [data-testid="toast"]'); const count = Math.min(await candidates.count(), 8);
    for (let index = 0; index < count; index++) {
      const text = (await candidates.nth(index).innerText().catch(() => '')).trim();
      if (text && /(error|failed|wrong|couldn'?t|try again|not allowed|limit|something went wrong)/i.test(text) && !/sent|posted|shared|success/i.test(text)) return text.slice(0, 500);
    }
    return '';
  }
  private async countText(locator: ReturnType<Page['locator']>) {
    return (await locator.first().getAttribute('aria-label').catch(() => null)) || (await locator.first().innerText().catch(() => '')) || '';
  }

  private async currentHandle(page: Page) {
    const href = await page.locator('[data-testid="AppTabBar_Profile_Link"]').first().getAttribute('href').catch(() => null);
    if (href) return stripHandle(href);
    const text = await page.locator('[data-testid="SideNav_AccountSwitcher_Button"]').first().innerText().catch(() => '');
    return /@([A-Za-z0-9_]+)/.exec(text)?.[1] || '';
  }
  private normalizePostUrl(url?: string) {
    return url?.replace(/\/(analytics|photo\/\d+)(?:[/?#].*)?$/, '').replace(/[?#].*$/, '');
  }
  private async publishX(page: Page, input: SocialPublishInput, files: string[]): Promise<SocialPublishResult> {
    const timeout = this.timeout();
    page.setDefaultTimeout(timeout);
    page.setDefaultNavigationTimeout(timeout);
    const field = () => page.locator('[data-testid="tweetTextarea_0"], div[contenteditable="true"]').first();
    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        if (attempt === 1) {
          await this.gotoPage(page, 'https://x.com/compose/post', timeout);
        } else {
          await this.gotoPage(page, 'https://x.com/home', timeout);
          await this.waitForApp(page);
          await this.assertLoggedIn(page, 'x');
          const compose = page.locator('a[href="/compose/post"]').first();
          if (await compose.count()) await compose.click({ force: true, timeout: Math.min(timeout, 30000) }).catch(() => undefined);
          if (!/compose/.test(page.url())) await this.gotoPage(page, 'https://x.com/compose/post', timeout);
        }
        await field().waitFor({ state: 'visible', timeout });
        break;
      } catch (error) {
        lastError = error;
        if (/\/(login|i\/flow\/login)/i.test(page.url())) throw new Error('x: not logged in. Open Social → Connections → Open login browser and finish the login first.');
        if (attempt < 2) await page.waitForTimeout(5000);
      }
    }
    const editor = field();
    if (!(await editor.isVisible().catch(() => false))) throw lastError instanceof Error ? lastError : new Error('X composer did not open after 2 attempts');
    const selfHandle = stripHandle((await this.currentHandle(page)) || input.handle || '');
    const caption = input.caption.length > 280 ? `${input.caption.slice(0, 277)}...` : input.caption;
    await editor.click(); await page.keyboard.type(caption, { delay: 8 });
    if (files.length) {
      let fileInput = page.locator('input[type="file"]').first();
      if (!(await fileInput.count())) {
        const mediaButton = page.locator('[data-testid="attachments"], [aria-label*="Add photos" i], [aria-label*="media" i]').first();
        if (await mediaButton.count()) await mediaButton.click();
        fileInput = page.locator('input[type="file"]').first();
      }
      if (await fileInput.count()) await fileInput.setInputFiles(files);
      await page.waitForTimeout(2500);
    }
    const postButton = page.locator('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]').first();
    const button = (await postButton.count()) ? postButton : page.getByRole('button', { name: /^Post$/i }).last();
    try { await button.click({ timeout }); }
    catch { throw new Error('X Post button click was not confirmed; the post may still have been submitted. Check the account before retrying.'); }
    const composer = page.locator('[data-testid="tweetTextarea_0"]').first();
    const view = page.getByRole('link', { name: /View/i }).last();
    const postedHref = await Promise.race([
      view.waitFor({ state: 'visible', timeout }).then(() => view.getAttribute('href')).catch(() => null),
      composer.waitFor({ state: 'hidden', timeout }).then(() => null).catch(() => null),
    ]);
    let url: string | undefined;
    if (postedHref && (!selfHandle || postedHref.toLowerCase().includes(`/${selfHandle.toLowerCase()}/status/`))) url = new URL(postedHref, 'https://x.com').toString();
    const error = await this.pageError(page);
    if (error) throw new Error(`X rejected the post: ${error}`);
    if (!url && await composer.isVisible().catch(() => false)) throw new Error('X post confirmation timed out; the post may be live. Check the account before retrying.');
    if (!url && selfHandle) {
      await this.gotoPage(page, `https://x.com/${selfHandle}`, timeout).catch(() => undefined);
      const target = caption.toLowerCase().replace(/\s+/g, ' ').slice(0, 40);
      const articles = page.locator('article'); const total = Math.min(await articles.count().catch(() => 0), 6);
      for (let index = 0; index < total; index++) {
        const article = articles.nth(index);
        const text = (await article.innerText().catch(() => '')).toLowerCase().replace(/\s+/g, ' ');
        if (!text.includes(target)) continue;
        const href = await article.locator('a[href*="/status/"]').first().getAttribute('href').catch(() => null);
        if (href) { url = this.normalizePostUrl(new URL(href, 'https://x.com').toString()); break; }
      }
    }
    url = this.normalizePostUrl(url);
    return { externalId: url?.split('/status/')[1]?.split(/[/?#]/)[0], url, postedAt: new Date().toISOString() };
  }
  private async publishInstagram(page: Page, input: SocialPublishInput, files: string[]): Promise<SocialPublishResult> {
    if (!files.length) throw new Error('Instagram requires an image or video. Generate media first.');
    const timeout = this.timeout();
    await this.gotoPage(page, 'https://www.instagram.com/', timeout);
    await this.waitForApp(page);
    await this.assertLoggedIn(page, 'instagram');
    const create = page.locator('svg[aria-label="New post"], a[href*="/create/"], [aria-label="New post"]').first();
    if (await create.count()) await create.click();
    else await page.getByRole('link', { name: /Create/i }).first().click();
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.waitFor({ state: 'attached', timeout });
    await fileInput.setInputFiles(files);
    await page.waitForTimeout(3000);
    const ok = page.getByRole('button', { name: /^OK$/i }).last();
    if (await ok.count()) { await ok.click(); await page.waitForTimeout(1000); }
    for (let step = 0; step < 2; step++) {
      const next = page.getByRole('button', { name: /^Next$/i }).last();
      if (await next.count()) { await next.click(); await page.waitForTimeout(1200); }
    }
    const caption = page.locator('textarea[aria-label*="caption" i], div[contenteditable="true"][aria-label*="caption" i], div[contenteditable="true"]').last();
    if (await caption.count()) { await caption.click(); await page.keyboard.type(input.caption.slice(0, 2200), { delay: 8 }); }
    const share = page.getByRole('button', { name: /^(Share|Post)$/i }).last();
    await share.waitFor({ state: 'visible', timeout });
    await share.click(); await page.waitForTimeout(3500);
    const error = await this.pageError(page);
    if (error) throw new Error(`Instagram rejected the post: ${error}`);
    await page.getByText(/post shared|your post has been shared/i).first().waitFor({ timeout: 15000 }).catch(() => undefined);
    let url: string | undefined;
    if (input.handle) {
      await page.goto(`https://www.instagram.com/${stripHandle(input.handle)}/`, { waitUntil: 'domcontentloaded', timeout }).catch(() => undefined);
      const link = page.locator('a[href*="/p/"], a[href*="/reel/"]').first();
      if (await link.count()) { const href = await link.getAttribute('href'); if (href) url = new URL(href, 'https://www.instagram.com').toString().split('?')[0]; }
    }
    return { externalId: url?.split(/\/(?:p|reel)\//)[1]?.split(/[/?#]/)[0], url, postedAt: new Date().toISOString() };
  }

  private async scrapeX(handle: string): Promise<ScrapeResult> {
    this.clearStaleLock('x');
    const context = await this.launch('x', this.headless);
    try {
      const page = context.pages()[0] || await context.newPage();
      await this.gotoPage(page, `https://x.com/${stripHandle(handle)}`);
      await this.waitForApp(page);
      await this.assertLoggedIn(page, 'x');
      await page.locator('article').first().waitFor({ state: 'attached', timeout: 25000 }).catch(() => undefined);
      const name = (await page.locator('[data-testid="UserName"]').first().innerText().catch(() => '')).split('\n')[0] || stripHandle(handle);
      const followers = parseCount(await page.locator('a[href$="/verified_followers"], a[href$="/followers"]').first().innerText().catch(() => ''));
      const following = parseCount(await page.locator('a[href$="/following"]').first().innerText().catch(() => ''));
      const articles = page.locator('article'); const count = Math.min(await articles.count(), 12); const posts: NonNullable<SocialAnalyticsPayload['posts']> = [];
      for (let index = 0; index < count; index++) {
        const article = articles.nth(index);
        const caption = (await article.locator('[data-testid="tweetText"]').first().innerText().catch(() => '')).trim();
        if (!caption) continue;
        const href = await article.locator('a[href*="/status/"]').first().getAttribute('href').catch(() => null);
        const permalink = href ? new URL(href, 'https://x.com').toString().split('?')[0] : undefined;
        const postedAt = await article.locator('time[datetime]').first().getAttribute('datetime').catch(() => null);
        const likes = parseCount(await this.countText(article.locator('[data-testid="like"]')));
        const comments = parseCount(await this.countText(article.locator('[data-testid="reply"]')));
        const shares = parseCount(await this.countText(article.locator('[data-testid="retweet"]')));
        const impressions = parseCount(await this.countText(article.locator('[aria-label*="views" i]')));
        posts.push({ platform: 'x', externalId: permalink?.split('/status/')[1]?.split(/[/?#]/)[0], caption, mediaUrls: [], permalink, postedAt: postedAt || new Date().toISOString(), likes, comments, shares, saves: 0, impressions, reach: 0, clicks: 0 });
      }
      if (!posts.length) throw new Error('No posts found. Check the handle and make sure the X session is logged in.');
      return { accounts: [{ platform: 'x' as const, handle: stripHandle(handle), displayName: name, connected: true, followers, following }], posts };
    } finally { await context.close(); }
  }

  private async scrapeInstagram(handle: string): Promise<ScrapeResult> {
    const timeout = this.timeout();
    this.clearStaleLock('instagram');
    const context = await this.launch('instagram', this.headless);
    try {
      const page = context.pages()[0] || await context.newPage();
      await this.gotoPage(page, `https://www.instagram.com/${stripHandle(handle)}/`);
      await this.waitForApp(page);
      await this.assertLoggedIn(page, 'instagram');
      const description = await page.locator('meta[property="og:description"]').first().getAttribute('content').catch(() => null);
      const account = parseInstagramAccount(description, handle);
      const links = new Set<string>(); const anchors = page.locator('a[href*="/p/"], a[href*="/reel/"]'); const count = Math.min(await anchors.count(), 6);
      for (let index = 0; index < count; index++) { const href = await anchors.nth(index).getAttribute('href').catch(() => null); if (href) links.add(new URL(href, 'https://www.instagram.com').toString().split('?')[0]); }
      const posts: NonNullable<SocialAnalyticsPayload['posts']> = [];
      for (const link of [...links].slice(0, 6)) {
        const postPage = await context.newPage();
        try {
          await postPage.goto(link, { waitUntil: 'domcontentloaded', timeout });
          const meta = await postPage.locator('meta[property="og:description"]').first().getAttribute('content').catch(() => null);
          const postedAt = await postPage.locator('time[datetime]').first().getAttribute('datetime').catch(() => null);
          const parsed = parseInstagramPost(meta);
          posts.push({ platform: 'instagram', externalId: link.split(/\/(?:p|reel)\//)[1]?.split(/[/?#]/)[0], caption: parsed.caption, mediaUrls: [], permalink: link, postedAt: postedAt || new Date().toISOString(), likes: parsed.likes, comments: parsed.comments, shares: 0, saves: 0, impressions: 0, reach: 0, clicks: 0 });
        } catch { /* skip an individual unavailable post */ }
        finally { await postPage.close(); }
      }
      return { accounts: [account], posts };
    } finally { await context.close(); }
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
