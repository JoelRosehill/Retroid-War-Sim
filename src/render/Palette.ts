/**
 * A deliberately small, hand-tuned palette. Restricting every sprite to these
 * ramps is what makes procedurally generated art read as a coherent tileset
 * rather than as noise — the same discipline the 90s/2000s isometric games
 * followed because of hardware palette limits.
 */

export interface Ramp {
  /** Darkest to lightest, 5 steps. */
  readonly steps: readonly [number, number, number, number, number];
}

function ramp(a: number, b: number, c: number, d: number, e: number): Ramp {
  return { steps: [a, b, c, d, e] };
}

export const Ramps = {
  grass: ramp(0x1e3320, 0x2c4a2b, 0x3d6135, 0x527a41, 0x6b9451),
  plains: ramp(0x3a3a24, 0x4e4c30, 0x63603c, 0x7a7550, 0x928c66),
  dirt: ramp(0x2e2318, 0x413221, 0x55432c, 0x6b5639, 0x836c4a),
  mud: ramp(0x241c14, 0x33281c, 0x433526, 0x544330, 0x66533c),
  sand: ramp(0x6a5a38, 0x86744a, 0x9f8c5e, 0xb8a474, 0xd0bd8f),
  rock: ramp(0x232629, 0x35393e, 0x484d54, 0x5d636c, 0x757c86),
  mountain: ramp(0x1b1d21, 0x2c3036, 0x40454d, 0x585e68, 0x757d89),
  water: ramp(0x0b1f33, 0x123049, 0x1a4463, 0x24587e, 0x336f9b),
  foliage: ramp(0x13251a, 0x1d3823, 0x284c2d, 0x356239, 0x447a46),
  metal: ramp(0x1c1f22, 0x2e3338, 0x454b52, 0x60676f, 0x7f868f),
  concrete: ramp(0x2a2b29, 0x3d3e3a, 0x53544e, 0x6b6c65, 0x86877e),
  rust: ramp(0x2b1710, 0x40241a, 0x573224, 0x6f4330, 0x8a583f),
} as const;

export const Colors = {
  transparentKey: 0xff00ff,

  outline: 0x0b0d10,
  outlineSoft: 0x141821,
  shadow: 0x000000,

  skin: 0xa9764f,
  skinShade: 0x7c5336,

  glassLit: 0x9fd7f0,
  glassDark: 0x2a5a75,

  muzzle: 0xffe9a8,
  fireCore: 0xfff2c4,
  fireMid: 0xffa73a,
  fireEdge: 0xd8451c,
  smokeLight: 0x9aa0a6,
  smokeDark: 0x4a4f55,
  sparkHot: 0xfff6d0,

  laser: 0xff4d4d,
  laserGlow: 0xff9b9b,
  railCore: 0xd6f0ff,
  railGlow: 0x66c6ff,
  emp: 0x8ad8ff,
  empCore: 0xe8fbff,

  bloodDark: 0x4a1414,

  healthGood: 0x54c25a,
  healthWarn: 0xe0b040,
  healthBad: 0xd0402c,

  hudBg: 0x0d1218,
  hudLine: 0x2c3a48,
  hudText: 0x9fb4c7,
  hudGold: 0xe8c46a,
} as const;

/** Per-team ramp used to tint infantry fatigues, hull plating and flags. */
export function teamRamp(primary: number, secondary: number): Ramp {
  const mix = (a: number, b: number, t: number): number => {
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return (
      (Math.round(ar + (br - ar) * t) << 16) |
      (Math.round(ag + (bg - ag) * t) << 8) |
      Math.round(ab + (bb - ab) * t)
    );
  };
  return ramp(
    mix(secondary, 0x000000, 0.45),
    secondary,
    mix(secondary, primary, 0.6),
    primary,
    mix(primary, 0xffffff, 0.32),
  );
}

/** Fetch a ramp step with clamping, so callers can index freely. */
export function step(r: Ramp, index: number): number {
  return r.steps[Math.max(0, Math.min(4, index | 0))];
}
