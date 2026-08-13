/** Category E — the ten flying object types. */
import { ArmorClass, DamageType, EntityKind, TargetMask, type AircraftDef } from './types';
import { Colors } from '../render/Palette';

export const AIRCRAFT: readonly AircraftDef[] = [
  {
    id: 'scoutDrone', name: 'Scout Drone', kind: EntityKind.Aircraft, tier: 0,
    cost: 150, buildTime: 4, hp: 60, armor: ArmorClass.Air, sight: 22,
    speed: 8.5, turnRate: 3.6, altitude: 5, rotorRadius: 7, loiter: 999,
    weapon: null,
    visual: { fuselageLength: 12, fuselageWidth: 8, wingSpan: 0, wingChord: 0, rotor: 7, tail: false, pylons: false },
  },
  {
    id: 'attackHelicopter', name: 'Attack Helicopter', kind: EntityKind.Aircraft, tier: 2,
    cost: 780, buildTime: 14, hp: 420, armor: ArmorClass.Air, sight: 13,
    speed: 6.4, turnRate: 2.4, altitude: 6, rotorRadius: 15, loiter: 999,
    weapon: {
      name: 'Chin Gun', damage: 16, damageType: DamageType.AntiTank, cooldown: 0.9,
      range: 8, projectile: 'hitscan', targets: TargetMask.All,
      accuracy: 0.8, burst: 3, burstDelay: 0.07, muzzleLength: 9, tracerColor: 0xffd070,
    },
    weapon2: {
      name: 'Hellfire Pods', damage: 96, damageType: DamageType.AntiTank, cooldown: 5.5,
      range: 9.5, projectile: 'missile', splash: 1.4, targets: TargetMask.GroundAndStructure,
      accuracy: 0.86, speed: 16,
    },
    visual: { fuselageLength: 26, fuselageWidth: 10, wingSpan: 16, wingChord: 5, rotor: 15, tail: true, pylons: true },
  },
  {
    id: 'transportChopper', name: 'Transport Chopper', kind: EntityKind.Aircraft, tier: 1,
    cost: 560, buildTime: 11, hp: 480, armor: ArmorClass.Air, sight: 11,
    speed: 5.6, turnRate: 1.9, altitude: 6, rotorRadius: 18, loiter: 999, transportSlots: 8,
    weapon: {
      name: 'Door Gun', damage: 9, damageType: DamageType.Bullet, cooldown: 0.8,
      range: 6, projectile: 'hitscan', targets: TargetMask.Ground,
      accuracy: 0.65, burst: 4, burstDelay: 0.06, muzzleLength: 6, tracerColor: 0xffd070,
    },
    visual: { fuselageLength: 30, fuselageWidth: 13, wingSpan: 0, wingChord: 0, rotor: 18, tail: true, pylons: false },
  },
  {
    id: 'fighterJet', name: 'Fighter Jet', kind: EntityKind.Aircraft, tier: 2,
    cost: 820, buildTime: 15, hp: 300, armor: ArmorClass.Air, sight: 16,
    speed: 13.5, turnRate: 1.5, altitude: 11, rotorRadius: 0, loiter: 42,
    weapon: {
      name: 'Air-to-Air Missiles', damage: 130, damageType: DamageType.Explosive, cooldown: 3.4,
      range: 10, projectile: 'missile', splash: 1.0, targets: TargetMask.Air,
      accuracy: 0.9, speed: 22,
    },
    weapon2: {
      name: 'Nose Cannon', damage: 22, damageType: DamageType.AntiTank, cooldown: 0.5,
      range: 7, projectile: 'hitscan', targets: TargetMask.All,
      accuracy: 0.72, burst: 5, burstDelay: 0.04, muzzleLength: 8, tracerColor: 0xfff0c0,
    },
    visual: { fuselageLength: 30, fuselageWidth: 8, wingSpan: 24, wingChord: 9, rotor: 0, tail: true, pylons: true, glow: Colors.fireMid },
  },
  {
    id: 'heavyBomber', name: 'Heavy Bomber', kind: EntityKind.Aircraft, tier: 3,
    cost: 1500, buildTime: 26, hp: 760, armor: ArmorClass.Air, sight: 12,
    speed: 7.2, turnRate: 0.75, altitude: 13, rotorRadius: 0, loiter: 60,
    weapon: {
      name: 'Bomb Bay', damage: 210, damageType: DamageType.Explosive, cooldown: 0.55,
      range: 2.5, projectile: 'bomb', splash: 3.6, targets: TargetMask.GroundAndStructure,
      accuracy: 0.6, burst: 6, burstDelay: 0.28, speed: 7,
    },
    visual: { fuselageLength: 40, fuselageWidth: 13, wingSpan: 40, wingChord: 12, rotor: 0, tail: true, pylons: true, glow: Colors.fireEdge },
  },
  {
    id: 'cruiseMissile', name: 'Cruise Missile', kind: EntityKind.Aircraft, tier: 3,
    cost: 900, buildTime: 12, hp: 45, armor: ArmorClass.Air, sight: 10,
    speed: 11, turnRate: 1.2, altitude: 8, rotorRadius: 0, loiter: 35, oneShot: true,
    weapon: {
      name: 'Warhead', damage: 640, damageType: DamageType.Explosive, cooldown: 1,
      range: 1.2, projectile: 'none', splash: 5.5, targets: TargetMask.GroundAndStructure, accuracy: 1,
    },
    visual: { fuselageLength: 22, fuselageWidth: 5, wingSpan: 11, wingChord: 3, rotor: 0, tail: true, pylons: false, glow: Colors.fireCore },
  },
  {
    id: 'interceptor', name: 'Interceptor', kind: EntityKind.Aircraft, tier: 2,
    cost: 640, buildTime: 12, hp: 240, armor: ArmorClass.Air, sight: 18,
    speed: 15.5, turnRate: 2.0, altitude: 12, rotorRadius: 0, loiter: 38,
    weapon: {
      name: 'Interceptor Cannon', damage: 30, damageType: DamageType.Explosive, cooldown: 0.4,
      range: 8, projectile: 'hitscan', targets: TargetMask.Air,
      accuracy: 0.86, burst: 4, burstDelay: 0.05, muzzleLength: 9, tracerColor: 0xfff0c0,
    },
    visual: { fuselageLength: 26, fuselageWidth: 7, wingSpan: 20, wingChord: 7, rotor: 0, tail: true, pylons: false, glow: Colors.emp },
  },
  {
    id: 'gunship', name: 'Gunship', kind: EntityKind.Aircraft, tier: 3,
    cost: 1250, buildTime: 22, hp: 690, armor: ArmorClass.Air, sight: 14,
    speed: 5.2, turnRate: 1.1, altitude: 9, rotorRadius: 0, loiter: 70,
    weapon: {
      name: 'Side Battery', damage: 44, damageType: DamageType.Explosive, cooldown: 0.42,
      range: 9, projectile: 'shell', splash: 1.5, targets: TargetMask.GroundAndStructure,
      accuracy: 0.78, burst: 3, burstDelay: 0.13, speed: 20, muzzleLength: 12,
    },
    visual: { fuselageLength: 38, fuselageWidth: 12, wingSpan: 34, wingChord: 10, rotor: 0, tail: true, pylons: true, glow: Colors.fireMid },
  },
  {
    id: 'empDrone', name: 'EMP Drone', kind: EntityKind.Aircraft, tier: 3,
    cost: 700, buildTime: 13, hp: 180, armor: ArmorClass.Air, sight: 15,
    speed: 8.0, turnRate: 2.6, altitude: 8, rotorRadius: 9, loiter: 999,
    weapon: {
      name: 'EMP Pulse', damage: 55, damageType: DamageType.EMP, cooldown: 6,
      range: 6, projectile: 'none', splash: 4.5, targets: TargetMask.All, accuracy: 1,
    },
    visual: { fuselageLength: 16, fuselageWidth: 11, wingSpan: 0, wingChord: 0, rotor: 9, tail: false, pylons: false, glow: Colors.emp },
  },
  {
    id: 'orbitalStrike', name: 'Orbital Strike', kind: EntityKind.Aircraft, tier: 4,
    cost: 1800, buildTime: 20, hp: 9999, armor: ArmorClass.Air, sight: 30,
    speed: 24, turnRate: 4, altitude: 26, rotorRadius: 0, loiter: 25, oneShot: true,
    weapon: {
      name: 'Kinetic Lance', damage: 1400, damageType: DamageType.Energy, cooldown: 1,
      range: 1.5, projectile: 'beam', splash: 7, targets: TargetMask.GroundAndStructure, accuracy: 1,
    },
    visual: { fuselageLength: 10, fuselageWidth: 6, wingSpan: 0, wingChord: 0, rotor: 0, tail: false, pylons: false, glow: Colors.railCore },
  },
];
