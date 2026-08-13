/**
 * Bakes every texture the sim needs, once, at boot.
 *
 * Generation is chunked and yields to the event loop so the boot bar animates
 * instead of the tab locking up. Roughly 1,300 small canvases are produced;
 * after this point the renderer only ever swaps texture references, never
 * rasterizes.
 */
import { Texture } from 'pixi.js';
import { PixelCanvas } from './PixelCanvas';
import { teamRamp, type Ramp } from './Palette';
import { RNG } from '../core/RNG';
import { TEAMS } from '../core/Config';
import { Biome, DecalKind, PropKind } from '../map/BiomeTypes';
import { drawCliff, drawDecal, drawProp, drawTileTop } from './sprites/terrain';
import {
  AIRCRAFT_CANVAS, VEHICLE_CANVAS, buildFacings, drawAircraft, drawAirShadow,
  drawInfantry, drawRotor, drawTurret, drawVehicleHull,
} from './sprites/units';
import { drawBarbedWire, drawStructure } from './sprites/structures';
import {
  drawBeam, drawDebris, drawDot, drawDustFrames, drawEmpFrames, drawExplosionFrames,
  drawMuzzleFlash, drawProjectile, drawShockRing, drawSmokeFrames, drawTracer,
} from './sprites/effects';
import { ALL_DEFS, DEFENSES } from '../data/registry';
import { EntityKind, isAircraft, isDefense, isInfantry, isVehicle, type EntityDef } from '../data/types';
import { Colors } from './Palette';

/** Textures indexed by [facing][frame], with a pixel-space pivot. */
export interface SpriteSet {
  readonly textures: readonly (readonly Texture[])[];
  readonly pivotX: number;
  readonly pivotY: number;
}

export interface UnitSprites {
  /** Body / hull, per team. */
  readonly body: readonly SpriteSet[];
  /** Rotating turret, per team; empty when the chassis has none. */
  readonly turret: readonly SpriteSet[] | null;
  /** Helicopter rotor discs; shared across teams. */
  readonly rotor: readonly Texture[] | null;
  /** Ground shadow for airborne units. */
  readonly airShadow: Texture | null;
}

export interface EffectSprites {
  explosionSmall: Texture[];
  explosionMedium: Texture[];
  explosionLarge: Texture[];
  muzzleSmall: Texture[];
  muzzleLarge: Texture[];
  smoke: Texture[];
  dust: Texture[];
  emp: Texture[];
  tracer: Texture;
  tracerHeavy: Texture;
  beamLaser: Texture;
  beamRail: Texture;
  beamEmp: Texture;
  shell: Texture;
  rocket: Texture;
  missile: Texture;
  bomb: Texture;
  debris: Texture[];
  shockRing: Texture;
  dot: Texture;
}

/** The `frame` field of a walk cycle maps into three unique poses. */
export const WALK_CYCLE: readonly number[] = [0, 1, 0, 2];

export type ProgressFn = (done: number, total: number, label: string) => void;

const YIELD_EVERY = 24;

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export class SpriteLibrary {
  /** [biome][variant] */
  terrain: Texture[][] = [];
  /** [biome][heightIndex] where heightIndex 0 is a one-step cliff. */
  cliffs: Texture[][] = [];
  /** [DecalKind][variant] */
  decals: Texture[][] = [];
  /** [PropKind][variant] */
  props: Texture[][] = [];
  /** Prop pivots, parallel to `props`. */
  propPivots: { x: number; y: number }[][] = [];

  units = new Map<string, UnitSprites>();
  effects!: EffectSprites;

  private readonly teamRamps: Ramp[] = TEAMS.map((t) => teamRamp(t.primary, t.secondary));

  static async bake(seed: number, onProgress: ProgressFn): Promise<SpriteLibrary> {
    const lib = new SpriteLibrary();
    await lib.run(seed, onProgress);
    return lib;
  }

  private async run(seed: number, onProgress: ProgressFn): Promise<void> {
    const rng = new RNG(seed);
    let done = 0;
    const total = this.estimateWork();
    let sinceYield = 0;

    const tick = async (label: string): Promise<void> => {
      done++;
      sinceYield++;
      if (sinceYield >= YIELD_EVERY) {
        sinceYield = 0;
        onProgress(done, total, label);
        await nextFrame();
      }
    };

    // --- Terrain ---------------------------------------------------------
    const biomes = [
      Biome.Water, Biome.Sand, Biome.Grass, Biome.Plains,
      Biome.Forest, Biome.Mud, Biome.Rock, Biome.Mountain,
    ];
    for (const biome of biomes) {
      const variants: Texture[] = [];
      for (let v = 0; v < 4; v++) {
        variants.push(drawTileTop(biome, rng.fork(biome * 31 + v), v).toTexture());
        await tick('terrain');
      }
      this.terrain[biome] = variants;

      const cliffSet: Texture[] = [];
      for (let h = 1; h <= 3; h++) {
        cliffSet.push(drawCliff(biome, h, rng.fork(biome * 97 + h)).toTexture());
        await tick('cliffs');
      }
      this.cliffs[biome] = cliffSet;
    }

    // --- Decals ----------------------------------------------------------
    for (const kind of [DecalKind.Crater, DecalKind.MudTrack, DecalKind.Scorch, DecalKind.Rubble]) {
      const variants: Texture[] = [];
      for (let v = 0; v < 3; v++) {
        variants.push(drawDecal(kind, rng.fork(kind * 17 + v)).toTexture());
        await tick('decals');
      }
      this.decals[kind] = variants;
    }

    // --- Props -----------------------------------------------------------
    const propKinds = [
      PropKind.Pine, PropKind.DeadTree, PropKind.Boulder,
      PropKind.RockCluster, PropKind.Bush, PropKind.Stump,
    ];
    for (const kind of propKinds) {
      const variants: Texture[] = [];
      const pivots: { x: number; y: number }[] = [];
      for (let v = 0; v < 3; v++) {
        const canvas = drawProp(kind, rng.fork(kind * 53 + v));
        variants.push(canvas.toTexture());
        pivots.push({ x: canvas.width / 2, y: canvas.height - 2 });
        await tick('props');
      }
      this.props[kind] = variants;
      this.propPivots[kind] = pivots;
    }

    // --- Entities --------------------------------------------------------
    for (const def of ALL_DEFS) {
      await this.bakeEntity(def, rng, tick);
    }

    // --- Effects ---------------------------------------------------------
    this.effects = {
      explosionSmall: drawExplosionFrames(10, 8, rng.fork(1)).map((c) => c.toTexture()),
      explosionMedium: drawExplosionFrames(20, 9, rng.fork(2)).map((c) => c.toTexture()),
      explosionLarge: drawExplosionFrames(38, 10, rng.fork(3)).map((c) => c.toTexture()),
      muzzleSmall: drawMuzzleFlash(9, 3).map((c) => c.toTexture()),
      muzzleLarge: drawMuzzleFlash(18, 4).map((c) => c.toTexture()),
      smoke: drawSmokeFrames(14, 7, rng.fork(4)).map((c) => c.toTexture()),
      dust: drawDustFrames(5, rng.fork(5)).map((c) => c.toTexture()),
      emp: drawEmpFrames(34, 7).map((c) => c.toTexture()),
      tracer: drawTracer(9, 0xffb845, 0xfff3c8).toTexture(),
      tracerHeavy: drawTracer(15, 0xff8a3a, 0xfff3c8).toTexture(),
      beamLaser: drawBeam(2, Colors.laser, Colors.laserGlow).toTexture(),
      beamRail: drawBeam(3, Colors.railCore, Colors.railGlow).toTexture(),
      beamEmp: drawBeam(2, Colors.empCore, Colors.emp).toTexture(),
      shell: drawProjectile('shell', 0xffd070).toTexture(),
      rocket: drawProjectile('rocket', 0xffffff).toTexture(),
      missile: drawProjectile('missile', 0xffffff).toTexture(),
      bomb: drawProjectile('bomb', 0xffffff).toTexture(),
      debris: [0, 1, 2, 3].map((i) => drawDebris(rng.fork(600 + i)).toTexture()),
      shockRing: drawShockRing(26).toTexture(),
      dot: drawDot().toTexture(),
    };
    await tick('effects');

    onProgress(total, total, 'ready');
  }

  private async bakeEntity(
    def: EntityDef, rng: RNG, tick: (label: string) => Promise<void>,
  ): Promise<void> {
    const seedBase = hashString(def.id);

    if (isInfantry(def)) {
      const body: SpriteSet[] = [];
      for (let team = 0; team < 2; team++) {
        const ramp = this.teamRamps[team];
        const facingFrames: Texture[][] = [];
        const canvases = buildFacings((facing) =>
          drawInfantry(def.visual, ramp, facing, 0, rng.fork(seedBase + facing)),
        );
        // Frames 1 and 2 are the two stride poses; frame 0 is the neutral pose.
        const strideA = buildFacings((facing) =>
          drawInfantry(def.visual, ramp, facing, 1, rng.fork(seedBase + facing)),
        );
        const strideB = buildFacings((facing) =>
          drawInfantry(def.visual, ramp, facing, 3, rng.fork(seedBase + facing)),
        );
        for (let f = 0; f < 8; f++) {
          facingFrames.push([
            canvases[f].toTexture(),
            strideA[f].toTexture(),
            strideB[f].toTexture(),
          ]);
        }
        body.push({
          textures: facingFrames,
          pivotX: canvases[0].width / 2,
          pivotY: def.visual.height + 1,
        });
        await tick(def.name);
      }
      this.units.set(def.id, { body, turret: null, rotor: null, airShadow: null });
      return;
    }

    if (isVehicle(def)) {
      const body: SpriteSet[] = [];
      const turret: SpriteSet[] = [];
      for (let team = 0; team < 2; team++) {
        const ramp = this.teamRamps[team];
        const hulls = buildFacings((facing) =>
          drawVehicleHull(def.visual, ramp, facing, rng.fork(seedBase + facing * 7)),
        );
        body.push({
          textures: hulls.map((c) => [c.toTexture()]),
          pivotX: VEHICLE_CANVAS.w / 2,
          pivotY: VEHICLE_CANVAS.h - 6,
        });

        if (def.visual.turret) {
          const turrets = buildFacings((facing) => drawTurret(def.visual, ramp, facing));
          turret.push({
            textures: turrets.map((c) => [c.toTexture()]),
            pivotX: 20,
            pivotY: 16,
          });
        }
        await tick(def.name);
      }
      this.units.set(def.id, {
        body,
        turret: turret.length ? turret : null,
        rotor: null,
        airShadow: null,
      });
      return;
    }

    if (isAircraft(def)) {
      const body: SpriteSet[] = [];
      for (let team = 0; team < 2; team++) {
        const ramp = this.teamRamps[team];
        const frames = buildFacings((facing) => drawAircraft(def.visual, ramp, facing));
        body.push({
          textures: frames.map((c) => [c.toTexture()]),
          pivotX: AIRCRAFT_CANVAS.w / 2,
          pivotY: AIRCRAFT_CANVAS.h / 2,
        });
        await tick(def.name);
      }
      const rotor = def.rotorRadius > 0
        ? [0, 1].map((f) => drawRotor(def.rotorRadius, f).toTexture())
        : null;
      const shadowWidth = Math.max(10, def.visual.wingSpan || def.visual.fuselageLength);
      this.units.set(def.id, {
        body,
        turret: null,
        rotor,
        airShadow: drawAirShadow(shadowWidth).toTexture(),
      });
      return;
    }

    // Buildings and stationary defences.
    const body: SpriteSet[] = [];
    const turret: SpriteSet[] = [];
    for (let team = 0; team < 2; team++) {
      const ramp = this.teamRamps[team];

      // Barbed wire is a fence, not a building — it gets its own silhouette
      // rather than the generic extruded box.
      const sprite = def.id === 'barbedWire'
        ? wireSprite(drawBarbedWire(rng.fork(seedBase + team)))
        : drawStructure(def.visual, ramp, rng.fork(seedBase + team));

      body.push({
        textures: [[sprite.canvas.toTexture()]],
        pivotX: sprite.anchorX,
        pivotY: sprite.anchorY,
      });

      if (isDefense(def) && def.turret) {
        const turrets = buildFacings((facing) =>
          drawTurret({ ...emptyVehicleVisual, turret: def.turret! }, ramp, facing),
        );
        turret.push({ textures: turrets.map((c) => [c.toTexture()]), pivotX: 20, pivotY: 16 });
      }
      await tick(def.name);
    }
    this.units.set(def.id, {
      body,
      turret: turret.length ? turret : null,
      rotor: null,
      airShadow: null,
    });
  }

  private estimateWork(): number {
    let n = 8 * 4 + 8 * 3 + 4 * 3 + 6 * 3 + 2 + 1;
    n += ALL_DEFS.length * 2;
    return n;
  }

  spritesFor(id: string): UnitSprites {
    const set = this.units.get(id);
    if (!set) throw new Error(`No sprites baked for "${id}"`);
    return set;
  }
}

/** Wrap a bare canvas in the structure-sprite shape, anchored at its base. */
function wireSprite(canvas: PixelCanvas): { canvas: PixelCanvas; anchorX: number; anchorY: number } {
  return { canvas, anchorX: canvas.width / 2, anchorY: canvas.height - 6 };
}

/** Minimal stand-in so defence turrets can reuse the vehicle turret renderer. */
const emptyVehicleVisual = {
  length: 0, width: 0, height: 0,
  locomotion: 'tread' as const,
  turret: null,
};

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Convenience for callers that only need the count of defence types. */
export const DEFENSE_COUNT = DEFENSES.length;
export const KIND_LABEL: Record<EntityKind, string> = {
  [EntityKind.Infantry]: 'INF',
  [EntityKind.Vehicle]: 'VEH',
  [EntityKind.Aircraft]: 'AIR',
  [EntityKind.Building]: 'BLD',
  [EntityKind.Defense]: 'DEF',
};

export { PixelCanvas };
