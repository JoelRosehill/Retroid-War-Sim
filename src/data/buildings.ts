/** Category B — the twenty building types. */
import { ArmorClass, DamageType, EntityKind, TargetMask, type BuildingDef } from './types';
import { Ramps } from '../render/Palette';

export const BUILDINGS: readonly BuildingDef[] = [
  {
    id: 'commandCenter', name: 'Command Center', kind: EntityKind.Building, tier: 0,
    cost: 2000, buildTime: 30, hp: 3600, armor: ArmorClass.Structure, sight: 14,
    fw: 3, fh: 3, weapon: null,
    isHeadquarters: true, buildRadius: 22, unlocksTier: 0, incomeMultiplier: 1,
    produces: ['engineer'],
    visual: {
      fw: 3, fh: 3, height: 34, style: 'block', body: Ramps.concrete, windows: true,
      ornaments: ['dish', 'flag', 'antenna', 'vent'],
    },
  },
  {
    id: 'barracks', name: 'Barracks', kind: EntityKind.Building, tier: 0,
    cost: 500, buildTime: 12, hp: 1100, armor: ArmorClass.Structure, sight: 9,
    fw: 2, fh: 3, weapon: null,
    produces: ['rifleman', 'scout', 'medic', 'engineer', 'heavyGunner', 'antiTank', 'flamethrower'],
    visual: {
      fw: 2, fh: 3, height: 22, style: 'shed', body: Ramps.concrete, windows: true,
      ornaments: ['vent', 'lamp', 'flag'],
    },
  },
  {
    id: 'sniperTower', name: 'Sniper Tower', kind: EntityKind.Building, tier: 1,
    cost: 550, buildTime: 11, hp: 700, armor: ArmorClass.Structure, sight: 18,
    fw: 1, fh: 1,
    weapon: {
      name: 'Overwatch Rifle', damage: 78, damageType: DamageType.Bullet, cooldown: 2.4,
      range: 14, projectile: 'hitscan', targets: TargetMask.Ground,
      accuracy: 0.95, muzzleLength: 10, tracerColor: 0xfff0c0,
    },
    visual: { fw: 1, fh: 1, height: 44, style: 'tower', body: Ramps.concrete, ornaments: ['lamp'] },
  },
  {
    id: 'researchStation', name: 'Research Station', kind: EntityKind.Building, tier: 1,
    cost: 900, buildTime: 18, hp: 900, armor: ArmorClass.Structure, sight: 10,
    fw: 2, fh: 2, weapon: null, unlocksTier: 2,
    visual: {
      fw: 2, fh: 2, height: 26, style: 'dome', body: Ramps.metal, windows: true,
      ornaments: ['dish', 'vent'],
    },
  },
  {
    id: 'miningRig', name: 'Mining Rig', kind: EntityKind.Building, tier: 0,
    cost: 650, buildTime: 14, hp: 800, armor: ArmorClass.Structure, sight: 8,
    fw: 2, fh: 2, weapon: null, incomeMultiplier: 1,
    visual: { fw: 2, fh: 2, height: 16, style: 'derrick', body: Ramps.rust, ornaments: ['chimney'] },
  },
  {
    id: 'wall', name: 'Wall', kind: EntityKind.Building, tier: 0,
    cost: 45, buildTime: 1.2, hp: 480, armor: ArmorClass.Structure, sight: 2,
    fw: 1, fh: 1, weapon: null,
    visual: { fw: 1, fh: 1, height: 20, style: 'wall', body: Ramps.concrete },
  },
  {
    id: 'gate', name: 'Gate', kind: EntityKind.Building, tier: 0,
    cost: 120, buildTime: 3, hp: 420, armor: ArmorClass.Structure, sight: 5,
    fw: 1, fh: 1, weapon: null, passable: true,
    visual: { fw: 1, fh: 1, height: 20, style: 'gate', body: Ramps.metal, accent: 0xe0b040 },
  },
  {
    id: 'supplyDepot', name: 'Supply Depot', kind: EntityKind.Building, tier: 0,
    cost: 420, buildTime: 9, hp: 850, armor: ArmorClass.Structure, sight: 8,
    fw: 2, fh: 2, weapon: null, incomeMultiplier: 0.4,
    produces: ['supplyTruck'],
    visual: {
      fw: 2, fh: 2, height: 18, style: 'shed', body: Ramps.rust,
      ornaments: ['crane', 'sandbags'],
    },
  },
  {
    id: 'radar', name: 'Radar', kind: EntityKind.Building, tier: 1,
    cost: 700, buildTime: 14, hp: 620, armor: ArmorClass.Structure, sight: 34,
    fw: 2, fh: 2, weapon: null, grantsRadar: true,
    visual: { fw: 2, fh: 2, height: 20, style: 'block', body: Ramps.metal, ornaments: ['dish', 'antenna'] },
  },
  {
    id: 'powerGenerator', name: 'Power Generator', kind: EntityKind.Building, tier: 0,
    cost: 380, buildTime: 8, hp: 700, armor: ArmorClass.Structure, sight: 7,
    fw: 2, fh: 2, weapon: null, incomeMultiplier: 0.25,
    visual: {
      fw: 2, fh: 2, height: 22, style: 'block', body: Ramps.metal, windows: false,
      ornaments: ['chimney', 'vent', 'chimney'],
    },
  },
  {
    id: 'helipad', name: 'Helipad', kind: EntityKind.Building, tier: 2,
    cost: 850, buildTime: 16, hp: 800, armor: ArmorClass.Structure, sight: 9,
    fw: 3, fh: 3, weapon: null,
    produces: ['scoutDrone', 'attackHelicopter', 'transportChopper', 'empDrone'],
    visual: { fw: 3, fh: 3, height: 8, style: 'pad', body: Ramps.concrete, ornaments: ['lamp', 'antenna'] },
  },
  {
    id: 'vehicleFactory', name: 'Vehicle Factory', kind: EntityKind.Building, tier: 1,
    cost: 1100, buildTime: 20, hp: 1600, armor: ArmorClass.Structure, sight: 9,
    fw: 3, fh: 3, weapon: null,
    produces: ['lightJeep', 'apc', 'lightTank', 'supplyTruck', 'engineerVehicle', 'radarMobile', 'artilleryTruck', 'hovercraft'],
    visual: {
      fw: 3, fh: 3, height: 26, style: 'hangar', body: Ramps.metal,
      ornaments: ['crane', 'vent', 'chimney'],
    },
  },
  {
    id: 'airfield', name: 'Airfield', kind: EntityKind.Building, tier: 2,
    cost: 1300, buildTime: 24, hp: 1300, armor: ArmorClass.Structure, sight: 11,
    fw: 4, fh: 3, weapon: null,
    produces: ['fighterJet', 'interceptor', 'heavyBomber', 'gunship', 'cruiseMissile'],
    visual: { fw: 4, fh: 3, height: 12, style: 'pad', body: Ramps.concrete, ornaments: ['lamp', 'dish', 'flag'] },
  },
  {
    id: 'techLab', name: 'Tech Lab', kind: EntityKind.Building, tier: 2,
    cost: 1400, buildTime: 25, hp: 950, armor: ArmorClass.Structure, sight: 10,
    fw: 2, fh: 2, weapon: null, unlocksTier: 3,
    produces: ['mechWalker', 'commando', 'droneOperator'],
    visual: {
      fw: 2, fh: 2, height: 28, style: 'dome', body: Ramps.metal, windows: true,
      ornaments: ['antenna', 'dish'],
    },
  },
  {
    id: 'hospital', name: 'Hospital', kind: EntityKind.Building, tier: 1,
    cost: 600, buildTime: 13, hp: 900, armor: ArmorClass.Structure, sight: 9,
    fw: 2, fh: 2, weapon: null, healRadius: 9, repairRate: 0,
    produces: ['medic'],
    visual: {
      fw: 2, fh: 2, height: 24, style: 'block', body: Ramps.concrete, windows: true,
      accent: 0xd0402c, ornaments: ['lamp', 'vent'],
    },
  },
  {
    id: 'bunker', name: 'Bunker', kind: EntityKind.Building, tier: 1,
    cost: 400, buildTime: 8, hp: 1900, armor: ArmorClass.Structure, sight: 10,
    fw: 2, fh: 2,
    weapon: {
      name: 'Embrasure Guns', damage: 14, damageType: DamageType.Bullet, cooldown: 0.65,
      range: 8, projectile: 'hitscan', targets: TargetMask.All,
      accuracy: 0.78, burst: 4, burstDelay: 0.06, muzzleLength: 7, tracerColor: 0xffd070,
    },
    visual: { fw: 2, fh: 2, height: 12, style: 'bunker', body: Ramps.concrete, ornaments: ['sandbags'] },
  },
  {
    id: 'antiAirBattery', name: 'Anti-Air Battery', kind: EntityKind.Building, tier: 1,
    cost: 750, buildTime: 14, hp: 780, armor: ArmorClass.Structure, sight: 16,
    fw: 2, fh: 2,
    weapon: {
      name: 'Flak Battery', damage: 42, damageType: DamageType.Explosive, cooldown: 0.75,
      range: 13, projectile: 'shell', splash: 1.8, targets: TargetMask.Air,
      accuracy: 0.8, burst: 2, burstDelay: 0.1, speed: 30, muzzleLength: 12,
    },
    visual: { fw: 2, fh: 2, height: 14, style: 'emplacement', body: Ramps.metal, ornaments: ['sandbags'] },
  },
  {
    id: 'silo', name: 'Silo', kind: EntityKind.Building, tier: 2,
    cost: 1600, buildTime: 28, hp: 1100, armor: ArmorClass.Structure, sight: 8,
    fw: 2, fh: 2, weapon: null, grantsAbility: 'orbitalStrike',
    produces: ['cruiseMissile', 'orbitalStrike'],
    visual: { fw: 2, fh: 2, height: 40, style: 'silo', body: Ramps.metal, ornaments: ['vent', 'antenna'] },
  },
  {
    id: 'repairBay', name: 'Repair Bay', kind: EntityKind.Building, tier: 1,
    cost: 620, buildTime: 12, hp: 900, armor: ArmorClass.Structure, sight: 8,
    fw: 3, fh: 2, weapon: null, repairRadius: 8, repairRate: 42,
    visual: {
      fw: 3, fh: 2, height: 16, style: 'hangar', body: Ramps.rust,
      accent: 0xe0b040, ornaments: ['crane', 'lamp'],
    },
  },
  {
    id: 'commsHub', name: 'Communications Hub', kind: EntityKind.Building, tier: 2,
    cost: 950, buildTime: 18, hp: 700, armor: ArmorClass.Structure, sight: 26,
    fw: 2, fh: 2, weapon: null, grantsRadar: true, grantsAbility: 'airstrike',
    visual: { fw: 2, fh: 2, height: 18, style: 'mast', body: Ramps.metal, ornaments: ['dish', 'antenna'] },
  },
];
