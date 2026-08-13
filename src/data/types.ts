import type { InfantryVisual, VehicleVisual, AircraftVisual } from '../render/sprites/units';
import type { StructureVisual } from '../render/sprites/structures';

export const enum EntityKind {
  Infantry = 0,
  Vehicle = 1,
  Aircraft = 2,
  Building = 3,
  Defense = 4,
}

/** What a weapon is allowed to shoot at. */
export const enum TargetMask {
  None = 0,
  Ground = 1,
  Air = 2,
  Structure = 4,
  GroundAndStructure = 5,
  All = 7,
}

/** Armour classes drive the damage multiplier table. */
export const enum ArmorClass {
  Infantry = 0,
  Light = 1,
  Heavy = 2,
  Structure = 3,
  Air = 4,
}

export const enum DamageType {
  Bullet = 0,
  Explosive = 1,
  Fire = 2,
  AntiTank = 3,
  Energy = 4,
  EMP = 5,
}

/**
 * Damage multiplier per (damage type, armour class). This is the single knob
 * that makes unit composition matter: bullets shred infantry and bounce off
 * heavy armour, AT rockets do the reverse.
 */
export const DAMAGE_TABLE: readonly (readonly number[])[] = [
  //          Infantry  Light  Heavy  Structure  Air
  /* Bullet */   [1.00,  0.55,  0.18,     0.25,  0.60],
  /* Explosive */[0.85,  1.00,  0.70,     1.00,  0.35],
  /* Fire */     [1.45,  0.70,  0.30,     0.55,  0.10],
  /* AntiTank */ [0.35,  1.30,  1.55,     0.80,  0.25],
  /* Energy */   [1.10,  1.00,  0.95,     0.70,  1.05],
  /* EMP */      [0.20,  1.20,  1.20,     0.40,  1.40],
];

export function damageMultiplier(type: DamageType, armor: ArmorClass): number {
  return DAMAGE_TABLE[type][armor];
}

export type ProjectileKind = 'hitscan' | 'shell' | 'rocket' | 'missile' | 'bomb' | 'beam' | 'none';

export interface WeaponDef {
  readonly name: string;
  readonly damage: number;
  readonly damageType: DamageType;
  /** Seconds between shots (or between bursts). */
  readonly cooldown: number;
  /** Maximum range in tiles. */
  readonly range: number;
  /** Minimum range in tiles — mortars and artillery cannot hit adjacent targets. */
  readonly minRange?: number;
  readonly projectile: ProjectileKind;
  /** Splash radius in tiles; 0 for single-target. */
  readonly splash?: number;
  readonly targets: TargetMask;
  /** 0-1 chance to hit at maximum range; always hits at point blank. */
  readonly accuracy: number;
  readonly burst?: number;
  readonly burstDelay?: number;
  /** Parabolic trajectory that arcs over obstacles (mortars, artillery). */
  readonly arcing?: boolean;
  /** Projectile travel speed in tiles/second. Ignored for hitscan. */
  readonly speed?: number;
  /** Muzzle flash length in pixels; 0 suppresses the flash. */
  readonly muzzleLength?: number;
  /** Tracer tint. */
  readonly tracerColor?: number;
}

interface BaseDef {
  readonly id: string;
  readonly name: string;
  readonly kind: EntityKind;
  readonly cost: number;
  /** Seconds to produce. */
  readonly buildTime: number;
  readonly hp: number;
  readonly armor: ArmorClass;
  /** Vision and auto-acquire radius in tiles. */
  readonly sight: number;
  readonly weapon: WeaponDef | null;
  /** Secondary weapon, e.g. an APC's pintle gun. */
  readonly weapon2?: WeaponDef;
  /** Tech tier; a producer must exist before the AI can queue it. */
  readonly tier: number;
}

export interface InfantryDef extends BaseDef {
  readonly kind: EntityKind.Infantry;
  /** Tiles per second. */
  readonly speed: number;
  readonly visual: InfantryVisual;
  /** Heals nearby friendly infantry. */
  readonly healRate?: number;
  /** Repairs nearby friendly vehicles and structures. */
  readonly repairRate?: number;
  /** Can capture neutral or enemy structures. */
  readonly canCapture?: boolean;
  /** Spawns a scout drone that follows the operator. */
  readonly spawnsDrone?: boolean;
}

export interface VehicleDef extends BaseDef {
  readonly kind: EntityKind.Vehicle;
  readonly speed: number;
  /** Tiles/second^2. */
  readonly accel: number;
  readonly brake: number;
  /** Radians per second. */
  readonly turnRate: number;
  /** Collision radius in tiles. */
  readonly radius: number;
  readonly visual: VehicleVisual;
  /** Ignores water pathing restrictions. */
  readonly amphibious?: boolean;
  /** Crushes enemy infantry it drives over. */
  readonly crushes?: boolean;
  /** Repairs nearby friendlies. */
  readonly repairRate?: number;
  /** Adds to the owner's coin drip while alive. */
  readonly supplyBonus?: number;
  /** Carries infantry. */
  readonly transportSlots?: number;
}

export interface AircraftDef extends BaseDef {
  readonly kind: EntityKind.Aircraft;
  readonly speed: number;
  readonly turnRate: number;
  /** Cruise altitude in elevation units; drives shadow offset and scale. */
  readonly altitude: number;
  readonly visual: AircraftVisual;
  /** Rotor disc radius; 0 for fixed-wing. */
  readonly rotorRadius: number;
  /** Detonates on arrival and dies (cruise missiles, orbital strikes). */
  readonly oneShot?: boolean;
  /** Seconds before the aircraft must return to base and despawn. */
  readonly loiter: number;
  readonly transportSlots?: number;
}

export interface BuildingDef extends BaseDef {
  readonly kind: EntityKind.Building;
  /** Footprint in tiles. */
  readonly fw: number;
  readonly fh: number;
  readonly visual: StructureVisual;
  /** Unit ids this structure can produce. */
  readonly produces?: readonly string[];
  /** Multiplies the owner's passive coin drip. */
  readonly incomeMultiplier?: number;
  /** Unlocks the given tech tier. */
  readonly unlocksTier?: number;
  /** Repairs friendly units within this radius. */
  readonly repairRadius?: number;
  readonly repairRate?: number;
  /** Heals friendly infantry within this radius. */
  readonly healRadius?: number;
  /** Extends the buildable area. */
  readonly buildRadius?: number;
  /** Ground units path through it (gates). */
  readonly passable?: boolean;
  /** Losing every structure with this flag ends the match. */
  readonly isHeadquarters?: boolean;
  /** Reveals the map and boosts allied accuracy. */
  readonly grantsRadar?: boolean;
  /** Enables an off-map ability. */
  readonly grantsAbility?: 'orbitalStrike' | 'empBurst' | 'airstrike';
}

export interface DefenseDef extends BaseDef {
  readonly kind: EntityKind.Defense;
  readonly fw: number;
  readonly fh: number;
  readonly visual: StructureVisual;
  /** Rotating turret drawn on top of the base. */
  readonly turret?: { radius: number; barrelLength: number; barrelWidth: number };
  /** Detonates when an enemy comes within `triggerRadius` tiles, then dies. */
  readonly proximity?: { triggerRadius: number; targets: TargetMask };
  /** Invisible to the enemy AI's threat map until it fires. */
  readonly concealed?: boolean;
  /** Blocks ground pathing without being a real building. */
  readonly blocks?: boolean;
}

export type EntityDef = InfantryDef | VehicleDef | AircraftDef | BuildingDef | DefenseDef;

/** Narrowing helpers used all over the systems layer. */
export const isInfantry = (d: EntityDef): d is InfantryDef => d.kind === EntityKind.Infantry;
export const isVehicle = (d: EntityDef): d is VehicleDef => d.kind === EntityKind.Vehicle;
export const isAircraft = (d: EntityDef): d is AircraftDef => d.kind === EntityKind.Aircraft;
export const isBuilding = (d: EntityDef): d is BuildingDef => d.kind === EntityKind.Building;
export const isDefense = (d: EntityDef): d is DefenseDef => d.kind === EntityKind.Defense;
