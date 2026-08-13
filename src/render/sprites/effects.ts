/**
 * Combat VFX: explosions, muzzle flashes, smoke, tracers and projectiles.
 * Everything is a short frame sequence baked once at boot and replayed by the
 * particle system, which is what keeps a hundred simultaneous impacts cheap.
 */
import { PixelCanvas } from '../PixelCanvas';
import { Colors } from '../Palette';
import type { RNG } from '../../core/RNG';

/**
 * Fireball → smoke sequence. Early frames are a hot core with debris spikes,
 * later frames dilate into a cooling smoke ball.
 */
export function drawExplosionFrames(size: number, frames: number, rng: RNG): PixelCanvas[] {
  const out: PixelCanvas[] = [];
  const dim = size * 2 + 8;

  for (let i = 0; i < frames; i++) {
    const t = i / (frames - 1);
    const px = new PixelCanvas(dim, dim);
    const c = dim / 2;
    const radius = size * (0.35 + t * 0.95);

    if (t < 0.62) {
      // Fireball: three concentric shells, hottest in the middle.
      const heat = 1 - t / 0.62;
      px.fillEllipse(c, c, radius, radius * 0.82, Colors.fireEdge, 200 * heat + 40);
      px.fillEllipse(c, c, radius * 0.7, radius * 0.58, Colors.fireMid, 230 * heat + 25);
      px.fillEllipse(c, c, radius * 0.38, radius * 0.32, Colors.fireCore, 255 * heat);

      // Debris spikes.
      const spikes = 7;
      for (let s = 0; s < spikes; s++) {
        const a = (s / spikes) * Math.PI * 2 + i * 0.4;
        const len = radius * (1 + rng.next() * 0.6);
        px.line(c, c, c + Math.cos(a) * len, c + Math.sin(a) * len * 0.7, Colors.fireMid, 160 * heat);
      }
    }

    if (t > 0.28) {
      // Smoke, thickening as the fire dies.
      const smokeT = (t - 0.28) / 0.72;
      const alpha = 190 * (1 - smokeT * 0.85);
      for (let p = 0; p < 6; p++) {
        const a = (p / 6) * Math.PI * 2 + i;
        const d = radius * 0.55 * smokeT;
        px.fillEllipse(
          c + Math.cos(a) * d,
          c + Math.sin(a) * d * 0.6 - smokeT * size * 0.5,
          radius * 0.42, radius * 0.34,
          p % 2 ? Colors.smokeDark : Colors.smokeLight,
          alpha,
        );
      }
    }

    out.push(px);
  }
  return out;
}

/** Directional muzzle flash. Frame 0 is the brightest. */
export function drawMuzzleFlash(length: number, frames: number): PixelCanvas[] {
  const out: PixelCanvas[] = [];
  const w = length + 6;
  const h = 12;

  for (let i = 0; i < frames; i++) {
    const px = new PixelCanvas(w, h);
    const fade = 1 - i / frames;
    const cy = h / 2;
    const len = length * (1 - i * 0.25);

    px.fillPolygon(
      [
        { x: 2, y: cy - 3 * fade - 1 },
        { x: 2 + len, y: cy - 1 },
        { x: 2 + len, y: cy + 1 },
        { x: 2, y: cy + 3 * fade + 1 },
      ],
      Colors.fireMid, 220 * fade,
    );
    px.fillPolygon(
      [
        { x: 2, y: cy - 2 * fade },
        { x: 2 + len * 0.7, y: cy },
        { x: 2, y: cy + 2 * fade },
      ],
      Colors.fireCore, 255 * fade,
    );
    px.fillEllipse(3, cy, 3 * fade, 3 * fade, Colors.muzzle, 230 * fade);
    out.push(px);
  }
  return out;
}

/** Dissipating smoke puff used for damaged units and shell trails. */
export function drawSmokeFrames(size: number, frames: number, rng: RNG): PixelCanvas[] {
  const out: PixelCanvas[] = [];
  const dim = size * 2 + 6;

  for (let i = 0; i < frames; i++) {
    const t = i / (frames - 1);
    const px = new PixelCanvas(dim, dim);
    const c = dim / 2;
    const r = size * (0.4 + t * 0.85);
    const alpha = 175 * (1 - t * 0.9);
    for (let p = 0; p < 4; p++) {
      const a = rng.next() * Math.PI * 2;
      const d = r * 0.4 * t;
      px.fillEllipse(
        c + Math.cos(a) * d, c + Math.sin(a) * d * 0.7,
        r * 0.6, r * 0.5,
        p % 2 ? Colors.smokeLight : Colors.smokeDark, alpha,
      );
    }
    out.push(px);
  }
  return out;
}

/** Dust kicked up by moving vehicles and by shells landing short. */
export function drawDustFrames(frames: number, rng: RNG): PixelCanvas[] {
  const out: PixelCanvas[] = [];
  for (let i = 0; i < frames; i++) {
    const t = i / (frames - 1);
    const px = new PixelCanvas(16, 12);
    const alpha = 130 * (1 - t);
    for (let p = 0; p < 3; p++) {
      px.fillEllipse(8 + rng.int(-3, 3), 7 - t * 3, 3 + t * 3, 2 + t * 2, 0x8a7f66, alpha);
    }
    out.push(px);
  }
  return out;
}

/**
 * Tracer streak. Drawn pointing east; sprites are rotated at runtime, which is
 * the one place we rely on rotation rather than pre-baked facings because a
 * 3-pixel streak has no readable silhouette to preserve.
 */
export function drawTracer(length: number, color: number, coreColor: number): PixelCanvas {
  const px = new PixelCanvas(length, 3);
  px.fillRect(0, 1, length, 1, color, 210);
  px.fillRect(Math.round(length * 0.55), 1, Math.round(length * 0.45), 1, coreColor, 255);
  px.px(length - 1, 0, coreColor, 150);
  px.px(length - 1, 2, coreColor, 150);
  return px;
}

/** Sustained energy beam segment; stretched along its length at runtime. */
export function drawBeam(thickness: number, color: number, glow: number): PixelCanvas {
  const h = thickness + 4;
  const px = new PixelCanvas(8, h);
  const cy = h / 2;
  px.fillRect(0, Math.round(cy - thickness / 2 - 2), 8, thickness + 4, glow, 70);
  px.fillRect(0, Math.round(cy - thickness / 2), 8, thickness, color, 220);
  px.fillRect(0, Math.round(cy), 8, 1, 0xffffff, 240);
  return px;
}

/** Ballistic shell / rocket body, pointing east. */
export function drawProjectile(
  kind: 'shell' | 'rocket' | 'bomb' | 'missile', color: number,
): PixelCanvas {
  switch (kind) {
    case 'shell': {
      const px = new PixelCanvas(7, 5);
      px.fillEllipse(3, 2, 3, 2, 0x3a4047);
      px.fillEllipse(4, 2, 2, 1, 0x6b737b);
      px.px(6, 2, color);
      return px;
    }
    case 'rocket': {
      const px = new PixelCanvas(13, 6);
      px.fillRect(1, 2, 9, 2, 0x8a9099);
      px.fillPolygon([{ x: 10, y: 1 }, { x: 12, y: 3 }, { x: 10, y: 5 }], 0xd0402c);
      px.fillPolygon([{ x: 1, y: 1 }, { x: 4, y: 2 }, { x: 1, y: 3 }], 0x4a5058);
      px.fillEllipse(0, 3, 2, 1, Colors.fireMid, 220);
      return px;
    }
    case 'bomb': {
      const px = new PixelCanvas(9, 7);
      px.fillEllipse(4, 3, 4, 2, 0x2e3338);
      px.fillPolygon([{ x: 0, y: 1 }, { x: 3, y: 3 }, { x: 0, y: 5 }], 0x60676f);
      return px;
    }
    case 'missile':
    default: {
      const px = new PixelCanvas(17, 6);
      px.fillRect(2, 2, 12, 2, 0xb8bec6);
      px.fillRect(2, 2, 12, 1, 0xdde6ec);
      px.fillPolygon([{ x: 14, y: 1 }, { x: 16, y: 3 }, { x: 14, y: 4 }], 0xd0402c);
      px.fillPolygon([{ x: 2, y: 0 }, { x: 5, y: 2 }, { x: 2, y: 2 }], 0x6b737b);
      px.fillPolygon([{ x: 2, y: 4 }, { x: 5, y: 4 }, { x: 2, y: 6 }], 0x6b737b);
      px.fillEllipse(1, 3, 2, 1, Colors.fireCore, 230);
      return px;
    }
  }
}

/** EMP shockwave ring. */
export function drawEmpFrames(size: number, frames: number): PixelCanvas[] {
  const out: PixelCanvas[] = [];
  const dim = size * 2 + 6;
  for (let i = 0; i < frames; i++) {
    const t = i / (frames - 1);
    const px = new PixelCanvas(dim, dim);
    const c = dim / 2;
    const r = size * (0.2 + t * 0.9);
    const alpha = 230 * (1 - t);
    for (let a = 0; a < 64; a++) {
      const ang = (a / 64) * Math.PI * 2;
      px.px(c + Math.cos(ang) * r, c + Math.sin(ang) * r * 0.55, Colors.emp, alpha);
      px.px(c + Math.cos(ang) * (r - 1), c + Math.sin(ang) * (r - 1) * 0.55, Colors.empCore, alpha * 0.6);
    }
    out.push(px);
  }
  return out;
}

/** 1x1 white pixel, tinted and scaled for bars, rings and flat quads. */
export function drawDot(): PixelCanvas {
  const px = new PixelCanvas(1, 1);
  px.px(0, 0, 0xffffff);
  return px;
}

/** Small debris chunk thrown by explosions. */
export function drawDebris(rng: RNG): PixelCanvas {
  const px = new PixelCanvas(4, 4);
  const c = rng.pick([0x3a4047, 0x5d636c, 0x6b5236, 0x2b2f34]);
  px.fillRect(1, 1, rng.int(1, 2), rng.int(1, 2), c);
  return px;
}

/** Ground-level blast ring that precedes the scorch decal. */
export function drawShockRing(size: number): PixelCanvas {
  const px = new PixelCanvas(size * 2 + 4, size + 4);
  const c = { x: px.width / 2, y: px.height / 2 };
  for (let a = 0; a < 72; a++) {
    const ang = (a / 72) * Math.PI * 2;
    px.px(c.x + Math.cos(ang) * size, c.y + Math.sin(ang) * size * 0.5, 0xd9c9a0, 180);
  }
  return px;
}
