/**
 * Construction and unit production.
 *
 * Every transaction is validated here before anything is instantiated: the coin
 * balance, the tech tier, a legal build site, and an operational producer. The
 * AI submits intent; this system decides whether the intent becomes an entity.
 */
import type { World } from './World';
import type { TeamId } from '../core/Config';
import { Structure } from '../entities/Structure';
import {
  EntityKind, isBuilding, isDefense,
  type BuildingDef, type DefenseDef, type EntityDef,
} from '../data/types';
import { defOf, producerOf } from '../data/registry';
import { clamp } from '../core/MathUtils';

export interface BuildOutcome {
  ok: boolean;
  reason?: 'cost' | 'tier' | 'site' | 'producer' | 'queueFull';
}

const MAX_QUEUE = 5;

export class ProductionSystem {
  constructor(private readonly world: World) {}

  /** Queue a mobile unit at the cheapest-loaded producer that can build it. */
  queueUnit(team: TeamId, unitId: string): BuildOutcome {
    const def = defOf(unitId);
    if (def.kind === EntityKind.Building || def.kind === EntityKind.Defense) {
      return { ok: false, reason: 'producer' };
    }
    if (def.tier > this.world.techTier(team)) return { ok: false, reason: 'tier' };

    const producerId = producerOf(unitId);
    if (!producerId) return { ok: false, reason: 'producer' };

    let best: Structure | null = null;
    for (const structure of this.world.structuresOf(team)) {
      if (structure.def.id !== producerId || !structure.isOperational) continue;
      if (structure.queue.length >= MAX_QUEUE) continue;
      if (!best || structure.queue.length < best.queue.length) best = structure;
    }
    if (!best) return { ok: false, reason: 'producer' };

    if (!this.world.economy.trySpend(team, def.cost)) return { ok: false, reason: 'cost' };

    best.queue.push(unitId);
    if (best.queue.length === 1) best.queueTimer = def.buildTime;
    return { ok: true };
  }

  /** Place a building or defence, paying for it up front. */
  placeStructure(team: TeamId, structureId: string, gx: number, gy: number): BuildOutcome {
    const def = defOf(structureId);
    if (!isBuilding(def) && !isDefense(def)) return { ok: false, reason: 'producer' };
    if (def.tier > this.world.techTier(team)) return { ok: false, reason: 'tier' };
    if (!this.canPlaceAt(team, def, gx, gy)) return { ok: false, reason: 'site' };
    if (!this.world.economy.trySpend(team, def.cost)) return { ok: false, reason: 'cost' };

    const structure = this.world.spawnStructure(def, team, gx, gy, 0);
    if (!structure) {
      // The world rejected the site after we took payment — give it back
      // rather than silently burning the agent's coins.
      this.world.economy.refund(team, def.cost);
      return { ok: false, reason: 'site' };
    }
    return { ok: true };
  }

  /** Footprint fits, terrain is buildable, and it's inside our build radius. */
  canPlaceAt(team: TeamId, def: BuildingDef | DefenseDef, gx: number, gy: number): boolean {
    const map = this.world.map;
    const nav = this.world.nav;

    for (let y = gy; y < gy + def.fh; y++) {
      for (let x = gx; x < gx + def.fw; x++) {
        // Rejects water and mountain outright, plus props and non-buildable
        // biomes. Every tile of the footprint is checked, edges included.
        if (!map.isBuildable(x, y)) return false;
        if (nav.occupantAt(x, y) !== 0) return false;
        // Buildings need level ground.
        if (map.elevationAt(x, y) !== map.elevationAt(gx, gy)) return false;
      }
    }

    return this.world.withinBuildRadius(team, gx, gy);
  }

  /**
   * Spiral outward from `(ox, oy)` for the first legal site. Returns null when
   * the base is boxed in, which the AI treats as a signal to expand elsewhere.
   */
  findBuildSite(
    team: TeamId, def: BuildingDef | DefenseDef,
    ox: number, oy: number, maxRadius = 18,
  ): { gx: number; gy: number } | null {
    const size = this.world.map.size;
    const cx = clamp(Math.round(ox), 1, size - def.fw - 1);
    const cy = clamp(Math.round(oy), 1, size - def.fh - 1);

    if (this.canPlaceAt(team, def, cx, cy)) return { gx: cx, gy: cy };

    for (let r = 2; r <= maxRadius; r += 1) {
      // Sample the ring rather than every tile in it — much cheaper, and the
      // AI doesn't need the mathematically closest site, just a good one.
      const samples = Math.max(8, r * 5);
      for (let i = 0; i < samples; i++) {
        const a = (i / samples) * Math.PI * 2 + r * 0.37;
        const x = clamp(Math.round(cx + Math.cos(a) * r), 1, size - def.fw - 1);
        const y = clamp(Math.round(cy + Math.sin(a) * r), 1, size - def.fh - 1);
        if (this.canPlaceAt(team, def, x, y)) return { gx: x, gy: y };
      }
    }
    return null;
  }

  update(dt: number): void {
    for (let team = 0 as TeamId; team < 2; team = (team + 1) as TeamId) {
      for (const structure of this.world.structuresOf(team)) {
        if (!structure.isOperational || structure.queue.length === 0) continue;

        structure.queueTimer -= dt;
        if (structure.queueTimer > 0) continue;

        const unitId = structure.queue.shift()!;
        this.spawnFromProducer(structure, unitId);

        if (structure.queue.length > 0) {
          structure.queueTimer = defOf(structure.queue[0]).buildTime;
        }
      }
    }
  }

  /** Place the finished unit on a free tile beside its producer. */
  private spawnFromProducer(producer: Structure, unitId: string): void {
    const def: EntityDef = defOf(unitId);
    const world = this.world;

    const cx = producer.centreX;
    const cy = producer.centreY;
    const radius = Math.max(producer.fw, producer.fh) / 2 + 1.2;

    let spawnX = cx;
    let spawnY = cy + radius;

    if (def.kind !== EntityKind.Aircraft) {
      let placed = false;
      for (let ring = 0; ring < 4 && !placed; ring++) {
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const r = radius + ring;
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          if (world.nav.passable(x | 0, y | 0, 0)) {
            spawnX = x; spawnY = y; placed = true; break;
          }
        }
      }
    }

    const unit = world.spawnUnit(def, producer.team, spawnX, spawnY);
    if (!unit) return;

    // Send it to the team's current rally point.
    const rally = world.rallyPoint(producer.team);
    unit.orderMove(rally.gx, rally.gy, world, 0);
  }
}
