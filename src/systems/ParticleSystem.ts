/**
 * Pooled particles: explosions, smoke, dust, tracers, beams and debris.
 *
 * Everything here is short-lived and high-churn, so like projectiles it is
 * pooled. Tracers and beams are the one place we use sprite rotation instead of
 * pre-baked facings — a three-pixel streak has no silhouette worth preserving.
 */
import { Container, Sprite, type Texture } from 'pixi.js';
import { ObjectPool, SwapList, type Poolable } from '../core/ObjectPool';
import { depthKey, gridToScreen } from '../iso/Iso';
import { Layer } from '../core/Config';
import { RNG } from '../core/RNG';
import type { EffectSprites } from '../render/SpriteLibrary';
import type { SimEntity } from '../entities/SimEntity';

const enum ParticleMode {
  Animated = 0,
  Streak = 1,
  Ballistic = 2,
  Beam = 3,
}

class Particle implements Poolable {
  mode: ParticleMode = ParticleMode.Animated;
  gx = 0;
  gy = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  life = 0;
  maxLife = 0;
  frames: readonly Texture[] | null = null;
  rotation = 0;
  scale = 1;
  fade = true;
  readonly sprite = new Sprite();

  constructor() {
    this.sprite.anchor.set(0.5, 0.5);
  }

  reset(): void {
    this.frames = null;
    this.sprite.visible = false;
    this.sprite.rotation = 0;
    this.sprite.scale.set(1);
    this.sprite.alpha = 1;
  }
}

export class ParticleSystem {
  readonly container = new Container();
  private readonly pool: ObjectPool<Particle>;
  private readonly active = new SwapList<Particle>();
  private readonly rng: RNG;

  constructor(private readonly fx: EffectSprites, seed = 1337, prewarm = 256) {
    this.pool = new ObjectPool<Particle>(() => new Particle(), prewarm);
    this.rng = new RNG(seed);
    this.container.sortableChildren = false;
  }

  private spawn(): Particle {
    const p = this.pool.acquire();
    p.sprite.visible = true;
    p.sprite.alpha = 1;
    p.sprite.rotation = 0;
    p.sprite.scale.set(1);
    p.vx = 0; p.vy = 0; p.vz = 0;
    p.fade = true;
    this.container.addChild(p.sprite);
    this.active.add(p);
    return p;
  }

  /** @param radius splash radius in tiles; selects the explosion size. */
  spawnExplosion(gx: number, gy: number, z: number, radius: number): void {
    const frames = radius >= 3.2 ? this.fx.explosionLarge
      : radius >= 1.4 ? this.fx.explosionMedium
      : this.fx.explosionSmall;

    const p = this.spawn();
    p.mode = ParticleMode.Animated;
    p.frames = frames;
    p.gx = gx; p.gy = gy; p.z = z;
    p.maxLife = p.life = 0.08 * frames.length;
    p.scale = 0.85 + radius * 0.06;
    p.fade = false;

    // Debris fan.
    const chunks = Math.min(10, 2 + Math.round(radius * 2));
    for (let i = 0; i < chunks; i++) {
      const d = this.spawn();
      d.mode = ParticleMode.Ballistic;
      d.frames = [this.rng.pick(this.fx.debris)];
      d.gx = gx; d.gy = gy; d.z = z + 0.2;
      const a = this.rng.range(0, Math.PI * 2);
      const speed = this.rng.range(1.5, 4.5);
      d.vx = Math.cos(a) * speed;
      d.vy = Math.sin(a) * speed;
      d.vz = this.rng.range(3, 9);
      d.maxLife = d.life = this.rng.range(0.5, 1.1);
    }
  }

  spawnImpactSpark(gx: number, gy: number, z: number): void {
    const p = this.spawn();
    p.mode = ParticleMode.Animated;
    p.frames = this.fx.explosionSmall;
    p.gx = gx; p.gy = gy; p.z = z;
    p.maxLife = p.life = 0.05 * this.fx.explosionSmall.length;
    p.scale = 0.45;
    p.fade = false;
  }

  spawnMuzzleFlash(gx: number, gy: number, z: number, angle: number, large: boolean): void {
    const p = this.spawn();
    p.mode = ParticleMode.Animated;
    p.frames = large ? this.fx.muzzleLarge : this.fx.muzzleSmall;
    p.gx = gx; p.gy = gy; p.z = z;
    p.rotation = angle;
    p.maxLife = p.life = 0.035 * p.frames.length;
    p.scale = 1;
    p.fade = false;
    p.sprite.anchor.set(0.1, 0.5);
  }

  /** Instant-hit visual: a streak drawn between shooter and victim. */
  spawnTracer(
    fromX: number, fromY: number, fromZ: number,
    toX: number, toY: number, toZ: number, heavy: boolean,
  ): void {
    const a = gridToScreen(fromX, fromY, fromZ);
    const b = gridToScreen(toX, toY, toZ);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 1) return;

    const p = this.spawn();
    p.mode = ParticleMode.Streak;
    p.frames = [heavy ? this.fx.tracerHeavy : this.fx.tracer];
    p.gx = (fromX + toX) / 2;
    p.gy = (fromY + toY) / 2;
    p.z = (fromZ + toZ) / 2;
    p.rotation = Math.atan2(dy, dx);
    p.scale = length / (heavy ? 15 : 9);
    p.maxLife = p.life = 0.07;
  }

  spawnBeam(
    fromX: number, fromY: number, fromZ: number,
    toX: number, toY: number, toZ: number,
    kind: 'laser' | 'rail' | 'emp',
  ): void {
    const a = gridToScreen(fromX, fromY, fromZ);
    const b = gridToScreen(toX, toY, toZ);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 1) return;

    const p = this.spawn();
    p.mode = ParticleMode.Beam;
    p.frames = [
      kind === 'laser' ? this.fx.beamLaser : kind === 'rail' ? this.fx.beamRail : this.fx.beamEmp,
    ];
    p.gx = (fromX + toX) / 2;
    p.gy = (fromY + toY) / 2;
    p.z = (fromZ + toZ) / 2;
    p.rotation = Math.atan2(dy, dx);
    p.scale = length / 8;
    p.maxLife = p.life = kind === 'rail' ? 0.22 : 0.13;
  }

  spawnSmoke(gx: number, gy: number, z: number, scale = 1): void {
    const p = this.spawn();
    p.mode = ParticleMode.Animated;
    p.frames = this.fx.smoke;
    p.gx = gx; p.gy = gy; p.z = z;
    p.vz = 0.9;
    p.maxLife = p.life = 0.13 * this.fx.smoke.length;
    p.scale = scale;
    p.fade = false;
  }

  spawnTrailPuff(gx: number, gy: number, z: number): void {
    const p = this.spawn();
    p.mode = ParticleMode.Animated;
    p.frames = this.fx.smoke;
    p.gx = gx; p.gy = gy; p.z = z;
    p.maxLife = p.life = 0.28;
    p.scale = 0.35;
    p.fade = true;
  }

  spawnDust(gx: number, gy: number, z: number): void {
    const p = this.spawn();
    p.mode = ParticleMode.Animated;
    p.frames = this.fx.dust;
    p.gx = gx + this.rng.range(-0.2, 0.2);
    p.gy = gy + this.rng.range(-0.2, 0.2);
    p.z = z;
    p.maxLife = p.life = 0.4;
    p.scale = 1;
    p.fade = true;
  }

  spawnEmp(gx: number, gy: number, z: number, radius: number): void {
    const p = this.spawn();
    p.mode = ParticleMode.Animated;
    p.frames = this.fx.emp;
    p.gx = gx; p.gy = gy; p.z = z;
    p.maxLife = p.life = 0.09 * this.fx.emp.length;
    p.scale = radius / 4;
    p.fade = false;
  }

  spawnRepairSpark(entity: SimEntity): void {
    const p = this.spawn();
    p.mode = ParticleMode.Ballistic;
    p.frames = [this.fx.dot];
    p.gx = entity.centreX + this.rng.range(-0.3, 0.3);
    p.gy = entity.centreY + this.rng.range(-0.3, 0.3);
    p.z = entity.z + 0.4;
    p.vz = 1.6;
    p.maxLife = p.life = 0.45;
    p.scale = 2;
    p.sprite.tint = 0x7fe08a;
  }

  spawnCrush(gx: number, gy: number, z: number): void {
    for (let i = 0; i < 4; i++) {
      const p = this.spawn();
      p.mode = ParticleMode.Ballistic;
      p.frames = [this.fx.dot];
      p.gx = gx; p.gy = gy; p.z = z + 0.2;
      const a = this.rng.range(0, Math.PI * 2);
      p.vx = Math.cos(a) * 1.4;
      p.vy = Math.sin(a) * 1.4;
      p.vz = this.rng.range(1, 3);
      p.maxLife = p.life = 0.5;
      p.scale = 2;
      p.sprite.tint = 0x6b1f1f;
    }
  }

  /** Persistent smoke column for a burning wreck. */
  spawnWreckSmoke(gx: number, gy: number, z: number): void {
    const p = this.spawn();
    p.mode = ParticleMode.Animated;
    p.frames = this.fx.smoke;
    p.gx = gx + this.rng.range(-0.25, 0.25);
    p.gy = gy + this.rng.range(-0.25, 0.25);
    p.z = z;
    p.vz = 1.2;
    p.maxLife = p.life = 1.1;
    p.scale = 0.8;
    p.fade = true;
  }

  update(dt: number): void {
    const items = this.active.items;
    for (let i = items.length - 1; i >= 0; i--) {
      const p = items[i];
      p.life -= dt;
      if (p.life <= 0 || !p.frames) {
        this.recycle(i);
        continue;
      }

      if (p.mode === ParticleMode.Ballistic) {
        p.vz -= 26 * dt;
        p.gx += p.vx * dt;
        p.gy += p.vy * dt;
        p.z = Math.max(0, p.z + p.vz * dt);
      } else if (p.vz !== 0) {
        p.z += p.vz * dt;
      }

      const t = 1 - p.life / p.maxLife;
      const frameIdx = Math.min(p.frames.length - 1, Math.floor(t * p.frames.length));
      p.sprite.texture = p.frames[frameIdx];

      const screen = gridToScreen(p.gx, p.gy, p.z);
      p.sprite.position.set(Math.round(screen.x), Math.round(screen.y));
      p.sprite.rotation = p.rotation;
      p.sprite.zIndex = depthKey(p.gx, p.gy, Layer.Effect);

      if (p.mode === ParticleMode.Streak || p.mode === ParticleMode.Beam) {
        p.sprite.scale.set(p.scale, 1);
      } else {
        p.sprite.scale.set(p.scale);
      }
      p.sprite.alpha = p.fade ? Math.max(0, 1 - t) : 1;
    }
  }

  private recycle(index: number): void {
    const p = this.active.items[index];
    p.sprite.removeFromParent();
    p.sprite.tint = 0xffffff;
    p.sprite.anchor.set(0.5, 0.5);
    this.active.removeAt(index);
    this.pool.release(p);
  }

  clear(): void {
    while (this.active.length > 0) this.recycle(this.active.length - 1);
  }

  get liveCount(): number { return this.active.length; }
}
