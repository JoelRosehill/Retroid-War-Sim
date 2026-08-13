/**
 * Building and stationary-defence sprites.
 *
 * A structure is an extruded isometric box over its footprint diamond plus a
 * per-style ornament pass. Twenty building types and ten defence types share
 * one geometry routine; what distinguishes them is the ornament, the footprint
 * and the palette — which is also how the games we're imitating did it.
 */
import { PixelCanvas } from '../PixelCanvas';
import { Colors, Ramps, step, type Ramp } from '../Palette';
import { TILE_W, TILE_H } from '../../core/Config';
import { shade } from '../../core/MathUtils';
import type { RNG } from '../../core/RNG';

const HALF_W = TILE_W / 2;
const HALF_H = TILE_H / 2;

export type StructureStyle =
  | 'block' | 'hangar' | 'tower' | 'dome' | 'pad' | 'wall' | 'gate'
  | 'silo' | 'derrick' | 'shed' | 'bunker' | 'mast' | 'emplacement' | 'mine';

export interface StructureVisual {
  /** Footprint in tiles. */
  fw: number;
  fh: number;
  /** Wall height in pixels. */
  height: number;
  style: StructureStyle;
  /** Base body ramp; team colour is applied as trim so factions stay readable. */
  body?: Ramp;
  accent?: number;
  /** Windows lit at night / when operational. */
  windows?: boolean;
  /** Rooftop furniture. */
  ornaments?: ('vent' | 'dish' | 'antenna' | 'chimney' | 'crane' | 'lamp' | 'flag' | 'sandbags')[];
}

interface Vec2 { x: number; y: number; }

/** Screen-space corners of a w x h footprint diamond, relative to the canvas. */
function footprintDiamond(fw: number, fh: number, originX: number, originY: number): Vec2[] {
  return [
    { x: originX, y: originY },
    { x: originX + fw * HALF_W, y: originY + fw * HALF_H },
    { x: originX + fw * HALF_W - fh * HALF_W, y: originY + (fw + fh) * HALF_H },
    { x: originX - fh * HALF_W, y: originY + fh * HALF_H },
  ];
}

export interface StructureSprite {
  canvas: PixelCanvas;
  /** Anchor offsets, in pixels from the top-left of the canvas to the footprint's north corner. */
  anchorX: number;
  anchorY: number;
}

export function drawStructure(visual: StructureVisual, team: Ramp, rng: RNG): StructureSprite {
  const { fw, fh, height } = visual;
  const bodyRamp = visual.body ?? Ramps.concrete;

  // Mines are concealed ordnance, not architecture: no apron, no walls, no
  // team stripe — just a disturbed patch of earth with a fuse showing.
  if (visual.style === 'mine') {
    const canvas = drawMine(visual.accent ?? 0xd0402c, rng);
    return { canvas, anchorX: canvas.width / 2, anchorY: canvas.height / 2 };
  }

  const pad = 10;
  const width = (fw + fh) * HALF_W + pad * 2;
  const canvasH = (fw + fh) * HALF_H + height + pad * 2 + 14;
  const px = new PixelCanvas(Math.ceil(width), Math.ceil(canvasH));

  // Footprint origin (north corner of the diamond) inside the canvas.
  const originX = pad + fh * HALF_W;
  const originY = pad + 14;

  const ground = footprintDiamond(fw, fh, originX, originY);
  const roof = ground.map((p) => ({ x: p.x, y: p.y - height }));

  // Cast shadow, offset south-east.
  px.fillPolygon(ground.map((p) => ({ x: p.x + 3, y: p.y + 2 })), Colors.shadow, 60);

  // Concrete apron so the building doesn't float on the terrain.
  px.fillPolygon(ground, step(bodyRamp, 1));

  // Walls: only the two viewer-facing quads of the diamond.
  for (let i = 0; i < 4; i++) {
    const a = roof[i];
    const b = roof[(i + 1) % 4];
    const nx = b.y - a.y;
    const ny = -(b.x - a.x);
    if (ny <= 0) continue;
    const lit = nx < 0;
    px.fillPolygon(
      [a, b, { x: b.x, y: b.y + height }, { x: a.x, y: a.y + height }],
      lit ? step(bodyRamp, 3) : step(bodyRamp, 2),
    );
    // Vertical panel seams.
    const segs = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 12));
    for (let s = 1; s < segs; s++) {
      const t = s / segs;
      const sx = a.x + (b.x - a.x) * t;
      const sy = a.y + (b.y - a.y) * t;
      px.line(sx, sy, sx, sy + height, step(bodyRamp, lit ? 2 : 1), 150);
    }
  }

  // Roof.
  px.fillPolygon(roof, step(bodyRamp, 4));
  px.fillPolygon(
    roof.map((p, i) => {
      const c = roofCentre(roof);
      return { x: p.x + (c.x - p.x) * 0.18, y: p.y + (c.y - p.y) * 0.18 + (i === 0 ? 0 : 0) };
    }),
    shade(step(bodyRamp, 4), 1.06),
  );

  // Team stripe around the top of the walls.
  for (let i = 0; i < 4; i++) {
    const a = roof[i];
    const b = roof[(i + 1) % 4];
    if (-(b.x - a.x) <= 0) continue;
    px.line(a.x, a.y + 2, b.x, b.y + 2, step(team, 3));
    px.line(a.x, a.y + 3, b.x, b.y + 3, step(team, 1));
  }

  if (visual.windows) drawWindows(px, roof, height, rng);

  drawStyleOrnament(px, visual, roof, ground, team, rng);

  for (const orn of visual.ornaments ?? []) {
    drawRoofOrnament(px, orn, roofCentre(roof), team, rng);
  }

  px.outline(Colors.outline, 225);
  return { canvas: px, anchorX: originX, anchorY: originY };
}

function roofCentre(roof: Vec2[]): Vec2 {
  return {
    x: (roof[0].x + roof[1].x + roof[2].x + roof[3].x) / 4,
    y: (roof[0].y + roof[1].y + roof[2].y + roof[3].y) / 4,
  };
}

function drawWindows(px: PixelCanvas, roof: Vec2[], height: number, rng: RNG): void {
  for (let i = 0; i < 4; i++) {
    const a = roof[i];
    const b = roof[(i + 1) % 4];
    if (-(b.x - a.x) <= 0) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const count = Math.max(1, Math.floor(len / 11));
    const rows = Math.max(1, Math.floor(height / 10));
    for (let c = 0; c < count; c++) {
      for (let r = 0; r < rows; r++) {
        const t = (c + 0.5) / count;
        const wx = a.x + (b.x - a.x) * t;
        const wy = a.y + (b.y - a.y) * t + 6 + r * 10;
        const lit = rng.bool(0.55);
        px.fillRect(wx - 1, wy, 3, 3, lit ? 0xe0c274 : Colors.glassDark);
        px.px(wx - 1, wy, shade(lit ? 0xe0c274 : Colors.glassDark, 0.6));
      }
    }
  }
}

function drawStyleOrnament(
  px: PixelCanvas, visual: StructureVisual, roof: Vec2[], ground: Vec2[], team: Ramp, rng: RNG,
): void {
  const c = roofCentre(roof);
  const accent = visual.accent ?? step(team, 3);

  switch (visual.style) {
    case 'hangar': {
      // Barrel-vault roof plus a big shutter door on the south-east face.
      const spanX = (roof[1].x - roof[3].x) * 0.45;
      for (let i = -spanX; i <= spanX; i++) {
        const t = 1 - Math.abs(i / spanX);
        const h = Math.round(Math.sin(t * Math.PI * 0.5) * 10);
        px.line(c.x + i, c.y, c.x + i, c.y - h, i < 0 ? step(Ramps.metal, 3) : step(Ramps.metal, 2));
      }
      const door = [
        { x: roof[1].x - 6, y: roof[1].y + 4 },
        { x: roof[2].x + 6, y: roof[2].y + 4 },
        { x: roof[2].x + 6, y: roof[2].y + visual.height },
        { x: roof[1].x - 6, y: roof[1].y + visual.height },
      ];
      px.fillPolygon(door, 0x2b3036);
      for (let s = 0; s < 5; s++) {
        px.line(door[0].x, door[0].y + s * 4 + 2, door[1].x, door[1].y + s * 4 + 2, 0x1a1d21, 180);
      }
      break;
    }
    case 'tower': {
      // Crenellated cap and a firing slit.
      for (let i = 0; i < 4; i++) {
        const a = roof[i], b = roof[(i + 1) % 4];
        for (let t = 0; t <= 1.001; t += 0.25) {
          px.fillRect(a.x + (b.x - a.x) * t - 1, a.y + (b.y - a.y) * t - 4, 3, 4, step(Ramps.concrete, 3));
        }
      }
      px.fillRect(c.x - 4, c.y + visual.height * 0.4, 8, 2, 0x14171a);
      break;
    }
    case 'dome': {
      const rx = Math.round((roof[1].x - roof[3].x) * 0.4);
      const ry = Math.round(rx * 0.55);
      px.fillEllipse(c.x, c.y, rx, ry, step(Ramps.metal, 3));
      px.fillEllipse(c.x - Math.round(rx * 0.25), c.y - Math.round(ry * 0.3), Math.round(rx * 0.55), Math.round(ry * 0.5), step(Ramps.metal, 4));
      px.fillEllipse(c.x, c.y - ry + 1, 2, 1, accent);
      break;
    }
    case 'pad': {
      // Apron with a touchdown circle. Markings scale with the footprint so a
      // 4x3 airfield doesn't get a helipad-sized "H".
      const rx = Math.round((roof[1].x - roof[3].x) * 0.36);
      const ry = Math.round(rx * 0.5);
      px.fillEllipse(c.x, c.y, rx, ry, 0x3a4046);
      px.fillEllipse(c.x, c.y, rx - 3, ry - 2, 0x4a5157);
      px.speckle(c.x - rx, c.y - ry, rx * 2, ry * 2, 0x3a4046, 0.08, () => rng.next(), 150);

      // Touchdown "H", sized to the pad.
      const hw = Math.max(4, Math.round(rx * 0.34));
      const hh = Math.max(3, Math.round(ry * 0.5));
      px.fillRect(c.x - hw, c.y - hh, 2, hh * 2, 0xd9d2b6);
      px.fillRect(c.x + hw - 2, c.y - hh, 2, hh * 2, 0xd9d2b6);
      px.fillRect(c.x - hw, c.y - 1, hw * 2, 2, 0xd9d2b6);

      // Perimeter approach lights.
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.3;
        px.fillEllipse(c.x + Math.cos(a) * rx, c.y + Math.sin(a) * ry, 1, 1, 0xffcc55);
      }
      break;
    }
    case 'silo': {
      const rx = Math.round((roof[1].x - roof[3].x) * 0.3);
      px.fillEllipse(c.x, c.y - 2, rx, Math.round(rx * 0.5), step(Ramps.metal, 3));
      px.fillEllipse(c.x, c.y - 4, Math.round(rx * 0.6), Math.round(rx * 0.3), step(Ramps.metal, 4));
      px.line(c.x - rx, c.y, c.x - rx, c.y + visual.height, step(Ramps.rust, 2));
      px.line(c.x + rx, c.y, c.x + rx, c.y + visual.height, step(Ramps.rust, 2));
      break;
    }
    case 'derrick': {
      // Mining rig: lattice tower with a nodding pump.
      const topY = c.y - 24;
      px.line(c.x - 7, c.y, c.x - 1, topY, step(Ramps.metal, 3));
      px.line(c.x + 7, c.y, c.x + 1, topY, step(Ramps.metal, 3));
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const y = c.y + (topY - c.y) * t;
        const w = 7 - t * 6;
        px.line(c.x - w, y, c.x + w, y, step(Ramps.metal, 2));
        px.line(c.x - w, y, c.x + (w - 2), y - 5, step(Ramps.metal, 1), 180);
      }
      px.fillRect(c.x - 2, topY - 3, 5, 4, accent);
      px.fillEllipse(c.x + 9, c.y + 3, 4, 2, 0x1b1410);
      break;
    }
    case 'wall': {
      const capA = { x: roof[3].x, y: roof[3].y };
      const capB = { x: roof[1].x, y: roof[1].y };
      px.line(capA.x, capA.y - 2, capB.x, capB.y - 2, step(Ramps.concrete, 4));
      for (let t = 0; t <= 1.001; t += 0.2) {
        px.fillRect(capA.x + (capB.x - capA.x) * t - 1, capA.y + (capB.y - capA.y) * t - 5, 3, 4, step(Ramps.concrete, 3));
      }
      break;
    }
    case 'gate': {
      px.fillPolygon(
        [roof[1], roof[2], { x: roof[2].x, y: roof[2].y + visual.height }, { x: roof[1].x, y: roof[1].y + visual.height }],
        0x2b2f34,
      );
      for (let i = 0; i < 6; i++) {
        px.line(roof[1].x, roof[1].y + i * 4 + 2, roof[2].x, roof[2].y + i * 4 + 2, accent, 140);
      }
      px.fillRect(c.x - 1, c.y - 5, 3, 4, 0xd0402c);
      break;
    }
    case 'bunker': {
      // Sloped earth berm and a horizontal embrasure.
      px.fillPolygon(ground.map((p) => ({ x: p.x, y: p.y - 2 })), step(Ramps.dirt, 2), 200);
      px.fillRect(c.x - 6, c.y + Math.round(visual.height * 0.5), 13, 3, 0x0e1114);
      px.speckle(c.x - 10, c.y - 4, 20, 10, step(Ramps.dirt, 3), 0.15, () => rng.next());
      break;
    }
    case 'mast': {
      px.line(c.x, c.y, c.x, c.y - 30, step(Ramps.metal, 3));
      for (let i = 0; i < 4; i++) {
        const y = c.y - 6 - i * 7;
        px.line(c.x - 5 + i, y, c.x + 5 - i, y, step(Ramps.metal, 2));
      }
      px.px(c.x, c.y - 31, 0xd0402c);
      px.line(c.x, c.y - 24, c.x - 9, c.y + 2, step(Ramps.metal, 1), 150);
      px.line(c.x, c.y - 24, c.x + 9, c.y + 2, step(Ramps.metal, 1), 150);
      break;
    }
    case 'emplacement': {
      // Sandbag ring around a revetted gun pit. The pit floor stays light
      // enough to read as packed earth — near-black turns it into a hole.
      const rx = Math.round((roof[1].x - roof[3].x) * 0.42);
      const ry = Math.round(rx * 0.5);

      px.fillEllipse(c.x, c.y, rx - 2, ry - 1, step(Ramps.dirt, 2));
      px.fillEllipse(c.x, c.y + 1, rx - 6, ry - 4, step(Ramps.dirt, 1));
      px.speckle(c.x - rx, c.y - ry, rx * 2, ry * 2, step(Ramps.dirt, 3), 0.1, () => rng.next(), 170);

      // Concrete mounting ring the turret sits on.
      px.fillEllipse(c.x, c.y, Math.max(4, rx >> 2), Math.max(2, ry >> 2), step(Ramps.concrete, 3));

      const bags = Math.max(10, rx >> 1);
      for (let a = 0; a < bags; a++) {
        const ang = (a / bags) * Math.PI * 2;
        px.fillEllipse(
          c.x + Math.cos(ang) * rx, c.y + Math.sin(ang) * ry,
          3, 2, a % 2 ? 0x6f6444 : 0x857a55,
        );
      }
      break;
    }
    case 'mine': {
      px.fillEllipse(c.x, c.y + 2, 5, 3, step(Ramps.dirt, 2));
      px.fillEllipse(c.x, c.y + 1, 3, 2, step(Ramps.metal, 2));
      px.px(c.x, c.y, accent);
      break;
    }
    case 'shed':
    case 'block':
    default: {
      // Simple ridge line so flat roofs still catch the eye.
      px.line(roof[0].x, roof[0].y, roof[2].x, roof[2].y, step(Ramps.concrete, 3), 160);
      px.fillRect(c.x - 3, c.y - 2, 7, 3, step(Ramps.metal, 2));
      break;
    }
  }
}

function drawRoofOrnament(px: PixelCanvas, kind: string, c: Vec2, team: Ramp, rng: RNG): void {
  switch (kind) {
    case 'vent':
      px.fillRect(c.x - 8, c.y - 4, 5, 4, step(Ramps.metal, 2));
      px.fillRect(c.x - 8, c.y - 5, 5, 1, step(Ramps.metal, 4));
      break;
    case 'dish':
      px.line(c.x + 6, c.y, c.x + 6, c.y - 6, step(Ramps.metal, 3));
      px.fillEllipse(c.x + 6, c.y - 8, 6, 3, 0xb8bec6);
      px.fillEllipse(c.x + 6, c.y - 8, 4, 2, 0x6b737b);
      break;
    case 'antenna':
      px.line(c.x - 5, c.y, c.x - 5, c.y - 13, step(Ramps.metal, 4));
      px.px(c.x - 5, c.y - 14, 0xd0402c);
      break;
    case 'chimney':
      px.fillRect(c.x + 4, c.y - 9, 4, 9, step(Ramps.rust, 2));
      px.fillRect(c.x + 4, c.y - 10, 4, 1, step(Ramps.rust, 4));
      for (let i = 0; i < 3; i++) {
        px.fillEllipse(c.x + 6 + rng.int(-1, 1), c.y - 13 - i * 3, 2 + i, 1 + i, 0x6a7076, 90 - i * 20);
      }
      break;
    case 'crane':
      px.line(c.x, c.y, c.x, c.y - 16, step(Ramps.metal, 3));
      px.line(c.x, c.y - 16, c.x + 13, c.y - 12, step(Ramps.metal, 3));
      px.line(c.x + 11, c.y - 12, c.x + 11, c.y - 6, step(Ramps.metal, 2));
      break;
    case 'lamp':
      px.line(c.x - 9, c.y, c.x - 9, c.y - 10, step(Ramps.metal, 2));
      px.fillRect(c.x - 11, c.y - 12, 5, 2, 0xffe9a8);
      break;
    case 'flag': {
      px.line(c.x + 8, c.y, c.x + 8, c.y - 14, step(Ramps.metal, 3));
      for (let y = 0; y < 6; y++) {
        px.fillRect(c.x + 9, c.y - 14 + y, 7 - (y % 2), 1, step(team, y < 3 ? 3 : 2));
      }
      break;
    }
    case 'sandbags':
      for (let i = 0; i < 6; i++) {
        px.fillEllipse(c.x - 10 + i * 4, c.y + 2, 3, 2, i % 2 ? 0x6f6444 : 0x857a55);
      }
      break;
    default:
      break;
  }
}

/** Small ground-level marker used for mines and tripwires. */
export function drawMine(color: number, rng: RNG): PixelCanvas {
  const px = new PixelCanvas(18, 14);
  // Freshly turned soil ring, then the pressure plate barely proud of it.
  px.fillEllipse(9, 9, 7, 3, step(Ramps.dirt, 1), 150);
  px.speckle(2, 5, 14, 8, step(Ramps.dirt, 3), 0.16, () => rng.next(), 140);
  px.fillEllipse(9, 8, 3, 2, step(Ramps.metal, 1), 220);
  px.fillEllipse(9, 7, 2, 1, step(Ramps.metal, 3), 220);
  px.px(9, 7, color);
  return px;
}

/** Barbed-wire segment: two posts and a sagging wire run. */
export function drawBarbedWire(rng: RNG): PixelCanvas {
  const px = new PixelCanvas(TILE_W, 22);
  const y0 = 14;
  px.fillEllipse(10, y0 + 4, 4, 2, Colors.shadow, 60);
  px.fillEllipse(TILE_W - 10, y0 + 4, 4, 2, Colors.shadow, 60);
  px.fillRect(9, y0 - 8, 2, 12, 0x4a3524);
  px.fillRect(TILE_W - 11, y0 - 8, 2, 12, 0x4a3524);

  for (const sag of [0, 4, 8]) {
    for (let x = 10; x < TILE_W - 10; x++) {
      const t = (x - 10) / (TILE_W - 20);
      const y = y0 - 8 + sag + Math.sin(t * Math.PI) * 2;
      px.px(x, y, 0x8a8f96, 200);
      if (x % 7 === 0) {
        px.px(x, y - 1, 0xb0b6bc);
        px.px(x, y + 1, 0xb0b6bc);
      }
    }
  }
  px.speckle(0, y0 - 10, TILE_W, 16, 0x5d636c, 0.02, () => rng.next(), 140);
  return px;
}
