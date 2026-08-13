/**
 * Behaviour profiles for the two agents.
 *
 * The controller logic is shared; what makes the agents feel like different
 * opponents is entirely in this data — build order, army composition, when they
 * commit to an attack, and how much of their income goes into static defence.
 */

export interface BuildStep {
  id: string;
  /** Stop building once this many exist. */
  max: number;
  /** Don't start until the agent already has this many of `after`. */
  after?: { id: string; count: number };
  /** Fraction of the current balance the agent will commit to this. */
  spendCap?: number;
}

export interface CompositionEntry {
  id: string;
  /** Relative share of the army this unit should represent. */
  weight: number;
  /** Hard cap on simultaneous units of this type. */
  cap: number;
}

export interface AIProfile {
  readonly name: string;
  readonly doctrine: string;

  /** Evaluated top to bottom; the first affordable, legal step is built. */
  readonly buildOrder: readonly BuildStep[];
  readonly composition: readonly CompositionEntry[];

  /** Static defences, placed on the side of the base facing the enemy. */
  readonly defenses: readonly BuildStep[];

  /** Army size needed before the first attack wave commits. */
  readonly attackThreshold: number;
  /** Each successive wave demands this many more units. */
  readonly waveGrowth: number;
  /** Share of the army held back to guard the base. */
  readonly defenseRatio: number;
  /** Coins kept in reserve rather than spent on units. */
  readonly reserve: number;
  /** 0-1; higher means attacking further from home and retreating less. */
  readonly aggression: number;
  /** Seconds between attack waves at minimum. */
  readonly waveCooldown: number;
}

export const ALPHA_PROFILE: AIProfile = {
  name: 'ALPHA COMMAND',
  doctrine: 'Rapid mechanisation. Cheap wheels, early pressure, replace losses faster than the enemy can kill them.',
  buildOrder: [
    { id: 'barracks', max: 1 },
    { id: 'miningRig', max: 2 },
    { id: 'vehicleFactory', max: 1, after: { id: 'miningRig', count: 1 } },
    { id: 'miningRig', max: 4 },
    { id: 'supplyDepot', max: 1 },
    { id: 'barracks', max: 2 },
    { id: 'researchStation', max: 1, after: { id: 'vehicleFactory', count: 1 } },
    { id: 'miningRig', max: 6 },
    { id: 'repairBay', max: 1 },
    { id: 'vehicleFactory', max: 2 },
    { id: 'radar', max: 1 },
    { id: 'helipad', max: 1, after: { id: 'researchStation', count: 1 } },
    { id: 'techLab', max: 1, after: { id: 'researchStation', count: 1 } },
    { id: 'miningRig', max: 9 },
    { id: 'hospital', max: 1 },
    { id: 'airfield', max: 1, after: { id: 'techLab', count: 1 } },
    { id: 'commandCenter', max: 2, after: { id: 'miningRig', count: 6 } },
  ],
  composition: [
    { id: 'lightJeep', weight: 0.30, cap: 24 },
    { id: 'rifleman', weight: 0.18, cap: 26 },
    { id: 'lightTank', weight: 0.16, cap: 16 },
    { id: 'scout', weight: 0.06, cap: 6 },
    { id: 'antiTank', weight: 0.08, cap: 12 },
    { id: 'apc', weight: 0.05, cap: 6 },
    { id: 'medic', weight: 0.04, cap: 5 },
    { id: 'engineer', weight: 0.03, cap: 3 },
    { id: 'attackHelicopter', weight: 0.06, cap: 8 },
    { id: 'heavyTank', weight: 0.02, cap: 5 },
    { id: 'commando', weight: 0.02, cap: 3 },
  ],
  defenses: [
    { id: 'mgTurret', max: 4 },
    { id: 'apMine', max: 6 },
    { id: 'samSite', max: 2 },
    { id: 'mortarPit', max: 2 },
  ],
  attackThreshold: 7,
  waveGrowth: 2,
  defenseRatio: 0.2,
  reserve: 150,
  aggression: 0.85,
  waveCooldown: 22,
};

export const BRAVO_PROFILE: AIProfile = {
  name: 'BRAVO LEGION',
  doctrine: 'Fortify and escalate. Hold the line with walls and guns, bank the difference, then break the deadlock from the air.',
  buildOrder: [
    { id: 'miningRig', max: 2 },
    { id: 'barracks', max: 1 },
    { id: 'powerGenerator', max: 1 },
    { id: 'miningRig', max: 4 },
    { id: 'bunker', max: 2 },
    { id: 'researchStation', max: 1 },
    { id: 'vehicleFactory', max: 1, after: { id: 'researchStation', count: 1 } },
    { id: 'miningRig', max: 6 },
    { id: 'antiAirBattery', max: 2 },
    { id: 'radar', max: 1 },
    { id: 'techLab', max: 1, after: { id: 'researchStation', count: 1 } },
    { id: 'repairBay', max: 1 },
    { id: 'miningRig', max: 9 },
    { id: 'airfield', max: 1, after: { id: 'techLab', count: 1 } },
    { id: 'hospital', max: 1 },
    { id: 'commsHub', max: 1, after: { id: 'techLab', count: 1 } },
    { id: 'silo', max: 1, after: { id: 'airfield', count: 1 } },
    { id: 'miningRig', max: 12 },
  ],
  composition: [
    { id: 'rifleman', weight: 0.16, cap: 20 },
    { id: 'heavyGunner', weight: 0.14, cap: 14 },
    { id: 'antiTank', weight: 0.10, cap: 12 },
    { id: 'sniper', weight: 0.06, cap: 6 },
    { id: 'engineer', weight: 0.04, cap: 4 },
    { id: 'medic', weight: 0.05, cap: 6 },
    { id: 'heavyTank', weight: 0.13, cap: 12 },
    { id: 'artilleryTruck', weight: 0.07, cap: 6 },
    { id: 'heavyBomber', weight: 0.08, cap: 5 },
    { id: 'interceptor', weight: 0.05, cap: 5 },
    { id: 'gunship', weight: 0.05, cap: 3 },
    { id: 'mechWalker', weight: 0.04, cap: 3 },
    { id: 'cruiseMissile', weight: 0.03, cap: 2 },
  ],
  defenses: [
    { id: 'mgTurret', max: 6 },
    { id: 'wall', max: 22 },
    { id: 'barbedWire', max: 10 },
    { id: 'mortarPit', max: 4 },
    { id: 'samSite', max: 3 },
    { id: 'atMine', max: 8 },
    { id: 'laserDefense', max: 3 },
    { id: 'artilleryCannon', max: 2 },
    { id: 'railgunTurret', max: 2 },
  ],
  attackThreshold: 16,
  waveGrowth: 4,
  defenseRatio: 0.42,
  reserve: 700,
  aggression: 0.45,
  waveCooldown: 42,
};

export const PROFILES: readonly [AIProfile, AIProfile] = [ALPHA_PROFILE, BRAVO_PROFILE];
