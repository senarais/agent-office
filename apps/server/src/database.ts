import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv, randomUUID, createHash } from 'node:crypto';
import { defaultAppearance, defaultSettings } from '../../../packages/shared/src/types';
import type { WorldState, Secret } from '../../../packages/shared/src/types';
import { spawn } from '../../../packages/shared/src/world';

export const now = () => new Date().toISOString();
export function freshState(): WorldState {
  return { version: 1, company: { id: '00000000-0000-4000-8000-000000000001', name: 'PT ABISENA RAIS JAYA', motto: 'Building companies, one agent at a time.', chaos: 0, wallColor: '#597264', plants: true, goals: 'Hire our first colleague. Make something worthwhile.' }, employees: [], tasks: [], providers: [], conversations: [], messages: [], reports: [], meetings: [], history: [], incidents: [], events: [], settings: structuredClone(defaultSettings), player: { ...spawn, appearance: { ...defaultAppearance, shirt: '#e4d9b7', jacket: '#597264' }, equipped: 'hand', coffee: 3, energyDrinks: 1, inventory: ['Office Key', 'Company Documents', 'Whip', 'Cartoon Rifle', 'USB Drive', 'Access Card'] }, savedAt: now(), storage: { mode: 'local' } };
}

export class Store {
  db: DatabaseSync; state: WorldState; private key: Buffer; private syncing?: Promise<void>; private lastSync = 0; private closed = false;
  constructor(public directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 }); chmodSync(directory, 0o700);
    const keyPath = join(directory, 'vault.key');
    if (!process.env.VAULT_KEY && !existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32), { mode: 0o600 });
    this.key = process.env.VAULT_KEY ? Buffer.from(process.env.VAULT_KEY, 'base64') : readFileSync(keyPath);
    if (this.key.length !== 32) throw new Error('VAULT_KEY must decode to 32 bytes');
    this.db = new DatabaseSync(join(directory, 'office.sqlite')); chmodSync(join(directory, 'office.sqlite'), 0o600);
    this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS world (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS vault (id TEXT PRIMARY KEY, payload TEXT NOT NULL);');
    const row = this.db.prepare('SELECT payload FROM world WHERE id=1').get() as { payload: string } | undefined;
    this.state = row ? JSON.parse(row.payload) : freshState();
  }
  hasSave() { return !!this.db.prepare('SELECT id FROM world WHERE id=1').get(); }
  secret(id: string): Secret {
    const row = this.db.prepare('SELECT payload FROM vault WHERE id=?').get(id) as { payload: string } | undefined;
    if (!row) return {};
    const [iv, tag, ciphertext] = row.payload.split('.').map(s => Buffer.from(s, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv); decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString());
  }
  setSecret(id: string, secret: Secret) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const payload = Buffer.concat([cipher.update(JSON.stringify(secret)), cipher.final()]);
    this.db.prepare('INSERT OR REPLACE INTO vault(id,payload) VALUES (?,?)').run(id, [iv, cipher.getAuthTag(), payload].map(b => b.toString('base64')).join('.'));
  }
  save() {
    if (this.closed) return;
    this.state.savedAt = now(); this.db.prepare('INSERT OR REPLACE INTO world(id,payload) VALUES (1,?)').run(JSON.stringify(this.state));
  }
  private async remote(table: string, method: string, body?: unknown, query = '') {
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}${query}`, { method, signal: AbortSignal.timeout(15000), headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!response.ok) throw new Error(`Supabase ${table}: HTTP ${response.status}. Check migration and backend credentials.`);
    return method === 'GET' ? response.json() : undefined;
  }
  async restore() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || this.hasSave()) return;
    try { const rows = await this.remote('office_state', 'GET', undefined, `?id=eq.${this.state.company.id}&select=payload&limit=1`); if (rows[0]?.payload?.version === 1) { this.state = rows[0].payload; this.state.providers.forEach(p => { p.hasSecret = false; p.status = 'untested'; }); } }
    catch (e) { this.state.storage = { mode: 'local', restoreBlocked: true, error: `${(e as Error).message} Initial remote restore failed; remote writes are paused to protect the existing backup. Local play still saves. See docs/SUPABASE_SETUP.md.` }; }
  }
  sync(force = false): Promise<void> {
    if (this.syncing) return force ? this.syncing.then(() => this.sync(true)) : this.syncing;
    if (this.state.storage.restoreBlocked || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || (!force && Date.now() - this.lastSync < 10000)) return Promise.resolve();
    this.syncing = this.replicate().finally(() => { this.syncing = undefined; });
    return this.syncing;
  }
  private async replicate() {
    try {
      const s = structuredClone(this.state), cid = s.company.id;
      await this.remote('companies', 'POST', { id: cid, name: s.company.name, payload: s.company });
      const stableId = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 32).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
      const tables: Record<string, { id: string }[]> = { employees: s.employees, tasks: s.tasks, conversations: s.conversations, messages: s.messages, reports: s.reports, meetings: s.meetings, employment_history: s.history, provider_connections: s.providers, incidents: s.incidents, task_events: s.events,
        employee_appearance: s.employees.map(e => ({ id: e.id, employeeId: e.id, appearance: e.appearance })),
        employee_provider_config: s.employees.map(e => ({ id: e.id, employeeId: e.id, providerId: e.providerId, model: e.model, tools: e.tools, systemPrompt: e.systemPrompt })),
        meeting_participants: s.meetings.flatMap(m => m.attendeeIds.map(eid => ({ id: stableId(`${m.id}:participant:${eid}`), meetingId: m.id, employeeId: eid }))),
        meeting_messages: s.meetings.flatMap(m => m.messages.map((msg, i) => ({ id: stableId(`${m.id}:message:${i}`), meetingId: m.id, ...msg }))),
      };
      for (const [table, rows] of Object.entries(tables)) if (rows.length) await this.remote(table, 'POST', rows.map(row => ({ id: row.id, company_id: cid, payload: row })));
      await this.remote('game_settings', 'POST', { id: cid, company_id: cid, payload: s.settings });
      await this.remote('company_settings', 'POST', { id: cid, company_id: cid, payload: s.company });
      await this.remote('player_state', 'POST', { id: cid, company_id: cid, payload: s.player });
      await this.remote('inventory', 'POST', { id: cid, company_id: cid, payload: { items: s.player.inventory, coffee: s.player.coffee, energyDrinks: s.player.energyDrinks, equipped: s.player.equipped } });
      await this.remote('office_state', 'POST', { id: cid, company_id: cid, payload: s });
      this.state.storage = { mode: 'supabase', syncedAt: now() };
    } catch (e) { this.state.storage = { mode: 'local', error: (e as Error).message }; }
    finally { this.lastSync = Date.now(); this.save(); }
  }
  close() { this.save(); this.closed = true; this.db.close(); }
}
export const id = () => randomUUID();
