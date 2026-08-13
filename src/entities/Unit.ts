/**
 * Shared behaviour for everything that moves: path following, target
 * acquisition and weapon servicing. Concrete movement physics differ per
 * category and are supplied by the subclasses.
 */
import { Sprite } from 'pixi.js';
import { SimEntity, UnitState } from './SimEntity';
import type { World } from '../systems/World';
import type { TeamId } from '../core/Config';
import { MoveClass } from '../pathfinding/NavGrid';
import { headingToFacing8, dist, dist2 } from '../core/MathUtils';
import { TargetMask, type EntityDef, type WeaponDef } from '../data/types';
import type { UnitSprites } from '../render/SpriteLibrary';
import { WALK_CYCLE } from '../render/SpriteLibrary';

/** How long a unit will chase before giving up and returning to its order. */
const CHASE_GIVEUP = 9;
const REPATH_INTERVAL = 1.4;

export abstract class Unit extends SimEntity {
  /** Waypoints as flat tile indices, produced by the path service. */
  protected path: Int32Array = new Int32Array(0);
  protected pathIndex = 0;
  protected pathPending = false;

  /** Final destination of the current move order. */
  moveGoalX = 0;
  moveGoalY = 0;
  hasMoveGoal = false;

  /** Set by the AI; the unit re-acquires targets around this point. */
  stanceX = 0;
  stanceY = 0;

  protected repathTimer = 0;
  protected chaseTimer = 0;
  protected walkPhase = 0;

  /** Current velocity in tiles/second. */
  vx = 0;
  vy = 0;

  protected sprites: UnitSprites;
  protected turretSprite: Sprite | null = null;
  protected turretFacing = 0;

  /** Burst-fire bookkeeping for the primary weapon. */
  private burstRemaining = 0;
  private burstTimer = 0;

  constructor(def: EntityDef, team: TeamId, gx: number, gy: number, sprites: UnitSprites) {
    super(def, team, gx, gy);
    this.sprites = sprites;
    this.stanceX = gx;
    this.stanceY = gy;

    const set = sprites.body[team];
    this.bodySprite.texture = set.textures[0][0];
    this.bodySprite.anchor.set(set.pivotX / this.bodySprite.texture.width, set.pivotY / this.bodySprite.texture.height);

    if (sprites.turret) {
      const tset = sprites.turret[team];
      this.turretSprite = new Sprite(tset.textures[0][0]);
      this.turretSprite.anchor.set(
        tset.pivotX / this.turretSprite.texture.width,
        tset.pivotY / this.turretSprite.texture.height,
      );
      this.view.addChild(this.turretSprite);
    }
  }

  abstract get moveClass(): MoveClass;
  abstract get maxSpeed(): number;

  // --- Orders ---------------------------------------------------------------

  orderMove(gx: number, gy: number, world: World, priority = 1): void {
    this.moveGoalX = gx;
    this.moveGoalY = gy;
    this.hasMoveGoal = true;
    this.stanceX = gx;
    this.stanceY = gy;
    this.requestPath(world, priority);
  }

  orderAttack(target: SimEntity, world: World): void {
    this.target = target;
    this.chaseTimer = CHASE_GIVEUP;
    if (!this.inWeaponRange(target, this.def.weapon)) {
      this.orderMove(Math.round(target.centreX), Math.round(target.centreY), world, 2);
    }
  }

  stop(): void {
    this.hasMoveGoal = false;
    this.path = new Int32Array(0);
    this.pathIndex = 0;
    this.vx = 0;
    this.vy = 0;
    if (this.state === UnitState.Moving) this.state = UnitState.Idle;
  }

  protected requestPath(world: World, priority: number): void {
    const sx = Math.round(this.gx);
    const sy = Math.round(this.gy);
    this.pathPending = true;
    world.paths.request({
      requesterId: this.id,
      sx, sy,
      gx: Math.round(this.moveGoalX),
      gy: Math.round(this.moveGoalY),
      moveClass: this.moveClass,
      priority,
      onComplete: (result) => {
        this.pathPending = false;
        if (!this.alive) return;
        this.path = result.waypoints;
        this.pathIndex = 0;
        if (result.found && this.path.length > 0) {
          this.state = UnitState.Moving;
        } else if (!result.found) {
          // Unreachable — hold position rather than grinding the pathfinder.
          this.hasMoveGoal = false;
          this.state = UnitState.Idle;
        }
      },
    });
  }

  // --- Per-tick -------------------------------------------------------------

  override update(dt: number, world: World): void {
    this.age += dt;
    if (this.disabledFor > 0) {
      this.disabledFor -= dt;
      this.vx *= 0.85;
      this.vy *= 0.85;
      return;
    }

    this.cooldown -= dt;
    this.cooldown2 -= dt;
    this.repathTimer -= dt;

    this.updateTargeting(dt, world);
    this.updateMovement(dt, world);
    this.updateWeapons(dt, world);
  }

  /** Drop dead targets and acquire a new one when idle. */
  protected updateTargeting(dt: number, world: World): void {
    if (this.target && !this.target.alive) this.target = null;

    if (this.target) {
      this.chaseTimer -= dt;
      const d2 = dist2(this.gx, this.gy, this.target.centreX, this.target.centreY);
      const sight = this.def.sight;
      if (d2 > sight * sight * 2.2 || this.chaseTimer <= 0) {
        this.target = null;
      }
    }

    if (!this.target && this.def.weapon) {
      const found = world.targeting.findTarget(this, this.def.weapon);
      if (found) {
        this.target = found;
        this.chaseTimer = CHASE_GIVEUP;
      }
    }
  }

  protected abstract updateMovement(dt: number, world: World): void;

  /** Service both weapon slots against the current target. */
  protected updateWeapons(dt: number, world: World): void {
    const target = this.target;
    if (!target || !target.alive) {
      this.burstRemaining = 0;
      return;
    }

    const primary = this.def.weapon;
    if (primary) {
      // Finish the current burst before re-checking range.
      if (this.burstRemaining > 0) {
        this.burstTimer -= dt;
        if (this.burstTimer <= 0) {
          world.combat.fire(this, primary, target, 0);
          this.burstRemaining--;
          this.burstTimer = primary.burstDelay ?? 0.06;
        }
      } else if (this.cooldown <= 0 && this.canEngage(target, primary)) {
        this.faceTarget(target);
        world.combat.fire(this, primary, target, 0);
        this.cooldown = primary.cooldown;
        this.burstRemaining = Math.max(0, (primary.burst ?? 1) - 1);
        this.burstTimer = primary.burstDelay ?? 0.06;
        this.state = UnitState.Attacking;
      }
    }

    const secondary = this.def.weapon2;
    if (secondary && this.cooldown2 <= 0 && this.canEngage(target, secondary)) {
      this.faceTarget(target);
      world.combat.fire(this, secondary, target, 1);
      this.cooldown2 = secondary.cooldown;
    }
  }

  protected canEngage(target: SimEntity, weapon: WeaponDef): boolean {
    if (!weaponCanHit(weapon, target)) return false;
    return this.inWeaponRange(target, weapon);
  }

  inWeaponRange(target: SimEntity | null, weapon: WeaponDef | null): boolean {
    if (!target || !weapon) return false;
    const d = dist(this.gx, this.gy, target.centreX, target.centreY) - target.hitRadius;
    if (d > weapon.range) return false;
    if (weapon.minRange !== undefined && d < weapon.minRange) return false;
    return true;
  }

  protected faceTarget(target: SimEntity): void {
    const a = Math.atan2(
      (target.centreX + target.centreY) - (this.gx + this.gy),
      (target.centreX - target.centreY) - (this.gx - this.gy),
    );
    this.turretFacing = a;
    if (!this.sprites.turret) this.facing = a;
  }

  /** Advance along the current path; returns true while still travelling. */
  protected followPath(dt: number, world: World, speed: number): boolean {
    if (this.pathIndex >= this.path.length) {
      if (this.hasMoveGoal && !this.pathPending && this.repathTimer <= 0) {
        const remaining = dist(this.gx, this.gy, this.moveGoalX, this.moveGoalY);
        if (remaining > 1.5) {
          this.repathTimer = REPATH_INTERVAL;
          this.requestPath(world, 1);
        } else {
          this.hasMoveGoal = false;
        }
      }
      return false;
    }

    const size = world.map.size;
    const nodeIdx = this.path[this.pathIndex];
    const nx = (nodeIdx % size) + 0.5;
    const ny = ((nodeIdx / size) | 0) + 0.5;

    const dx = nx - this.gx;
    const dy = ny - this.gy;
    const d = Math.hypot(dx, dy);

    if (d < 0.22) {
      this.pathIndex++;
      return this.pathIndex < this.path.length;
    }

    const terrain = world.map.speedFactorAt((this.gx) | 0, (this.gy) | 0) || 1;
    const step = speed * terrain * dt;
    const inv = 1 / d;
    this.vx = dx * inv * speed * terrain;
    this.vy = dy * inv * speed * terrain;

    this.gx += dx * inv * Math.min(step, d);
    this.gy += dy * inv * Math.min(step, d);
    this.walkPhase += step;

    // Screen-space heading, not grid heading — sprites are drawn in screen space.
    this.facing = Math.atan2(dx + dy, dx - dy);
    return true;
  }

  /**
   * Push apart from crowded neighbours. Cheap local avoidance keeps formations
   * from stacking into a single tile without touching the pathfinder.
   */
  protected applySeparation(dt: number, world: World, strength: number, radius: number): void {
    let sx = 0, sy = 0, count = 0;
    world.unitHash.query(this.gx, this.gy, radius, (other) => {
      if (other === this || !other.alive) return;
      const dx = this.gx - other.gx;
      const dy = this.gy - other.gy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= 0.0001 || d2 > radius * radius) return;
      const inv = 1 / Math.sqrt(d2);
      sx += dx * inv;
      sy += dy * inv;
      count++;
    });

    if (count === 0) return;
    const inv = 1 / count;
    const push = strength * dt;
    const nx = this.gx + sx * inv * push;
    const ny = this.gy + sy * inv * push;
    if (world.nav.passable(nx | 0, ny | 0, this.moveClass)) {
      this.gx = nx;
      this.gy = ny;
    }
  }

  // --- Rendering ------------------------------------------------------------

  override syncView(): void {
    super.syncView();
    const set = this.sprites.body[this.team];
    const facingIdx = headingToFacing8(this.facing);
    const frames = set.textures[facingIdx];
    const frame = frames.length > 1
      ? frames[WALK_CYCLE[Math.floor(this.walkPhase * 3.2) % WALK_CYCLE.length]]
      : frames[0];
    this.bodySprite.texture = frame;

    if (this.turretSprite && this.sprites.turret) {
      const tset = this.sprites.turret[this.team];
      this.turretSprite.texture = tset.textures[headingToFacing8(this.turretFacing)][0];
      this.turretSprite.y = -this.turretElevation;
    }

    // Flash white-hot briefly after taking a hit, then settle.
    this.view.alpha = this.disabledFor > 0 ? 0.72 + Math.sin(this.age * 22) * 0.12 : 1;
  }

  /** Pixels the turret sits above the hull's pivot. */
  protected get turretElevation(): number { return 6; }
}

/** Does this weapon's target mask allow engaging `target`? */
export function weaponCanHit(weapon: WeaponDef, target: SimEntity): boolean {
  const mask = weapon.targets;
  if (target.isAirborne) return (mask & TargetMask.Air) !== 0;
  if (target.isStructure) return (mask & TargetMask.Structure) !== 0;
  return (mask & TargetMask.Ground) !== 0;
}
