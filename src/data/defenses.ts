/** Category C — the ten stationary defence types. */
import { ArmorClass, DamageType, EntityKind, TargetMask, type DefenseDef } from './types';
import { Colors, Ramps } from '../render/Palette';

export const DEFENSES: readonly DefenseDef[] = [
  {
    id: 'mgTurret', name: 'Machine Gun Turret', kind: EntityKind.Defense, tier: 0,
    cost: 300, buildTime: 6, hp: 620, armor: ArmorClass.Structure, sight: 10,
    fw: 1, fh: 1, blocks: true,
    weapon: {
      name: 'Twin MG', damage: 13, damageType: DamageType.Bullet, cooldown: 0.55,
      range: 8.5, projectile: 'hitscan', targets: TargetMask.All,
      accuracy: 0.82, burst: 5, burstDelay: 0.05, muzzleLength: 9, tracerColor: 0xffd070,
    },
    turret: { radius: 4, barrelLength: 11, barrelWidth: 1 },
    visual: { fw: 1, fh: 1, height: 10, style: 'emplacement', body: Ramps.concrete },
  },
  {
    id: 'mortarPit', name: 'Mortar Pit', kind: EntityKind.Defense, tier: 1,
    cost: 480, buildTime: 9, hp: 520, armor: ArmorClass.Structure, sight: 8,
    fw: 1, fh: 1, blocks: true,
    weapon: {
      name: '81mm Mortar', damage: 120, damageType: DamageType.Explosive, cooldown: 4.2,
      range: 15, minRange: 4, projectile: 'shell', splash: 2.6,
      targets: TargetMask.GroundAndStructure, accuracy: 0.62, arcing: true, speed: 8, muzzleLength: 10,
    },
    turret: { radius: 4, barrelLength: 9, barrelWidth: 2 },
    visual: { fw: 1, fh: 1, height: 8, style: 'emplacement', body: Ramps.dirt, ornaments: ['sandbags'] },
  },
  {
    id: 'apMine', name: 'Anti-Personnel Mine', kind: EntityKind.Defense, tier: 0,
    cost: 60, buildTime: 1.5, hp: 25, armor: ArmorClass.Structure, sight: 3,
    fw: 1, fh: 1, concealed: true,
    weapon: {
      name: 'Fragmentation Charge', damage: 150, damageType: DamageType.Explosive, cooldown: 1,
      range: 2, projectile: 'none', splash: 2.6, targets: TargetMask.Ground, accuracy: 1,
    },
    proximity: { triggerRadius: 1.4, targets: TargetMask.Ground },
    visual: { fw: 1, fh: 1, height: 3, style: 'mine', body: Ramps.dirt, accent: 0xd0402c },
  },
  {
    id: 'atMine', name: 'Anti-Tank Mine', kind: EntityKind.Defense, tier: 0,
    cost: 95, buildTime: 2, hp: 30, armor: ArmorClass.Structure, sight: 3,
    fw: 1, fh: 1, concealed: true,
    weapon: {
      name: 'Shaped Charge', damage: 420, damageType: DamageType.AntiTank, cooldown: 1,
      range: 2, projectile: 'none', splash: 1.8, targets: TargetMask.Ground, accuracy: 1,
    },
    proximity: { triggerRadius: 1.1, targets: TargetMask.Ground },
    visual: { fw: 1, fh: 1, height: 3, style: 'mine', body: Ramps.dirt, accent: 0xe0b040 },
  },
  {
    id: 'laserDefense', name: 'Laser Defense', kind: EntityKind.Defense, tier: 2,
    cost: 900, buildTime: 15, hp: 700, armor: ArmorClass.Structure, sight: 12,
    fw: 1, fh: 1, blocks: true,
    weapon: {
      name: 'Pulse Laser', damage: 58, damageType: DamageType.Energy, cooldown: 1.05,
      range: 10, projectile: 'beam', targets: TargetMask.All, accuracy: 1,
    },
    turret: { radius: 4, barrelLength: 12, barrelWidth: 1 },
    visual: { fw: 1, fh: 1, height: 16, style: 'tower', body: Ramps.metal, accent: Colors.laser },
  },
  {
    id: 'artilleryCannon', name: 'Artillery Cannon', kind: EntityKind.Defense, tier: 2,
    cost: 1200, buildTime: 20, hp: 900, armor: ArmorClass.Structure, sight: 10,
    fw: 2, fh: 2, blocks: true,
    weapon: {
      name: 'Fortress Gun', damage: 260, damageType: DamageType.Explosive, cooldown: 7.5,
      range: 26, minRange: 7, projectile: 'shell', splash: 4.2,
      targets: TargetMask.GroundAndStructure, accuracy: 0.6, arcing: true, speed: 11, muzzleLength: 20,
    },
    turret: { radius: 7, barrelLength: 22, barrelWidth: 2 },
    visual: { fw: 2, fh: 2, height: 14, style: 'emplacement', body: Ramps.concrete, ornaments: ['sandbags'] },
  },
  {
    id: 'samSite', name: 'SAM Site', kind: EntityKind.Defense, tier: 1,
    cost: 780, buildTime: 13, hp: 640, armor: ArmorClass.Structure, sight: 20,
    fw: 2, fh: 2, blocks: true,
    weapon: {
      name: 'Surface-to-Air Missile', damage: 175, damageType: DamageType.Explosive, cooldown: 3.6,
      range: 17, projectile: 'missile', splash: 1.6, targets: TargetMask.Air,
      accuracy: 0.92, speed: 20,
    },
    turret: { radius: 5, barrelLength: 10, barrelWidth: 2 },
    visual: { fw: 2, fh: 2, height: 11, style: 'emplacement', body: Ramps.metal, ornaments: ['dish'] },
  },
  {
    id: 'empTrap', name: 'EMP Trap', kind: EntityKind.Defense, tier: 2,
    cost: 420, buildTime: 7, hp: 60, armor: ArmorClass.Structure, sight: 4,
    fw: 1, fh: 1, concealed: true,
    weapon: {
      name: 'Capacitor Discharge', damage: 90, damageType: DamageType.EMP, cooldown: 1,
      range: 3, projectile: 'none', splash: 5.5, targets: TargetMask.All, accuracy: 1,
    },
    proximity: { triggerRadius: 2.6, targets: TargetMask.All },
    visual: { fw: 1, fh: 1, height: 4, style: 'mine', body: Ramps.metal, accent: Colors.emp },
  },
  {
    id: 'barbedWire', name: 'Barbed Wire', kind: EntityKind.Defense, tier: 0,
    cost: 35, buildTime: 1, hp: 220, armor: ArmorClass.Structure, sight: 2,
    fw: 1, fh: 1, blocks: true, weapon: null,
    visual: { fw: 1, fh: 1, height: 7, style: 'wall', body: Ramps.rust },
  },
  {
    id: 'railgunTurret', name: 'Railgun Turret', kind: EntityKind.Defense, tier: 3,
    cost: 1700, buildTime: 26, hp: 1050, armor: ArmorClass.Structure, sight: 16,
    fw: 2, fh: 2, blocks: true,
    weapon: {
      name: 'Railgun', damage: 420, damageType: DamageType.Energy, cooldown: 4.5,
      range: 18, projectile: 'beam', splash: 1.2, targets: TargetMask.All, accuracy: 1, muzzleLength: 22,
    },
    turret: { radius: 6, barrelLength: 24, barrelWidth: 1 },
    visual: { fw: 2, fh: 2, height: 18, style: 'tower', body: Ramps.metal, accent: Colors.railGlow },
  },
];
