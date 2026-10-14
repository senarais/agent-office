import type { Employee, Point, PunishmentMethod, Weapon } from './types';
import { canStand, distance } from './world';

export const weapons: Record<Weapon, { name: string; cooldown: number; range: number; width: number; damage: number }> = {
  hand: { name: 'Fists', cooldown: 320, range: 36, width: 18, damage: 6 },
  whip: { name: 'Pecut / whip', cooldown: 420, range: 80, width: 30, damage: 10 },
  knife: { name: 'Knife', cooldown: 260, range: 46, width: 18, damage: 18 },
  rifle: { name: 'Pixel rifle', cooldown: 145, range: 380, width: 12, damage: 25 },
};
export const directions: Point[] = [{ x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }, { x: 1, y: 0 }];
export function clearShot(a: Point, b: Point) {
  const steps = Math.max(1, Math.ceil(distance(a, b) / 3));
  for (let i = 1; i <= steps; i++) if (!canStand({ x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps }, 1)) return false;
  return true;
}
/** Ground-plane hitboxes match sprite feet; visual trails are drawn 16px above them. */
export function traceAttack(origin: Point, direction: number, weapon: Weapon, employees: Pick<Employee, 'id' | 'position' | 'employmentStatus' | 'currentHp'>[]) {
  const spec = weapons[weapon], axis = directions[direction]; let end = { ...origin };
  for (let i = 3; i <= spec.range; i += 3) { const p = { x: origin.x + axis.x * i, y: origin.y + axis.y * i }; if (!canStand(p, 1)) break; end = p; }
  const candidates = employees.filter(e => e.employmentStatus === 'active' && e.currentHp > 0).map(e => {
    const dx = e.position.x - origin.x, dy = e.position.y - origin.y;
    return { e, along: dx * axis.x + dy * axis.y, side: Math.abs(dx * axis.y - dy * axis.x), d: distance(origin, e.position) };
  }).filter(c => c.along >= -5 && c.d <= spec.range && c.side <= spec.width && (weapon !== 'rifle' || c.along <= distance(origin, end) + 2) && clearShot(origin, c.e.position)).sort((a, b) => a.d - b.d);
  const target = candidates[0]?.e;
  return { end: target ? { ...target.position } : end, employeeId: target?.id };
}
export const punishments: Record<PunishmentMethod, { name: string; damage: number; interval: number; morale: number; stress: number; energy: number; weapon: Weapon; description: string }> = {
  whip: { name: 'Auto whip machine', damage: 6, interval: 1500, morale: 5, stress: 6, energy: 2, weapon: 'whip', description: 'A mechanically terrible management style.' },
  punch: { name: 'Boxing glove rig', damage: 5, interval: 1600, morale: 4, stress: 5, energy: 2, weapon: 'hand', description: 'Unsolicited punch-card attendance.' },
  knife: { name: 'Knife punishment', damage: 8, interval: 1900, morale: 6, stress: 8, energy: 3, weapon: 'knife', description: 'Small pixel slashes. Stop before HP reaches zero.' },
  target: { name: 'Target practice', damage: 12, interval: 2100, morale: 6, stress: 9, energy: 3, weapon: 'rifle', description: 'Intensity controls damage. Can be lethal if left running.' },
  shock: { name: 'Office shock chair', damage: 2, interval: 2300, morale: 8, stress: 12, energy: 4, weapon: 'hand', description: 'Corporate synergy, now with fictional static.' },
  meeting: { name: 'Endless meeting', damage: 0, interval: 3000, morale: 6, stress: 9, energy: 6, weapon: 'hand', description: 'Slide 847: a meeting about the next meeting. No HP damage.' },
  paperwork: { name: 'Paperwork treadmill', damage: 1, interval: 2500, morale: 4, stress: 6, energy: 12, weapon: 'hand', description: 'Please reprint the form requesting more forms.' },
};
