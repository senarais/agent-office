import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { WorldState, Employee, Weapon } from '../packages/shared/src/types';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const state = async (page: Page): Promise<WorldState> => (await page.request.get('/api/state')).json();
async function command<T = unknown>(page: Page, path: string, data: unknown, method: 'POST' | 'PATCH' = 'POST'): Promise<T> {
  const { token } = await (await page.request.get('/api/bootstrap')).json();
  const response = await page.request.fetch(`/api${path}`, { method, headers: { 'X-Office-Token': token }, data }); expect(response.ok(), await response.text()).toBe(true); return response.json();
}
async function enter(page: Page) { await page.goto('/'); await page.getByRole('button', { name: 'ENTER OFFICE' }).click(); await expect.poll(() => page.evaluate(async () => !!(await import('/apps/game/src/game/OfficeScene.ts' as string)).officeScene?.player)).toBe(true); }
async function close(page: Page) { if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape'); }
async function walk(page: Page, x: number, y: number) { await close(page); await page.evaluate(async p => (await import('/apps/game/src/game/OfficeScene.ts' as string)).officeScene.walkTo(p), { x, y }); await expect.poll(() => page.evaluate(async p => { const { officeScene } = await import('/apps/game/src/game/OfficeScene.ts' as string); return Math.hypot(officeScene.player.x - p.x, officeScene.player.y - p.y); }, { x, y }), { timeout: 15000 }).toBeLessThan(6); }
async function device(page: Page, x: number, y: number, title: string) { await walk(page, x, y); await page.keyboard.press('e'); await expect(page.getByRole('dialog', { name: title, exact: true })).toBeVisible(); }
async function hire(page: Page, name: string, department = 'Development'): Promise<Employee> {
  const s = await state(page); const provider = s.providers.find(p => p.kind === 'demo') || await command<{ id: string }>(page, '/providers', { name: 'DEMO SIMULATION', kind: 'demo', model: 'demo-simulation' });
  return command<Employee>(page, '/employees', { name, role: 'Automation specialist', department, appearance: s.player.appearance, providerId: provider.id, model: 'demo-simulation', tools: ['read'], systemPrompt: 'Return concise verified reports.' });
}
async function approach(page: Page, id: string) {
  await close(page);
  await page.evaluate(async id => (await import('/apps/game/src/game/OfficeScene.ts' as string)).officeScene.approachEmployee(id), id);
  await page.keyboard.down('Shift'); await expect(page.getByRole('dialog', { name: 'A CONVERSATION', exact: true })).toBeVisible({ timeout: 25000 }); await page.keyboard.up('Shift');
  await expect.poll(() => page.evaluate(async () => (await import('/apps/game/src/state.ts' as string)).useGame.getState().window?.id)).toBe(id);
}
async function equip(page: Page, weapon: Weapon) {
  await close(page); await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  const name = { hand: 'Empty hand', whip: 'Pecut / whip', knife: 'Knife', rifle: 'Cartoon rifle' }[weapon];
  const row = page.locator('.inventory-grid article').filter({ has: page.getByRole('heading', { name, exact: true }) }); const button = row.getByRole('button', { name: 'Equip', exact: true }); if (await button.count()) await button.click();
  await expect.poll(async () => (await state(page)).player.equipped).toBe(weapon); await close(page);
}

test('SPACE fires instantly into empty space, autofire is bounded, and new combat/HR flows persist', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await enter(page);
  await command(page, '/settings', { violence: 'full', blood: true, weaponDamage: { hand: 6, whip: 10, knife: 18, rifle: 25 }, pixelScale: 2, shake: false }, 'PATCH');
  await equip(page, 'rifle'); await walk(page, 1208, 792); await page.keyboard.press('ArrowRight', { delay: 25 });
  const initial = await page.evaluate(async () => (await import('/apps/game/src/game/OfficeScene.ts' as string)).officeScene.combatFX.shotsFired);
  const hpBefore = (await state(page)).employees.map(e => e.currentHp);
  await page.route('**/api/combat', async route => { await new Promise(r => setTimeout(r, 350)); await route.continue(); });
  await page.keyboard.press('Space'); const immediate = await page.evaluate(async () => (await import('/apps/game/src/game/OfficeScene.ts' as string)).officeScene.combatFX.shotsFired); expect(immediate).toBe(initial + 1);
  await page.keyboard.down('Space'); await page.waitForTimeout(900); await page.keyboard.up('Space'); await page.waitForTimeout(500); await page.unroute('**/api/combat');
  const fired = await page.evaluate(async () => (await import('/apps/game/src/game/OfficeScene.ts' as string)).officeScene.combatFX.shotsFired); expect(fired - initial).toBeGreaterThanOrEqual(5); expect(fired - initial).toBeLessThanOrEqual(8); expect((await state(page)).employees.map(e => e.currentHp)).toEqual(hpBefore);
  const e = await hire(page, 'Combat colleague'); await equip(page, 'knife'); await approach(page, e.id); await close(page); await page.keyboard.press('Space');
  await expect.poll(async () => (await state(page)).employees.find(p => p.id === e.id)!.currentHp).toBe(82);
  await expect.poll(() => page.evaluate(async id => { const { officeScene } = await import('/apps/game/src/game/OfficeScene.ts' as string); return !!officeScene.children.list.find((o: { getData?: (k: string) => unknown }) => o.getData?.('employeeId') === id && o.getData?.('hpVisible')); }, e.id)).toBe(true);
  expect(await page.evaluate(async () => (await import('/apps/game/src/game/OfficeScene.ts' as string)).officeScene.combatFX.bloodBursts)).toBeGreaterThan(0);
  await approach(page, e.id); await page.getByRole('button', { name: 'Heal', exact: true }).click(); await page.getByRole('button', { name: 'Give lunch box', exact: true }).click(); await expect.poll(async () => (await state(page)).employees.find(p => p.id === e.id)!.currentHp).toBe(100);
  await equip(page, 'whip'); await approach(page, e.id); await close(page); await page.keyboard.press('Space'); await expect.poll(async () => (await state(page)).employees.find(p => p.id === e.id)!.currentHp).toBe(90);
  await approach(page, e.id); await page.getByRole('button', { name: 'Heal', exact: true }).click(); await page.getByRole('button', { name: 'Give drink', exact: true }).click(); await expect.poll(async () => (await state(page)).employees.find(p => p.id === e.id)!.currentHp).toBe(100);
  await equip(page, 'rifle'); await approach(page, e.id); await close(page);
  await page.keyboard.press('Space'); await expect.poll(async () => (await state(page)).employees.find(p => p.id === e.id)!.currentHp).toBe(75); expect((await state(page)).employees.find(p => p.id === e.id)!.employmentStatus).toBe('active');
  for (let i = 0; i < 3; i++) { await page.waitForTimeout(170); await page.keyboard.press('Space'); }
  await expect.poll(async () => (await state(page)).employees.find(p => p.id === e.id)!.employmentStatus).toBe('deceased'); await page.waitForTimeout(350);
  const body = async () => page.evaluate(async id => { const { officeScene } = await import('/apps/game/src/game/OfficeScene.ts' as string); return officeScene.children.list.some((o: { getData?: (k: string) => unknown; angle?: number }) => o.getData?.('employeeId') === id && o.getData?.('corpse') === true && Math.abs(o.angle! - 90) < 1); }, e.id);
  expect(await body()).toBe(true); await page.screenshot({ path: 'docs/screenshots/persistent-corpse.png', animations: 'disabled' });
  await enter(page); await expect.poll(body).toBe(true); await approach(page, e.id); await expect(page.getByText('DECEASED · NOT FIRED')).toBeVisible();
  await page.getByRole('button', { name: 'Leave corpse for now' }).click(); expect((await state(page)).employees.find(p => p.id === e.id)!.corpsePresent).toBe(true);
  await approach(page, e.id); await page.getByRole('button', { name: 'Resurrect', exact: true }).click(); await expect.poll(async () => (await state(page)).employees.find(p => p.id === e.id)!.currentHp).toBe(100); expect((await state(page)).employees.find(p => p.id === e.id)!.employmentStatus).toBe('active');
  await close(page); await approach(page, e.id); await close(page); for (let i = 0; i < 4; i++) { await page.waitForTimeout(180); await page.keyboard.press('Space'); } await expect.poll(async () => (await state(page)).employees.find(p => p.id === e.id)!.employmentStatus).toBe('deceased');
  await approach(page, e.id); await page.getByRole('button', { name: 'Replace similar', exact: true }).click(); await page.getByLabel('Name', { exact: true }).fill('Replacement colleague'); await page.getByRole('tab', { name: 'Appearance', exact: true }).click(); await page.getByLabel('hat', { exact: true }).check(); await page.getByRole('button', { name: 'Create replacement', exact: true }).click();
  const replacement = (await state(page)).employees.find(p => p.name === 'Replacement colleague')!; expect(replacement.providerId).toBe(e.providerId); expect(replacement.appearance.hat).toBe(true); expect(replacement.predecessorId).toBe(e.id);
  await command(page, `/employees/${replacement.id}/fire`, {}); await device(page, 152, 584, 'HR TERMINAL / PEOPLE & CULTURE'); await page.getByRole('tab', { name: 'Vacancies' }).click();
  await page.locator('.paper-row').filter({ hasText: 'Replacement colleague' }).getByRole('button', { name: 'Replace new', exact: true }).click(); await expect(page.getByLabel('Job title', { exact: true })).toHaveValue('Research Analyst'); await page.getByLabel('Name', { exact: true }).fill('Entirely new colleague'); await page.getByRole('tab', { name: 'Agent connection' }).click(); await expect(page.getByLabel('Agent provider', { exact: true })).toHaveValue(''); await page.getByRole('button', { name: 'Create replacement' }).click();
  const fresh = (await state(page)).employees.find(p => p.name === 'Entirely new colleague')!; expect(fresh.providerId).toBe(''); await command(page, `/employees/${fresh.id}/fire`, {}); expect(errors).toEqual([]);
});

test('recurring tasks run while browser is away; machine control persists and can stop/release', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await enter(page); const e = await hire(page, 'Scheduled colleague', 'QA');
  await device(page, 1112, 600, 'ABISENA OS'); await page.getByRole('button', { name: 'Recurring tasks Set it once. Autopilot.' }).click(); await page.getByRole('button', { name: '+ New recurring task' }).click();
  await page.getByLabel('Schedule name', { exact: true }).fill('Automatic office briefing'); await page.getByLabel('Assigned employee').selectOption(e.id); await page.getByLabel('Schedule type').selectOption('once');
  await page.getByLabel('Task instructions', { exact: true }).fill('Verify automatic task execution and generate a report.'); await page.getByLabel('Output destination').selectOption('printer'); await page.getByLabel('Employee delivers report', { exact: true }).uncheck();
  const runAt = await page.evaluate(() => { const d = new Date(Date.now() + 6000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19); }); await page.getByLabel('Run once at', { exact: true }).fill(runAt); await page.getByRole('button', { name: 'Save recurring task' }).click();
  const rule = (await state(page)).recurringTasks.find(r => r.name === 'Automatic office briefing')!; expect(rule.id).toBeTruthy();
  await page.goto('about:blank'); await expect.poll(async () => (await state(page)).scheduleRuns.find(r => r.recurringTaskId === rule.id)?.status, { timeout: 25000 }).toBe('completed');
  const saved = await state(page), run = saved.scheduleRuns.find(r => r.recurringTaskId === rule.id)!; const report = saved.reports.find(r => r.taskId === run.taskId)!; expect(report.text).toContain('DEMO SIMULATION');
  await enter(page); await device(page, 1112, 600, 'ABISENA OS'); await page.getByRole('button', { name: 'Recurring tasks Set it once. Autopilot.' }).click(); await page.getByRole('tab', { name: 'Run history' }).click(); await page.getByRole('button', { name: 'Open generated report' }).click(); await expect(page.locator('.report-document')).toContainText('DEMO SIMULATION'); await page.getByRole('button', { name: 'Archive report' }).click(); await expect.poll(async () => (await state(page)).reports.find(r => r.id === report.id)!.archived).toBe(true);
  await device(page, 1160, 744, 'TORTURE ROOM / MACHINE CONTROLS'); await page.getByLabel('Employee for torture room').selectOption(e.id); await page.getByLabel('Machine / punishment method').selectOption('meeting'); await page.getByRole('button', { name: 'Send employee & start' }).click();
  await expect.poll(async () => (await state(page)).tortureSessions.at(-1)?.status, { timeout: 20000 }).toBe('active'); await expect.poll(async () => (await state(page)).tortureSessions.at(-1)!.pulses).toBeGreaterThan(0); await page.getByRole('button', { name: 'Stop machine' }).click(); await expect.poll(async () => (await state(page)).tortureSessions.at(-1)!.status).toBe('paused');
  await page.getByLabel('Machine / punishment method').selectOption('knife'); await page.getByRole('button', { name: 'Apply machine settings' }).click(); await page.getByRole('button', { name: 'Resume machine' }).click(); await expect.poll(async () => (await state(page)).employees.find(p => p.id === e.id)!.currentHp).toBeLessThan(100); await page.getByRole('button', { name: 'Stop machine' }).click();
  const hp = (await state(page)).employees.find(p => p.id === e.id)!.currentHp; await enter(page); await device(page, 1160, 744, 'TORTURE ROOM / MACHINE CONTROLS'); await expect(page.getByRole('button', { name: 'Resume machine' })).toBeEnabled(); await page.waitForTimeout(2500); expect((await state(page)).employees.find(p => p.id === e.id)!.currentHp).toBe(hp); await page.screenshot({ path: 'docs/screenshots/torture-controls.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Release employee', exact: true }).click(); await expect.poll(async () => (await state(page)).employees.find(p => p.id === e.id)!.tortureId).toBeUndefined();
  await device(page, 1112, 600, 'ABISENA OS'); await page.getByRole('button', { name: 'Recurring tasks Set it once. Autopilot.' }).click(); await page.getByRole('button', { name: 'Edit schedule' }).click(); await page.getByLabel('Schedule type').selectOption('interval'); await page.getByLabel('Interval (minutes)').fill('30'); await page.getByRole('button', { name: 'Save recurring task' }).click(); await page.getByRole('button', { name: 'Pause', exact: true }).click(); await expect.poll(async () => (await state(page)).recurringTasks.find(r => r.id === rule.id)!.enabled).toBe(false); await page.getByRole('button', { name: 'Resume', exact: true }).click(); await expect.poll(async () => (await state(page)).recurringTasks.find(r => r.id === rule.id)!.enabled).toBe(true); await page.screenshot({ path: 'docs/screenshots/recurring-tasks.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Delete', exact: true }).click(); await page.getByRole('button', { name: 'Delete schedule', exact: true }).click(); await expect.poll(async () => (await state(page)).recurringTasks.find(r => r.id === rule.id)!.deletedAt).toBeTruthy(); await command(page, `/employees/${e.id}/fire`, {}); expect(errors).toEqual([]);
});

test('development HTTP server never serves vault keys or SQLite save files', async ({ page }) => {
  mkdirSync('.test-data', { recursive: true }); const directory = mkdtempSync('.test-data/http-boundary-');
  try { for (const filename of ['vault.key', 'office.sqlite', 'office.sqlite-wal']) { const path = join(directory, filename); writeFileSync(path, 'non-secret test fixture'); expect((await page.request.get('/' + path)).status()).toBe(403); expect((await page.request.get('/@fs' + resolve(path))).status()).toBe(403); } }
  finally { rmSync(directory, { recursive: true, force: true }); }
});
