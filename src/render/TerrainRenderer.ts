/**
 * Terrain rendering.
 *
 * A 96x96 map is ~9,200 tile sprites plus cliffs, decals and ground clutter.
 * Submitting those individually every frame is wasteful, and because each
 * generated tile variant is its own texture they would not batch. So the
 * terrain is baked once into a grid of render textures — one draw call per
 * on-screen chunk instead of thousands.
 *
 * Tall props (pines, dead trees) are deliberately *not* baked: a unit must be
 * able to walk behind them, which means they have to take part in depth
 * sorting. Short clutter is baked, since nothing meaningfully passes behind it.
 */
import { Container, Renderer, RenderTexture, Sprite } from 'pixi.js';
import { ELEV_STEP, HALF_H, HALF_W, Layer, TILE_H, TILE_W } from '../core/Config';
import { depthKey, gridToScreen } from '../iso/Iso';
import type { GameMap } from '../map/GameMap';
import { Biome, DecalKind, PropKind } from '../map/BiomeTypes';
import type { SpriteLibrary } from './SpriteLibrary';
import type { Sortable } from '../iso/DepthSorter';

const CHUNK = 16;

/** Props that participate in depth sorting rather than being baked in. */
const TALL_PROPS = new Set<PropKind>([PropKind.Pine, PropKind.DeadTree]);

export interface PropInstance extends Sortable {
  gx: number;
  gy: number;
}

export class TerrainRenderer {
  readonly container = new Container();
  /** Tall props, handed to the entity layer's depth sorter. */
  readonly props: PropInstance[] = [];

  private chunkSprites: Sprite[] = [];
  private chunkBounds: { x0: number; y0: number; x1: number; y1: number }[] = [];

  constructor(
    private readonly map: GameMap,
    private readonly lib: SpriteLibrary,
  ) {}

  /** Bake every chunk. Call once, after the map is generated. */
  bake(renderer: Renderer): void {
    const chunksPerSide = Math.ceil(this.map.size / CHUNK);

    for (let cy = 0; cy < chunksPerSide; cy++) {
      for (let cx = 0; cx < chunksPerSide; cx++) {
        this.bakeChunk(renderer, cx * CHUNK, cy * CHUNK);
      }
    }
    this.collectTallProps();
  }

  private bakeChunk(renderer: Renderer, x0: number, y0: number): void {
    const x1 = Math.min(this.map.size, x0 + CHUNK);
    const y1 = Math.min(this.map.size, y0 + CHUNK);

    // Screen-space extents of this chunk, allowing for elevation and cliffs.
    let maxElev = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) maxElev = Math.max(maxElev, this.map.elevationAt(x, y));
    }

    const minX = (x0 - (y1 - 1)) * HALF_W - HALF_W;
    const maxX = ((x1 - 1) - y0) * HALF_W + HALF_W;
    const minY = (x0 + y0) * HALF_H - maxElev * ELEV_STEP;
    const maxY = ((x1 - 1) + (y1 - 1)) * HALF_H + TILE_H + ELEV_STEP * 3 + 8;

    const width = Math.ceil(maxX - minX);
    const height = Math.ceil(maxY - minY);

    const scratch = new Container();

    // Painter's order within a chunk is simply the screen row.
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        this.drawTile(scratch, x, y, minX, minY);
      }
    }

    const texture = RenderTexture.create({ width, height, scaleMode: 'nearest' });
    renderer.render({ container: scratch, target: texture, clear: true });
    scratch.destroy({ children: true });

    const sprite = new Sprite(texture);
    sprite.position.set(minX, minY);
    this.container.addChild(sprite);
    this.chunkSprites.push(sprite);
    this.chunkBounds.push({ x0, y0, x1, y1 });
  }

  private drawTile(scratch: Container, x: number, y: number, ox: number, oy: number): void {
    const map = this.map;
    const i = map.idx(x, y);
    const biome = map.biome[i] as Biome;
    const elev = map.elevation[i];
    const screen = gridToScreen(x, y, elev);

    // Cliff face, drawn first so the tile top overlaps its upper edge.
    const southEast = map.elevationAt(x + 1, y);
    const southWest = map.elevationAt(x, y + 1);
    const drop = elev - Math.min(southEast, southWest);
    if (drop > 0) {
      const cliffSet = this.lib.cliffs[biome];
      const cliff = new Sprite(cliffSet[Math.min(cliffSet.length - 1, drop - 1)]);
      cliff.position.set(screen.x - HALF_W - ox, screen.y - oy);
      scratch.addChild(cliff);
    }

    const variants = this.lib.terrain[biome];
    const tile = new Sprite(variants[map.variant[i] % variants.length]);
    tile.position.set(screen.x - HALF_W - ox, screen.y - oy);
    scratch.addChild(tile);

    const decal = map.decal[i] as DecalKind;
    if (decal !== DecalKind.None) {
      const set = this.lib.decals[decal];
      const sprite = new Sprite(set[map.decalVariant[i] % set.length]);
      sprite.position.set(screen.x - HALF_W - ox, screen.y - oy);
      scratch.addChild(sprite);
    }

    const prop = map.prop[i] as PropKind;
    if (prop !== PropKind.None && !TALL_PROPS.has(prop)) {
      const set = this.lib.props[prop];
      const variant = map.propVariant[i] % set.length;
      const pivot = this.lib.propPivots[prop][variant];
      const sprite = new Sprite(set[variant]);
      sprite.position.set(
        screen.x - ox - pivot.x,
        screen.y + HALF_H - oy - pivot.y,
      );
      scratch.addChild(sprite);
    }
  }

  /** Build sortable sprites for the props that units must be able to hide behind. */
  private collectTallProps(): void {
    const map = this.map;
    for (let y = 0; y < map.size; y++) {
      for (let x = 0; x < map.size; x++) {
        const i = map.idx(x, y);
        const prop = map.prop[i] as PropKind;
        if (prop === PropKind.None || !TALL_PROPS.has(prop)) continue;

        const set = this.lib.props[prop];
        const variant = map.propVariant[i] % set.length;
        const pivot = this.lib.propPivots[prop][variant];
        const sprite = new Sprite(set[variant]);
        sprite.anchor.set(pivot.x / sprite.texture.width, pivot.y / sprite.texture.height);

        const screen = gridToScreen(x, y, map.elevation[i]);
        sprite.position.set(Math.round(screen.x), Math.round(screen.y + HALF_H));

        this.props.push({
          view: sprite,
          depth: depthKey(x, y, Layer.Entity, -10),
          visible: true,
          gx: x,
          gy: y,
        });
      }
    }
  }

  /** Hide chunks and props outside the camera's grid window. */
  cull(bounds: { x0: number; y0: number; x1: number; y1: number }): void {
    for (let i = 0; i < this.chunkSprites.length; i++) {
      const c = this.chunkBounds[i];
      this.chunkSprites[i].visible =
        c.x1 >= bounds.x0 && c.x0 <= bounds.x1 && c.y1 >= bounds.y0 && c.y0 <= bounds.y1;
    }

    for (const prop of this.props) {
      prop.visible =
        prop.gx >= bounds.x0 - 2 && prop.gx <= bounds.x1 + 2 &&
        prop.gy >= bounds.y0 - 2 && prop.gy <= bounds.y1 + 2;
    }
  }

  /** Total baked texture area, reported in the debug overlay. */
  get bakedPixels(): number {
    let total = 0;
    for (const sprite of this.chunkSprites) total += sprite.texture.width * sprite.texture.height;
    return total;
  }

  destroy(): void {
    for (const sprite of this.chunkSprites) sprite.texture.destroy(true);
    this.container.destroy({ children: true });
  }
}

/** Screen size of the whole map, used to frame the minimap. */
export function mapPixelSize(size: number): { width: number; height: number } {
  return { width: size * TILE_W, height: size * TILE_H + ELEV_STEP * 6 };
}
