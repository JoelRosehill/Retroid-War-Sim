/**
 * Application bootstrap and the main loop.
 *
 * The simulation runs on a fixed 30 Hz timestep with an accumulator, decoupled
 * from rendering: a dropped frame slows the picture, never the physics, so a
 * recording made on a busy machine still plays back at the right speed.
 */
import { Application, Container, TextureStyle } from 'pixi.js';
import { MAP_SIZE, MAX_CATCHUP_TICKS, SIM_DT, TEAMS, type TeamId } from './core/Config';
import { SpriteLibrary, type ProgressFn } from './render/SpriteLibrary';
import { TerrainRenderer } from './render/TerrainRenderer';
import { requestMapPlan } from './map/LLMMapClient';
import { generateMap } from './map/MapGenerator';
import { World } from './systems/World';
import { AIController } from './ai/AIController';
import { PROFILES } from './ai/Profiles';
import { HUD } from './ui/HUD';
import { defOf } from './data/registry';
import { isBuilding, isDefense } from './data/types';

export interface GameOptions {
  seed: number;
  /** Natural-language brief handed to the map generator. */
  prompt: string;
  /** Presentation aspect: landscape for YouTube, vertical for shorts. */
  format: 'landscape' | 'vertical' | 'square';
  mount: HTMLElement;
  onProgress: ProgressFn;
}

const FORMATS: Record<GameOptions['format'], { w: number; h: number }> = {
  landscape: { w: 1600, h: 900 },
  vertical: { w: 720, h: 1280 },
  square: { w: 1000, h: 1000 },
};

export class Game {
  private app!: Application;
  private world!: World;
  private hud!: HUD;
  private agents: AIController[] = [];
  private readonly worldRoot = new Container();

  private accumulator = 0;
  private running = false;
  private simSpeed = 1;

  async start(opts: GameOptions): Promise<void> {
    // Nearest-neighbour everywhere: this is a pixel-art project, and bilinear
    // filtering would turn every sprite to mush the moment the camera zooms.
    TextureStyle.defaultOptions.scaleMode = 'nearest';

    const size = FORMATS[opts.format];

    this.app = new Application();
    await this.app.init({
      width: size.w,
      height: size.h,
      background: 0x07090c,
      antialias: false,
      roundPixels: true,
      preference: 'webgl',
      autoDensity: false,
      resolution: 1,
    });

    opts.mount.appendChild(this.app.canvas);
    this.fitCanvas(size.w, size.h);
    window.addEventListener('resize', () => this.fitCanvas(size.w, size.h));

    opts.onProgress(0, 1, 'baking sprites');
    const sprites = await SpriteLibrary.bake(opts.seed, opts.onProgress);

    opts.onProgress(1, 1, 'requesting terrain');
    const response = await requestMapPlan({ prompt: opts.prompt, seed: opts.seed });

    opts.onProgress(1, 1, 'generating terrain');
    const map = generateMap({
      size: MAP_SIZE,
      seed: opts.seed,
      plan: response.plan,
      source: response.source,
    });

    const terrain = new TerrainRenderer(map, sprites);
    terrain.bake(this.app.renderer);

    this.world = new World(map, sprites, terrain, opts.seed);
    this.worldRoot.addChild(this.world.root);
    this.app.stage.addChild(this.worldRoot);

    this.agents = [
      new AIController(this.world, 0, PROFILES[0], opts.seed + 11),
      new AIController(this.world, 1, PROFILES[1], opts.seed + 29),
    ];

    this.hud = new HUD(this.world, this.agents);
    this.app.stage.addChild(this.hud.container);
    this.hud.resize(size.w, size.h);

    this.world.camera.resize(size.w, size.h);
    this.seedBases();

    // Open on a wide establishing shot of the whole battlefield.
    this.world.camera.snapTo(MAP_SIZE / 2, MAP_SIZE / 2, 0.6);

    this.bindControls();
    this.exposeDebugHandle();
    this.running = true;
    this.app.ticker.add((ticker) => this.frame(ticker.deltaMS / 1000));

    opts.onProgress(1, 1, 'ready');
  }

  /** Give each agent a command centre, a first rig, and a small starting force. */
  private seedBases(): void {
    const world = this.world;

    for (const team of [0, 1] as TeamId[]) {
      const home = world.homePosition(team);
      const hqDef = defOf('commandCenter');
      if (!isBuilding(hqDef)) continue;

      // The spawn area is levelled and drained by the map generator, so the
      // centred site is normally fine — but fall back to a real site search
      // rather than trusting that and losing the headquarters.
      const hqX = home.gx - Math.floor(hqDef.fw / 2);
      const hqY = home.gy - Math.floor(hqDef.fh / 2);
      let hq = world.spawnStructure(hqDef, team, hqX, hqY, 1);
      if (!hq) {
        const site = world.production.findBuildSite(team, hqDef, home.gx, home.gy, 14);
        if (site) hq = world.spawnStructure(hqDef, team, site.gx, site.gy, 1);
      }
      if (!hq) throw new Error(`could not place a command center for team ${team}`);

      const rigDef = defOf('miningRig');
      if (isBuilding(rigDef)) {
        const site = world.production.findBuildSite(team, rigDef, home.gx + 4, home.gy + 4, 12);
        if (site) world.spawnStructure(rigDef, team, site.gx, site.gy, 1);
      }

      // A token garrison so the opening minute isn't an empty map.
      const escort = ['rifleman', 'rifleman', 'scout', 'engineer'];
      for (let i = 0; i < escort.length; i++) {
        const angle = (i / escort.length) * Math.PI * 2;
        world.spawnUnit(
          defOf(escort[i]), team,
          home.gx + Math.cos(angle) * 4,
          home.gy + Math.sin(angle) * 4,
        );
      }
    }
  }

  private frame(dtSeconds: number): void {
    // Clamp the delta so a tab restored from the background doesn't fast-forward.
    const dt = Math.min(0.25, dtSeconds) * this.simSpeed;

    // Only the simulation pauses. Rendering and the camera keep running, so a
    // paused match can still be inspected and framed.
    if (this.running) {
      this.accumulator += dt;

      let ticks = 0;
      while (this.accumulator >= SIM_DT && ticks < MAX_CATCHUP_TICKS) {
        this.world.update(SIM_DT);
        for (const agent of this.agents) agent.update(SIM_DT);
        this.accumulator -= SIM_DT;
        ticks++;
      }
      // Drop the backlog rather than spiralling if we can't keep up.
      if (ticks >= MAX_CATCHUP_TICKS) this.accumulator = 0;

      this.world.camera.update(dt, this.world.globalCentreOfMass());
    }

    this.world.camera.applyTo(this.world.root);
    this.world.syncViews();
    this.hud.update();
  }

  /** Letterbox the fixed-resolution canvas into the browser window. */
  private fitCanvas(baseW: number, baseH: number): void {
    const scale = Math.min(window.innerWidth / baseW, window.innerHeight / baseH);
    const canvas = this.app.canvas;
    canvas.style.width = `${Math.floor(baseW * scale)}px`;
    canvas.style.height = `${Math.floor(baseH * scale)}px`;
  }

  /**
   * Expose the live simulation on `window.__retroid` for inspection: framing a
   * particular base, dumping AI state, or driving the camera when composing a
   * shot. Read-only in spirit — nothing in the game reads it back.
   */
  private exposeDebugHandle(): void {
    (window as unknown as Record<string, unknown>).__retroid = {
      world: this.world,
      agents: this.agents,
      camera: this.world.camera,
      /** Frame a team's base and hold it there. */
      lookAtBase: (team: TeamId, zoom = 1.6) => {
        const home = this.world.homePosition(team);
        this.world.camera.snapTo(home.gx, home.gy, zoom);
      },
      setSpeed: (multiplier: number) => { this.simSpeed = multiplier; },
      pause: () => { this.running = false; },
      resume: () => { this.running = true; },
      /** Drop a unit on the map — for previewing a chassis or staging a shot. */
      spawn: (id: string, team: TeamId, gx: number, gy: number) =>
        this.world.spawnUnit(defOf(id), team, gx, gy),
      /**
       * Place a completed structure, bypassing cost, build radius and prop
       * checks. It cannot bypass terrain: water and mountain are refused here
       * exactly as they are for the agents, and this returns null instead.
       */
      place: (id: string, team: TeamId, gx: number, gy: number) => {
        const def = defOf(id);
        if (!isBuilding(def) && !isDefense(def)) return null;
        return this.world.spawnStructure(def, team, gx, gy, 1);
      },
    };
  }

  private bindControls(): void {
    window.addEventListener('keydown', (event) => {
      switch (event.key) {
        case ' ':
          this.running = !this.running;
          event.preventDefault();
          break;
        case '1': this.simSpeed = 1; break;
        case '2': this.simSpeed = 2; break;
        case '3': this.simSpeed = 4; break;
        default: break;
      }
    });
  }

  get teamNames(): readonly string[] {
    return TEAMS.map((t) => t.name);
  }
}
