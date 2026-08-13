/**
 * Projectiles: shells, rockets, homing missiles and gravity bombs.
 *
 * All instances come from an object pool. During a heavy engagement several
 * hundred are created and destroyed per second, and without pooling the
 * resulting garbage produces visible collection stutter — which is exactly the
 * artefact that ruins a screen recording.
 */
import { Container, Sprite, type Texture } from 'pixi.js';
import { ObjectPool, SwapList, type Poolable } from '../core/ObjectPool';
import { depthKey, gridToScreen } from '../iso/Iso';
import { ELEV_STEP, Layer } from '../core/Config';
import type { TeamId } from '../core/Config';
import type { SimEntity } from '../entities/SimEntity';
import type { DamageType } from '../data/types';
import type { World } from './World';

/** Gravity for arcing trajectories, in elevation units per second squared. */
const GRAVITY = 42;

export type ProjectileMotion = 'direct' | 'arcing' | 'homing' | 'falling';

export class Projectile implements Poolable {
  gx = 0;
  gy = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;

  motion: ProjectileMotion = 'direct';
  damage = 0;
  damageType: DamageType = 0 as DamageType;
  splash = 0;
  team: TeamId = 0;
  owner: SimEntity | null = null;
  target: SimEntity | null = null;
  targetX = 0;
  targetY = 0;
  life = 0;
  trailTimer = 0;
  leavesTrail = false;
  active = false;

  readonly sprite = new Sprite();

  constructor() {
    this.sprite.anchor.set(0.5, 0.5);
    this.sprite.visible = false;
  }

  reset(): void {
    this.owner = null;
    this.target = null;
    this.active = false;
    this.sprite.visible = false;
    this.leavesTrail = false;
  }
}

export interface LaunchSpec {
  texture: Texture;
  motion: ProjectileMotion;
  fromX: number;
  fromY: number;
  fromZ: number;
  toX: number;
  toY: number;
  target: SimEntity | null;
  speed: number;
  damage: number;
  damageType: DamageType;
  splash: number;
  team: TeamId;
  owner: SimEntity | null;
  trail: boolean;
}

export class ProjectileSystem {
  readonly container = new Container();
  private readonly pool: ObjectPool<Projectile>;
  private readonly active = new SwapList<Projectile>();

  constructor(prewarm = 128) {
    this.pool = new ObjectPool<Projectile>(() => new Projectile(), prewarm);
    this.container.sortableChildren = false;
  }

  launch(spec: LaunchSpec): void {
    const p = this.pool.acquire();
    p.active = true;
    p.gx = spec.fromX;
    p.gy = spec.fromY;
    p.z = spec.fromZ;
    p.motion = spec.motion;
    p.damage = spec.damage;
    p.damageType = spec.damageType;
    p.splash = spec.splash;
    p.team = spec.team;
    p.owner = spec.owner;
    p.target = spec.target;
    p.targetX = spec.toX;
    p.targetY = spec.toY;
    p.leavesTrail = spec.trail;
    p.trailTimer = 0;

    const dx = spec.toX - spec.fromX;
    const dy = spec.toY - spec.fromY;
    const distance = Math.hypot(dx, dy) || 0.001;
    const travel = distance / Math.max(0.5, spec.speed);
    p.life = Math.min(14, travel * 2.2 + 0.5);

    const inv = 1 / distance;
    p.vx = dx * inv * spec.speed;
    p.vy = dy * inv * spec.speed;

    if (spec.motion === 'arcing') {
      // Choose the vertical launch velocity that lands the shell on target.
      p.vz = 0.5 * GRAVITY * travel + (0 - spec.fromZ) / travel;
      p.life = travel + 0.2;
    } else if (spec.motion === 'falling') {
      p.vz = 0;
      p.vx *= 0.35;
      p.vy *= 0.35;
    } else {
      p.vz = 0;
    }

    p.sprite.texture = spec.texture;
    p.sprite.visible = true;
    this.container.addChild(p.sprite);
    this.active.add(p);
  }

  update(dt: number, world: World): void {
    const items = this.active.items;
    for (let i = items.length - 1; i >= 0; i--) {
      const p = items[i];
      p.life -= dt;

      switch (p.motion) {
        case 'homing': {
          if (p.target && p.target.alive) {
            const dx = p.target.centreX - p.gx;
            const dy = p.target.centreY - p.gy;
            const d = Math.hypot(dx, dy) || 1;
            const speed = Math.hypot(p.vx, p.vy);
            // Blend the heading toward the target; a hard snap looks robotic.
            p.vx = (p.vx * 0.82 + (dx / d) * speed * 0.18);
            p.vy = (p.vy * 0.82 + (dy / d) * speed * 0.18);
            const norm = speed / (Math.hypot(p.vx, p.vy) || 1);
            p.vx *= norm;
            p.vy *= norm;
            p.z += ((p.target.z ?? 0) - p.z) * Math.min(1, dt * 3);
          }
          break;
        }
        case 'arcing':
          p.vz -= GRAVITY * dt;
          p.z = Math.max(0, p.z + p.vz * dt);
          break;
        case 'falling':
          p.vz -= GRAVITY * 0.55 * dt;
          p.z = Math.max(0, p.z + p.vz * dt);
          break;
        default:
          break;
      }

      p.gx += p.vx * dt;
      p.gy += p.vy * dt;

      if (p.leavesTrail) {
        p.trailTimer -= dt;
        if (p.trailTimer <= 0) {
          p.trailTimer = 0.05;
          world.effects.spawnTrailPuff(p.gx, p.gy, p.z);
        }
      }

      const impact = this.checkImpact(p, world);
      if (impact || p.life <= 0) {
        this.detonate(p, world);
        this.recycle(i);
        continue;
      }

      this.render(p);
    }
  }

  private checkImpact(p: Projectile, world: World): boolean {
    if (p.motion === 'arcing' || p.motion === 'falling') {
      return p.z <= 0.05;
    }

    if (p.target && p.target.alive) {
      const dx = p.target.centreX - p.gx;
      const dy = p.target.centreY - p.gy;
      if (dx * dx + dy * dy <= (p.target.hitRadius + 0.35) ** 2) return true;
    } else {
      const dx = p.targetX - p.gx;
      const dy = p.targetY - p.gy;
      if (dx * dx + dy * dy <= 0.36) return true;
    }

    return !world.map.inBounds(p.gx | 0, p.gy | 0);
  }

  private detonate(p: Projectile, world: World): void {
    if (p.splash > 0) {
      world.combat.applySplash(p.gx, p.gy, p.splash, p.damage, p.damageType, p.team, p.owner);
      world.effects.spawnExplosion(p.gx, p.gy, p.z, p.splash);
      world.camera.reportImpact(p.gx, p.gy, Math.min(9, p.splash * 2.2));
    } else if (p.target && p.target.alive) {
      p.target.takeDamage(p.damage, p.damageType, world, p.owner);
      world.effects.spawnImpactSpark(p.gx, p.gy, p.z);
    } else {
      world.effects.spawnImpactSpark(p.gx, p.gy, p.z);
    }
    world.camera.reportAction(p.gx, p.gy, 0.5);
  }

  private render(p: Projectile): void {
    const screen = gridToScreen(p.gx, p.gy, p.z);
    p.sprite.position.set(Math.round(screen.x), Math.round(screen.y));
    p.sprite.rotation = Math.atan2(p.vx + p.vy, p.vx - p.vy);
    p.sprite.zIndex = depthKey(p.gx, p.gy, Layer.Effect);
  }

  private recycle(index: number): void {
    const p = this.active.items[index];
    p.sprite.removeFromParent();
    this.active.removeAt(index);
    this.pool.release(p);
  }

  clear(): void {
    while (this.active.length > 0) this.recycle(this.active.length - 1);
  }

  get liveCount(): number { return this.active.length; }

  /** Screen-space altitude helper shared with the effects layer. */
  static altitudeToScreen(z: number): number {
    return z * ELEV_STEP;
  }
}
