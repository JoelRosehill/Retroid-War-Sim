/**
 * The simulation container: entity storage, per-team indices, the systems that
 * operate on them, and the render layers they draw into.
 *
 * Entities are kept in per-team dense arrays with swap-removal. Every system
 * that needs a proximity query goes through the shared spatial hash, which is
 * rebuilt once per tick rather than maintained incrementally — cheaper at these
 * counts and impossible to desynchronise.
 */
import { Container } from 'pixi.js';
import { Layer, MAP_SIZE, TEAMS, enemyOf, type TeamId } from '../core/Config';
import { RNG } from '../core/RNG';
import { SpatialHash } from '../core/SpatialHash';
import { DepthSorter, type Sortable } from '../iso/DepthSorter';
import { CinematicCamera } from '../iso/CinematicCamera';
import type { GameMap } from '../map/GameMap';
import { DecalKind } from '../map/BiomeTypes';
import { NavGrid } from '../pathfinding/NavGrid';
import { PathService } from '../pathfinding/PathService';
import type { SpriteLibrary } from '../render/SpriteLibrary';
import type { TerrainRenderer } from '../render/TerrainRenderer';
import { SimEntity } from '../entities/SimEntity';
import { Unit } from '../entities/Unit';
import { InfantryUnit } from '../entities/Infantry';
import { VehicleUnit } from '../entities/Vehicle';
import { AircraftUnit } from '../entities/Aircraft';
import { Structure } from '../entities/Structure';
import { EconomySystem } from './EconomySystem';
import { ProductionSystem } from './ProductionSystem';
import { TargetingSystem } from './TargetingSystem';
import { CombatSystem } from './CombatSystem';
import { ProjectileSystem } from './ProjectileSystem';
import { ParticleSystem } from './ParticleSystem';
import {
  EntityKind, isAircraft, isBuilding, isDefense, isInfantry, isVehicle,
  type BuildingDef, type DefenseDef, type EntityDef,
} from '../data/types';
import { dist2 } from '../core/MathUtils';

export interface KillEvent {
  victim: string;
  victimTeam: TeamId;
  killer: string | null;
  killerTeam: TeamId | null;
  at: number;
}

export class World {
  readonly root = new Container();
  readonly shadowLayer = new Container();
  readonly entityLayer = new Container();
  readonly airLayer = new Container();

  readonly nav: NavGrid;
  readonly paths: PathService;
  readonly economy: EconomySystem;
  readonly production: ProductionSystem;
  readonly targeting: TargetingSystem;
  readonly combat: CombatSystem;
  readonly projectiles: ProjectileSystem;
  readonly effects: ParticleSystem;
  readonly camera: CinematicCamera;
  readonly rng: RNG;

  readonly unitHash = new SpatialHash<Unit>(MAP_SIZE, 8);

  private readonly units: [Unit[], Unit[]] = [[], []];
  private readonly structures: [Structure[], Structure[]] = [[], []];
  private readonly sortables: Sortable[] = [];
  private readonly airSortables: Sortable[] = [];

  private readonly entitySorter: DepthSorter;
  private readonly airSorter: DepthSorter;

  private readonly rallies: [{ gx: number; gy: number }, { gx: number; gy: number }];
  private readonly homes: [{ gx: number; gy: number }, { gx: number; gy: number }];
  private readonly tiers: [number, number] = [0, 0];

  readonly killFeed: KillEvent[] = [];
  elapsed = 0;
  winner: TeamId | null = null;

  constructor(
    readonly map: GameMap,
    readonly sprites: SpriteLibrary,
    readonly terrain: TerrainRenderer,
    seed: number,
  ) {
    this.rng = new RNG(seed ^ 0x5bf03635);
    this.nav = new NavGrid(map);
    this.paths = new PathService(this.nav);
    this.camera = new CinematicCamera(this.rng.fork(7), map.size);

    this.economy = new EconomySystem(this);
    this.production = new ProductionSystem(this);
    this.targeting = new TargetingSystem(this);
    this.combat = new CombatSystem(this);
    this.projectiles = new ProjectileSystem();
    this.effects = new ParticleSystem(sprites.effects, seed ^ 0x2545f491);

    const span = map.size * 2 * 1000 + 5000;
    this.entitySorter = new DepthSorter(Layer.Entity * 1_000_000 - 1000, Layer.Entity * 1_000_000 + span, 256);
    this.airSorter = new DepthSorter(Layer.Air * 1_000_000 - 1000, Layer.Air * 1_000_000 + span, 128);

    const a = map.spawns[0] ?? { gx: 8, gy: 8 };
    const b = map.spawns[1] ?? { gx: map.size - 9, gy: map.size - 9 };
    this.homes = [{ ...a }, { ...b }];
    this.rallies = [
      { gx: Math.round((a.gx * 3 + b.gx) / 4), gy: Math.round((a.gy * 3 + b.gy) / 4) },
      { gx: Math.round((b.gx * 3 + a.gx) / 4), gy: Math.round((b.gy * 3 + a.gy) / 4) },
    ];

    this.root.addChild(terrain.container);
    this.root.addChild(this.shadowLayer);
    this.root.addChild(this.entityLayer);
    this.root.addChild(this.airLayer);
    this.root.addChild(this.projectiles.container);
    this.root.addChild(this.effects.container);

    // Tall scenery sorts alongside units so infantry can move behind treelines.
    for (const prop of terrain.props) {
      this.entityLayer.addChild(prop.view);
      this.sortables.push(prop);
    }
  }

  // --- Queries ---------------------------------------------------------------

  unitsOf(team: TeamId): readonly Unit[] { return this.units[team]; }
  structuresOf(team: TeamId): readonly Structure[] { return this.structures[team]; }
  enemyTeam(team: TeamId): TeamId { return enemyOf(team); }
  techTier(team: TeamId): number { return this.tiers[team]; }
  rallyPoint(team: TeamId): { gx: number; gy: number } { return this.rallies[team]; }
  homePosition(team: TeamId): { gx: number; gy: number } { return this.homes[team]; }

  setRallyPoint(team: TeamId, gx: number, gy: number): void {
    this.rallies[team].gx = gx;
    this.rallies[team].gy = gy;
  }

  unitCount(team: TeamId): number { return this.units[team].length; }
  structureCount(team: TeamId): number { return this.structures[team].length; }

  countOf(team: TeamId, defId: string): number {
    let n = 0;
    for (const u of this.units[team]) if (u.def.id === defId) n++;
    for (const s of this.structures[team]) if (s.def.id === defId) n++;
    return n;
  }

  countKind(team: TeamId, kind: EntityKind): number {
    let n = 0;
    for (const u of this.units[team]) if (u.def.kind === kind) n++;
    return n;
  }

  /** Build placement is allowed near any structure with a build radius. */
  withinBuildRadius(team: TeamId, gx: number, gy: number): boolean {
    for (const s of this.structures[team]) {
      const radius = s.asBuilding()?.buildRadius ?? 9;
      if (dist2(gx, gy, s.centreX, s.centreY) <= radius * radius) return true;
    }
    return this.structures[team].length === 0;
  }

  /** Centre of mass of a team's mobile forces, or null when it has none. */
  centreOfMass(team: TeamId): { gx: number; gy: number; count: number } | null {
    const list = this.units[team];
    if (list.length === 0) return null;
    let sx = 0, sy = 0;
    for (const u of list) { sx += u.gx; sy += u.gy; }
    return { gx: sx / list.length, gy: sy / list.length, count: list.length };
  }

  /** Combined centre of mass across both teams, for the camera's idle drift. */
  globalCentreOfMass(): { gx: number; gy: number; count: number } | null {
    let sx = 0, sy = 0, n = 0;
    for (const team of [0, 1] as TeamId[]) {
      for (const u of this.units[team]) { sx += u.gx; sy += u.gy; n++; }
    }
    if (n === 0) return null;
    return { gx: sx / n, gy: sy / n, count: n };
  }

  // --- Spawning --------------------------------------------------------------

  spawnUnit(def: EntityDef, team: TeamId, gx: number, gy: number): Unit | null {
    const sprites = this.sprites.spritesFor(def.id);
    let unit: Unit;

    if (isInfantry(def)) unit = new InfantryUnit(def, team, gx, gy, sprites);
    else if (isVehicle(def)) unit = new VehicleUnit(def, team, gx, gy, sprites);
    else if (isAircraft(def)) unit = new AircraftUnit(def, team, gx, gy, sprites);
    else return null;

    unit.groundElevation = this.map.elevationAt(gx | 0, gy | 0);
    this.units[team].push(unit);

    if (unit.isAirborne) {
      this.airLayer.addChild(unit.view);
      this.airSortables.push(unit);
      const shadow = (unit as AircraftUnit).shadowSprite;
      if (shadow) this.shadowLayer.addChild(shadow);
    } else {
      this.entityLayer.addChild(unit.view);
      this.sortables.push(unit);
    }

    return unit;
  }

  /**
   * @param progress 0 starts a construction site; 1 places it complete.
   * @returns null when the site is illegal.
   *
   * The "never on water" rule is enforced here rather than only in
   * ProductionSystem, so no caller — seeding, a debug helper, or future code —
   * can put a structure on water or mountain by going around the AI's path.
   * Every tile of the footprint must qualify, including its edges.
   */
  spawnStructure(
    def: BuildingDef | DefenseDef, team: TeamId, gx: number, gy: number, progress = 1,
  ): Structure | null {
    if (!this.map.footprintOnBuildableTerrain(gx, gy, def.fw, def.fh)) {
      console.warn(
        `[world] refused ${def.id} at ${gx},${gy}: footprint covers unbuildable terrain`,
      );
      return null;
    }

    const sprites = this.sprites.spritesFor(def.id);
    const structure = new Structure(def, team, gx, gy, sprites);
    structure.buildProgress = progress;
    structure.groundElevation = this.map.elevationAt(gx, gy);
    if (progress < 1) structure.hp = structure.maxHp * 0.25;

    this.structures[team].push(structure);
    this.entityLayer.addChild(structure.view);
    this.sortables.push(structure);

    const passable = isBuilding(def) ? def.passable === true : false;
    if (!isDefense(def) || def.blocks) {
      this.nav.occupy(gx, gy, def.fw, def.fh, structure.id, passable);
    }

    this.refreshTier(team);
    return structure;
  }

  /** Called by entities when their hp reaches zero. */
  notifyDestroyed(entity: SimEntity, killer: SimEntity | null): void {
    this.killFeed.push({
      victim: entity.def.name,
      victimTeam: entity.team,
      killer: killer?.def.name ?? null,
      killerTeam: killer?.team ?? null,
      at: this.elapsed,
    });
    if (this.killFeed.length > 40) this.killFeed.shift();

    const radius = entity.isStructure ? Math.max(2.5, (entity as Structure).fw * 1.2) : 1.1;
    this.effects.spawnExplosion(entity.centreX, entity.centreY, entity.z, radius);
    this.camera.reportImpact(entity.centreX, entity.centreY, entity.isStructure ? 10 : 3);
    this.camera.reportAction(entity.centreX, entity.centreY, entity.isStructure ? 4 : 1.5);

    if (entity.isStructure) {
      const s = entity as Structure;
      this.nav.release(s.gx, s.gy, s.fw, s.fh);
      this.scorchGround(s.centreX, s.centreY, Math.max(1.5, s.fw));
      this.refreshTier(s.team);
    } else {
      this.scorchGround(entity.centreX, entity.centreY, 0.9);
    }
  }

  /** Stamp a scorch decal — battle damage accumulates visibly over a match. */
  scorchGround(gx: number, gy: number, radius: number): void {
    const r = Math.max(0, Math.round(radius));
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = (gx + dx) | 0;
        const y = (gy + dy) | 0;
        if (!this.map.inBounds(x, y)) continue;
        if (dx * dx + dy * dy > r * r) continue;
        if (this.rng.bool(0.35)) this.map.setDecal(x, y, DecalKind.Scorch, this.rng.int(0, 2));
      }
    }
  }

  private refreshTier(team: TeamId): void {
    let tier = 0;
    for (const s of this.structures[team]) {
      if (!s.isOperational) continue;
      const unlock = s.asBuilding()?.unlocksTier;
      if (unlock !== undefined) tier = Math.max(tier, unlock);
    }
    // A command centre alone permits tier 1; labs push it higher.
    if (this.structures[team].some((s) => s.def.id === 'commandCenter' && s.isOperational)) {
      tier = Math.max(tier, 1);
    }
    this.tiers[team] = tier;
  }

  // --- Tick ------------------------------------------------------------------

  update(dt: number): void {
    this.elapsed += dt;

    this.unitHash.rebuild(this.units[0].concat(this.units[1]));

    for (const team of [0, 1] as TeamId[]) {
      const list = this.units[team];
      for (let i = 0; i < list.length; i++) {
        const unit = list[i];
        if (!unit.alive) continue;
        unit.groundElevation = this.map.elevationAt(unit.gx | 0, unit.gy | 0);
        unit.update(dt, this);
      }

      const structures = this.structures[team];
      for (let i = 0; i < structures.length; i++) {
        const s = structures[i];
        if (!s.alive) continue;
        s.update(dt, this);
      }
    }

    this.paths.update();
    this.projectiles.update(dt, this);
    this.effects.update(dt);
    this.economy.update(dt);
    this.production.update(dt);

    this.reap();
    this.checkVictory();
  }

  /** Remove dead entities and their display objects. */
  private reap(): void {
    for (const team of [0, 1] as TeamId[]) {
      const units = this.units[team];
      for (let i = units.length - 1; i >= 0; i--) {
        const unit = units[i];
        if (unit.alive) continue;
        this.paths.cancel(unit.id);
        this.removeSortable(unit);
        unit.dispose();
        units[i] = units[units.length - 1];
        units.pop();
      }

      const structures = this.structures[team];
      for (let i = structures.length - 1; i >= 0; i--) {
        const s = structures[i];
        if (s.alive) continue;
        this.removeSortable(s);
        s.dispose();
        structures[i] = structures[structures.length - 1];
        structures.pop();
      }
    }
  }

  private removeSortable(entity: SimEntity): void {
    const list = entity.isAirborne ? this.airSortables : this.sortables;
    const idx = list.findIndex((s) => s === (entity as unknown as Sortable));
    if (idx >= 0) {
      list[idx] = list[list.length - 1];
      list.pop();
    }
  }

  private checkVictory(): void {
    if (this.winner !== null) return;
    for (const team of [0, 1] as TeamId[]) {
      const hasHq = this.structures[team].some((s) => s.asBuilding()?.isHeadquarters && s.alive);
      const hasAnything = this.structures[team].length > 0 || this.units[team].length > 0;
      if (!hasHq && !hasAnything) {
        this.winner = enemyOf(team);
        return;
      }
    }
  }

  // --- Render ----------------------------------------------------------------

  /** Update sprite transforms and re-sort the depth layers. */
  syncViews(): void {
    const bounds = this.camera.visibleGridBounds(6);
    this.terrain.cull(bounds);

    for (const team of [0, 1] as TeamId[]) {
      for (const unit of this.units[team]) {
        unit.visible =
          unit.gx >= bounds.x0 && unit.gx <= bounds.x1 &&
          unit.gy >= bounds.y0 && unit.gy <= bounds.y1;
        if (unit.visible) unit.syncView();
      }
      for (const s of this.structures[team]) {
        s.visible =
          s.gx + s.fw >= bounds.x0 && s.gx <= bounds.x1 &&
          s.gy + s.fh >= bounds.y0 && s.gy <= bounds.y1;
        if (s.visible) s.syncView();
      }
    }

    this.entitySorter.sort(this.sortables, this.entityLayer);
    this.airSorter.sort(this.airSortables, this.airLayer);
  }

  get teamNames(): readonly string[] {
    return TEAMS.map((t) => t.name);
  }

  get liveProjectiles(): number { return this.projectiles.liveCount; }
  get liveParticles(): number { return this.effects.liveCount; }
}
