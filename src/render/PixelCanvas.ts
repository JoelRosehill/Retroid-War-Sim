/**
 * A tiny integer-pixel drawing surface.
 *
 * All sprites in this project are generated at runtime rather than shipped as
 * PNGs, so the whole art pipeline is code: draw into an RGBA buffer at 1:1
 * pixel scale, then upload once as a nearest-neighbour texture. That keeps the
 * repo asset-free and makes palette-swapping per team trivial, while preserving
 * the hard-edged look of the era we're imitating.
 */
import { CanvasSource, Texture } from 'pixi.js';

export class PixelCanvas {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  /** Set a single pixel. Alpha-blends when `alpha` < 255. */
  px(x: number, y: number, color: number, alpha = 255): void {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    const d = this.data;
    const r = (color >> 16) & 255;
    const g = (color >> 8) & 255;
    const b = color & 255;

    if (alpha >= 255) {
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      return;
    }
    const a = alpha / 255;
    const inv = 1 - a;
    const dstA = d[i + 3] / 255;
    const outA = a + dstA * inv;
    if (outA <= 0) { d[i + 3] = 0; return; }
    d[i] = (r * a + d[i] * dstA * inv) / outA;
    d[i + 1] = (g * a + d[i + 1] * dstA * inv) / outA;
    d[i + 2] = (b * a + d[i + 2] * dstA * inv) / outA;
    d[i + 3] = outA * 255;
  }

  /** Read a pixel's colour, or -1 if transparent / out of bounds. */
  get(x: number, y: number): number {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return -1;
    const i = (y * this.width + x) * 4;
    if (this.data[i + 3] === 0) return -1;
    return (this.data[i] << 16) | (this.data[i + 1] << 8) | this.data[i + 2];
  }

  clear(): void {
    this.data.fill(0);
  }

  fill(color: number, alpha = 255): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) this.px(x, y, color, alpha);
    }
  }

  fillRect(x: number, y: number, w: number, h: number, color: number, alpha = 255): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) this.px(x + dx, y + dy, color, alpha);
    }
  }

  strokeRect(x: number, y: number, w: number, h: number, color: number, alpha = 255): void {
    for (let dx = 0; dx < w; dx++) {
      this.px(x + dx, y, color, alpha);
      this.px(x + dx, y + h - 1, color, alpha);
    }
    for (let dy = 0; dy < h; dy++) {
      this.px(x, y + dy, color, alpha);
      this.px(x + w - 1, y + dy, color, alpha);
    }
  }

  /** Bresenham line. */
  line(x0: number, y0: number, x1: number, y1: number, color: number, alpha = 255): void {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;

    for (;;) {
      this.px(x0, y0, color, alpha);
      if (x0 === x1 && y0 === y1) break;
      const e2 = err * 2;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /** Filled axis-aligned ellipse centred on (cx, cy). */
  fillEllipse(cx: number, cy: number, rx: number, ry: number, color: number, alpha = 255): void {
    if (rx <= 0 || ry <= 0) return;
    for (let y = -ry; y <= ry; y++) {
      const t = 1 - (y * y) / (ry * ry);
      if (t <= 0) continue;
      const span = Math.sqrt(t) * rx;
      for (let x = -span; x <= span; x++) this.px(cx + x, cy + y, color, alpha);
    }
  }

  /** Filled isometric diamond whose top vertex is (cx, cy). */
  fillDiamond(cx: number, cy: number, halfW: number, halfH: number, color: number, alpha = 255): void {
    for (let y = 0; y < halfH * 2; y++) {
      const t = y < halfH ? y / halfH : (halfH * 2 - y) / halfH;
      const span = Math.round(halfW * t);
      for (let x = -span; x <= span; x++) this.px(cx + x, cy + y, color, alpha);
    }
  }

  /**
   * Scanline-fill a convex polygon. Vehicles and buildings are drawn as
   * extruded iso boxes, so a general quad fill covers every facing with one
   * code path instead of eight hand-drawn sprites per hull.
   */
  fillPolygon(points: readonly { x: number; y: number }[], color: number, alpha = 255): void {
    if (points.length < 3) return;
    let minY = Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    minY = Math.max(0, Math.floor(minY));
    maxY = Math.min(this.height - 1, Math.ceil(maxY));

    for (let y = minY; y <= maxY; y++) {
      let xMin = Infinity;
      let xMax = -Infinity;
      const sampleY = y + 0.5;
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if (a.y === b.y) continue;
        const lo = Math.min(a.y, b.y);
        const hi = Math.max(a.y, b.y);
        if (sampleY < lo || sampleY >= hi) continue;
        const t = (sampleY - a.y) / (b.y - a.y);
        const x = a.x + (b.x - a.x) * t;
        if (x < xMin) xMin = x;
        if (x > xMax) xMax = x;
      }
      if (xMin > xMax) continue;
      for (let x = Math.round(xMin); x <= Math.round(xMax); x++) this.px(x, y, color, alpha);
    }
  }

  /** Vertical gradient bar — the workhorse for hulls, walls and towers. */
  gradientV(x: number, y: number, w: number, h: number, top: number, bottom: number): void {
    const tr = (top >> 16) & 255, tg = (top >> 8) & 255, tb = top & 255;
    const br = (bottom >> 16) & 255, bg = (bottom >> 8) & 255, bb = bottom & 255;
    for (let dy = 0; dy < h; dy++) {
      const t = h === 1 ? 0 : dy / (h - 1);
      const c = ((tr + (br - tr) * t) << 16) | ((tg + (bg - tg) * t) << 8) | (tb + (bb - tb) * t);
      for (let dx = 0; dx < w; dx++) this.px(x + dx, y + dy, c | 0, 255);
    }
  }

  /**
   * Scatter pixels of `color` across the opaque area of a rect. `rand` is a
   * plain function so callers can pass a seeded RNG and keep sprites stable.
   */
  speckle(
    x: number, y: number, w: number, h: number,
    color: number, density: number, rand: () => number, alpha = 255,
  ): void {
    const count = Math.max(0, Math.round(w * h * density));
    for (let i = 0; i < count; i++) {
      const px = x + Math.floor(rand() * w);
      const py = y + Math.floor(rand() * h);
      if (this.get(px, py) >= 0) this.px(px, py, color, alpha);
    }
  }

  /** Classic 2x2 ordered dither between two colours over a rect. */
  dither(x: number, y: number, w: number, h: number, a: number, b: number, ratio: number): void {
    const matrix = [0, 2, 3, 1];
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const threshold = (matrix[(dy & 1) * 2 + (dx & 1)] + 0.5) / 4;
        this.px(x + dx, y + dy, ratio > threshold ? b : a);
      }
    }
  }

  /** Trace a 1px outline around every opaque pixel that borders transparency. */
  outline(color: number, alpha = 255): void {
    const w = this.width, h = this.height;
    const targets: number[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (this.get(x, y) >= 0) continue;
        if (
          this.get(x - 1, y) >= 0 || this.get(x + 1, y) >= 0 ||
          this.get(x, y - 1) >= 0 || this.get(x, y + 1) >= 0
        ) {
          targets.push(x, y);
        }
      }
    }
    for (let i = 0; i < targets.length; i += 2) this.px(targets[i], targets[i + 1], color, alpha);
  }

  /** Multiply every opaque pixel's brightness — used for damage states. */
  darken(factor: number): void {
    const d = this.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      d[i] *= factor; d[i + 1] *= factor; d[i + 2] *= factor;
    }
  }

  /** Copy another canvas onto this one at (ox, oy), skipping transparency. */
  blit(src: PixelCanvas, ox: number, oy: number, alpha = 255): void {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const i = (y * src.width + x) * 4;
        const a = src.data[i + 3];
        if (a === 0) continue;
        const c = (src.data[i] << 16) | (src.data[i + 1] << 8) | src.data[i + 2];
        this.px(ox + x, oy + y, c, (a * alpha) / 255);
      }
    }
  }

  /** Mirror horizontally into a new canvas (halves the facings we must draw). */
  flippedX(): PixelCanvas {
    const out = new PixelCanvas(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const si = (y * this.width + x) * 4;
        const di = (y * this.width + (this.width - 1 - x)) * 4;
        out.data[di] = this.data[si];
        out.data[di + 1] = this.data[si + 1];
        out.data[di + 2] = this.data[si + 2];
        out.data[di + 3] = this.data[si + 3];
      }
    }
    return out;
  }

  toCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    const image = ctx.createImageData(this.width, this.height);
    image.data.set(this.data);
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  /**
   * Upload as a nearest-neighbour texture. Anchoring is left to the caller.
   *
   * Must be a `CanvasSource`, not the generic `TextureSource` — only the canvas
   * source knows how to upload an HTMLCanvasElement, and the generic one
   * silently produces a blank texture.
   */
  toTexture(): Texture {
    const source = new CanvasSource({
      resource: this.toCanvas(),
      scaleMode: 'nearest',
    });
    return new Texture({ source });
  }
}
