/**
 * Terrain, cliff and scatter-prop sprite generation.
 *
 * Each biome gets several tile variants so large expanses don't visibly tile.
 * Variants differ only in their speckle seed, which is exactly how the era's
 * artists faked detail cheaply — the eye reads texture, not repetition.
 */
import { PixelCanvas } from '../PixelCanvas';
import { Colors, step } from '../Palette';
import { TILE_W, TILE_H, ELEV_STEP } from '../../core/Config';
import type { RNG } from '../../core/RNG';
import { Biome, biomeDef, DecalKind, PropKind } from '../../map/BiomeTypes';

const HALF_W = TILE_W / 2;
const HALF_H = TILE_H / 2;

/** Lower boundary of the tile diamond for a given column, used by cliff faces. */
function diamondBottomY(x: number): number {
  return x < HALF_W
    ? HALF_H + (x * HALF_H) / HALF_W
    : TILE_H - 1 - ((x - HALF_W) * HALF_H) / HALF_W;
}

/** One terrain tile top: a 64x32 diamond with per-biome texture. */
export function drawTileTop(biome: Biome, rng: RNG, variant: number): PixelCanvas {
  const px = new PixelCanvas(TILE_W, TILE_H);
  const def = biomeDef(biome);
  const r = def.ramp;

  // Base fill with a subtle north-lit gradient across the diamond.
  for (let y = 0; y < TILE_H; y++) {
    const t = y < HALF_H ? y / HALF_H : (TILE_H - y) / HALF_H;
    const span = Math.round(HALF_W * t);
    const shadeIdx = 2 + (y < HALF_H ? 1 : 0) - (y > TILE_H - 6 ? 1 : 0);
    for (let x = -span; x <= span; x++) {
      px.px(HALF_W + x, y, step(r, shadeIdx));
    }
  }

  const rand = () => rng.next();

  switch (biome) {
    case Biome.Water: {
      // Horizontal wave bands plus a couple of specular glints.
      for (let y = 2; y < TILE_H - 2; y += 3) {
        const offset = ((variant * 7 + y * 5) % 11) - 5;
        const t = y < HALF_H ? y / HALF_H : (TILE_H - y) / HALF_H;
        const span = Math.round(HALF_W * t) - 4;
        if (span <= 0) continue;
        for (let x = -span; x <= span; x++) {
          const wave = Math.sin((x + offset + variant * 3) * 0.35) > 0.55;
          if (wave) px.px(HALF_W + x, y, step(r, 4), 150);
        }
      }
      px.speckle(HALF_W - 12, 10, 24, 10, step(r, 4), 0.05, rand, 190);
      break;
    }
    case Biome.Forest: {
      // Dense mottling reads as canopy shadow at tile scale.
      px.speckle(0, 0, TILE_W, TILE_H, step(r, 1), 0.22, rand);
      px.speckle(0, 0, TILE_W, TILE_H, step(r, 3), 0.16, rand);
      px.speckle(0, 0, TILE_W, TILE_H, step(r, 4), 0.05, rand);
      break;
    }
    case Biome.Mountain:
    case Biome.Rock: {
      px.speckle(0, 0, TILE_W, TILE_H, step(r, 1), 0.14, rand);
      px.speckle(0, 0, TILE_W, TILE_H, step(r, 4), 0.09, rand);
      // A few short fracture lines.
      for (let i = 0; i < 3; i++) {
        const sx = HALF_W + rng.int(-18, 18);
        const sy = rng.int(6, TILE_H - 8);
        px.line(sx, sy, sx + rng.int(-7, 7), sy + rng.int(-3, 3), step(r, 0), 190);
      }
      break;
    }
    case Biome.Mud: {
      px.speckle(0, 0, TILE_W, TILE_H, step(r, 0), 0.18, rand);
      px.speckle(0, 0, TILE_W, TILE_H, step(r, 4), 0.06, rand, 170);
      // Standing water glints.
      for (let i = 0; i < 2; i++) {
        px.fillEllipse(HALF_W + rng.int(-14, 14), rng.int(10, 22), rng.int(2, 5), 2, 0x2a3c46, 150);
      }
      break;
    }
    case Biome.Sand: {
      px.speckle(0, 0, TILE_W, TILE_H, step(r, 4), 0.1, rand);
      px.speckle(0, 0, TILE_W, TILE_H, step(r, 1), 0.06, rand);
      // Wind ripples.
      for (let y = 8; y < TILE_H - 6; y += 5) {
        const span = Math.round(HALF_W * (y < HALF_H ? y / HALF_H : (TILE_H - y) / HALF_H)) - 8;
        if (span > 2) px.line(HALF_W - span, y, HALF_W + span, y + 1, step(r, 3), 90);
      }
      break;
    }
    default: {
      px.speckle(0, 0, TILE_W, TILE_H, step(r, 1), 0.12, rand);
      px.speckle(0, 0, TILE_W, TILE_H, step(r, 4), 0.08, rand);
      px.speckle(0, 0, TILE_W, TILE_H, step(r, 0), 0.04, rand);
      break;
    }
  }

  // Soften the south edge so adjacent tiles read as a continuous surface.
  for (let x = 0; x < TILE_W; x++) {
    const by = Math.round(diamondBottomY(x));
    px.px(x, by, step(r, 1), 70);
  }

  return px;
}

/**
 * Cliff face below an elevated tile: the two front quads of the tile's column.
 * Left face catches the light, right face falls into shade.
 */
export function drawCliff(biome: Biome, height: number, rng: RNG): PixelCanvas {
  const h = Math.max(1, Math.round(height * ELEV_STEP));
  const px = new PixelCanvas(TILE_W, h + HALF_H + 2);
  const r = biomeDef(biome).ramp;

  for (let x = 0; x < TILE_W; x++) {
    const top = Math.round(diamondBottomY(x));
    const lit = x < HALF_W;
    const base = lit ? step(r, 2) : step(r, 1);
    const dark = lit ? step(r, 1) : step(r, 0);
    for (let y = top; y < top + h; y++) {
      // Vertical falloff towards the base of the cliff.
      const t = (y - top) / h;
      px.px(x, y, t > 0.72 ? dark : base);
    }
  }

  // Strata and rubble.
  const rand = () => rng.next();
  px.speckle(0, HALF_H, TILE_W, h, step(r, 0), 0.1, rand);
  px.speckle(0, HALF_H, TILE_W, h, step(r, 3), 0.05, rand);
  for (let i = 0; i < 2; i++) {
    const y = HALF_H + rng.int(2, Math.max(3, h - 2));
    px.line(rng.int(2, 24), y, rng.int(38, 60), y + rng.int(-1, 1), step(r, 0), 120);
  }

  return px;
}

/** Ground decals painted over terrain before props are placed. */
export function drawDecal(kind: DecalKind, rng: RNG): PixelCanvas {
  const px = new PixelCanvas(TILE_W, TILE_H);

  switch (kind) {
    case DecalKind.Crater: {
      const rx = rng.int(11, 17);
      const ry = Math.round(rx * 0.5);
      px.fillEllipse(HALF_W, HALF_H, rx, ry, 0x2b2018, 210);
      px.fillEllipse(HALF_W, HALF_H + 1, rx - 4, ry - 2, 0x171009, 230);
      // Raised rim on the lit side.
      for (let a = 0; a < 28; a++) {
        const ang = (a / 28) * Math.PI * 2;
        px.px(HALF_W + Math.cos(ang) * rx, HALF_H + Math.sin(ang) * ry, 0x4a3a28, 170);
      }
      px.speckle(HALF_W - rx, HALF_H - ry, rx * 2, ry * 2, 0x3d2f20, 0.2, () => rng.next(), 160);
      break;
    }
    case DecalKind.MudTrack: {
      // Two parallel tread ruts running along the tile's long axis.
      for (const offset of [-4, 4]) {
        for (let i = -22; i <= 22; i++) {
          const x = HALF_W + i;
          const y = HALF_H + i * 0.5 + offset;
          px.px(x, y, 0x30251a, 190);
          px.px(x, y + 1, 0x241b12, 160);
        }
      }
      px.speckle(8, 6, TILE_W - 16, TILE_H - 12, 0x1d1610, 0.08, () => rng.next(), 140);
      break;
    }
    case DecalKind.Scorch: {
      px.fillEllipse(HALF_W, HALF_H, rng.int(9, 15), rng.int(5, 8), 0x14100c, 170);
      px.speckle(HALF_W - 14, HALF_H - 7, 28, 14, 0x0a0806, 0.25, () => rng.next(), 150);
      break;
    }
    case DecalKind.Rubble: {
      for (let i = 0; i < 14; i++) {
        const x = HALF_W + rng.int(-15, 15);
        const y = HALF_H + rng.int(-7, 7);
        px.fillRect(x, y, rng.int(1, 3), rng.int(1, 2), rng.pick([0x4a4d52, 0x35383c, 0x5d626a]), 220);
      }
      break;
    }
    default:
      break;
  }

  return px;
}

/**
 * Scatter props. Anchored bottom-centre so they sort on the tile they occupy.
 */
export function drawProp(kind: PropKind, rng: RNG): PixelCanvas {
  switch (kind) {
    case PropKind.Pine:      return drawPine(rng);
    case PropKind.DeadTree:  return drawDeadTree(rng);
    case PropKind.Boulder:   return drawBoulder(rng);
    case PropKind.RockCluster: return drawRockCluster(rng);
    case PropKind.Bush:      return drawBush(rng);
    case PropKind.Stump:     return drawStump(rng);
    default:                 return new PixelCanvas(1, 1);
  }
}

function drawPine(rng: RNG): PixelCanvas {
  const h = rng.int(34, 46);
  const w = 26;
  const px = new PixelCanvas(w, h);
  const cx = w >> 1;
  const trunkH = Math.round(h * 0.22);

  // Ground contact shadow.
  px.fillEllipse(cx, h - 2, 7, 3, Colors.shadow, 70);

  // Trunk.
  px.fillRect(cx - 1, h - trunkH - 2, 3, trunkH, 0x3a2a1c);
  px.line(cx - 1, h - trunkH - 2, cx - 1, h - 3, 0x24180f);

  // Stacked canopy tiers, widest at the base.
  const tiers = rng.int(4, 6);
  const canopyTop = 2;
  const canopyH = h - trunkH - canopyTop - 2;
  for (let t = tiers - 1; t >= 0; t--) {
    const ty = canopyTop + Math.round((canopyH * t) / tiers);
    const tierH = Math.round(canopyH / tiers) + 5;
    const spread = Math.round(3 + ((tiers - t) / tiers) * (w * 0.42));
    for (let y = 0; y < tierH; y++) {
      const frac = y / tierH;
      const span = Math.round(spread * frac);
      for (let x = -span; x <= span; x++) {
        // Left half lit, right half shaded, with a dithered seam.
        const lit = x < -span * 0.15;
        const edge = Math.abs(x) > span - 2;
        const c = edge ? 0x152a19 : lit ? 0x2f5a34 : 0x22432a;
        px.px(cx + x, ty + y, c);
      }
    }
    // Snow-free highlight flecks on the sunward side.
    px.speckle(cx - spread, ty, spread, tierH, 0x437a45, 0.06, () => rng.next());
  }

  px.outline(Colors.outline, 200);
  return px;
}

function drawDeadTree(rng: RNG): PixelCanvas {
  const h = rng.int(26, 36);
  const px = new PixelCanvas(22, h);
  const cx = 11;
  px.fillEllipse(cx, h - 2, 6, 2, Colors.shadow, 60);
  px.fillRect(cx - 1, h - h + 4, 2, h - 6, 0x36291d);

  for (let i = 0; i < rng.int(3, 6); i++) {
    const y = 6 + rng.int(0, h - 16);
    const dir = rng.bool() ? 1 : -1;
    const len = rng.int(4, 8);
    px.line(cx, y, cx + dir * len, y - rng.int(2, 6), 0x2c2116);
  }
  px.outline(Colors.outline, 170);
  return px;
}

function drawBoulder(rng: RNG): PixelCanvas {
  const w = rng.int(14, 22);
  const h = Math.round(w * 0.75);
  const px = new PixelCanvas(w, h + 4);
  const cx = w >> 1;

  px.fillEllipse(cx, h + 1, Math.round(w * 0.45), 3, Colors.shadow, 70);
  px.fillEllipse(cx, h - 4, Math.round(w * 0.44), Math.round(h * 0.42), 0x4a4f56);
  px.fillEllipse(cx - 2, h - 6, Math.round(w * 0.3), Math.round(h * 0.26), 0x62686f);
  px.speckle(2, 2, w - 4, h - 4, 0x35393e, 0.14, () => rng.next());
  px.outline(Colors.outline, 200);
  return px;
}

function drawRockCluster(rng: RNG): PixelCanvas {
  const px = new PixelCanvas(28, 20);
  px.fillEllipse(14, 18, 11, 3, Colors.shadow, 60);
  for (let i = 0; i < 4; i++) {
    const x = rng.int(5, 23);
    const y = rng.int(9, 16);
    const r = rng.int(2, 5);
    px.fillEllipse(x, y, r, Math.round(r * 0.7), 0x484d54);
    px.fillEllipse(x - 1, y - 1, Math.max(1, r - 2), Math.max(1, Math.round(r * 0.4)), 0x5d636c);
  }
  px.outline(Colors.outline, 180);
  return px;
}

function drawBush(rng: RNG): PixelCanvas {
  const px = new PixelCanvas(20, 16);
  px.fillEllipse(10, 14, 8, 2, Colors.shadow, 55);
  for (let i = 0; i < 5; i++) {
    px.fillEllipse(rng.int(5, 15), rng.int(7, 12), rng.int(3, 5), rng.int(2, 4), rng.pick([0x284c2d, 0x1d3823, 0x356239]));
  }
  px.outline(Colors.outline, 150);
  return px;
}

function drawStump(rng: RNG): PixelCanvas {
  const px = new PixelCanvas(14, 12);
  const height = rng.int(4, 6);
  px.fillEllipse(7, 10, 5, 2, Colors.shadow, 60);
  px.fillRect(4, 10 - height, 6, height, 0x3a2a1c);
  px.fillEllipse(7, 10 - height, 3, 2, 0x6b5236);
  px.px(7, 10 - height, 0x4a3a25);
  px.outline(Colors.outline, 170);
  return px;
}
