# Combat, employee care and the new room

All characters are fictional pixel NPCs. Effects are small square particles and cartoon poses, with no realistic gore.

## Equip and attack

**Esc → Inventory → Equip**. Face a direction with WASD/arrows, then **SPACE**.

Attacks animate and sound immediately, before waiting for the server. A nearby employee is not required. Hold SPACE to automatically fire the rifle; tap repeatedly for other weapons. Server-authoritative directional hit tests and furniture/wall occlusion determine actual damage.

| Weapon | Default damage | Cooldown | Default hits to defeat 100 HP |
| --- | --- | --- | --- |
| Fists | 6 | 320 ms | Never lethal |
| Pecut / whip | 10 | 420 ms | 10 in Full mode |
| Knife | 18 | 260 ms | 6 in Full mode |
| Rifle | 25 | 145 ms | 4 in Full mode |

Damage is tunable in **Esc → Gameplay**. A health bar appears for targeted, hovered or recently damaged employees. Weapon reach/direction matter; there is no auto-target attack behind the player. Knife/whip knockback may require moving forward between hits.

Feedback: recoil, dynamic whip curve, blade thrust, muzzle flash, hitscan trail, wall sparks, impact sounds, short hit-stop, knockback, small optional pixel blood, fall pose and persistent body. Particles/trails are bounded so sustained fire does not create an unbounded object list.

## Violence and accessibility

- **Full Pixel Violence:** lethal knife/rifle/whip and HP-damaging devices; optional blood.
- **Reduced:** blood suppressed; HP cannot drop below 1 from combat/devices.
- **Off:** attacks disabled; machines pause. Healing, release and case resolution remain available.
- **Pixel blood** can independently be switched off.
- Shake, damage flash, reduced motion, camera and text scale remain configurable.

## Death is not firing

At 0 HP the employee becomes `deceased`, stops working, active requests are cancelled, schedules pause, and a lying body remains. Reload does not remove it or revive them. Their roster position remains unresolved.

Press E beside the body or visit **HR → Deceased → Resolve death**:

- **Resurrect:** same employee/profile/conversations, full HP; death-paused schedules resume. Morale/relationship consequences remain.
- **Fire without replacement:** remove body, terminate employment, retain history and a vacancy.
- **Replace similar:** new name/appearance/personality; same role, department, responsibilities, instructions, provider/model/tools and copied schedule templates. Source record remains in history.
- **Replace completely new:** full blank-profile hiring flow; no inherited provider, instructions or schedules.
- **Leave corpse for now:** preserve current unresolved body and staffing case.

Terminated cases cannot be resurrected. Vacancies in HR still offer similar/new replacement. An already-replaced source cannot be used to accidentally create repeated replacements.

## Healing and supplies

At an injured colleague: **E → Heal**, or **Esc → Inventory → Give food/drink**. One lunch box, drink, coffee or energy drink fully restores HP, increases morale by 5 and energy by 10. Stock decreases by one.

Normal food cannot heal the dead; use Resurrect instead. Full-HP employees do not consume supplies. Pantry coffee-machine menu restocks lunch boxes/drinks (company benefit, maximum 20 each) and coffee. Coffee can alternatively boost the director's movement for one minute.

## Torture room

The small dedicated room is below the boss office, using existing map space. Walk to its control panel and press E. Boss laptop and employee dialogue provide shortcuts.

Choose an employee, one of seven methods, and intensity (0.5×–2×):

1. **Auto whip machine** — periodic whip strikes, HP/morale damage.
2. **Boxing glove rig** — cartoon punch impacts and stars.
3. **Knife punishment** — small blade effects and controlled HP damage.
4. **Target practice** — repeated pixel shots; can be lethal if left running.
5. **Office shock chair** — fictional blue static, heavier stress/morale effects.
6. **Endless meeting** — projector/meeting loop, stress/energy effects, no HP damage.
7. **Paperwork treadmill** — paper effects, heavy energy drain, mild HP damage.

Employee physically walks to the rig; the machine starts on arrival. Existing work is interrupted. One employee/case occupies the rig at a time. **Stop machine**, **Resume**, **Release**, **Heal**, and **HR / Fire** act on persisted records. Method/intensity changes apply through **Apply machine settings**.

Health, morale, stress, energy, relationship, cycle count and incidents are real stored values. A death stops the machine and exposes the normal resurrection/fire/replacement choices. Resolve the body before assigning another employee to the occupied rig.

Reload preserves the active/paused session. Restarting the server preserves its state but resets the next pulse to a future interval; **no offline accumulated damage** is applied. Leaving the browser closed while the server remains running does not stop a running machine.

Productivity is a visible game/flavor stat, not a claim that injuries change model intelligence. Agent billing/execution is controlled by actual task states and provider requests.
