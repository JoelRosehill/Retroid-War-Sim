/**
 * Aircraft ignore the ground grid entirely — they steer directly toward their
 * goal on a turn-rate constraint and live on an elevated render layer. Each one
 * projects a semi-transparent shadow onto the terrain directly below, which is
 * what communicates altitude in an isometric view where "higher on screen" is
 * otherwise ambiguous with "further away".
 */
import { Sprite } from 'pixi.js';
import { Unit } from './Unit';
import { UnitState } from './SimEntity';
import { MoveClass } from '../pathfinding/NavGrid';
import type { World } from '../systems/World';
import type { TeamId } from '../core/Config';
import { ELEV_STEP } from '../core/Config';
import type { AircraftDef } from '../data/types';
import type { UnitSprites } from '../render/SpriteLibrary';
import { clamp, damp, dist, turnToward } from '../core/MathUtils';
import { gridToScreen } from '../iso/Iso';

export class AircraftUnit extends Unit {
  declare readonly def: AircraftDef;

  /** Shadow lives in its own layer so it never sorts above ground units. */
  readonly shadowSprite: Sprite | null;
  private rotorSprite: Sprite | null = null;
  private lifetime: number;
  private returning = false;

  constructor(def: AircraftDef, team: TeamId, gx: number, gy: number, sprites: UnitSprites) {
    super(def, team, gx, gy, sprites);
    this.z = def.altitude;
    this.lifetime = def.loiter;

    this.shadowSprite = sprites.airShadow ? new Sprite(sprites.airShadow) : null;
    if (this.shadowSprite) this.shadowSprite.anchor.set(0.5, 0.5);

    if (sprites.rotor) {
      this.rotorSprite = new Sprite(sprites.rotor[0]);
      this.rotorSprite.anchor.set(0.5, 0.5);
      this.view.addChild(this.rotorSprite);
    }
  }

  override get moveClass(): MoveClass { return MoveClass.Air; }
  override get maxSpeed(): number { return this.def.speed; }
  override get isAirborne(): boolean { return true; }
  override get hitRadius(): number { return 0.6; }

  override orderMove(gx: number, gy: number, _world: World): void {
    // No pathfinding: aircraft fly straight lines.
    this.moveGoalX = gx;
    this.moveGoalY = gy;
    this.hasMoveGoal = true;
    this.stanceX = gx;
    this.stanceY = gy;
    this.state = UnitState.Moving;
  }

  protected override updateMovement(dt: number, world: World): void {
    this.lifetime -= dt;
    if (this.lifetime <= 0 && !this.returning) {
      this.returning = true;
      const home = world.homePosition(this.team);
      this.moveGoalX = home.gx;
      this.moveGoalY = home.gy;
      this.hasMoveGoal = true;
    }

    // Chase the target when we have one, otherwise hold the move goal.
    let tx = this.moveGoalX;
    let ty = this.moveGoalY;
    if (this.target && this.target.alive) {
      tx = this.target.centreX;
      ty = this.target.centreY;
    }

    const dx = tx - this.gx;
    const dy = ty - this.gy;
    const distance = Math.hypot(dx, dy);

    if (this.def.oneShot && this.target && distance <= Math.max(0.8, this.def.weapon?.range ?? 1)) {
      this.detonate(world);
      return;
    }

    if (distance > 0.05) {
      const desired = Math.atan2(dx + dy, dx - dy);
      this.facing = turnToward(this.facing, desired, this.def.turnRate * dt);
      this.turretFacing = this.facing;
    }

    // Loitering aircraft orbit rather than hovering on the spot.
    const engagementRange = this.def.weapon?.range ?? 6;
    const orbit = this.target && distance < engagementRange * 0.6 ? 0.45 : 1;

    const sx = Math.cos(this.facing);
    const sy = Math.sin(this.facing);
    const gxDir = (sx + sy) * 0.5;
    const gyDir = (sy - sx) * 0.5;
    const inv = 1 / (Math.hypot(gxDir, gyDir) || 1);

    const speed = this.def.speed * orbit;
    this.vx = gxDir * inv * speed;
    this.vy = gyDir * inv * speed;

    this.gx = clamp(this.gx + this.vx * dt, 0.5, world.map.size - 1.5);
    this.gy = clamp(this.gy + this.vy * dt, 0.5, world.map.size - 1.5);

    // Ease to cruise altitude, and dive a little when attacking a ground target.
    const targetAlt = this.target && !this.target.isAirborne
      ? this.def.altitude * 0.78
      : this.def.altitude;
    this.z = damp(this.z, targetAlt, 1.4, dt);

    if (this.returning && dist(this.gx, this.gy, this.moveGoalX, this.moveGoalY) < 2.5) {
      // Reached home — despawn quietly.
      this.hp = 0;
      this.alive = false;
      world.notifyDestroyed(this, null);
    }
  }

  /** Cruise missiles and orbital strikes deliver their payload and die. */
  private detonate(world: World): void {
    const weapon = this.def.weapon;
    if (weapon) {
      world.combat.detonate(this, weapon, this.gx, this.gy);
    }
    this.hp = 0;
    this.alive = false;
    world.notifyDestroyed(this, null);
  }

  override syncView(): void {
    super.syncView();

    if (this.rotorSprite && this.sprites.rotor) {
      this.rotorSprite.texture = this.sprites.rotor[(this.age * 24) & 1];
      this.rotorSprite.y = -this.def.visual.fuselageWidth * 0.5 - 3;
    }

    if (this.shadowSprite) {
      const ground = gridToScreen(this.gx, this.gy, this.groundElevation);
      this.shadowSprite.position.set(Math.round(ground.x), Math.round(ground.y));
      // Higher altitude means a smaller, fainter shadow.
      const t = clamp(1 - this.z / (this.def.altitude * 2 + 1), 0.25, 1);
      this.shadowSprite.scale.set(0.55 + t * 0.6);
      this.shadowSprite.alpha = 0.28 + t * 0.42;
      this.shadowSprite.visible = this.visible;
    }
  }

  override dispose(): void {
    this.shadowSprite?.removeFromParent();
    this.shadowSprite?.destroy();
    super.dispose();
  }

  /** Screen-space vertical offset used by tracer origins. */
  get screenAltitude(): number {
    return this.z * ELEV_STEP;
  }
}
