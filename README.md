# OrbitCraft

A real-time GPU-accelerated N-body physics universe sandbox built with WebGPU.

![OrbitCraft screenshot placeholder](docs/screenshot.png)

> OrbitCraft is a physics simulation platform, not a game engine. It is designed for gravitational visualization, emergent orbital mechanics, and GPU compute experimentation.

---

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Controls](#controls)
- [Simulation Modes](#simulation-modes)
- [Architecture](#architecture)
- [File Structure](#file-structure)
- [Simulation Units](#simulation-units)
- [Performance Targets](#performance-targets)
- [Scripts](#scripts)
- [Testing](#testing)
- [Building for Production](#building-for-production)

---

## Features

| Feature | Details |
|---|---|
| **GPU N-body physics** | WebGPU compute shaders with tiled shared-memory O(N²) force calculation |
| **Barnes-Hut approximation** | CPU quad-tree → GPU integration, enables 100k+ bodies |
| **Hybrid mode** | Auto-switches algorithm at runtime based on body count |
| **Velocity Verlet / Semi-implicit Euler** | Symplectic integration for long-term orbital stability |
| **Rocket propulsion** | Thrust-based rockets with fuel burn, WASD control, autopilot circularisation |
| **Lagrange points** | L1–L5 computed numerically per dominant body pair, colour-coded by stability |
| **Gravity field heatmap** | Toggleable fullscreen raymarched potential overlay |
| **Trajectory trails** | Per-body ring-buffer trails rendered on Canvas 2D overlay |
| **Multi-universe saves** | Create, duplicate, snapshot, fork, export/import universes via localStorage |
| **Live editing** | Add, delete, and edit bodies during a running simulation |
| **Dark space UI** | Vanilla TypeScript panels — body list, inspector, control bar, no frameworks |

---

## Requirements

| Requirement | Version |
|---|---|
| Node.js | 18+ |
| npm | 9+ |
| Browser | Chrome 113+ / Edge 113+ (WebGPU required) |

> **macOS users:** If WebGPU does not initialise, enable it at `chrome://flags/#enable-unsafe-webgpu`.

---

## Quick Start

```bash
# 1 — Install dependencies
npm install

# 2 — Start dev server (hot-reload)
npm run dev

# 3 — Open in browser
open http://localhost:5173
```

On first load, a default solar system is generated:

- **1 star** (Sol) at the origin
- **2 planets** (Earth-like at r = 55, Jupiter-like at r = 130) in stable circular orbits
- **1 moon** orbiting the inner planet
- **~700 asteroids** in a belt between r = 75–115
- **1 rocket** in low orbit around the inner planet

---

## Controls

### Camera

| Action | Input |
|---|---|
| Pan | Click + drag |
| Zoom | Scroll wheel / pinch |
| Focus body | Double-click body in list |

### Rocket

| Action | Input |
|---|---|
| Thrust direction | Arrow keys or WASD |
| Toggle engine on/off | Space |
| Set thrust in inspector | Select rocket → adjust inspector |
| Autopilot circularise | Select rocket → Inspector → "Circularise" |

### Simulation

| Action | Location |
|---|---|
| Play / Pause | Bottom bar `⏸` button |
| Step one frame | Bottom bar `⏭` button |
| Speed multiplier | Bottom bar speed slider (×0.0001 – ×10000) |
| Switch simulation mode | Top bar mode selector |
| Toggle overlays | Top bar checkboxes |

### Body editing

| Action | Method |
|---|---|
| Select body | Click body in left panel list |
| Delete body | Click `×` next to body in list |
| Edit properties | Select body → right panel inspector |
| Add body at position | Top bar → choose type → "+ Add (click canvas)" → click canvas |
| Inspect position/velocity live | Inspector updates at ~4 Hz from GPU readback |

---

## Simulation Modes

### EXACT (default)
- Full O(N²) gravitational force calculation on GPU
- Tiled workgroup shared-memory reduces global memory bandwidth by ~256×
- Target: 1,000–10,000 bodies at 60 fps

### BARNES-HUT
- CPU builds a quad-tree each frame
- Approximation threshold `θ = 0.5` (configurable in `constants.ts`)
- GPU performs integration using CPU-supplied force array
- Target: 10,000–100,000 bodies

### HYBRID
- Automatically uses EXACT below 3,000 bodies, BARNES-HUT above
- Switchable at runtime without restart

---

## Architecture

```
SimulationEngine          — requestAnimationFrame loop, timestep, mode dispatch
├── GPUPhysicsEngine       — WebGPU device, compute pipelines, ping-pong buffers
│   ├── gravityCompute.wgsl      (nbodyStep entry point)
│   └── integrateForces.wgsl     (integrateForces entry point)
├── BarnesHutSystem        — CPU quad-tree, O(N log N) force evaluation
├── RocketSystem           — thrust forces, fuel burn, autopilot
├── LagrangePointSystem    — L1–L5 Newton's-method solver
├── UniverseManager        — body CRUD, GPU buffer sync, initial universe gen
│   └── BodySystem               — in-memory body list, dirty tracking
├── RenderEngine           — WebGPU instanced body rendering + Canvas 2D overlay
│   ├── renderBodies.wgsl        (instanced quads with glow)
│   └── [Canvas 2D]              (trails, labels, Lagrange markers)
├── RaymarchedGravitySystem — fullscreen potential heatmap (toggleable)
│   └── raymarchGravity.wgsl
├── CameraSystem           — pan, zoom, touch, world↔screen transforms
└── MultiUniverseSaveSystem — localStorage JSON, snapshots, fork
```

### GPU Buffer Layout

```
positionBuffer[2]   — ping-pong vec2<f32> array, N × 8 bytes
velocityBuffer[2]   — ping-pong vec2<f32> array, N × 8 bytes
massBuffer          — f32 array,            N × 4 bytes
forceBuffer         — vec2<f32> array,      N × 8 bytes  (BH / rocket)
bodyRenderBuffer    — 48-byte struct array, N entries

Render struct (48 bytes):
  posX, posY         f32 f32    — 0
  velX, velY         f32 f32    — 8
  colorR, G, B, A    f32×4      — 16
  radius             f32        — 32
  bodyType           u32        — 36
  _pad0, _pad1       f32 f32    — 40
```

### Integration Scheme

Semi-implicit (symplectic) Euler — good energy conservation for orbital mechanics:

```
a(t)       = F(x(t)) / m
v(t + dt)  = v(t) + a(t) · dt
x(t + dt)  = x(t) + v(t + dt) · dt
```

---

## File Structure

```
orbit-crafter/
├── index.html
├── styles.css
├── package.json
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── main.ts                         — entry point
    ├── SimulationEngine.ts
    ├── GPUPhysicsEngine.ts
    ├── BarnesHutSystem.ts
    ├── BodySystem.ts
    ├── RocketSystem.ts
    ├── LagrangePointSystem.ts
    ├── CameraSystem.ts
    ├── RenderEngine.ts
    ├── RaymarchedGravitySystem.ts
    ├── UniverseManager.ts
    ├── shaders.d.ts                    — *.wgsl?raw type declarations
    ├── shaders/
    │   ├── gravityCompute.wgsl         — O(N²) GPU N-body + integration
    │   ├── integrateForces.wgsl        — integration-only (Barnes-Hut mode)
    │   ├── renderBodies.wgsl           — instanced body rendering
    │   ├── raymarchGravity.wgsl        — gravity field heatmap
    │   └── barnesHutCompute.wgsl       — GPU BH traversal (future use)
    ├── ui/
    │   ├── BodyList.ts
    │   ├── Inspector.ts
    │   ├── ControlBar.ts
    │   ├── ModeSelector.ts
    │   └── UniverseManagerPanel.ts
    ├── persistence/
    │   └── MultiUniverseSaveSystem.ts
    └── utils/
        ├── constants.ts
        ├── math.ts
        └── gpuBuffers.ts
```

---

## Simulation Units

OrbitCraft uses dimensionless simulation units to keep floating-point values in a numerically comfortable range:

| Quantity | Value |
|---|---|
| Gravitational constant G | 1.0 |
| Star mass | 1 000 |
| Planet mass | ~1–3 |
| Moon mass | 0.01 |
| Asteroid mass | 0.0001 |
| Rocket mass | 0.05 |
| Default timestep dt | 0.05 |
| Softening ε | 0.1 (ε² = 0.01) |

Circular orbit velocity at radius r around mass M: `v = √(G·M / r)`

---

## Performance Targets

| Mode | Bodies | Target FPS |
|---|---|---|
| EXACT (GPU) | 1 000 | 60 |
| EXACT (GPU) | 10 000 | 30+ |
| BARNES-HUT | 10 000 | 60 |
| BARNES-HUT | 100 000 | 15+ |
| HYBRID | < 3 000 | 60 (exact) |
| HYBRID | ≥ 3 000 | 30+ (BH) |

> Gravity field heatmap (`Grav Field` overlay) is expensive and capped at 512 bodies when enabled.

---

## Scripts

```bash
npm run dev        # Dev server with hot-reload  (http://localhost:5173)
npm run build      # Production build            → dist/
npm run preview    # Serve production build locally
npm run typecheck  # TypeScript type check only  (no emit)
npm test           # Run unit test suite         (Vitest)
npm run test:ui    # Run tests with browser UI
npm run test:run   # Run tests once (CI mode)
```

For a full pre-release check (typecheck → tests → build):

```bash
./scripts/build.sh
```

---

## Testing

Tests live in `tests/` and cover all CPU-side logic. WebGPU and DOM are not required for the test suite.

```bash
npm test           # watch mode
npm run test:run   # single run (CI)
```

Test files:

| File | Coverage |
|---|---|
| `tests/math.test.ts` | Vector operations, orbital velocity, hex↔RGB, smoothstep |
| `tests/barnesHut.test.ts` | Tree construction, COM computation, force accuracy vs exact |
| `tests/lagrange.test.ts` | L4/L5 geometry, L1–L3 bracket, stability classification |
| `tests/bodySystem.test.ts` | CRUD operations, dirty flag, GPU index assignment, readback |
| `tests/saveSystem.test.ts` | Snapshot create/load/delete, fork, JSON export/import |

---

## Building for Production

```bash
npm run build
# output → dist/index.html + dist/assets/
```

The build is a single self-contained bundle. Serve `dist/` from any static host. Because WebGPU requires a secure context, the site must be served over **HTTPS** (or `localhost`).

Example with `serve`:

```bash
npx serve dist
```

> The server must send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers if SharedArrayBuffer is ever used. The Vite dev server sets these automatically; configure them in your production web server as needed.

---

## License

MIT
