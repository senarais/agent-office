#!/usr/bin/env node
import { chromium } from 'playwright';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const flag = name => args.includes(`--${name}`);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = option('mode', 'home');
const query = option('query', '');
const user = option('user', '').replace(/^@/, '');
const explicitUrl = option('url', '');
const scrolls = Math.max(0, Math.min(30, Number(option('scrolls', '5')) || 5));
const limit = Math.max(1, Math.min(100, Number(option('limit', '30')) || 30));
const dataDir = resolve(root, option('data-dir', process.env.DATA_DIR || '.local-data'));
const profile = resolve(dataDir, 'browser', 'x');

if (mode === 'search' && !query) { console.error('--query is required for --mode search'); process.exit(1); }
if (mode === 'user' && !user) { console.error('--user is required for --mode user'); process.exit(1); }
if (mode === 'tweet' && !explicitUrl) { console.error('--url is required for --mode tweet'); process.exit(1); }

const target = mode === 'search'
  ? `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`
  : mode === 'user' ? `https://x.com/${encodeURIComponent(user)}`
  : mode === 'tweet' ? explicitUrl
  : 'https://x.com/home';

function clearProfile() {
  let busy = false;
  try {
    const pids = execFileSync('pgrep', ['-f', profile], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).map(Number);
    for (const pid of pids) {
      if (pid === process.pid) continue;
      let age = 0;
      try { age = Number(execFileSync('ps', ['-o', 'etimes=', '-p', String(pid)], { encoding: 'utf8' }).trim()) || 0; } catch { /* gone */ }
      if (age > 900) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } } else busy = true;
    }
  } catch { /* no matches */ }
  if (!busy) try { for (const name of readdirSync(profile)) if (name.startsWith('Singleton')) unlinkSync(resolve(profile, name)); } catch { /* no profile yet */ }
  return !busy;
}
const lockDir = resolve(dataDir, 'browser', 'x-scrape.lock');
const sleep = ms => new Promise(done => setTimeout(done, ms));
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error?.code === 'EPERM'; } };
async function acquireLock() {
  const deadline = Date.now() + 480000; let waited = 0;
  mkdirSync(resolve(dataDir, 'browser'), { recursive: true, mode: 0o700 });
  while (Date.now() < deadline) {
    try { mkdirSync(lockDir); writeFileSync(resolve(lockDir, 'pid'), String(process.pid)); return; }
    catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let owner = 0;
      try { owner = Number(readFileSync(resolve(lockDir, 'pid'), 'utf8').trim()) || 0; } catch { /* being written */ }
      if (!owner || !alive(owner)) { rmSync(lockDir, { recursive: true, force: true }); continue; }
      if (Date.now() - waited > 15000) { waited = Date.now(); console.error(`[x-scroll] waiting for the shared browser queue (${Math.ceil((deadline - Date.now()) / 1000)}s left)`); }
      await sleep(2000);
    }
  }
  throw new Error('X scrape queue is busy after 8 minutes. Retry later.');
}
function releaseLock() {
  try { if (Number(readFileSync(resolve(lockDir, 'pid'), 'utf8').trim()) === process.pid) rmSync(lockDir, { recursive: true, force: true }); } catch { /* gone */ }
}
await acquireLock();
process.once('exit', releaseLock);
const hardStop = setTimeout(() => { console.error('[x-scroll] browser work exceeded 6 minutes; releasing the queue.'); process.exit(1); }, 360000);
async function launch() {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (!clearProfile()) { await sleep(3000); if (!clearProfile()) throw new Error('X browser profile is busy with another publish. Retry in a few minutes.'); }
    try {
      return await chromium.launchPersistentContext(profile, {
        headless: !flag('headed'),
        executablePath: process.env.SOCIAL_BROWSER_EXECUTABLE || undefined,
        viewport: { width: 1280, height: 900 },
        locale: 'en-US', chromiumSandbox: false, timeout: 180000,
        args: ['--disable-dev-shm-usage', '--disable-gpu', '--disable-software-rasterizer', '--disable-accelerated-2d-canvas', '--renderer-process-limit=1', '--js-flags=--max-old-space-size=128', '--blink-settings=imagesEnabled=false'],
      });
    } catch (error) {
      lastError = error;
      clearProfile();
      if (attempt < 2) await new Promise(done => setTimeout(done, 3000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Browser launch failed.');
}
const context = await launch();
let page = context.pages()[0] || await context.newPage();
let code = 0;
try {
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('article[data-testid="tweet"]', { timeout: 90000 }).catch(() => undefined);

  if (!(await page.locator('[data-testid="SideNav_AccountSwitcher_Button"]').count())) {
    console.error('X profile is not signed in. Open the office Social panel and sign in to X once, then retry.');
    process.exitCode = 2;
  } else {
    const collected = new Map();
    const snapshot = async () => {
      const tweets = await page.locator('article[data-testid="tweet"]').evaluateAll(nodes => {
        const clean = value => (value || '').replace(/\s+/g, ' ').trim();
        return nodes.map(node => {
          const nameText = node.querySelector('[data-testid="User-Name"]')?.innerText || '';
          const lines = nameText.split('\n').map(line => line.trim()).filter(Boolean);
          const handle = lines.find(line => line.startsWith('@')) || nameText.match(/@[A-Za-z0-9_]+/)?.[0] || '';
          const author = (lines.find(line => !line.startsWith('@') && !line.startsWith('·')) || '').split('@')[0].trim();
          const link = node.querySelector('time')?.closest('a')?.getAttribute('href')
            || [...node.querySelectorAll('a[href*="/status/"]')].map(anchor => anchor.getAttribute('href') || '').find(href => href && !/(analytics|photo|video)/.test(href))
            || '';
          const statusUrl = link ? new URL(link, 'https://x.com').href.split('?')[0] : '';
          const metrics = {};
          for (const [key, testId] of [['replies', 'reply'], ['reposts', 'retweet'], ['likes', 'like'], ['views', 'analytics']]) {
            const element = node.querySelector(`[data-testid="${testId}"]`);
            metrics[key] = clean(element?.getAttribute('aria-label') || element?.innerText);
          }
          const media = [...node.querySelectorAll('[data-testid="tweetPhoto"] img')].map(image => image.src).slice(0, 4);
          return {
            author, handle,
            time: node.querySelector('time')?.getAttribute('datetime') || '',
            url: statusUrl,
            text: clean(node.querySelector('[data-testid="tweetText"]')?.innerText),
            metrics, media,
            ad: clean(node.innerText).startsWith('Ad ') || !!node.querySelector('[data-testid="placementTracking"]'),
          };
        }).filter(item => item.text && item.url && !item.ad);
      });
      for (const tweet of tweets) if (!collected.has(tweet.url)) collected.set(tweet.url, tweet);
    };

    await page.waitForTimeout(6000);
    await snapshot();
    for (let index = 0; index < scrolls && collected.size < limit; index++) {
      await page.mouse.wheel(0, 1800);
      await page.waitForTimeout(2200);
      await snapshot();
    }
    const tweets = [...collected.values()].slice(0, limit);
    console.log(JSON.stringify({ mode, query: query || undefined, url: page.url(), count: tweets.length, tweets }, null, 2));
  }
} catch (error) {
  console.error(`X scroll failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await context.close().catch(() => undefined);
  clearTimeout(hardStop);
}
