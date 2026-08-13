/**
 * Root of the entity hierarchy.
 *
 * Every simulated object — infantry, vehicle, aircraft, building, defence —
 * inherits spatial data, team ownership and a health pool from here. Rendering
 * state lives alongside the simulation state rather than in a parallel
 * structure, because the depth sorter needs both every frame and splitting them
 * costs a pointer chase per sprite per frame.
 */
import { Container, Sprite } from 'pixi.js';
import type { TeamId } from '../core/Config';
import { Layer } from '../core/Config';
import { depthKey, gridToScreen } from '../iso/Iso';
import { damageMultiplier, type DamageType, type EntityDef } from '../data/types';
import type { World } from '../systems/World';

export const enum UnitState {
  Idle = 0,
  Moving = 1,
  Attacking = 2,
  Repairing = 3,
  Constructing = 4,
  Dying = 5,
  Dead = 6,
}

let nextEntityId = 1;

export abstract class SimEntity {
  readonly id: number;
  readonly def: EntityDef;
  readonly team: TeamId;

  /** Grid position. Fractional for units, integral (north-west corner) for structures. */
  gx: number;
  gy: number;
  /** Altitude in elevation units above the terrain. Zero for everything grounded. */
  z = 0;

  hp: number;
  readonly maxHp: number;
  alive = true;
  state: UnitState = UnitState.Idle;

  /** Screen-space heading in radians; drives which of the 8 facings is drawn. */
  facing = 0;

  /** Seconds until the primary and secondary weapons may fire again. */
  cooldown = 0;
  cooldown2 = 0;

  /** Current acquisition target. Cleared automatically when it dies. */
  target: SimEntity | null = null;

  /** Seconds of EMP lockout remaining; zero means fully operational. */
  disabledFor = 0;

  /** Root display object; positioned by `syncView`. */
  readonly view: Container;
  protected readonly bodySprite: Sprite;
  depth = 0;
  visible = true;

  /** Elevation of the tile beneath the entity, cached for rendering. */
  groundElevation = 0;

  /** Seconds since spawn, used for animation phase and grace periods. */
  age = 0;

  constructor(def: EntityDef, team: TeamId, gx: number, gy: number) {
    this.id = nextEntityId++;
    this.def = def;
    this.team = team;
    this.gx = gx;
    this.gy = gy;
    this.maxHp = def.hp;
    this.hp = def.hp;

    this.view = new Container();
    this.bodySprite = new Sprite();
    this.view.addChild(this.bodySprite);
  }

  /** Centre of the entity in grid space — structures return their footprint centre. */
  get centreX(): number { return this.gx; }
  get centreY(): number { return this.gy; }

  /** Radius used for hit tests and splash falloff, in tiles. */
  get hitRadius(): number { return 0.5; }

  get isAirborne(): boolean { return false; }
  get isStructure(): boolean { return false; }

  abstract update(dt: number, world: World): void;

  /**
   * Apply damage after armour-class multipliers.
   * @returns the damage actually dealt.
   */
  takeDamage(amount: number, type: DamageType, world: World, source: SimEntity | null): number {
    if (!this.alive || this.state === UnitState.Dying) return 0;

    const dealt = amount * damageMultiplier(type, this.def.armor);
    this.hp -= dealt;

    // EMP suppresses rather than destroys: vehicles and aircraft stall out.
    if (type === 5 /* DamageType.EMP */) {
      this.disabledFor = Math.max(this.disabledFor, 3.5);
    }

    // Retaliate if idle and the attacker is reachable.
    if (source && source.alive && this.target === null && !this.isStructure) {
      this.target = source;
    }

    if (this.hp <= 0) {
      this.hp = 0;
      this.onDestroyed(world, source);
    }
    return dealt;
  }

  heal(amount: number): void {
    if (!this.alive) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  /** Called once when hp reaches zero. Subclasses add wreckage and effects. */
  protected onDestroyed(world: World, killer: SimEntity | null): void {
    this.state = UnitState.Dying;
    this.alive = false;
    world.notifyDestroyed(this, killer);
  }

  /** Position the display object for the current camera frame. */
  syncView(): void {
    const p = gridToScreen(this.gx, this.gy, this.groundElevation + this.z);
    this.view.position.set(Math.round(p.x), Math.round(p.y));
    this.depth = depthKey(this.gx, this.gy, this.isAirborne ? Layer.Air : Layer.Entity, this.z * 4);
  }

  /** Clear cross-references so a dead entity can be collected. */
  dispose(): void {
    this.target = null;
    this.view.removeFromParent();
    this.view.destroy({ children: true });
  }

  /** 0-1 health fraction, for HUD bars and AI evaluation. */
  get healthFraction(): number {
    return this.maxHp > 0 ? this.hp / this.maxHp : 0;
  }

  get isDisabled(): boolean {
    return this.disabledFor > 0;
  }
}
