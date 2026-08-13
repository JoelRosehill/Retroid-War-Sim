/**
 * The agent brain.
 *
 * Runs on a fixed tick budget rather than every frame: it reads the board
 * (balance, army, enemy positions, base integrity), then emits intent —
 * build orders, production queue entries, and movement targets for clusters of
 * units. All of it goes through ProductionSystem, so nothing bypasses the coin
 * ledger.
 */
import { AICfg, type TeamId } from '../core/Config';
import { clamp, dist2 } from '../core/MathUtils';
import { RNG } from '../core/RNG';
import type { World } from '../systems/World';
import type { Unit } from '../entities/Unit';
import type { Structure } from '../entities/Structure';
import { defOf } from '../data/registry';
import { EntityKind, isBuilding, isDefense, type BuildingDef, type DefenseDef } from '../data/types';
import type { AIProfile } from './Profiles';

const enum Role {
  Defend = 0,
  Attack = 1,
}

export interface AISnapshot {
  team: TeamId;
  wave: number;
  armySize: number;
  attackers: number;
  posture: string;
  target: string | null;
}

export class AIController {
  private readonly rng: RNG;
  private readonly roles = new Map<number, Role>();

  private thinkCounter = 0;
  private retargetCounter = 0;
  private waveNumber = 0;
  private waveTimer = 0;
  /**
   * Cost of the structure the agent is currently saving for. Unit production
   * treats it as extra reserve — otherwise a cheap-unit doctrine spends every
   * coin the moment it arrives and never banks enough to expand its economy.
   */
  private savingFor = 0;
  private attacking = false;
  private attackX = 0;
  private attackY = 0;
  private targetName: string | null = null;
  private underAttack = 0;

  constructor(
    private readonly world: World,
    readonly team: TeamId,
    readonly profile: AIProfile,
    seed: number,
  ) {
    this.rng = new RNG(seed ^ (team * 0x9e3779b9));
    const home = world.homePosition(team);
    this.attackX = home.gx;
    this.attackY = home.gy;
  }

  /** Called once per simulation tick; heavy work is spread across ticks. */
  update(dt: number): void {
    this.waveTimer -= dt;
    this.underAttack = Math.max(0, this.underAttack - dt);

    if (++this.thinkCounter >= AICfg.thinkInterval) {
      this.thinkCounter = 0;
      this.think();
    }
    if (++this.retargetCounter >= AICfg.retargetInterval) {
      this.retargetCounter = 0;
      this.manageArmy();
    }
  }

  private think(): void {
    const world = this.world;
    if (world.structuresOf(this.team).length === 0) return;

    this.assessThreat();
    this.buildStructures();
    this.buildDefenses();
    this.produceUnits();
  }

  // --- Base building --------------------------------------------------------

  /** Build the first legal, affordable step in the profile's order. */
  private buildStructures(): void {
    const world = this.world;
    const economy = world.economy;

    for (const step of this.profile.buildOrder) {
      if (world.countOf(this.team, step.id) >= step.max) continue;
      if (step.after && world.countOf(this.team, step.after.id) < step.after.count) continue;

      const def = defOf(step.id);
      if (!isBuilding(def)) continue;
      if (def.tier > world.techTier(this.team)) continue;

      const budget = economy.coins(this.team) - this.profile.reserve;
      if (budget < def.cost) {
        // Save up rather than skipping ahead down the order.
        this.savingFor = def.cost;
        return;
      }

      const site = this.pickBuildSite(def);
      if (!site) continue;

      world.production.placeStructure(this.team, def.id, site.gx, site.gy);
      this.savingFor = 0;
      return; // One structure per think tick keeps spending legible.
    }
    this.savingFor = 0;
  }

  /**
   * Economy buildings hug the base; production buildings sit slightly toward
   * the enemy so freshly built units start closer to the front.
   */
  private pickBuildSite(def: BuildingDef): { gx: number; gy: number } | null {
    const world = this.world;
    const home = world.homePosition(this.team);
    const enemyHome = world.homePosition(world.enemyTeam(this.team));

    const dx = enemyHome.gx - home.gx;
    const dy = enemyHome.gy - home.gy;
    const len = Math.hypot(dx, dy) || 1;

    const forward = def.produces && def.produces.length > 0 ? 5 : 0;
    const jitter = 3;

    const ox = home.gx + (dx / len) * forward + this.rng.range(-jitter, jitter);
    const oy = home.gy + (dy / len) * forward + this.rng.range(-jitter, jitter);

    return world.production.findBuildSite(this.team, def, ox, oy, 20);
  }

  /** Static defences go on the approach the enemy actually uses. */
  private buildDefenses(): void {
    const world = this.world;
    const economy = world.economy;

    // Defences come out of the same discretionary pot as units, and yield to
    // the army when the agent is below strength.
    const army = world.unitCount(this.team);
    const hold = army < this.targetArmySize() * 0.55 ? 0.9 : 0.75;
    const spendable = economy.coins(this.team) - this.profile.reserve - this.savingFor * hold;
    if (spendable <= 0) return;

    const defenseBias = this.underAttack > 0 ? 1.6 : 1;
    if (this.rng.next() > 0.35 * defenseBias) return;

    const home = world.homePosition(this.team);
    const enemyHome = world.homePosition(world.enemyTeam(this.team));
    const dx = enemyHome.gx - home.gx;
    const dy = enemyHome.gy - home.gy;

    for (const step of this.profile.defenses) {
      if (world.countOf(this.team, step.id) >= step.max) continue;
      const def = defOf(step.id);
      if (!isDefense(def) && !isBuilding(def)) continue;
      if (def.tier > world.techTier(this.team)) continue;
      if (def.cost > spendable) continue;

      // Ring the base on the enemy-facing arc.
      const spreadAngle = this.rng.range(-0.9, 0.9);
      const baseAngle = Math.atan2(dy, dx) + spreadAngle;
      const radius = this.rng.range(7, 12);
      const ox = home.gx + Math.cos(baseAngle) * radius;
      const oy = home.gy + Math.sin(baseAngle) * radius;

      const site = world.production.findBuildSite(
        this.team, def as BuildingDef | DefenseDef, ox, oy, 10,
      );
      if (!site) continue;

      world.production.placeStructure(this.team, def.id, site.gx, site.gy);
      return;
    }
  }

  // --- Unit production ------------------------------------------------------

  /**
   * Queue whichever unit is furthest below its target share of the army. This
   * self-corrects: losing all the tanks makes tanks the top priority next tick.
   */
  /**
   * How large an army this agent is currently trying to field. Scaling it off
   * income rather than off the current army size matters: pegging it to what
   * you already have makes the target self-satisfying, and the agent never
   * expands past its opening force.
   */
  private targetArmySize(): number {
    const income = this.world.economy.ledger(this.team).income;
    return clamp(Math.round(10 + income * 0.55), 10, 64);
  }

  private produceUnits(): void {
    const world = this.world;
    const economy = world.economy;
    const army = world.unitCount(this.team);
    const target = this.targetArmySize();

    let bestId: string | null = null;
    let bestDeficit = 0;

    // How much of the construction fund to protect. An agent well below its
    // army target buys units first and expands later; one at strength banks
    // for the next building.
    const hold = army < target * 0.55 ? 0.2 : 0.75;
    const spendable = economy.coins(this.team) - this.profile.reserve - this.savingFor * hold;
    if (spendable <= 0) return;

    for (const entry of this.profile.composition) {
      const have = world.countOf(this.team, entry.id);
      if (have >= entry.cap) continue;

      const def = defOf(entry.id);
      if (def.tier > world.techTier(this.team)) continue;

      const want = Math.max(1, entry.weight * target);
      const deficit = (want - have) / want;
      if (deficit <= bestDeficit) continue;

      // Only consider it if we could actually pay right now.
      if (spendable < def.cost) continue;

      bestDeficit = deficit;
      bestId = entry.id;
    }

    if (bestId) world.production.queueUnit(this.team, bestId);
  }

  // --- Army management ------------------------------------------------------

  /** Note whether hostiles are inside our base perimeter. */
  private assessThreat(): void {
    const world = this.world;
    const home = world.homePosition(this.team);
    const enemy = world.enemyTeam(this.team);

    for (const unit of world.unitsOf(enemy)) {
      if (dist2(unit.gx, unit.gy, home.gx, home.gy) < 20 * 20) {
        this.underAttack = 6;
        return;
      }
    }
  }

  private manageArmy(): void {
    const world = this.world;
    const army = world.unitsOf(this.team);
    if (army.length === 0) return;

    this.assignRoles(army);

    const attackers = army.filter((u) => this.roles.get(u.id) === Role.Attack);
    const threshold = this.profile.attackThreshold + this.waveNumber * this.profile.waveGrowth;

    // Fall back to base defence while the base is being overrun.
    if (this.underAttack > 0 && attackers.length < threshold * 1.4) {
      this.attacking = false;
      this.recallToBase(army);
      return;
    }

    if (!this.attacking && attackers.length >= threshold && this.waveTimer <= 0) {
      this.launchWave(attackers);
    } else if (this.attacking) {
      this.sustainWave(attackers);
    } else {
      this.stageAtRally(attackers);
    }

    this.holdDefenders(army);
  }

  /** Split the army between the defensive garrison and the strike force. */
  private assignRoles(army: readonly Unit[]): void {
    const wantDefenders = Math.round(army.length * this.profile.defenseRatio);
    let defenders = 0;

    for (const unit of army) {
      if (!this.roles.has(unit.id)) {
        // Slow, short-ranged and support units garrison; the rest go forward.
        const def = unit.def;
        const garrison = def.kind === EntityKind.Infantry && (def as { healRate?: number }).healRate !== undefined;
        this.roles.set(unit.id, garrison ? Role.Defend : Role.Attack);
      }
      if (this.roles.get(unit.id) === Role.Defend) defenders++;
    }

    // Rebalance toward the target garrison size.
    for (const unit of army) {
      if (defenders >= wantDefenders) break;
      if (this.roles.get(unit.id) === Role.Attack) {
        this.roles.set(unit.id, Role.Defend);
        defenders++;
      }
    }
    for (const unit of army) {
      if (defenders <= wantDefenders) break;
      if (this.roles.get(unit.id) === Role.Defend) {
        this.roles.set(unit.id, Role.Attack);
        defenders--;
      }
    }

    // Drop entries for units that died.
    if (this.roles.size > army.length * 2 + 32) {
      const live = new Set(army.map((u) => u.id));
      for (const id of [...this.roles.keys()]) if (!live.has(id)) this.roles.delete(id);
    }
  }

  private launchWave(attackers: readonly Unit[]): void {
    const target = this.pickAttackTarget(attackers);
    if (!target) return;

    this.attacking = true;
    this.waveNumber++;
    this.waveTimer = this.profile.waveCooldown;
    this.attackX = target.gx;
    this.attackY = target.gy;
    this.targetName = target.name;

    for (const unit of attackers) {
      const spread = 3.5;
      unit.orderMove(
        clamp(this.attackX + this.rng.range(-spread, spread), 1, this.world.map.size - 2),
        clamp(this.attackY + this.rng.range(-spread, spread), 1, this.world.map.size - 2),
        this.world,
        1,
      );
    }
  }

  private sustainWave(attackers: readonly Unit[]): void {
    const world = this.world;

    // Wave is spent — regroup.
    const threshold = this.profile.attackThreshold * 0.4;
    if (attackers.length < threshold) {
      this.attacking = false;
      this.targetName = null;
      return;
    }

    // Re-aim if the objective is gone.
    const stillThere = world.structuresOf(world.enemyTeam(this.team)).some(
      (s) => s.alive && dist2(s.centreX, s.centreY, this.attackX, this.attackY) < 36,
    );
    if (!stillThere) {
      const next = this.pickAttackTarget(attackers);
      if (!next) { this.attacking = false; return; }
      this.attackX = next.gx;
      this.attackY = next.gy;
      this.targetName = next.name;
    }

    for (const unit of attackers) {
      // Units already shooting something are left alone.
      if (unit.target) continue;
      const far = dist2(unit.gx, unit.gy, this.attackX, this.attackY) > 36;
      if (far && !unit.hasMoveGoal) {
        unit.orderMove(this.attackX, this.attackY, world, 1);
      }
    }
  }

  /** Gather at the rally point between waves. */
  private stageAtRally(attackers: readonly Unit[]): void {
    const rally = this.world.rallyPoint(this.team);
    for (const unit of attackers) {
      if (unit.target || unit.hasMoveGoal) continue;
      if (dist2(unit.gx, unit.gy, rally.gx, rally.gy) < 49) continue;
      unit.orderMove(
        rally.gx + this.rng.range(-3, 3),
        rally.gy + this.rng.range(-3, 3),
        this.world, 0,
      );
    }
  }

  private holdDefenders(army: readonly Unit[]): void {
    const home = this.world.homePosition(this.team);
    for (const unit of army) {
      if (this.roles.get(unit.id) !== Role.Defend) continue;
      if (unit.target || unit.hasMoveGoal) continue;
      if (dist2(unit.gx, unit.gy, home.gx, home.gy) < 100) continue;
      unit.orderMove(
        home.gx + this.rng.range(-6, 6),
        home.gy + this.rng.range(-6, 6),
        this.world, 0,
      );
    }
  }

  private recallToBase(army: readonly Unit[]): void {
    const home = this.world.homePosition(this.team);
    for (const unit of army) {
      if (unit.target) continue;
      if (dist2(unit.gx, unit.gy, home.gx, home.gy) < 144) continue;
      unit.orderMove(
        home.gx + this.rng.range(-7, 7),
        home.gy + this.rng.range(-7, 7),
        this.world, 2,
      );
    }
  }

  /**
   * Aggressive profiles head for production buildings; cautious ones pick off
   * whatever is closest and least defended.
   */
  private pickAttackTarget(attackers: readonly Unit[]): { gx: number; gy: number; name: string } | null {
    const world = this.world;
    const enemy = world.enemyTeam(this.team);
    const enemyStructures = world.structuresOf(enemy);
    if (enemyStructures.length === 0) {
      const mass = world.centreOfMass(enemy);
      return mass ? { gx: mass.gx, gy: mass.gy, name: 'enemy forces' } : null;
    }

    let originX = 0, originY = 0;
    for (const unit of attackers) { originX += unit.gx; originY += unit.gy; }
    originX /= Math.max(1, attackers.length);
    originY /= Math.max(1, attackers.length);

    let best: Structure | null = null;
    let bestScore = -Infinity;

    for (const s of enemyStructures) {
      if (!s.alive) continue;
      const d = Math.sqrt(dist2(originX, originY, s.centreX, s.centreY)) + 1;

      const building = s.asBuilding();
      let value = 1;
      if (building?.isHeadquarters) value = 3.2;
      else if (building?.produces?.length) value = 2.4;
      else if (building?.incomeMultiplier) value = 1.8;
      else if (s.asDefense()) value = 0.7;

      // Aggressive agents weight value; cautious agents weight proximity.
      const proximityWeight = 1 - this.profile.aggression;
      const score = value * this.profile.aggression + (60 / d) * proximityWeight;

      if (score > bestScore) { bestScore = score; best = s; }
    }

    if (!best) return null;
    return { gx: best.centreX, gy: best.centreY, name: best.def.name };
  }

  snapshot(): AISnapshot {
    const army = this.world.unitsOf(this.team);
    let attackers = 0;
    for (const unit of army) if (this.roles.get(unit.id) === Role.Attack) attackers++;

    return {
      team: this.team,
      wave: this.waveNumber,
      armySize: army.length,
      attackers,
      posture: this.underAttack > 0 ? 'DEFENDING' : this.attacking ? 'ASSAULT' : 'MASSING',
      target: this.targetName,
    };
  }
}
