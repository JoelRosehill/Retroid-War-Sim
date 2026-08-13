/**
 * Target acquisition.
 *
 * Scoring balances distance against how worthwhile the target is, so a tank
 * doesn't ignore an artillery piece to shoot the rifleman one tile closer. The
 * spatial hash keeps this at a few dozen candidate checks per unit rather than
 * a scan over every entity.
 */
import type { SimEntity } from '../entities/SimEntity';
import type { Structure } from '../entities/Structure';
import { weaponCanHit } from '../entities/Unit';
import { EntityKind, type WeaponDef } from '../data/types';
import { dist2 } from '../core/MathUtils';
import type { World } from './World';

/** Relative priority per category, before distance weighting. */
const KIND_PRIORITY: Record<EntityKind, number> = {
  [EntityKind.Infantry]: 1.0,
  [EntityKind.Vehicle]: 1.35,
  [EntityKind.Aircraft]: 1.2,
  [EntityKind.Defense]: 1.5,
  [EntityKind.Building]: 0.75,
};

export class TargetingSystem {
  constructor(private readonly world: World) {}

  /** Best target for a mobile unit, searched within its sight radius. */
  findTarget(seeker: SimEntity, weapon: WeaponDef): SimEntity | null {
    const searchRadius = Math.max(seeker.def.sight, weapon.range) * 1.05;
    return this.search(seeker, weapon, seeker.gx, seeker.gy, searchRadius, true);
  }

  /** Structures only engage what is already inside weapon range. */
  findTargetForStructure(seeker: Structure, weapon: WeaponDef): SimEntity | null {
    return this.search(seeker, weapon, seeker.centreX, seeker.centreY, weapon.range, false);
  }

  private search(
    seeker: SimEntity, weapon: WeaponDef,
    ox: number, oy: number, radius: number, includeStructures: boolean,
  ): SimEntity | null {
    let best: SimEntity | null = null;
    let bestScore = -Infinity;
    const minRange2 = weapon.minRange ? weapon.minRange * weapon.minRange : 0;

    const consider = (candidate: SimEntity): void => {
      if (!candidate.alive || candidate.team === seeker.team) return;
      if (!weaponCanHit(weapon, candidate)) return;

      const d2 = dist2(ox, oy, candidate.centreX, candidate.centreY);
      if (d2 > radius * radius) return;
      // A mortar cannot depress far enough to hit what's on top of it.
      if (minRange2 > 0 && d2 < minRange2) return;

      // Prefer close, high-value, already-damaged targets.
      const distance = Math.sqrt(d2);
      const priority = KIND_PRIORITY[candidate.def.kind];
      const finishBonus = candidate.healthFraction < 0.35 ? 1.25 : 1;
      const score = (priority * finishBonus * 100) / (distance + 1.5);

      if (score > bestScore) { bestScore = score; best = candidate; }
    };

    this.world.unitHash.query(ox, oy, radius, consider);

    if (includeStructures) {
      // Structures are few enough to scan linearly, and they don't move.
      for (const structure of this.world.structuresOf(this.world.enemyTeam(seeker.team))) {
        if (structure.asDefense()?.concealed && !structure.target) continue;
        consider(structure);
      }
    } else {
      for (const structure of this.world.structuresOf(this.world.enemyTeam(seeker.team))) {
        consider(structure);
      }
    }

    return best;
  }

  /**
   * Nearest enemy structure to a point — used by the AI to pick attack goals.
   */
  nearestEnemyStructure(team: 0 | 1, gx: number, gy: number): Structure | null {
    let best: Structure | null = null;
    let bestD2 = Infinity;
    for (const s of this.world.structuresOf(this.world.enemyTeam(team))) {
      if (!s.alive) continue;
      const d2 = dist2(gx, gy, s.centreX, s.centreY);
      if (d2 < bestD2) { bestD2 = d2; best = s; }
    }
    return best;
  }
}
