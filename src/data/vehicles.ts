/** Category D — the ten ground machinery types. */
import { ArmorClass, DamageType, EntityKind, TargetMask, type VehicleDef } from './types';

export const VEHICLES: readonly VehicleDef[] = [
  {
    id: 'lightJeep', name: 'Light Jeep', kind: EntityKind.Vehicle, tier: 0,
    cost: 200, buildTime: 4, hp: 150, armor: ArmorClass.Light, sight: 12,
    speed: 5.6, accel: 6.5, brake: 9, turnRate: 3.4, radius: 0.45, crushes: true,
    weapon: {
      name: 'Pintle MG', damage: 10, damageType: DamageType.Bullet, cooldown: 0.7,
      range: 6.5, projectile: 'hitscan', targets: TargetMask.All,
      accuracy: 0.7, burst: 4, burstDelay: 0.06, muzzleLength: 8, tracerColor: 0xffd070,
    },
    visual: {
      length: 20, width: 11, height: 6, locomotion: 'wheel',
      turret: { radius: 3, barrelLength: 9, barrelWidth: 1 },
    },
  },
  {
    id: 'apc', name: 'Armored Personnel Carrier', kind: EntityKind.Vehicle, tier: 1,
    cost: 420, buildTime: 8, hp: 460, armor: ArmorClass.Light, sight: 10,
    speed: 3.9, accel: 3.2, brake: 5, turnRate: 2.0, radius: 0.6, crushes: true, transportSlots: 5,
    weapon: {
      name: 'Cupola Gun', damage: 12, damageType: DamageType.Bullet, cooldown: 0.85,
      range: 6.8, projectile: 'hitscan', targets: TargetMask.All,
      accuracy: 0.72, burst: 3, burstDelay: 0.07, muzzleLength: 7, tracerColor: 0xffd070,
    },
    visual: {
      length: 26, width: 14, height: 9, locomotion: 'tread',
      turret: { radius: 3, barrelLength: 7, barrelWidth: 1 },
      fittings: ['crate'],
    },
  },
  {
    id: 'lightTank', name: 'Light Tank', kind: EntityKind.Vehicle, tier: 1,
    cost: 520, buildTime: 10, hp: 620, armor: ArmorClass.Heavy, sight: 10,
    speed: 3.4, accel: 2.6, brake: 4.5, turnRate: 1.7, radius: 0.65, crushes: true,
    weapon: {
      name: '76mm Cannon', damage: 72, damageType: DamageType.AntiTank, cooldown: 2.2,
      range: 8.5, projectile: 'shell', splash: 0.8, targets: TargetMask.GroundAndStructure,
      accuracy: 0.88, speed: 22, muzzleLength: 13,
    },
    visual: {
      length: 28, width: 15, height: 8, locomotion: 'tread',
      turret: { radius: 5, barrelLength: 15, barrelWidth: 1 },
    },
  },
  {
    id: 'heavyTank', name: 'Heavy Tank', kind: EntityKind.Vehicle, tier: 2,
    cost: 980, buildTime: 17, hp: 1250, armor: ArmorClass.Heavy, sight: 10.5,
    speed: 2.3, accel: 1.5, brake: 3, turnRate: 1.05, radius: 0.8, crushes: true,
    weapon: {
      name: '120mm Cannon', damage: 155, damageType: DamageType.AntiTank, cooldown: 3.2,
      range: 10, projectile: 'shell', splash: 1.4, targets: TargetMask.GroundAndStructure,
      accuracy: 0.9, speed: 24, muzzleLength: 17,
    },
    weapon2: {
      name: 'Coaxial MG', damage: 8, damageType: DamageType.Bullet, cooldown: 0.6,
      range: 6, projectile: 'hitscan', targets: TargetMask.Ground,
      accuracy: 0.75, burst: 4, burstDelay: 0.05, muzzleLength: 6, tracerColor: 0xffd070,
    },
    visual: {
      length: 34, width: 19, height: 10, locomotion: 'tread',
      turret: { radius: 7, barrelLength: 19, barrelWidth: 2 },
    },
  },
  {
    id: 'artilleryTruck', name: 'Artillery Truck', kind: EntityKind.Vehicle, tier: 2,
    cost: 860, buildTime: 15, hp: 380, armor: ArmorClass.Light, sight: 8,
    speed: 2.8, accel: 2.0, brake: 4, turnRate: 1.4, radius: 0.6,
    weapon: {
      name: '155mm Howitzer', damage: 190, damageType: DamageType.Explosive, cooldown: 6.5,
      range: 20, minRange: 5, projectile: 'shell', splash: 3.2,
      targets: TargetMask.GroundAndStructure, accuracy: 0.62, arcing: true, speed: 9, muzzleLength: 16,
    },
    visual: {
      length: 30, width: 14, height: 8, locomotion: 'wheel',
      turret: { radius: 5, barrelLength: 20, barrelWidth: 2 },
      fittings: ['cabin'],
    },
  },
  {
    id: 'radarMobile', name: 'Radar Mobile', kind: EntityKind.Vehicle, tier: 1,
    cost: 460, buildTime: 9, hp: 300, armor: ArmorClass.Light, sight: 24,
    speed: 3.6, accel: 3.0, brake: 5, turnRate: 2.2, radius: 0.55,
    weapon: null,
    visual: {
      length: 26, width: 13, height: 8, locomotion: 'wheel', turret: null,
      fittings: ['radarDish', 'cabin'],
    },
  },
  {
    id: 'engineerVehicle', name: 'Engineer Vehicle', kind: EntityKind.Vehicle, tier: 1,
    cost: 500, buildTime: 10, hp: 520, armor: ArmorClass.Light, sight: 8,
    speed: 3.0, accel: 2.4, brake: 4, turnRate: 1.8, radius: 0.6, repairRate: 38,
    weapon: null,
    visual: {
      length: 27, width: 15, height: 9, locomotion: 'tread', turret: null,
      fittings: ['plow', 'antenna'],
      accent: 0xe0b040,
    },
  },
  {
    id: 'supplyTruck', name: 'Supply Truck', kind: EntityKind.Vehicle, tier: 0,
    cost: 340, buildTime: 7, hp: 280, armor: ArmorClass.Light, sight: 8,
    speed: 4.0, accel: 3.0, brake: 5, turnRate: 2.0, radius: 0.55, supplyBonus: 4,
    weapon: null,
    visual: {
      length: 28, width: 13, height: 9, locomotion: 'wheel', turret: null,
      fittings: ['cabin', 'crate'],
    },
  },
  {
    id: 'mechWalker', name: 'Mech Walker', kind: EntityKind.Vehicle, tier: 3,
    cost: 1450, buildTime: 24, hp: 1450, armor: ArmorClass.Heavy, sight: 12,
    speed: 2.0, accel: 2.2, brake: 4, turnRate: 2.4, radius: 0.75, crushes: true,
    weapon: {
      name: 'Twin Autocannon', damage: 34, damageType: DamageType.AntiTank, cooldown: 1.1,
      range: 9, projectile: 'shell', splash: 0.7, targets: TargetMask.All,
      accuracy: 0.86, burst: 2, burstDelay: 0.12, speed: 26, muzzleLength: 13,
    },
    weapon2: {
      name: 'Shoulder Rockets', damage: 70, damageType: DamageType.Explosive, cooldown: 7,
      range: 11, projectile: 'rocket', splash: 2.2, targets: TargetMask.GroundAndStructure,
      accuracy: 0.7, burst: 4, burstDelay: 0.15, speed: 13,
    },
    visual: {
      length: 20, width: 18, height: 18, locomotion: 'leg',
      turret: { radius: 6, barrelLength: 13, barrelWidth: 2 },
      fittings: ['missilePod'],
    },
  },
  {
    id: 'hovercraft', name: 'Hovercraft', kind: EntityKind.Vehicle, tier: 2,
    cost: 640, buildTime: 12, hp: 420, armor: ArmorClass.Light, sight: 11,
    speed: 5.0, accel: 3.4, brake: 2.6, turnRate: 1.9, radius: 0.6,
    amphibious: true, transportSlots: 4,
    weapon: {
      name: 'Rocket Rack', damage: 46, damageType: DamageType.Explosive, cooldown: 2.6,
      range: 8, projectile: 'rocket', splash: 1.6, targets: TargetMask.GroundAndStructure,
      accuracy: 0.74, burst: 2, burstDelay: 0.18, speed: 14,
    },
    visual: {
      length: 28, width: 18, height: 7, locomotion: 'hover',
      turret: { radius: 4, barrelLength: 8, barrelWidth: 2 },
      fittings: ['missilePod'],
    },
  },
];
