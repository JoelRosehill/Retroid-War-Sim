# Retroid War Sim

A 2.5D isometric RTS **simulation** — two AI agents fight an autonomous war on a
procedurally generated map, rendered in early-2000s pixel art (SimCity 2000 /
Red Alert 2 lineage). There is no player: the camera directs itself toward the
action, which makes the output suitable for screen recording.

```bash
npm install
npm run dev        # http://localhost:5173
```

No API key is required — the map generator falls back to a local procedural
generator. See [Terrain generation](#terrain-generation) to enable the Claude path.

---

## File structure

```
retroid-war-sim/
├── index.html                     Boot overlay + canvas mount
├── vite.config.ts                 Vite config; registers the mapgen middleware
├── tsconfig.json                  Strict TypeScript
├── server/
│   └── mapgen.ts                  POST /api/mapgen — Claude-authored biome plans
└── src/
    ├── main.ts                    Entry point; query-string options
    ├── Game.ts                    App bootstrap, fixed-timestep loop, debug hook
    │
    ├── core/
    │   ├── Config.ts              Tile metrics, sim rate, economy + camera tuning
    │   ├── RNG.ts                 Seeded mulberry32 + value-noise/fBm
    │   ├── MathUtils.ts           Clamp, damp, angle helpers, colour ops
    │   ├── ObjectPool.ts          Pool + swap-remove dense list
    │   └── SpatialHash.ts         Uniform-grid broad phase for proximity queries
    │
    ├── iso/
    │   ├── Iso.ts                 Grid ↔ screen projection, depth keys
    │   ├── DepthSorter.ts         Bucketed painter's-algorithm sort
    │   └── CinematicCamera.ts     Autonomous director: heat, framing, cuts, shake
    │
    ├── render/
    │   ├── PixelCanvas.ts         Integer-pixel raster surface → nearest texture
    │   ├── Palette.ts             Fixed colour ramps + per-team tinting
    │   ├── SpriteLibrary.ts       Bakes every texture at boot (chunked, async)
    │   ├── TerrainRenderer.ts     Terrain baked into per-chunk render textures
    │   └── sprites/
    │       ├── terrain.ts         Tiles, cliffs, decals, scatter props
    │       ├── units.ts           Infantry poses; extruded iso hulls + aircraft
    │       ├── structures.ts      Extruded building boxes + per-style ornaments
    │       └── effects.ts         Explosions, muzzle flashes, tracers, beams
    │
    ├── map/
    │   ├── BiomeTypes.ts          8 biomes: movement, cover, buildability
    │   ├── MapPlan.ts             Wire format shared with the server
    │   ├── LLMMapClient.ts        Fetches a plan; procedural fallback
    │   ├── MapGenerator.ts        Expands a plan into the full-res grid
    │   └── GameMap.ts             Flat typed-array tile storage
    │
    ├── pathfinding/
    │   ├── NavGrid.ts             Terrain + structure passability, move classes
    │   ├── AStar.ts               8-way A*, binary heap, versioned scratch
    │   └── PathService.ts         Budgeted request queue
    │
    ├── data/
    │   ├── types.ts               Entity/weapon schema, armour × damage table
    │   ├── infantry.ts            Category A — 10 types
    │   ├── buildings.ts           Category B — 20 types
    │   ├── defenses.ts            Category C — 10 types
    │   ├── vehicles.ts            Category D — 10 types
    │   ├── aircraft.ts            Category E — 10 types
    │   └── registry.ts            Lookup + producer index
    │
    ├── entities/
    │   ├── SimEntity.ts           Base class: spatial, team, health, view
    │   ├── Unit.ts                Path following, targeting, weapon servicing
    │   ├── Infantry.ts            Direct steering, medic/engineer support
    │   ├── Vehicle.ts             Accel/brake/turn radius, crushing
    │   ├── Aircraft.ts            Off-grid flight, altitude, ground shadow
    │   └── Structure.ts           Footprints, production queues, auras
    │
    ├── systems/
    │   ├── World.ts               Entity storage, layers, tick orchestration
    │   ├── EconomySystem.ts       Coin ledger, passive drip, rig multipliers
    │   ├── ProductionSystem.ts    Build validation, siting, spawn queues
    │   ├── TargetingSystem.ts     Threat-weighted acquisition
    │   ├── CombatSystem.ts        Hitscan/beam/ballistic, accuracy, splash
    │   ├── ProjectileSystem.ts    Pooled projectiles, parabolic + homing
    │   └── ParticleSystem.ts      Pooled VFX
    │
    ├── ai/
    │   ├── Profiles.ts            The two doctrines (data only)
    │   └── AIController.ts        Decision loop shared by both agents
    │
    └── ui/
        └── HUD.ts                 Faction readouts, kill feed, clock
```

---

## Architecture

### Isometric projection (`src/iso/Iso.ts`)

```
screenX = (gx - gy) * tileWidth  / 2
screenY = (gx + gy) * tileHeight / 2 - elevation * ELEV_STEP
```

64×32 tiles, elevation as a separate 16px vertical step that never affects
depth ordering. `screenToGrid` inverts it; `depthKey` produces the sort key.

### Depth sorting (`src/iso/DepthSorter.ts`)

Entities sort by screen row (`gx + gy`) so objects lower on screen overlap those
higher up. Pixi's `sortableChildren` runs a comparison sort over the whole
container every frame; the keys here are bounded and mostly-sorted between
frames, so this uses a **bucket sort by screen row plus an insertion pass inside
each bucket**, then rewrites the child array in place.

### Rendering

All art is **generated at runtime** — the repo ships no image files. `PixelCanvas`
rasterizes into an RGBA buffer at 1:1 pixel scale, and `SpriteLibrary` bakes
~1,300 textures at boot (chunked, yielding to the event loop so the progress bar
animates). This makes per-team palette swaps free and keeps the hard-edged look
of the era intact.

Vehicles, aircraft and buildings are drawn as **extruded isometric boxes computed
from a facing angle**, so all 8 facings come from one routine rather than 8
hand-authored sprites per chassis. Infantry are drawn per-facing from a pose
table, because a humanoid silhouette doesn't survive being extruded. Only 5
facings are rasterized; the other 3 are horizontal mirrors.

Terrain is baked into **per-chunk render textures** (16×16 tiles each), turning
~9,200 tile sprites into one draw call per on-screen chunk. Tall props (pines,
dead trees) are deliberately excluded from the bake so units can walk *behind*
them and take part in depth sorting.

### Cinematic camera (`src/iso/CinematicCamera.ts`)

Combat events deposit "heat" on a coarse grid. Each frame the director finds the
hottest cluster, aims at its centre of mass, and sets zoom from the cluster's
spread. When a new engagement decisively outweighs the current one it **cuts**
rather than pans — a camera that drifts between two fights reads badly in a
clip. With no combat it drifts slowly over the centre of mass of all units.
Explosions add distance-attenuated shake.

### Simulation loop

Fixed **30 Hz** timestep with an accumulator, decoupled from rendering: a dropped
frame slows the picture, never the physics, so a recording made on a busy machine
still plays back at the right speed. Pausing stops the simulation but not the
camera, so a paused match can still be inspected.

### Performance

Measured in-browser with 84 units and 42 structures live:

| | cost |
|---|---|
| Simulation tick (all systems + both AI agents) | **0.24 ms** |
| View sync + depth sort, per frame | **0.07 ms** |

The load-bearing decisions: chunked terrain bake, bucketed depth sort, object
pooling for projectiles/particles, a spatial hash for proximity queries, and a
per-tick expansion budget in the path service (one order given to 80 units would
otherwise mean 80 full A\* searches inside a single tick).

---

## Entities

60 types across five categories, defined as strictly-typed data in `src/data/`.
Behaviour is shared by category (`Infantry`, `Vehicle`, `Aircraft`, `Structure`);
what distinguishes types is stats, weapons, visual parameters and ability hooks.
Adding a type is a data edit, not a new class.

| Category | Count | Mechanics |
|---|---|---|
| **A — Infantry** | 10 | A\* pathing, attack radius, per-unit state machine, medic/engineer support |
| **B — Buildings** | 20 | Grid-snapped footprint matrices that block ground pathing; production queues, income, repair auras |
| **C — Defense** | 10 | Proximity triggers (mines), parabolic trajectories (mortars), 360° auto-targeting turrets |
| **D — Machinery** | 10 | Acceleration, braking, turning radius, larger hitboxes, infantry crushing; hovercraft ignore water |
| **E — Flying** | 10 | Off-grid flight on an elevated layer, projecting a semi-transparent ground shadow that scales with altitude |

Damage is resolved through a **damage-type × armour-class** table, so composition
matters: bullets shred infantry and bounce off heavy armour; AT rockets invert it.

---

## Economy

A strict global coin ledger per agent, updated every tick.

- **Passive income** — a flat drip every agent receives unconditionally.
- **Active income** — each operational Mining Rig multiplies the drip; depots,
  generators and surviving supply trucks contribute smaller bonuses.
- **Purchasing** — every unit, building and defence is validated against the
  ledger in `ProductionSystem` *before* anything is instantiated. Nothing in the
  game can bypass it.

---

## The two agents

Both use the same controller (`AIController`); the difference is entirely data in
`Profiles.ts` — build order, army composition, attack thresholds, and how much
income goes into static defence.

- **ALPHA COMMAND** — rapid mechanisation. Early vehicle factory, cheap jeeps and
  light tanks, commits attack waves at 7 units, minimal fortification.
- **BRAVO LEGION** — fortify and escalate. Walls, wire, bunkers and turrets;
  banks a large reserve, techs to heavy tanks and bombers, waves at 16 units.

Each decision cycle evaluates coin balance, enemy positions, friendly unit
counts and base integrity, then emits build orders, production queue entries and
movement targets for clusters of units. Army composition targets scale off
**income**, not current army size — pegging the target to what you already have
makes it self-satisfying and the agent never expands past its opening force.

---

## Terrain generation

The map is generated in two stages. A **biome plan** (a coarse biome matrix plus
ridge, river and prop directives) supplies large-scale intent; `MapGenerator`
expands it into the full 96×96 grid with domain-warped biome borders, ridge
elevation, carved rivers, scattered props and pre-existing battle damage, then
guarantees the two spawns are connected by ground — carving a corridor if the
plan didn't leave one.

The plan comes from **Claude** when an API key is present:

```bash
cp .env.example .env       # set ANTHROPIC_API_KEY
```

`server/mapgen.ts` runs server-side only — the key never reaches the browser. It
requests a coarse matrix under a strict JSON schema (`output_config.format`)
rather than a full-resolution one, which keeps the response to a few thousand
tokens while still letting the model author the map's shape. Without a key, an
equivalent plan is produced locally; the sim is fully playable either way, and
the HUD says which path was used.

---

## Controls and options

| Key | |
|---|---|
| `Space` | Pause / resume the simulation (camera keeps running) |
| `1` `2` `3` | Simulation speed ×1 / ×2 / ×4 |
| `D` | Toggle the debug overlay |

Query-string options, so a recording session is reproducible:

```
?seed=1234           fixed seed — same map, same match, every time
?format=vertical     9:16 for shorts (also: landscape, square)
?prompt=...          terrain brief handed to the map generator
```

`window.__retroid` exposes the live simulation for composing shots:
`lookAtBase(team, zoom)`, `spawn(id, team, gx, gy)`, `place(id, team, gx, gy)`,
`setSpeed(n)`, `pause()`, `resume()`.

---

## Scripts

```bash
npm run dev          # dev server + /api/mapgen middleware
npm run build        # typecheck, then production build
npm run typecheck    # tsc --noEmit
npm run preview      # serve the build (mapgen middleware included)
```
