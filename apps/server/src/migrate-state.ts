import { randomUUID } from 'node:crypto';
import { defaultAppearance, defaultSettings } from '../../../packages/shared/src/types';
import { defaultSocialBrowserSettings } from '../../../packages/shared/src/social';
import type { Director, GameSave, Office, WorldState } from '../../../packages/shared/src/types';
import { canStand, entry, nearbyWalkable, spawn } from '../../../packages/shared/src/world';

const DEFAULT_INVENTORY = ['Office Key', 'Company Documents', 'Whip', 'Knife', 'Cartoon Rifle', 'USB Drive', 'Access Card'];

function normalizeSettings(settings: WorldState['settings'] | undefined): GameSave['settings'] {
  return { ...structuredClone(defaultSettings), ...settings, weaponDamage: { ...defaultSettings.weaponDamage, ...settings?.weaponDamage } };
}

/** Additive migration. v2 (single office) is wrapped as the first business; v3 is normalised in place. Never drops staff, providers or histories. */
export function migrateState(input: unknown): GameSave {
  const raw = input as Partial<GameSave> & Partial<WorldState>;
  return Array.isArray(raw.offices) ? normalizeSave(raw as GameSave) : fromSingleOffice(raw as WorldState);
}

function fromSingleOffice(old: WorldState): GameSave {
  const settings = normalizeSettings(old.settings);
  const company = { id: old.company?.id || randomUUID(), name: old.company?.name || 'PT ABISENA RAIS JAYA', motto: old.company?.motto ?? 'Building companies, one agent at a time.', chaos: old.company?.chaos ?? 0, wallColor: old.company?.wallColor ?? '#597264', plants: old.company?.plants ?? true, goals: old.company?.goals ?? 'Hire our first colleague. Make something worthwhile.' };
  const director: Director = {
    appearance: old.player?.appearance || { ...defaultAppearance, shirt: '#e4d9b7', jacket: '#597264' }, equipped: old.player?.equipped || 'hand',
    coffee: old.player?.coffee ?? 3, energyDrinks: old.player?.energyDrinks ?? 1, food: old.player?.food ?? 3, drinks: old.player?.drinks ?? 3,
    inventory: [...(old.player?.inventory || DEFAULT_INVENTORY)], caffeinatedUntil: old.player?.caffeinatedUntil,
  };
  const office: Office = {
    id: company.id, name: company.name, industry: 'General', createdAt: old.savedAt || new Date().toISOString(), company,
    employees: old.employees || [], tasks: old.tasks || [], conversations: old.conversations || [], messages: old.messages || [],
    reports: old.reports || [], meetings: old.meetings || [], recurringTasks: old.recurringTasks || [], scheduleRuns: old.scheduleRuns || [],
    tortureSessions: old.tortureSessions || [], history: old.history || [], incidents: old.incidents || [],
    socialAccounts: [], socialPosts: [], socialCampaigns: [], socialPublishes: [],
    socialSettings: { ...defaultSocialBrowserSettings },
    playerPosition: { x: old.player?.x ?? spawn.x, y: old.player?.y ?? spawn.y },
  };
  return normalizeSave({ version: 3, company: { id: company.id, name: company.name }, settings, providers: old.providers || [], director, activeOfficeId: office.id, offices: [office], events: old.events || [], savedAt: old.savedAt || new Date().toISOString(), storage: old.storage || { mode: 'local' } });
}

function normalizeSave(save: GameSave): GameSave {
  save.version = 3;
  save.settings = normalizeSettings(save.settings);
  save.providers ??= [];
  save.events ??= [];
  save.storage ??= { mode: 'local' };
  save.savedAt ??= new Date().toISOString();
  save.director ??= { appearance: { ...defaultAppearance }, equipped: 'hand', coffee: 3, energyDrinks: 1, food: 3, drinks: 3, inventory: [...DEFAULT_INVENTORY] };
  save.director.food ??= 3; save.director.drinks ??= 3; save.director.coffee ??= 3; save.director.energyDrinks ??= 1; save.director.equipped ??= 'hand';
  save.director.inventory ??= [...DEFAULT_INVENTORY];
  if (!save.director.inventory.includes('Knife')) save.director.inventory.push('Knife');
  save.offices ??= [];
  if (!save.offices.length) { const office = freshOffice(save.company); save.offices.push(office); }
  for (const office of save.offices) {
    office.id ||= randomUUID(); office.name ||= save.company?.name || 'Main Office'; office.industry ||= 'General'; office.createdAt ||= save.savedAt;
    office.company = { id: office.company?.id || save.company?.id || randomUUID(), name: office.company?.name || save.company?.name || 'PT ABISENA RAIS JAYA', motto: office.company?.motto ?? '', chaos: office.company?.chaos ?? 0, wallColor: office.company?.wallColor ?? '#597264', plants: office.company?.plants ?? true, goals: office.company?.goals ?? '' };
    office.employees ??= []; office.tasks ??= []; office.conversations ??= []; office.messages ??= []; office.reports ??= []; office.meetings ??= [];
    office.recurringTasks ??= []; office.scheduleRuns ??= []; office.tortureSessions ??= []; office.history ??= []; office.incidents ??= [];
    office.socialAccounts ??= []; office.socialPosts ??= []; office.socialCampaigns ??= []; office.socialPublishes ??= [];
    office.socialSettings = { ...defaultSocialBrowserSettings, ...office.socialSettings };
    for (const rule of office.recurringTasks) rule.telegramNotify ??= false;
    office.playerPosition ??= { ...entry };
    if (!canStand(office.playerPosition)) office.playerPosition = { ...entry };
    for (const e of office.employees) {
      e.skills ??= [];
      e.maxHp ??= 100; e.currentHp ??= e.employmentStatus === 'deceased' ? 0 : e.maxHp; e.productivity ??= 100; e.corpsePresent ??= e.employmentStatus === 'deceased';
      if (e.employmentStatus === 'deceased') { e.currentHp = 0; e.diedAt ??= e.endedAt || save.savedAt; delete e.endedAt; e.state = 'dead'; e.destination = { ...e.position }; }
      else if (e.employmentStatus === 'active' && !canStand(e.position)) e.position = canStand(e.home) ? { ...e.home } : nearbyWalkable(spawn);
    }
  }
  if (!save.offices.some(o => o.id === save.activeOfficeId)) save.activeOfficeId = save.offices[0].id;
  save.company = { id: save.offices[0].company.id, name: save.offices[0].company.name };
  return save;
}

export function freshOffice(company: { id: string; name: string }, name?: string, industry = 'General'): Office {
  return {
    id: randomUUID(), name: name || company.name, industry, createdAt: new Date().toISOString(),
    company: { id: company.id, name: company.name, motto: 'Building companies, one agent at a time.', chaos: 0, wallColor: '#597264', plants: true, goals: 'Hire our first colleague. Make something worthwhile.' },
    employees: [], tasks: [], conversations: [], messages: [], reports: [], meetings: [], recurringTasks: [], scheduleRuns: [], tortureSessions: [], history: [], incidents: [],
    socialAccounts: [], socialPosts: [], socialCampaigns: [], socialPublishes: [],
    socialSettings: { ...defaultSocialBrowserSettings },
    playerPosition: { ...entry },
  };
}
