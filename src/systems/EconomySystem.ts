/**
 * The coin ledger.
 *
 * One global balance per agent, updated every simulation tick. Income is a flat
 * passive drip multiplied by operational mining rigs (and, to a lesser degree,
 * depots, generators and supply trucks). Every purchase in the game funnels
 * through `trySpend`, so the AI can never conjure a unit it hasn't paid for.
 */
import { Economy, type TeamId } from '../core/Config';
import type { World } from './World';

export interface TeamLedger {
  coins: number;
  /** Coins per second at this instant, including all multipliers. */
  income: number;
  /** Running totals for the HUD. */
  earned: number;
  spent: number;
  rigs: number;
}

export class EconomySystem {
  private readonly ledgers: [TeamLedger, TeamLedger];

  constructor(private readonly world: World) {
    const fresh = (): TeamLedger => ({
      coins: Economy.startingCoins,
      income: Economy.passiveDrip,
      earned: 0,
      spent: 0,
      rigs: 0,
    });
    this.ledgers = [fresh(), fresh()];
  }

  ledger(team: TeamId): TeamLedger {
    return this.ledgers[team];
  }

  coins(team: TeamId): number {
    return this.ledgers[team].coins;
  }

  canAfford(team: TeamId, cost: number): boolean {
    return this.ledgers[team].coins >= cost;
  }

  /** Deduct `cost` if affordable. Returns false and changes nothing otherwise. */
  trySpend(team: TeamId, cost: number): boolean {
    const ledger = this.ledgers[team];
    if (ledger.coins < cost) return false;
    ledger.coins -= cost;
    ledger.spent += cost;
    return true;
  }

  refund(team: TeamId, amount: number): void {
    const ledger = this.ledgers[team];
    ledger.coins += amount;
    ledger.earned += amount;
  }

  update(dt: number): void {
    for (let team = 0 as TeamId; team < 2; team = (team + 1) as TeamId) {
      const ledger = this.ledgers[team];

      let multiplier = 1;
      let rigs = 0;
      for (const structure of this.world.structuresOf(team)) {
        if (!structure.isOperational) continue;
        const building = structure.asBuilding();
        if (!building?.incomeMultiplier) continue;
        if (building.id === 'miningRig') {
          rigs++;
          if (rigs <= Economy.maxRigsCounted) multiplier += Economy.rigMultiplier;
        } else {
          multiplier += building.incomeMultiplier * 0.35;
        }
      }

      // Supply trucks add a small flat bonus while they survive.
      let flatBonus = 0;
      for (const unit of this.world.unitsOf(team)) {
        if (!unit.alive) continue;
        const supply = (unit.def as { supplyBonus?: number }).supplyBonus;
        if (supply) flatBonus += supply;
      }

      ledger.rigs = rigs;
      ledger.income = Economy.passiveDrip * multiplier + flatBonus;

      const gained = ledger.income * dt;
      ledger.coins += gained;
      ledger.earned += gained;
    }
  }
}
