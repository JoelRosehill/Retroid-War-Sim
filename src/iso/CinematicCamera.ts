/**
 * Autonomous camera director.
 *
 * Combat events deposit "heat" onto a coarse grid. Every frame the director
 * finds the hottest cluster, aims at its centre of mass, and zooms to frame the
 * cluster's spread. When a new engagement decisively outweighs the current one
 * it cuts rather than pans, which reads far better in a recorded clip than a
 * camera that drifts endlessly between two fights.
 *
 * With no combat anywhere it falls back to a slow drift over the centre of mass
 * of all living units, so the shot is never static.
 */
import type { Container } from 'pixi.js';
import { CameraCfg, HALF_W, HALF_H, MAP_SIZE } from '../core/Config';
import { clamp, damp, dist2, lerp } from '../core/MathUtils';
import { gridToScreen } from './Iso';
import type { RNG } from '../core/RNG';

const HEAT_CELL = 6;

interface Cluster {
  gx: number;
  gy: number;
  heat: number;
  spread: number;
}

export class CinematicCamera {
  /** Current camera focus in grid space. */
  focusX = MAP_SIZE / 2;
  focusY = MAP_SIZE / 2;
  zoom = 1;

  private targetX = MAP_SIZE / 2;
  private targetY = MAP_SIZE / 2;
  private targetZoom = 1;

  private readonly heat: Float32Array;
  private readonly cols: number;
  private readonly rows: number;

  private shake = 0;
  private shakeX = 0;
  private shakeY = 0;
  private cutTimer = 0;
  private driftPhase = 0;

  private viewWidth = 1280;
  private viewHeight = 720;

  constructor(private readonly rng: RNG, mapSize = MAP_SIZE) {
    this.cols = Math.ceil(mapSize / HEAT_CELL);
    this.rows = Math.ceil(mapSize / HEAT_CELL);
    this.heat = new Float32Array(this.cols * this.rows);
  }

  resize(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
  }

  /** Called by combat systems whenever something violent happens. */
  reportAction(gx: number, gy: number, weight = 1): void {
    const cx = clamp((gx / HEAT_CELL) | 0, 0, this.cols - 1);
    const cy = clamp((gy / HEAT_CELL) | 0, 0, this.rows - 1);
    this.heat[cy * this.cols + cx] += weight;
  }

  /** Screen shake, scaled by distance so far-off explosions don't rattle the frame. */
  reportImpact(gx: number, gy: number, magnitude: number): void {
    const d2 = dist2(gx, gy, this.focusX, this.focusY);
    const falloff = 1 / (1 + d2 * 0.02);
    this.shake = Math.min(CameraCfg.maxShake, this.shake + magnitude * falloff);
  }

  /**
   * @param unitCentroid Fallback focus when nothing is fighting.
   */
  update(dt: number, unitCentroid: { gx: number; gy: number; count: number } | null): void {
    const decay = Math.exp(-CameraCfg.heatDecay * dt);
    let total = 0;
    for (let i = 0; i < this.heat.length; i++) {
      this.heat[i] *= decay;
      if (this.heat[i] < 0.01) this.heat[i] = 0;
      total += this.heat[i];
    }

    this.cutTimer -= dt;
    const cluster = total > 0.5 ? this.findHottestCluster() : null;

    if (cluster) {
      const far = dist2(cluster.gx, cluster.gy, this.targetX, this.targetY) > 24 * 24;
      if (far && this.cutTimer <= 0) {
        // Hard cut to the new engagement.
        this.focusX = cluster.gx;
        this.focusY = cluster.gy;
        this.cutTimer = CameraCfg.cutCooldown;
      }
      this.targetX = cluster.gx;
      this.targetY = cluster.gy;

      // Frame the cluster: tight on a duel, wide on a pitched battle.
      const desiredTiles = clamp(cluster.spread * 2.6 + 9, 10, 46);
      this.targetZoom = clamp(this.viewWidth / (desiredTiles * HALF_W * 2), CameraCfg.minZoom, CameraCfg.maxZoom);
    } else if (unitCentroid && unitCentroid.count > 0) {
      this.driftPhase += dt * 0.16;
      this.targetX = unitCentroid.gx + Math.cos(this.driftPhase) * 8;
      this.targetY = unitCentroid.gy + Math.sin(this.driftPhase * 0.8) * 8;
      this.targetZoom = clamp(this.viewWidth / (34 * HALF_W * 2), CameraCfg.minZoom, CameraCfg.maxZoom);
    }

    this.focusX = damp(this.focusX, this.targetX, CameraCfg.panLerp, dt);
    this.focusY = damp(this.focusY, this.targetY, CameraCfg.panLerp, dt);
    this.zoom = damp(this.zoom, this.targetZoom, CameraCfg.zoomLerp, dt);

    if (this.shake > 0.01) {
      this.shakeX = this.rng.range(-1, 1) * this.shake;
      this.shakeY = this.rng.range(-1, 1) * this.shake * 0.6;
      this.shake = damp(this.shake, 0, CameraCfg.shakeDecay, dt);
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
      this.shake = 0;
    }
  }

  /**
   * Weighted centroid of the hottest heat cell and its neighbours, plus the
   * spread of contributing cells so the zoom can frame the whole engagement.
   */
  private findHottestCluster(): Cluster | null {
    let bestIdx = -1;
    let bestHeat = 0;
    for (let i = 0; i < this.heat.length; i++) {
      if (this.heat[i] > bestHeat) { bestHeat = this.heat[i]; bestIdx = i; }
    }
    if (bestIdx < 0) return null;

    const bx = bestIdx % this.cols;
    const by = (bestIdx / this.cols) | 0;

    let sumW = 0, sumX = 0, sumY = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = bx + dx, y = by + dy;
        if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) continue;
        const w = this.heat[y * this.cols + x];
        if (w <= 0) continue;
        sumW += w;
        sumX += (x + 0.5) * HEAT_CELL * w;
        sumY += (y + 0.5) * HEAT_CELL * w;
      }
    }
    if (sumW <= 0) return null;

    const cx = sumX / sumW;
    const cy = sumY / sumW;

    let variance = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = bx + dx, y = by + dy;
        if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) continue;
        const w = this.heat[y * this.cols + x];
        if (w <= 0) continue;
        variance += w * dist2((x + 0.5) * HEAT_CELL, (y + 0.5) * HEAT_CELL, cx, cy);
      }
    }

    return { gx: cx, gy: cy, heat: sumW, spread: Math.sqrt(variance / sumW) };
  }

  /** Write the current transform onto the world container. */
  applyTo(world: Container): void {
    const focus = gridToScreen(this.focusX, this.focusY, 0);
    world.scale.set(this.zoom);
    world.position.set(
      Math.round(this.viewWidth * 0.5 - focus.x * this.zoom + this.shakeX),
      Math.round(this.viewHeight * 0.5 - (focus.y + HALF_H) * this.zoom + this.shakeY),
    );
  }

  /** Grid-space rectangle currently on screen, padded for culling. */
  visibleGridBounds(pad = 4): { x0: number; y0: number; x1: number; y1: number } {
    const halfTilesX = this.viewWidth / (2 * HALF_W * this.zoom);
    const halfTilesY = this.viewHeight / (2 * HALF_H * this.zoom);
    const reach = halfTilesX + halfTilesY + pad;
    return {
      x0: this.focusX - reach,
      y0: this.focusY - reach,
      x1: this.focusX + reach,
      y1: this.focusY + reach,
    };
  }

  /** Immediately place the camera without easing (used at match start). */
  snapTo(gx: number, gy: number, zoom = 1): void {
    this.focusX = this.targetX = gx;
    this.focusY = this.targetY = gy;
    this.zoom = this.targetZoom = clamp(zoom, CameraCfg.minZoom, CameraCfg.maxZoom);
  }

  /** 0-1 intensity of the current engagement, for HUD flourishes. */
  get intensity(): number {
    let total = 0;
    for (let i = 0; i < this.heat.length; i++) total += this.heat[i];
    return clamp(total / 60, 0, 1);
  }

  /** Blend factor helper for HUD elements that should fade during hard cuts. */
  get cutProgress(): number {
    return clamp(lerp(1, 0, this.cutTimer / CameraCfg.cutCooldown), 0, 1);
  }
}
