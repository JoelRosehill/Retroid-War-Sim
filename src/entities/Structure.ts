/**
 * Buildings and stationary defences.
 *
 * Structures snap to the grid, occupy a footprint matrix that blocks ground
 * pathfinding, and never move. Production, income and repair auras are driven
 * from here; the AI reads them through the World's per-team indices.
 */
import { Sprite } from 'pixi.js';
import { SimEntity, UnitState } from './SimEntity';
import type { World } from '../systems/World';
import type { TeamId } from '../core/Config';
import { HALF_H, HALF_W, Layer } from '../core/Config';
import { depthKey, gridToScreen } from '../iso/Iso';
import {
  EntityKind, isBuilding, isDefense, TargetMask,
  type BuildingDef, type DefenseDef, type WeaponDef,
} from '../data/types';
import type { UnitSprites } from '../render/SpriteLibrary';
import { headingToFacing8, dist2 } from '../core/MathUtils';
import { weaponCanHit } from './Unit';

export type StructureDef = BuildingDef | DefenseDef;

export class Structure extends SimEntity {
  declare readonly def: StructureDef;

  readonly fw: number;
  readonly fh: number;

  /** Construction progress 0-1. Below 1 the structure is inert and fragile. */
  buildProgress = 1;

  /** Production queue of unit ids, serviced by ProductionSystem. */
  readonly queue: string[] = [];
  queueTimer = 0;

  private turretSprite: Sprite | null = null;
  private turretFacing = 0;
  private sprites: UnitSprites;
  private auraTimer = 0;
  private burstRemaining = 0;
  private burstTimer = 0;

  constructor(def: StructureDef, team: TeamId, gx: number, gy: number, sprites: UnitSprites) {
    super(def, team, gx, gy);
    this.fw = def.fw;
    this.fh = def.fh;
    this.sprites = sprites;

    const set = sprites.body[team];
    const tex = set.textures[0][0];
    this.bodySprite.texture = tex;
    this.bodySprite.anchor.set(set.pivotX / tex.width, set.pivotY / tex.height);

    if (sprites.turret) {
      const tset = sprites.turret[team];
      this.turretSprite = new Sprite(tset.textures[0][0]);
      this.turretSprite.anchor.set(
        tset.pivotX / this.turretSprite.texture.width,
        tset.pivotY / this.turretSprite.texture.height,
      );
      // The body sprite is anchored at the footprint's *north corner*, so the
      // turret has to be offset to the footprint's centre or it floats off the
      // back of the emplacement.
      this.turretSprite.x = ((this.fw - this.fh) * HALF_W) / 2;
      this.turretSprite.y = ((this.fw + this.fh) * HALF_H) / 2 - this.def.visual.height - 2;
      this.view.addChild(this.turretSprite);
    }
  }

  override get isStructure(): boolean { return true; }
  override get centreX(): number { return this.gx + this.fw / 2 - 0.5; }
  override get centreY(): number { return this.gy + this.fh / 2 - 0.5; }
  override get hitRadius(): number { return Math.max(this.fw, this.fh) * 0.5; }

  get isOperational(): boolean {
    return this.alive && this.buildProgress >= 1 && this.disabledFor <= 0;
  }

  asBuilding(): BuildingDef | null {
    return isBuilding(this.def) ? this.def : null;
  }

  asDefense(): DefenseDef | null {
    return isDefense(this.def) ? this.def : null;
  }

  override update(dt: number, world: World): void {
    this.age += dt;
    if (this.disabledFor > 0) this.disabledFor -= dt;

    if (this.buildProgress < 1) {
      this.buildProgress = Math.min(1, this.buildProgress + dt / this.def.buildTime);
      this.state = UnitState.Constructing;
      this.hp = Math.max(this.hp, this.maxHp * (0.25 + 0.75 * this.buildProgress));
      return;
    }

    this.cooldown -= dt;
    this.updateProximityTrigger(world);
    this.updateWeapon(dt, world);
    this.updateAuras(dt, world);
  }

  /** Mines and traps: detonate when an eligible enemy comes close enough. */
  private updateProximityTrigger(world: World): void {
    const def = this.asDefense();
    if (!def?.proximity) return;

    const { triggerRadius, targets } = def.proximity;
    let victim: SimEntity | null = null;

    world.unitHash.query(this.centreX, this.centreY, triggerRadius, (other) => {
      if (other.team === this.team || !other.alive) return;
      if (other.isAirborne && (targets & TargetMask.Air) === 0) return;
      if (!other.isAirborne && (targets & TargetMask.Ground) === 0) return;
      victim = other;
      return false;
    });

    if (!victim || !this.def.weapon) return;
    world.combat.detonate(this, this.def.weapon, this.centreX, this.centreY);
    this.hp = 0;
    this.alive = false;
    world.notifyDestroyed(this, null);
  }

  private updateWeapon(dt: number, world: World): void {
    const weapon = this.def.weapon;
    if (!weapon || this.asDefense()?.proximity) return;
    if (!this.isOperational) return;

    if (this.target && (!this.target.alive || !this.inRange(this.target, weapon))) {
      this.target = null;
    }
    if (!this.target) {
      this.target = world.targeting.findTargetForStructure(this, weapon);
      if (!this.target) return;
    }

    const heading = Math.atan2(
      (this.target.centreX + this.target.centreY) - (this.centreX + this.centreY),
      (this.target.centreX - this.target.centreY) - (this.centreX - this.centreY),
    );
    this.turretFacing = heading;
    this.facing = heading;

    if (this.burstRemaining > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        world.combat.fire(this, weapon, this.target, 0);
        this.burstRemaining--;
        this.burstTimer = weapon.burstDelay ?? 0.06;
      }
      return;
    }

    if (this.cooldown <= 0) {
      world.combat.fire(this, weapon, this.target, 0);
      this.cooldown = weapon.cooldown;
      this.burstRemaining = Math.max(0, (weapon.burst ?? 1) - 1);
      this.burstTimer = weapon.burstDelay ?? 0.06;
      this.state = UnitState.Attacking;
    }
  }

  private inRange(target: SimEntity, weapon: WeaponDef): boolean {
    if (!weaponCanHit(weapon, target)) return false;
    const d2 = dist2(this.centreX, this.centreY, target.centreX, target.centreY);
    if (d2 > weapon.range * weapon.range) return false;
    if (weapon.minRange !== undefined && d2 < weapon.minRange * weapon.minRange) return false;
    return true;
  }

  /** Repair bays and hospitals mend nearby friendlies. */
  private updateAuras(dt: number, world: World): void {
    const def = this.asBuilding();
    if (!def) return;
    const radius = def.repairRadius ?? def.healRadius;
    if (!radius) return;

    this.auraTimer -= dt;
    if (this.auraTimer > 0) return;
    this.auraTimer = 0.6;

    const rate = (def.repairRate ?? 26) * 0.6;
    const infantryOnly = def.healRadius !== undefined && def.repairRadius === undefined;

    world.unitHash.query(this.centreX, this.centreY, radius, (other) => {
      if (other.team !== this.team || !other.alive) return;
      if (other.hp >= other.maxHp) return;
      if (infantryOnly && other.def.kind !== EntityKind.Infantry) return;
      other.heal(rate);
      world.effects.spawnRepairSpark(other);
    });
  }

  override syncView(): void {
    const p = gridToScreen(this.gx, this.gy, this.groundElevation);
    this.view.position.set(Math.round(p.x), Math.round(p.y));
    // Sort on the footprint's southern tip so units in front overlap correctly.
    this.depth = depthKey(this.gx + this.fw - 1, this.gy + this.fh - 1, Layer.Entity, -20);

    if (this.turretSprite && this.sprites.turret) {
      const tset = this.sprites.turret[this.team];
      this.turretSprite.texture = tset.textures[headingToFacing8(this.turretFacing)][0];
    }

    if (this.buildProgress < 1) {
      // Rise out of the ground as it builds — cheap, readable, and period-correct.
      this.view.alpha = 0.45 + this.buildProgress * 0.55;
      this.bodySprite.scale.set(1, 0.35 + this.buildProgress * 0.65);
    } else if (this.bodySprite.scale.y !== 1) {
      this.view.alpha = 1;
      this.bodySprite.scale.set(1, 1);
    }
  }

  /** All tiles this structure occupies. */
  *footprint(): Generator<{ x: number; y: number }> {
    for (let y = this.gy; y < this.gy + this.fh; y++) {
      for (let x = this.gx; x < this.gx + this.fw; x++) yield { x, y };
    }
  }
}
