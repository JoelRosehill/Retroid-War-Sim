/**
 * Infantry. Steering is direct — no acceleration model — because foot soldiers
 * change direction instantly and the walk-cycle animation sells the motion.
 * Medics and engineers run support behaviour instead of shooting.
 */
import { Unit } from './Unit';
import { UnitState, type SimEntity } from './SimEntity';
import { MoveClass } from '../pathfinding/NavGrid';
import type { World } from '../systems/World';
import type { TeamId } from '../core/Config';
import type { InfantryDef } from '../data/types';
import type { UnitSprites } from '../render/SpriteLibrary';
import { dist2 } from '../core/MathUtils';

export class InfantryUnit extends Unit {
  declare readonly def: InfantryDef;
  private supportTimer = 0;

  constructor(def: InfantryDef, team: TeamId, gx: number, gy: number, sprites: UnitSprites) {
    super(def, team, gx, gy, sprites);
  }

  override get moveClass(): MoveClass { return MoveClass.Ground; }
  override get maxSpeed(): number { return this.def.speed; }
  override get hitRadius(): number { return 0.28; }

  protected override updateMovement(dt: number, world: World): void {
    const moving = this.followPath(dt, world, this.def.speed);

    if (!moving) {
      this.vx = 0;
      this.vy = 0;
      if (this.state === UnitState.Moving) this.state = UnitState.Idle;

      // Close the last stretch to a target we can't quite reach.
      if (this.target && this.def.weapon && !this.inWeaponRange(this.target, this.def.weapon)) {
        if (!this.pathPending && this.repathTimer <= 0) {
          this.repathTimer = 1.1;
          this.moveGoalX = this.target.centreX;
          this.moveGoalY = this.target.centreY;
          this.hasMoveGoal = true;
          this.requestPath(world, 2);
        }
      }
    }

    this.applySeparation(dt, world, 1.6, 0.85);
  }

  protected override updateWeapons(dt: number, world: World): void {
    super.updateWeapons(dt, world);
    if (this.def.healRate || this.def.repairRate) this.updateSupport(dt, world);
  }

  /** Medics heal infantry; engineers repair vehicles and structures. */
  private updateSupport(dt: number, world: World): void {
    this.supportTimer -= dt;
    if (this.supportTimer > 0) return;
    this.supportTimer = 0.5;

    const radius = 4.5;
    let best: SimEntity | null = null;
    let bestDeficit = 0;

    world.unitHash.query(this.gx, this.gy, radius, (other) => {
      if (other.team !== this.team || !other.alive || other === this) return;
      const deficit = other.maxHp - other.hp;
      if (deficit <= 0) return;
      const canHelp = this.def.healRate
        ? other.def.kind === 0 /* Infantry */
        : other.def.kind !== 0;
      if (!canHelp) return;
      if (deficit > bestDeficit) { bestDeficit = deficit; best = other; }
    });

    if (this.def.repairRate) {
      for (const structure of world.structuresOf(this.team)) {
        if (!structure.alive) continue;
        if (dist2(this.gx, this.gy, structure.centreX, structure.centreY) > radius * radius) continue;
        const deficit = structure.maxHp - structure.hp;
        if (deficit > bestDeficit) { bestDeficit = deficit; best = structure; }
      }
    }

    if (best) {
      const rate = (this.def.healRate ?? this.def.repairRate ?? 0) * 0.5;
      (best as SimEntity).heal(rate);
      this.state = UnitState.Repairing;
      world.effects.spawnRepairSpark(best as SimEntity);
    }
  }
}
