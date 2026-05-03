# OrbitCraft

A real-time N-body gravity simulator running entirely on the GPU via WebGPU compute shaders. Watch stars, planets, and moons orbit under Newtonian gravity — drag bodies, add new ones, watch collisions merge mass.

**Live demo:** https://shreyravi.github.io/orbit-crafter/

> Requires Chrome 113+ or Edge 113+. WebGPU is not available in Firefox or Safari.

![OrbitCraft screenshot](https://shreyravi.github.io/orbit-crafter/og.png)

---

## How it works

Each physics tick dispatches a WGSL compute shader that computes pairwise gravitational acceleration for every body, integrates using a staggered leapfrog (drift-kick) scheme, and writes results into a ping-pong storage buffer. The GPU buffer is used directly as vertex data for rendering — no CPU roundtrip per frame. A CPU readback runs async every few frames for collision detection and drag interaction.

- **Integrator:** Staggered leapfrog with substep splitting (`SUBSTEP_COUNT = 4`)
- **Softening:** ε² = 0.0625 prevents NaN at zero separation
- **Bodies:** Up to 64 simultaneously
- **Rendering:** WebGPU additive-blend glow + Canvas 2D overlay for trails, HUD, and UI

---

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:5173 in Chrome 113+ or Edge 113+.

---

## Controls

| Input | Action |
|-------|--------|
| Click empty space | Start placing a body (ghost preview) |
| Scroll while placing | Adjust ghost body mass |
| Click to confirm | Drop the body |
| Escape | Cancel placement |
| Click + drag body | Fling with velocity |
| Hover body + Delete / Backspace | Remove body |
| Space | Pause / resume |
| `.` | Step one frame (when paused) |
| `+` / `=` | Speed up (up to 10×) |
| `-` | Slow down (down to 0.1×) |
| `R` | Reset to star + planet + moon |
| Scroll (no ghost) | Zoom in / out |

---

## Development

```bash
# Type-check
npx tsc --noEmit

# Unit tests (pure math, no WebGPU required)
npm test

# Production build
npm run build

# Preview production build locally
npm run preview
```

### Project layout

```
src/
  constants.ts      — shared constants, BodyData/Camera types, coordinate helpers
  physicsEngine.ts  — WebGPU compute pipeline, leapfrog integration, CPU readback
  renderer.ts       — WebGPU render pipeline, Canvas 2D overlay (trails, HUD, hover)
  input.ts          — mouse/touch/keyboard input, ghost body placement, drag
  main.ts           — entry point, game loop, merge/delete/reset callbacks
  __tests__/
    physics.test.ts — unit tests: force math, leapfrog conservation, coordinate round-trip
```

---

## CI / CD

GitHub Actions runs on every push to `main`:

- **CI** (`.github/workflows/ci.yml`): type-checks + runs the full test suite on Node 22
- **Deploy** (`.github/workflows/deploy.yml`): type-checks, tests, builds, and deploys to GitHub Pages

The live site at `https://shreyravi.github.io/orbit-crafter/` updates automatically on every merge to `main`.

---

## Design system

Visual tokens, palette, typography, and interaction rules are in [`DESIGN.md`](DESIGN.md).

---

## License

MIT
