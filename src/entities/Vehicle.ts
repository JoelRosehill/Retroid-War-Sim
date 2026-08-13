/**
 * Ground vehicles: acceleration, braking and a turning radius.
 *
 * A vehicle only accelerates along its current heading, so it must rotate
 * before it can pursue — that constraint is what makes tanks read as heavy and
 * makes flanking meaningful. Hovercraft override the move class to ignore
 * water.
 */
import { Unit } from './Unit';
import { UnitState } from './SimEntity';
import { MoveClass } from '../pathfinding/NavGrid';
import type { World } from '../systems/World';
import type { TeamId } from '../core/Config';
import type { VehicleDef } from '../data/types';
import type { UnitSprites } from '../render/SpriteLibrary';
import { angleDelta, clamp, dist, turnToward } from '../core/MathUtils';

export class VehicleUnit extends Unit {
  declare readonly def: VehicleDef;
  /** Current forward speed in tiles/second. */
  private speed = 0;
  private dustTimer = 0;
  private crushTimer = 0;

  constructor(def: VehicleDef, team: TeamId, gx: number, gy: number, sprites: UnitSprites) {
    super(def, team, gx, gy, sprites);
    this.facing = Math.PI / 2;
    this.turretFacing = this.facing;
  }

  override get moveClass(): MoveClass {
    return this.def.amphibious ? MoveClass.Amphibious : MoveClass.Ground;
  }
  override get maxSpeed(): number { return this.def.speed; }
  override get hitRadius(): number { return this.def.radius; }
  protected override get turretElevation(): number { return this.def.visual.height + 2; }

  protected override updateMovement(dt: number, world: World): void {
    const waypoint = this.currentWaypoint(world);

    if (!waypoint) {
      // Brake to a stop and hold.
      this.speed = Math.max(0, this.speed - this.def.brake * dt);
      this.advance(dt, world);
      if (this.speed <= 0.01 && this.state === UnitState.Moving) this.state = UnitState.Idle;
      this.maybeRepathToTarget(world);
      return;
    }

    const dx = waypoint.x - this.gx;
    const dy = waypoint.y - this.gy;
    const distance = Math.hypot(dx, dy);
    if (distance < 0.3) {
      this.pathIndex++;
      return;
    }

    // Screen-space heading toward the waypoint.
    const desired = Math.atan2(dx + dy, dx - dy);
    const turn = this.def.turnRate * dt;
    this.facing = turnToward(this.facing, desired, turn);

    // Only accelerate once roughly pointed the right way.
    const alignment = Math.abs(angleDelta(this.facing, desired));
    const terrain = world.map.speedFactorAt(this.gx | 0, this.gy | 0) || 1;
    const targetSpeed = alignment > 1.1 ? this.def.speed * 0.22 : this.def.speed * terrain;

    // Slow down for the final waypoint so the vehicle settles rather than skids.
    const remaining = this.pathIndex >= this.path.length - 1 ? distance : Infinity;
    const brakeSpeed = Math.sqrt(Math.max(0, 2 * this.def.brake * remaining));

    const cap = Math.min(targetSpeed, brakeSpeed);
    this.speed = this.speed < cap
      ? Math.min(cap, this.speed + this.def.accel * dt)
      : Math.max(cap, this.speed - this.def.brake * dt);

    this.advance(dt, world);
    this.state = UnitState.Moving;

    this.dustTimer -= dt;
    if (this.speed > this.def.speed * 0.4 && this.dustTimer <= 0) {
      this.dustTimer = 0.18;
      world.effects.spawnDust(this.gx, this.gy, this.groundElevation);
    }

    if (this.def.crushes) this.crushInfantry(dt, world);
  }

  /** Integrate along the hull's heading and reject illegal tiles. */
  private advance(dt: number, world: World): void {
    if (this.speed <= 0) { this.vx = 0; this.vy = 0; return; }

    // Convert the screen-space heading back into grid deltas.
    const sx = Math.cos(this.facing);
    const sy = Math.sin(this.facing);
    const gxDir = (sx + sy) * 0.5;
    const gyDir = (sy - sx) * 0.5;
    const inv = 1 / (Math.hypot(gxDir, gyDir) || 1);

    this.vx = gxDir * inv * this.speed;
    this.vy = gyDir * inv * this.speed;

    const nx = this.gx + this.vx * dt;
    const ny = this.gy + this.vy * dt;

    if (world.nav.passable(nx | 0, this.gy | 0, this.moveClass)) this.gx = nx;
    else this.speed *= 0.5;
    if (world.nav.passable(this.gx | 0, ny | 0, this.moveClass)) this.gy = ny;
    else this.speed *= 0.5;

    this.gx = clamp(this.gx, 0.5, world.map.size - 1.5);
    this.gy = clamp(this.gy, 0.5, world.map.size - 1.5);
  }

  private currentWaypoint(world: World): { x: number; y: number } | null {
    if (this.pathIndex >= this.path.length) return null;
    const size = world.map.size;
    const idx = this.path[this.pathIndex];
    return { x: (idx % size) + 0.5, y: ((idx / size) | 0) + 0.5 };
  }

  private maybeRepathToTarget(world: World): void {
    if (!this.target || !this.def.weapon) return;
    if (this.inWeaponRange(this.target, this.def.weapon)) return;
    if (this.pathPending || this.repathTimer > 0) return;
    this.repathTimer = 1.3;
    this.moveGoalX = this.target.centreX;
    this.moveGoalY = this.target.centreY;
    this.hasMoveGoal = true;
    this.requestPath(world, 2);
  }

  /** Tracked vehicles kill enemy infantry they roll over. */
  private crushInfantry(dt: number, world: World): void {
    this.crushTimer -= dt;
    if (this.crushTimer > 0 || this.speed < this.def.speed * 0.35) return;
    this.crushTimer = 0.25;

    world.unitHash.query(this.gx, this.gy, this.def.radius + 0.3, (other) => {
      if (other.team === this.team || !other.alive) return;
      if (other.def.kind !== 0 /* Infantry */) return;
      if (dist(this.gx, this.gy, other.gx, other.gy) > this.def.radius + 0.25) return;
      other.takeDamage(9999, 1 /* Explosive */, world, this);
      world.effects.spawnCrush(other.gx, other.gy, other.groundElevation);
    });
  }
}
