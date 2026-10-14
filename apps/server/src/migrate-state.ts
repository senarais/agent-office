import { defaultSettings } from '../../../packages/shared/src/types';
import type { WorldState } from '../../../packages/shared/src/types';
import { canStand, nearbyWalkable, spawn } from '../../../packages/shared/src/world';

/** Additive local-save migration: never drops employees, histories, provider IDs or tasks. */
export function migrateState(s: WorldState): WorldState {
  s.recurringTasks ??= []; s.scheduleRuns ??= []; s.tortureSessions ??= [];
  s.settings = { ...structuredClone(defaultSettings), ...s.settings, weaponDamage: { ...defaultSettings.weaponDamage, ...s.settings.weaponDamage } };
  s.player.food ??= 3; s.player.drinks ??= 3;
  if (!s.player.inventory.includes('Knife')) s.player.inventory.push('Knife');
  if (!canStand(s.player)) Object.assign(s.player, nearbyWalkable(spawn));
  for (const e of s.employees) {
    e.maxHp ??= 100; e.currentHp ??= e.employmentStatus === 'deceased' ? 0 : e.maxHp; e.productivity ??= 100; e.corpsePresent ??= e.employmentStatus === 'deceased';
    if (e.employmentStatus === 'deceased') { e.currentHp = 0; e.diedAt ??= e.endedAt || s.savedAt; delete e.endedAt; e.state = 'dead'; e.destination = { ...e.position }; }
    else if (e.employmentStatus === 'active' && !canStand(e.position)) e.position = canStand(e.home) ? { ...e.home } : nearbyWalkable(spawn);
  }
  s.version = 2; return s;
}
