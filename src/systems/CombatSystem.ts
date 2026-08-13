/**
 * Weapon resolution: hitscan, beams, ballistic shells, homing missiles and
 * area detonations, plus the accuracy model and splash falloff.
 */
import type { SimEntity } from '../entities/SimEntity';
import { DamageType, type WeaponDef } from '../data/types';
import type { World } from './World';
import type { TeamId } from '../core/Config';
import { clamp, dist } from '../core/MathUtils';

export class CombatSystem {
  constructor(private readonly world: World) {}

  /**
   * Fire one shot. `slot` selects the muzzle offset so a hull machine gun and a
   * turret cannon don't emit their flashes from the same pixel.
   */
  fire(shooter: SimEntity, weapon: WeaponDef, target: SimEntity, slot: number): void {
    const world = this.world;
    const sx = shooter.centreX;
    const sy = shooter.centreY;
    const sz = shooter.z + shooter.groundElevation + (shooter.isStructure ? 0.6 : 0.35);

    const tx = target.centreX;
    const ty = target.centreY;
    const tz = target.z + target.groundElevation + 0.3;

    world.camera.reportAction(sx, sy, 0.6);

    const angle = Math.atan2((tx + ty) - (sx + sy), (tx - ty) - (sx - sy));
    if (weapon.muzzleLength) {
      world.effects.spawnMuzzleFlash(sx, sy, sz, angle, weapon.muzzleLength > 12);
    }

    switch (weapon.projectile) {
      case 'hitscan': {
        const hit = this.rollAccuracy(weapon, dist(sx, sy, tx, ty));
        world.effects.spawnTracer(sx, sy, sz, tx, ty, tz, (weapon.muzzleLength ?? 0) > 10);
        if (hit) {
          target.takeDamage(weapon.damage, weapon.damageType, world, shooter);
          if (weapon.splash) {
            this.applySplash(tx, ty, weapon.splash, weapon.damage * 0.5, weapon.damageType, shooter.team, shooter);
          }
          world.effects.spawnImpactSpark(tx, ty, tz);
        }
        break;
      }

      case 'beam': {
        const kind = weapon.damageType === DamageType.EMP ? 'emp'
          : weapon.damage > 200 ? 'rail' : 'laser';
        world.effects.spawnBeam(sx, sy, sz, tx, ty, tz, kind);
        target.takeDamage(weapon.damage, weapon.damageType, world, shooter);
        if (weapon.splash) {
          this.applySplash(tx, ty, weapon.splash, weapon.damage * 0.6, weapon.damageType, shooter.team, shooter);
        }
        world.effects.spawnImpactSpark(tx, ty, tz);
        break;
      }

      case 'shell':
      case 'rocket':
      case 'missile':
      case 'bomb': {
        const spread = this.spreadFor(weapon, dist(sx, sy, tx, ty));
        const aimX = tx + world.rng.range(-spread, spread);
        const aimY = ty + world.rng.range(-spread, spread);

        const fx = world.sprites.effects;
        const texture = weapon.projectile === 'shell' ? fx.shell
          : weapon.projectile === 'rocket' ? fx.rocket
          : weapon.projectile === 'bomb' ? fx.bomb
          : fx.missile;

        const motion = weapon.arcing ? 'arcing'
          : weapon.projectile === 'missile' ? 'homing'
          : weapon.projectile === 'bomb' ? 'falling'
          : 'direct';

        world.projectiles.launch({
          texture,
          motion,
          fromX: sx, fromY: sy, fromZ: sz,
          toX: aimX, toY: aimY,
          // Arcing and dropped ordnance land on a point; direct fire tracks the unit.
          target: motion === 'arcing' || motion === 'falling' ? null : target,
          speed: weapon.speed ?? 16,
          damage: weapon.damage,
          damageType: weapon.damageType,
          splash: weapon.splash ?? 0,
          team: shooter.team,
          owner: shooter,
          trail: weapon.projectile === 'rocket' || weapon.projectile === 'missile',
        });
        break;
      }

      case 'none':
      default:
        // Contact weapons: demolition charges, mines, EMP bursts.
        this.detonate(shooter, weapon, tx, ty);
        break;
    }

    void slot;
  }

  /** Immediate area detonation at a point, used by mines and one-shot units. */
  detonate(source: SimEntity, weapon: WeaponDef, gx: number, gy: number): void {
    const world = this.world;
    const radius = weapon.splash ?? 1;

    this.applySplash(gx, gy, radius, weapon.damage, weapon.damageType, source.team, source);

    if (weapon.damageType === DamageType.EMP) {
      world.effects.spawnEmp(gx, gy, 0.3, radius);
    } else {
      world.effects.spawnExplosion(gx, gy, 0.2, radius);
    }
    world.camera.reportImpact(gx, gy, Math.min(12, radius * 2.4));
    world.camera.reportAction(gx, gy, 2);
    world.scorchGround(gx, gy, radius);
  }

  /**
   * Damage everything hostile inside `radius`, falling off linearly. Friendly
   * fire is deliberately excluded — with two AI agents brawling at this density
   * it produces more confusion than drama.
   */
  applySplash(
    gx: number, gy: number, radius: number, damage: number,
    type: DamageType, team: TeamId, source: SimEntity | null,
  ): void {
    const world = this.world;

    world.unitHash.query(gx, gy, radius, (entity) => {
      if (!entity.alive || entity.team === team) return;
      const d = dist(gx, gy, entity.centreX, entity.centreY);
      const falloff = clamp(1 - d / radius, 0.15, 1);
      entity.takeDamage(damage * falloff, type, world, source);
    });

    for (const structure of world.structuresOf(world.enemyTeam(team))) {
      if (!structure.alive) continue;
      const d = dist(gx, gy, structure.centreX, structure.centreY) - structure.hitRadius;
      if (d > radius) continue;
      const falloff = clamp(1 - Math.max(0, d) / radius, 0.15, 1);
      structure.takeDamage(damage * falloff, type, world, source);
    }
  }

  /**
   * Accuracy degrades with range; at point-blank everything connects. Rolling
   * a miss still draws the tracer, which is most of what sells a firefight.
   */
  private rollAccuracy(weapon: WeaponDef, distance: number): boolean {
    const t = clamp(distance / Math.max(0.001, weapon.range), 0, 1);
    const chance = 1 - (1 - weapon.accuracy) * t * t;
    return this.world.rng.next() < chance;
  }

  /** Aim scatter in tiles for projectile weapons. */
  private spreadFor(weapon: WeaponDef, distance: number): number {
    const t = clamp(distance / Math.max(0.001, weapon.range), 0, 1);
    return (1 - weapon.accuracy) * t * (weapon.arcing ? 3.2 : 1.4);
  }
}
