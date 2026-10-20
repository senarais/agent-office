import type { Director, GameSave, Office, OfficeSummary, Point, WorldState } from '../../../packages/shared/src/types';
import { terminalTasks } from '../../../packages/shared/src/types';
import { integrationStatus } from './integrations';

/**
 * Accessor view over the persisted save. The engine and scheduler keep using `state.employees`,
 * `state.tasks`, `state.settings`, `state.player.x`, … exactly as before, but per-office arrays
 * resolve to the *active* office and PT-wide data (settings, providers, director) lives at the root.
 */
export class GameState {
  constructor(public save: GameSave) { bindDirector(this); }
  get version() { return this.save.version; }
  get settings() { return this.save.settings; }
  get providers() { return this.save.providers; }
  get director() { return this.save.director; }
  get player(): Director & Point { return this.save.director as Director & Point; }
  get events() { return this.save.events; }
  set events(value: GameSave['events']) { this.save.events = value; }
  get offices() { return this.save.offices; }
  get activeOfficeId() { return this.save.activeOfficeId; }
  set activeOfficeId(id: string) { this.save.activeOfficeId = id; }
  get active(): Office { return this.save.offices.find(o => o.id === this.save.activeOfficeId) || this.save.offices[0]; }
  get officeId() { return this.active.id; }
  get company() { return this.active.company; }
  get employees() { return this.active.employees; }
  get tasks() { return this.active.tasks; }
  get conversations() { return this.active.conversations; }
  get messages() { return this.active.messages; }
  get reports() { return this.active.reports; }
  get meetings() { return this.active.meetings; }
  get recurringTasks() { return this.active.recurringTasks; }
  get scheduleRuns() { return this.active.scheduleRuns; }
  get tortureSessions() { return this.active.tortureSessions; }
  get history() { return this.active.history; }
  get incidents() { return this.active.incidents; }
  get socialAccounts() { return this.active.socialAccounts; }
  get socialPosts() { return this.active.socialPosts; }
  get socialCampaigns() { return this.active.socialCampaigns; }
  get socialPublishes() { return this.active.socialPublishes; }
  get socialLastSyncAt() { return this.active.socialLastSyncAt; }
  set socialLastSyncAt(value: string | undefined) { this.active.socialLastSyncAt = value; }
  get socialAnalyticsError() { return this.active.socialAnalyticsError; }
  set socialAnalyticsError(value: string | undefined) { this.active.socialAnalyticsError = value; }
  get savedAt() { return this.save.savedAt; }
  set savedAt(value: string) { this.save.savedAt = value; }
  get storage() { return this.save.storage; }
  set storage(value: GameSave['storage']) { this.save.storage = value; }
  toJSON(): GameSave { return this.save; }
}

function bindDirector(state: GameState) {
  const director = state.save.director as Director & Point;
  Object.defineProperty(director, 'x', { configurable: true, enumerable: false, get: () => state.active.playerPosition.x, set: value => { state.active.playerPosition.x = value; } });
  Object.defineProperty(director, 'y', { configurable: true, enumerable: false, get: () => state.active.playerPosition.y, set: value => { state.active.playerPosition.y = value; } });
}

export function officeSummary(office: Office): OfficeSummary {
  return { id: office.id, name: office.name, industry: office.industry, employees: office.employees.filter(e => e.employmentStatus === 'active').length, activeTasks: office.tasks.filter(t => !terminalTasks.includes(t.status)).length };
}

/** Flatten the active office plus PT-wide data into the shape the browser game already consumes. */
export function view(state: GameState): WorldState {
  const o = state.active;
  return {
    version: state.save.version, company: o.company,
    employees: o.employees, tasks: o.tasks, providers: state.save.providers, conversations: o.conversations, messages: o.messages,
    reports: o.reports, meetings: o.meetings, recurringTasks: o.recurringTasks, scheduleRuns: o.scheduleRuns, tortureSessions: o.tortureSessions,
    history: o.history, incidents: o.incidents,
    socialAccounts: o.socialAccounts, socialPosts: o.socialPosts, socialCampaigns: o.socialCampaigns, socialPublishes: o.socialPublishes,
    socialSettings: o.socialSettings,
    socialLastSyncAt: o.socialLastSyncAt, socialAnalyticsError: o.socialAnalyticsError,
    events: state.save.events, settings: state.save.settings, integrations: integrationStatus(state.save.settings),
    player: { ...state.save.director, x: o.playerPosition.x, y: o.playerPosition.y },
    savedAt: state.save.savedAt, storage: state.save.storage,
    activeOfficeId: state.save.activeOfficeId, offices: state.save.offices.map(officeSummary),
  };
}
