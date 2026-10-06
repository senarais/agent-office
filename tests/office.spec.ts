import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const saved = async (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('abisena-office-v1')!).state);
async function openOffice(page: Page) {
  await page.goto('/'); await expect(page.locator('.world-map canvas')).toBeVisible();
  await expect.poll(async () => (await saved(page))?.player?.x).toBeGreaterThan(0);
}

test('director movement, sprint, collision, keyboard shortcuts and in-world agent interaction', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await openOffice(page);
  await page.getByRole('button', { name: 'Pause office', exact: true }).click();
  await page.locator('.world-map canvas').focus();
  const before = (await saved(page)).player;
  await page.keyboard.down('d'); await page.waitForTimeout(550); await page.keyboard.up('d'); await page.waitForTimeout(450);
  const after = (await saved(page)).player;
  expect(after.x).toBeGreaterThan(before.x + 30); expect(after.y).toBeCloseTo(before.y, 0);
  // Walk up through the meeting-room door and stop against the meeting table.
  await page.keyboard.down('a'); await page.waitForTimeout(550); await page.keyboard.up('a');
  await page.keyboard.down('w'); await page.waitForTimeout(2100); await page.keyboard.up('w'); await page.waitForTimeout(450);
  const atTable = (await saved(page)).player;
  expect(atTable.y).toBeGreaterThanOrEqual(232); expect(atTable.y).toBeLessThan(250);
  await page.keyboard.press('e'); await expect(page.getByRole('dialog')).toContainText('A little time, together.');
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.world-map canvas').focus(); await page.keyboard.press('m');
  await expect(page.getByRole('button', { name: 'Unmute all audio', exact: true })).toBeVisible();
  await page.keyboard.press('Tab'); await expect(page.getByRole('heading', { name: 'Make room for good work.' })).toBeVisible();
  await page.getByRole('button', { name: 'The office', exact: true }).click();
  await expect(page.locator('.world-map canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('delegate a task, use an accessible task dialog, persist work, and chat locally', async ({ page }) => {
  await openOffice(page);
  await page.getByRole('button', { name: 'A new task', exact: true }).click();
  await page.getByLabel('What shall we work on?').fill('Research a greener office');
  await page.getByLabel('A little more context').fill('Find three small ways to make our workday better.');
  await page.getByLabel('Kind of good work').selectOption('Research');
  await page.getByRole('button', { name: 'Set a good thing in motion' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const task = (await saved(page)).tasks.find((t: { title: string }) => t.title === 'Research a greener office');
  expect(task.agentId).toBe('nisa');
  await page.getByRole('button', { name: /^Task board/ }).click();
  await page.getByRole('button', { name: /Research a greener office/ }).click();
  await page.getByLabel('Move this task along').selectOption('blocked');
  await expect(page.getByRole('dialog')).toContainText('Blocked');
  await page.keyboard.press('Escape');
  await page.reload();
  expect((await saved(page)).tasks.find((t: { id: string }) => t.id === task.id).status).toBe('blocked');
  await page.getByRole('button', { name: 'Select Nisa', exact: true }).click();
  await page.getByRole('button', { name: 'Say hello', exact: true }).click();
  await page.getByRole('textbox', { name: 'Your message' }).fill('How is your progress?');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.locator('.from-agent')).toContainText('I’m on');
  const chats = (await saved(page)).chats;
  expect(chats.length).toBe(2); expect(chats[1].agentId).toBe('nisa');
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('audio, preferences, analytics, meetings, report downloads and pause all function', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await openOffice(page);
  await page.getByRole('button', { name: 'Play music', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause music', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next track', exact: true }).click();
  await expect(page.locator('.music-track')).toContainText('Coffee, code & sunshine');
  await page.getByRole('button', { name: 'Office settings', exact: true }).click();
  await page.getByLabel('Music volume', { exact: true }).fill('17');
  await page.getByRole('button', { name: 'Look & feel' }).click();
  await page.getByRole('switch', { name: 'Keep things calm' }).click();
  await page.getByRole('switch', { name: 'Follow the little paths' }).click();
  await page.getByRole('button', { name: 'Feels like home' }).click();
  await page.reload();
  const settings = (await saved(page)).settings;
  expect(settings.musicVolume).toBe(17); expect(settings.reducedMotion).toBe(true); expect(settings.pathLines).toBe(true);
  await page.getByRole('button', { name: 'Team huddle', exact: true }).click();
  await page.getByRole('button', { name: 'Ring the meeting bell' }).click();
  await expect(page.getByRole('dialog')).toContainText('The meeting room is open');
  await page.getByRole('button', { name: 'Wrap up & save notes' }).click();
  await expect(page.getByRole('dialog')).toContainText('Team check-in complete');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Insights', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Good work, at a glance.' })).toBeVisible();
  await expect(page.locator('.recharts-wrapper')).toHaveCount(4);
  await expect(page.locator('.recharts-pie-sector path')).toHaveCount(4);
  await page.getByRole('button', { name: 'The paper trail', exact: true }).click();
  await page.getByRole('button', { name: 'Have a look', exact: true }).first().click();
  await expect(page.locator('.report-output')).toContainText('Monday briefing');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save a copy' }).click();
  expect((await download).suggestedFilename()).toContain('monday');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('small screens stay within viewport and retain navigation and dialogs', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openOffice(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Our people', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Small team. Big heart.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Say hello', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const box = await page.getByRole('dialog').boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('coffee and screenshot work in-world, and agents finish reports while the task board is open', async ({ page }) => {
  await openOffice(page);
  const canvas = page.locator('.world-map canvas');
  const box = await canvas.boundingBox();
  await canvas.click({ position: { x: 115 / 1040 * box!.width, y: 410 / 664 * box!.height } });
  await expect(page.locator('.toast-stack')).toContainText('Caffeinated!');
  const screenshot = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Take office screenshot', exact: true }).click();
  expect((await screenshot).suggestedFilename()).toBe('a-day-at-abisena.png');
  await page.getByLabel('Simulation speed', { exact: true }).selectOption('4');
  await page.getByRole('button', { name: /^Task board/ }).click();
  const completed = page.locator('.column-review').getByRole('button', { name: /A fresh look for our landing page/ });
  await expect(completed).toBeVisible({ timeout: 25000 });
  await completed.click();
  await expect(page.locator('.report-output')).toContainText('Local simulation');
  await page.getByRole('button', { name: 'Looks good. Approve.' }).click();
  await expect(page.locator('.column-done').getByRole('button', { name: /A fresh look for our landing page/ })).toBeVisible();
  expect((await saved(page)).tasks.find((t: { id: string }) => t.id === 'T-103').status).toBe('done');
});
