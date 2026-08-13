/** Category A — the ten infantry types. */
import { ArmorClass, DamageType, EntityKind, TargetMask, type InfantryDef } from './types';
import { Colors } from '../render/Palette';

export const INFANTRY: readonly InfantryDef[] = [
  {
    id: 'rifleman', name: 'Rifleman', kind: EntityKind.Infantry, tier: 0,
    cost: 100, buildTime: 3.5, hp: 110, armor: ArmorClass.Infantry, sight: 9, speed: 2.1,
    weapon: {
      name: 'Service Rifle', damage: 11, damageType: DamageType.Bullet, cooldown: 0.75,
      range: 6.5, projectile: 'hitscan', targets: TargetMask.GroundAndStructure,
      accuracy: 0.82, burst: 3, burstDelay: 0.07, muzzleLength: 7, tracerColor: 0xffe08a,
    },
    visual: { height: 20, backpack: true, weapon: 'rifle', bulk: 1 },
  },
  {
    id: 'sniper', name: 'Sniper', kind: EntityKind.Infantry, tier: 1,
    cost: 320, buildTime: 7, hp: 80, armor: ArmorClass.Infantry, sight: 15, speed: 1.7,
    weapon: {
      name: 'Anti-Materiel Rifle', damage: 95, damageType: DamageType.Bullet, cooldown: 3.1,
      range: 13, projectile: 'hitscan', targets: TargetMask.GroundAndStructure,
      accuracy: 0.97, muzzleLength: 11, tracerColor: 0xfff0c0,
    },
    visual: { height: 20, backpack: false, weapon: 'longRifle', bulk: 0.9, cloak: 0x4a5232 },
  },
  {
    id: 'flamethrower', name: 'Flamethrower', kind: EntityKind.Infantry, tier: 1,
    cost: 220, buildTime: 5.5, hp: 140, armor: ArmorClass.Infantry, sight: 7, speed: 1.85,
    weapon: {
      name: 'Incinerator', damage: 26, damageType: DamageType.Fire, cooldown: 0.45,
      range: 3.4, projectile: 'hitscan', splash: 1.1, targets: TargetMask.GroundAndStructure,
      accuracy: 1, muzzleLength: 14, tracerColor: Colors.fireMid,
    },
    visual: { height: 21, backpack: true, weapon: 'nozzle', bulk: 1.2, helmet: 0x6b2a1c },
  },
  {
    id: 'medic', name: 'Medic', kind: EntityKind.Infantry, tier: 0,
    cost: 180, buildTime: 4.5, hp: 95, armor: ArmorClass.Infantry, sight: 9, speed: 2.2,
    weapon: {
      name: 'Sidearm', damage: 7, damageType: DamageType.Bullet, cooldown: 1.0,
      range: 4.5, projectile: 'hitscan', targets: TargetMask.Ground, accuracy: 0.7, muzzleLength: 4,
    },
    healRate: 14,
    visual: { height: 20, backpack: true, weapon: 'pistol', bulk: 1, helmet: 0xdadada, badge: 0xd0402c },
  },
  {
    id: 'engineer', name: 'Engineer', kind: EntityKind.Infantry, tier: 0,
    cost: 200, buildTime: 5, hp: 90, armor: ArmorClass.Infantry, sight: 8, speed: 2.0,
    weapon: null,
    repairRate: 22, canCapture: true,
    visual: { height: 20, backpack: true, weapon: 'none', bulk: 1.05, helmet: 0xe0b040, badge: 0x2c3a48 },
  },
  {
    id: 'heavyGunner', name: 'Heavy Gunner', kind: EntityKind.Infantry, tier: 1,
    cost: 260, buildTime: 6, hp: 175, armor: ArmorClass.Infantry, sight: 8.5, speed: 1.45,
    weapon: {
      name: 'Squad Automatic', damage: 9, damageType: DamageType.Bullet, cooldown: 0.9,
      range: 7.5, projectile: 'hitscan', targets: TargetMask.All,
      accuracy: 0.7, burst: 7, burstDelay: 0.05, muzzleLength: 9, tracerColor: 0xffd070,
    },
    visual: { height: 22, backpack: true, weapon: 'rifle', bulk: 1.45 },
  },
  {
    id: 'scout', name: 'Scout', kind: EntityKind.Infantry, tier: 0,
    cost: 90, buildTime: 2.8, hp: 70, armor: ArmorClass.Infantry, sight: 17, speed: 3.1,
    weapon: {
      name: 'Carbine', damage: 8, damageType: DamageType.Bullet, cooldown: 0.8,
      range: 5.5, projectile: 'hitscan', targets: TargetMask.Ground, accuracy: 0.75, muzzleLength: 6,
    },
    visual: { height: 19, backpack: false, weapon: 'rifle', bulk: 0.85, cloak: 0x3f4a35 },
  },
  {
    id: 'antiTank', name: 'Anti-Tank', kind: EntityKind.Infantry, tier: 1,
    cost: 280, buildTime: 6.5, hp: 105, armor: ArmorClass.Infantry, sight: 9, speed: 1.7,
    weapon: {
      name: 'Rocket Tube', damage: 88, damageType: DamageType.AntiTank, cooldown: 3.4,
      range: 8.5, projectile: 'rocket', splash: 0.9, targets: TargetMask.GroundAndStructure,
      accuracy: 0.85, speed: 12, muzzleLength: 10,
    },
    visual: { height: 21, backpack: true, weapon: 'tube', bulk: 1.15 },
  },
  {
    id: 'commando', name: 'Commando', kind: EntityKind.Infantry, tier: 2,
    cost: 700, buildTime: 13, hp: 320, armor: ArmorClass.Infantry, sight: 13, speed: 2.5,
    weapon: {
      name: 'Assault Package', damage: 20, damageType: DamageType.Bullet, cooldown: 0.6,
      range: 8, projectile: 'hitscan', targets: TargetMask.All,
      accuracy: 0.93, burst: 4, burstDelay: 0.06, muzzleLength: 9, tracerColor: 0xffe9a8,
    },
    weapon2: {
      name: 'Demolition Charge', damage: 220, damageType: DamageType.Explosive, cooldown: 9,
      range: 2.5, projectile: 'none', splash: 2.4, targets: TargetMask.Structure, accuracy: 1,
    },
    visual: { height: 22, backpack: true, weapon: 'rifle', bulk: 1.2, helmet: 0x22262a, cloak: 0x2a2f24 },
  },
  {
    id: 'droneOperator', name: 'Drone Operator', kind: EntityKind.Infantry, tier: 2,
    cost: 380, buildTime: 8, hp: 95, armor: ArmorClass.Infantry, sight: 20, speed: 1.9,
    weapon: {
      name: 'Marker Laser', damage: 5, damageType: DamageType.Energy, cooldown: 1.4,
      range: 10, projectile: 'beam', targets: TargetMask.All, accuracy: 0.9,
    },
    spawnsDrone: true,
    visual: { height: 20, backpack: true, weapon: 'antenna', bulk: 1, helmet: 0x2c3a48, badge: Colors.emp },
  },
];
