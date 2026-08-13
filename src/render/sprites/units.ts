/**
 * Unit sprite generation: infantry, ground vehicles and aircraft.
 *
 * Vehicles and aircraft are drawn as extruded isometric boxes computed from the
 * facing angle, so all eight facings come from one routine instead of eight
 * hand-authored sprites per chassis. Infantry are drawn per-facing from a small
 * pose table because a humanoid silhouette doesn't survive being extruded.
 *
 * Only facings 0 (E), 1 (SE), 2 (S), 6 (N) and 7 (NE) are drawn; 4, 3 and 5 are
 * horizontal mirrors of 0, 1 and 7.
 */
import { PixelCanvas } from '../PixelCanvas';
import { Colors, step, type Ramp } from '../Palette';
import { shade } from '../../core/MathUtils';
import type { RNG } from '../../core/RNG';

export const FACINGS = 8;
const DEG = Math.PI / 180;

/** Facings we rasterize; the rest are mirrors. */
const DRAWN_FACINGS = [0, 1, 2, 6, 7] as const;
const MIRROR_OF: Record<number, number> = { 4: 0, 3: 1, 5: 7 };

/** Build all 8 facings from a per-facing draw function, mirroring where possible. */
export function buildFacings(draw: (facing: number) => PixelCanvas): PixelCanvas[] {
  const out: PixelCanvas[] = new Array(FACINGS);
  for (const f of DRAWN_FACINGS) out[f] = draw(f);
  for (const key of Object.keys(MIRROR_OF)) {
    const f = Number(key);
    out[f] = out[MIRROR_OF[f]].flippedX();
  }
  return out;
}

// ---------------------------------------------------------------------------
// Infantry
// ---------------------------------------------------------------------------

export type WeaponSilhouette = 'rifle' | 'longRifle' | 'tube' | 'nozzle' | 'pistol' | 'none' | 'antenna';

export interface InfantryVisual {
  /** Overall pixel height of the figure. */
  height: number;
  /** Helmet colour override, otherwise the team ramp is used. */
  helmet?: number;
  /** Torso accent, e.g. medic cross or engineer harness. */
  badge?: number;
  backpack: boolean;
  weapon: WeaponSilhouette;
  /** Bulk multiplier — heavy gunners and commandos read wider. */
  bulk: number;
  /** Optional cloak/poncho colour drawn over the torso (scouts, commandos). */
  cloak?: number;
}

interface Pose {
  /** Torso half-width in pixels. */
  bodyW: number;
  /** Head horizontal offset. */
  headDx: number;
  /** Where the weapon sits and which way it points, in screen space. */
  armDx: number;
  armDy: number;
  aimX: number;
  aimY: number;
  /** Draw the face (front-facing only). */
  showFace: boolean;
  /** Draw the backpack (rear-facing only). */
  showPack: boolean;
}

const POSES: Record<number, Pose> = {
  // East
  0: { bodyW: 2, headDx: 1, armDx: 2, armDy: 0, aimX: 1, aimY: 0, showFace: false, showPack: false },
  // South-east
  1: { bodyW: 3, headDx: 1, armDx: 2, armDy: 1, aimX: 0.86, aimY: 0.5, showFace: true, showPack: false },
  // South
  2: { bodyW: 4, headDx: 0, armDx: 1, armDy: 2, aimX: 0, aimY: 1, showFace: true, showPack: false },
  // North
  6: { bodyW: 4, headDx: 0, armDx: -1, armDy: -1, aimX: 0, aimY: -1, showFace: false, showPack: true },
  // North-east
  7: { bodyW: 3, headDx: 1, armDx: 2, armDy: -1, aimX: 0.86, aimY: -0.5, showFace: false, showPack: true },
};

/**
 * @param frame 0-3 walk cycle; 0 and 2 are the contact poses.
 */
export function drawInfantry(
  visual: InfantryVisual, team: Ramp, facing: number, frame: number, rng: RNG,
): PixelCanvas {
  const pose = POSES[facing];
  const h = visual.height;
  const w = 22;
  const px = new PixelCanvas(w, h + 4);
  const cx = w >> 1;
  const groundY = h + 1;

  // Contact shadow.
  px.fillEllipse(cx, groundY, 5, 2, Colors.shadow, 80);

  const bodyW = Math.round(pose.bodyW * visual.bulk);
  const legTop = groundY - Math.round(h * 0.38);
  const torsoTop = groundY - Math.round(h * 0.72);
  const headR = Math.max(2, Math.round(h * 0.11));
  const headY = torsoTop - headR;

  // Legs — frames 1 and 3 are the strides.
  const stride = frame === 1 ? 2 : frame === 3 ? -2 : 0;
  const legDark = step(team, 0);
  px.fillRect(cx - bodyW + 1 + stride, legTop, 2, groundY - legTop, legDark);
  px.fillRect(cx + bodyW - 2 - stride, legTop, 2, groundY - legTop, legDark);
  px.fillRect(cx - bodyW + stride, groundY - 2, 3, 2, 0x24201c);
  px.fillRect(cx + bodyW - 3 - stride, groundY - 2, 3, 2, 0x24201c);

  // Torso, lit from the left.
  const torsoH = legTop - torsoTop;
  for (let y = 0; y < torsoH; y++) {
    for (let x = -bodyW; x <= bodyW; x++) {
      const lit = x < -bodyW * 0.2;
      px.px(cx + x, torsoTop + y, lit ? step(team, 3) : step(team, 2));
    }
  }
  // Webbing.
  px.line(cx - bodyW, torsoTop + Math.round(torsoH * 0.55), cx + bodyW, torsoTop + Math.round(torsoH * 0.55), step(team, 0), 200);

  if (visual.cloak !== undefined) {
    for (let y = 0; y < torsoH + 3; y++) {
      const spread = bodyW + (y > torsoH * 0.6 ? 1 : 0);
      for (let x = -spread; x <= spread; x++) {
        if (rng.next() < 0.82) px.px(cx + x, torsoTop + y, y % 3 === 0 ? shade(visual.cloak, 0.8) : visual.cloak);
      }
    }
  }

  if (visual.badge !== undefined) {
    const by = torsoTop + Math.round(torsoH * 0.3);
    px.fillRect(cx - 1, by, 3, 1, visual.badge);
    px.fillRect(cx, by - 1, 1, 3, visual.badge);
  }

  if (visual.backpack && pose.showPack) {
    px.fillRect(cx - bodyW + 1, torsoTop + 1, bodyW * 2 - 1, Math.round(torsoH * 0.7), step(team, 1));
    px.strokeRect(cx - bodyW + 1, torsoTop + 1, bodyW * 2 - 1, Math.round(torsoH * 0.7), step(team, 0));
  }

  // Head and helmet.
  px.fillEllipse(cx + pose.headDx, headY, headR, headR, Colors.skin);
  const helmet = visual.helmet ?? step(team, 1);
  px.fillEllipse(cx + pose.headDx, headY - 1, headR + 1, headR, helmet);
  px.fillRect(cx + pose.headDx - headR - 1, headY, (headR + 1) * 2, 1, shade(helmet, 0.7));
  if (pose.showFace) {
    px.px(cx + pose.headDx - 1, headY + 1, Colors.skinShade);
    px.px(cx + pose.headDx + 1, headY + 1, Colors.skinShade);
  }

  // Weapon.
  const ax = cx + pose.armDx;
  const ay = torsoTop + Math.round(torsoH * 0.35) + pose.armDy;
  drawHandWeapon(px, visual.weapon, ax, ay, pose.aimX, pose.aimY);

  px.outline(Colors.outline, 210);
  return px;
}

function drawHandWeapon(
  px: PixelCanvas, kind: WeaponSilhouette, x: number, y: number, ax: number, ay: number,
): void {
  const metal = 0x2b2f34;
  const wood = 0x4a3524;

  switch (kind) {
    case 'rifle':
      px.line(x, y, x + ax * 7, y + ay * 7, metal);
      px.line(x - ax * 2, y - ay * 2, x, y, wood);
      break;
    case 'longRifle':
      px.line(x, y, x + ax * 11, y + ay * 11, metal);
      px.line(x - ax * 3, y - ay * 3, x, y, wood);
      px.px(x + ax * 4, y + ay * 4 - 1, 0x5d636c);
      break;
    case 'tube':
      px.line(x - ax * 3, y - ay * 3, x + ax * 8, y + ay * 8, 0x3d4a35);
      px.line(x - ax * 3, y - ay * 3 - 1, x + ax * 8, y + ay * 8 - 1, 0x55663f);
      px.px(x + ax * 8, y + ay * 8, 0x2b2f34);
      break;
    case 'nozzle':
      px.line(x, y, x + ax * 6, y + ay * 6, metal);
      px.fillEllipse(x - ax * 3, y - ay * 3, 2, 3, 0x6b2a1c);
      px.px(x + ax * 6, y + ay * 6, Colors.fireMid);
      break;
    case 'pistol':
      px.line(x, y, x + ax * 4, y + ay * 4, metal);
      break;
    case 'antenna':
      px.line(x, y, x, y - 9, 0x5d636c);
      px.px(x, y - 10, Colors.emp);
      break;
    case 'none':
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Ground vehicles
// ---------------------------------------------------------------------------

export interface VehicleVisual {
  /** Hull length and width in pixels, measured along the vehicle's own axes. */
  length: number;
  width: number;
  /** Hull height in pixels (the extrusion depth). */
  height: number;
  /** 'tread' draws continuous tracks, 'wheel' draws discrete road wheels. */
  locomotion: 'tread' | 'wheel' | 'hover' | 'leg';
  /** Rotating turret spec, or null for turretless hulls. */
  turret: { radius: number; barrelLength: number; barrelWidth: number } | null;
  /** Extra silhouette furniture. */
  fittings?: ('radarDish' | 'crate' | 'antenna' | 'plow' | 'missilePod' | 'cabin')[];
  accent?: number;
}

interface Vec2 { x: number; y: number; }

/** Iso basis for a screen-space heading: forward and right, flattened vertically. */
function isoBasis(facing: number): { f: Vec2; r: Vec2 } {
  const a = facing * 45 * DEG;
  return {
    f: { x: Math.cos(a), y: Math.sin(a) * 0.5 },
    r: { x: Math.cos(a + Math.PI / 2), y: Math.sin(a + Math.PI / 2) * 0.5 },
  };
}

function quad(c: Vec2, f: Vec2, r: Vec2, len: number, wid: number): Vec2[] {
  const hl = len / 2, hw = wid / 2;
  return [
    { x: c.x + f.x * hl + r.x * hw, y: c.y + f.y * hl + r.y * hw },
    { x: c.x + f.x * hl - r.x * hw, y: c.y + f.y * hl - r.y * hw },
    { x: c.x - f.x * hl - r.x * hw, y: c.y - f.y * hl - r.y * hw },
    { x: c.x - f.x * hl + r.x * hw, y: c.y - f.y * hl + r.y * hw },
  ];
}

/** Extrude a top-face quad downward, painting only the viewer-facing sides. */
function extrude(px: PixelCanvas, top: Vec2[], height: number, litColor: number, darkColor: number): void {
  for (let i = 0; i < top.length; i++) {
    const a = top[i];
    const b = top[(i + 1) % top.length];
    // Screen-space outward normal; edges pointing down-screen are visible.
    const nx = b.y - a.y;
    const ny = -(b.x - a.x);
    if (ny <= 0) continue;
    const lit = nx < 0;
    px.fillPolygon(
      [a, b, { x: b.x, y: b.y + height }, { x: a.x, y: a.y + height }],
      lit ? litColor : darkColor,
    );
  }
}

export const VEHICLE_CANVAS = { w: 52, h: 42 };

export function drawVehicleHull(
  visual: VehicleVisual, team: Ramp, facing: number, rng: RNG,
): PixelCanvas {
  const px = new PixelCanvas(VEHICLE_CANVAS.w, VEHICLE_CANVAS.h);
  const cx = VEHICLE_CANVAS.w / 2;
  const groundY = VEHICLE_CANVAS.h - 6;
  const { f, r } = isoBasis(facing);
  const bodyY = groundY - visual.height;
  const centre: Vec2 = { x: cx, y: bodyY };

  // Ground shadow, elongated along the hull.
  const shadowQuad = quad({ x: cx, y: groundY }, f, r, visual.length + 4, visual.width + 4);
  px.fillPolygon(shadowQuad, Colors.shadow, 70);

  // Running gear.
  if (visual.locomotion === 'tread' || visual.locomotion === 'wheel') {
    for (const side of [-1, 1]) {
      const off: Vec2 = {
        x: centre.x + r.x * (visual.width / 2) * side,
        y: centre.y + r.y * (visual.width / 2) * side,
      };
      const track = quad(
        { x: off.x, y: off.y + visual.height * 0.55 },
        f, r, visual.length, Math.max(3, visual.width * 0.28),
      );
      px.fillPolygon(track, 0x1d2024);
      if (visual.locomotion === 'wheel') {
        const wheels = 3;
        for (let i = 0; i < wheels; i++) {
          const t = (i / (wheels - 1) - 0.5) * visual.length;
          px.fillEllipse(off.x + f.x * t, off.y + f.y * t + visual.height * 0.55, 3, 2, 0x111315);
        }
      } else {
        // Track links.
        for (let i = -visual.length / 2; i < visual.length / 2; i += 3) {
          px.px(off.x + f.x * i, off.y + f.y * i + visual.height * 0.55, 0x3a3f45);
        }
      }
    }
  } else if (visual.locomotion === 'hover') {
    px.fillPolygon(quad({ x: cx, y: groundY - 1 }, f, r, visual.length, visual.width + 3), 0x2a3f4d, 140);
    for (let i = 0; i < 6; i++) {
      px.px(cx + rng.int(-12, 12), groundY - rng.int(0, 3), Colors.emp, 120);
    }
  } else if (visual.locomotion === 'leg') {
    for (const side of [-1, 1]) {
      const hx = centre.x + r.x * (visual.width / 2) * side;
      const hy = centre.y + r.y * (visual.width / 2) * side;
      px.line(hx, hy + 2, hx + side * 3, groundY - 4, 0x35393e);
      px.line(hx + side * 3, groundY - 4, hx + side * 1, groundY, 0x35393e);
      px.fillRect(hx + side * 1 - 1, groundY - 1, 3, 2, 0x22262a);
    }
  }

  // Hull: top face plus extruded sides.
  const top = quad(centre, f, r, visual.length, visual.width);
  extrude(px, top, visual.height, step(team, 2), step(team, 1));
  px.fillPolygon(top, step(team, 3));

  // Panel line along the spine and a lighter forward deck.
  const nose = quad(
    { x: centre.x + f.x * visual.length * 0.28, y: centre.y + f.y * visual.length * 0.28 },
    f, r, visual.length * 0.35, visual.width * 0.72,
  );
  px.fillPolygon(nose, step(team, 4));

  if (visual.accent !== undefined) {
    const stripe = quad(centre, f, r, visual.length * 0.9, 2);
    px.fillPolygon(stripe, visual.accent, 200);
  }

  for (const fitting of visual.fittings ?? []) {
    drawFitting(px, fitting, centre, f, r, visual, team, rng);
  }

  px.outline(Colors.outline, 220);
  return px;
}

function drawFitting(
  px: PixelCanvas, fitting: string, c: Vec2, f: Vec2, r: Vec2,
  visual: VehicleVisual, team: Ramp, rng: RNG,
): void {
  switch (fitting) {
    case 'radarDish': {
      const y = c.y - 6;
      px.line(c.x, c.y - 1, c.x, y, 0x5d636c);
      px.fillEllipse(c.x, y - 2, 6, 3, 0xb8bec6);
      px.fillEllipse(c.x, y - 2, 4, 2, 0x7f868f);
      break;
    }
    case 'crate': {
      const bx = c.x - f.x * visual.length * 0.25;
      const by = c.y - f.y * visual.length * 0.25 - 4;
      px.fillRect(bx - 5, by, 10, 5, 0x6b5236);
      px.strokeRect(bx - 5, by, 10, 5, 0x3a2a1c);
      break;
    }
    case 'antenna':
      px.line(c.x + r.x * 4, c.y + r.y * 4, c.x + r.x * 4, c.y - 10, 0x5d636c);
      break;
    case 'plow': {
      const p = quad(
        { x: c.x + f.x * visual.length * 0.6, y: c.y + f.y * visual.length * 0.6 + 2 },
        f, r, 3, visual.width + 4,
      );
      px.fillPolygon(p, 0x8a5840);
      break;
    }
    case 'missilePod': {
      for (let i = 0; i < 4; i++) {
        const off = (i - 1.5) * 3;
        px.fillRect(c.x + r.x * off - 1, c.y + r.y * off - 6, 2, 5, 0x4a5058);
        px.px(c.x + r.x * off, c.y + r.y * off - 7, 0xd0402c);
      }
      break;
    }
    case 'cabin': {
      const cabTop = quad(
        { x: c.x + f.x * visual.length * 0.25, y: c.y + f.y * visual.length * 0.25 - 5 },
        f, r, visual.length * 0.3, visual.width * 0.85,
      );
      extrude(px, cabTop, 5, step(team, 2), step(team, 1));
      px.fillPolygon(cabTop, step(team, 4));
      px.fillPolygon(
        quad({ x: c.x + f.x * visual.length * 0.34, y: c.y + f.y * visual.length * 0.34 - 4 }, f, r, 2, visual.width * 0.6),
        Colors.glassDark,
      );
      break;
    }
    default:
      rng.next();
      break;
  }
}

/** Turret drawn separately so it can rotate independently of the hull. */
export function drawTurret(visual: VehicleVisual, team: Ramp, facing: number): PixelCanvas {
  const spec = visual.turret;
  const px = new PixelCanvas(40, 28);
  if (!spec) return px;

  const cx = 20, cy = 16;
  const { f, r } = isoBasis(facing);

  // Barrel first so the mantlet overlaps its root.
  const bl = spec.barrelLength;
  const bw = spec.barrelWidth;
  const tipX = cx + f.x * bl;
  const tipY = cy + f.y * bl;
  px.fillPolygon(
    [
      { x: cx + r.x * bw, y: cy + r.y * bw },
      { x: cx - r.x * bw, y: cy - r.y * bw },
      { x: tipX - r.x * bw, y: tipY - r.y * bw },
      { x: tipX + r.x * bw, y: tipY + r.y * bw },
    ],
    0x3a4047,
  );
  px.fillEllipse(tipX, tipY, bw + 1, Math.max(1, bw), 0x1d2024);

  const dome = quad({ x: cx, y: cy - 3 }, f, r, spec.radius * 2.1, spec.radius * 1.7);
  extrude(px, dome, 4, step(team, 2), step(team, 1));
  px.fillPolygon(dome, step(team, 4));
  px.px(cx - 2, cy - 5, step(team, 0));

  px.outline(Colors.outline, 220);
  return px;
}

// ---------------------------------------------------------------------------
// Aircraft
// ---------------------------------------------------------------------------

export interface AircraftVisual {
  fuselageLength: number;
  fuselageWidth: number;
  wingSpan: number;
  wingChord: number;
  /** Rotor disc radius, or 0 for fixed-wing. */
  rotor: number;
  tail: boolean;
  /** Draws stubby weapon pylons under the wings. */
  pylons: boolean;
  glow?: number;
}

export const AIRCRAFT_CANVAS = { w: 56, h: 40 };

export function drawAircraft(visual: AircraftVisual, team: Ramp, facing: number): PixelCanvas {
  const px = new PixelCanvas(AIRCRAFT_CANVAS.w, AIRCRAFT_CANVAS.h);
  const cx = AIRCRAFT_CANVAS.w / 2;
  const cy = AIRCRAFT_CANVAS.h / 2;
  const { f, r } = isoBasis(facing);
  const centre: Vec2 = { x: cx, y: cy };

  // Wings under the fuselage.
  if (visual.wingSpan > 0) {
    const wing = quad(centre, f, r, visual.wingChord, visual.wingSpan);
    px.fillPolygon(wing, step(team, 2));
    px.fillPolygon(quad(centre, f, r, Math.max(1, visual.wingChord - 3), visual.wingSpan - 2), step(team, 3));
  }

  if (visual.tail) {
    const tailC: Vec2 = { x: cx - f.x * visual.fuselageLength * 0.45, y: cy - f.y * visual.fuselageLength * 0.45 };
    px.fillPolygon(quad(tailC, f, r, 4, visual.wingSpan * 0.4), step(team, 2));
    px.line(tailC.x, tailC.y, tailC.x, tailC.y - 5, step(team, 1));
  }

  if (visual.pylons) {
    for (const side of [-1, 1]) {
      const pxp = cx + r.x * visual.wingSpan * 0.3 * side;
      const pyp = cy + r.y * visual.wingSpan * 0.3 * side;
      px.fillPolygon(quad({ x: pxp, y: pyp + 1 }, f, r, 7, 2), 0x4a5058);
    }
  }

  // Fuselage.
  const body = quad(centre, f, r, visual.fuselageLength, visual.fuselageWidth);
  extrude(px, body, 4, step(team, 2), step(team, 1));
  px.fillPolygon(body, step(team, 4));

  // Canopy toward the nose.
  const canopy = quad(
    { x: cx + f.x * visual.fuselageLength * 0.26, y: cy + f.y * visual.fuselageLength * 0.26 - 1 },
    f, r, visual.fuselageLength * 0.24, visual.fuselageWidth * 0.7,
  );
  px.fillPolygon(canopy, Colors.glassDark);
  px.fillPolygon(
    quad({ x: cx + f.x * visual.fuselageLength * 0.3, y: cy + f.y * visual.fuselageLength * 0.3 - 2 }, f, r, 2, visual.fuselageWidth * 0.4),
    Colors.glassLit, 200,
  );

  if (visual.glow !== undefined) {
    const ex = cx - f.x * visual.fuselageLength * 0.5;
    const ey = cy - f.y * visual.fuselageLength * 0.5;
    px.fillEllipse(ex, ey, 3, 2, visual.glow, 220);
    px.fillEllipse(ex - f.x * 3, ey - f.y * 3, 2, 1, Colors.fireCore, 160);
  }

  px.outline(Colors.outline, 210);
  return px;
}

/** Blurred rotor disc; two frames alternate to suggest rotation. */
export function drawRotor(radius: number, frame: number): PixelCanvas {
  const size = radius * 2 + 6;
  const px = new PixelCanvas(size, Math.max(6, radius + 6));
  const cx = size / 2;
  const cy = px.height / 2;

  px.fillEllipse(cx, cy, radius, Math.max(2, radius * 0.32), 0xc8d4dc, 45);
  const phase = frame * Math.PI * 0.5;
  for (let i = 0; i < 2; i++) {
    const a = phase + i * Math.PI;
    px.line(cx, cy, cx + Math.cos(a) * radius, cy + Math.sin(a) * radius * 0.35, 0xdde6ec, 170);
  }
  px.fillEllipse(cx, cy, 2, 1, 0x3a4047);
  return px;
}

/** Soft elliptical drop shadow projected under airborne units. */
export function drawAirShadow(width: number): PixelCanvas {
  const px = new PixelCanvas(width + 4, Math.round(width * 0.5) + 4);
  px.fillEllipse(px.width / 2, px.height / 2, width / 2, width * 0.22, Colors.shadow, 90);
  px.fillEllipse(px.width / 2, px.height / 2, width / 2 - 2, width * 0.16, Colors.shadow, 60);
  return px;
}
