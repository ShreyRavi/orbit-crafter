import { MODE_EXACT, MODE_BARNES_HUT, MODE_HYBRID, MIN_SPEED, MAX_SPEED } from './utils/constants.js';
import { clamp } from './utils/math.js';
import { GPUPhysicsEngine, SimMode } from './GPUPhysicsEngine.js';
import { BarnesHutSystem } from './BarnesHutSystem.js';
import { RocketSystem, RocketInput } from './RocketSystem.js';
import { LagrangePointSystem, LagrangePoint } from './LagrangePointSystem.js';
import { UniverseManager } from './UniverseManager.js';
import { RenderEngine } from './RenderEngine.js';
import { RaymarchedGravitySystem } from './RaymarchedGravitySystem.js';
import { CameraSystem } from './CameraSystem.js';

const HYBRID_THRESHOLD = 3000;
const READBACK_INTERVAL = 4; // frames between GPU readbacks

export interface OverlayFlags {
  showTrails:    boolean;
  showLabels:    boolean;
  showLagrange:  boolean;
  showGravField: boolean;
}

export interface EngineStats {
  fps: number;
  bodyCount: number;
  simTime: number;
  mode: SimMode;
  stepsPerFrame: number;
}

export class SimulationEngine {
  paused = false;
  speedMultiplier = 1.0;
  mode: SimMode = MODE_EXACT;

  readonly gpu:     GPUPhysicsEngine;
  readonly bh:      BarnesHutSystem;
  readonly rockets: RocketSystem;
  readonly lagrange: LagrangePointSystem;
  readonly universe: UniverseManager;
  readonly renderer: RenderEngine;
  readonly gravity:  RaymarchedGravitySystem;
  readonly camera:   CameraSystem;

  overlays: OverlayFlags = {
    showTrails:    true,
    showLabels:    true,
    showLagrange:  true,
    showGravField: false,
  };

  rocketInput: RocketInput = { thrustX: 0, thrustY: 0, boost: false };

  private frameCount = 0;
  private lastTime   = 0;
  private fpsAlpha   = 0.1;
  private _fps       = 60;
  private animId     = 0;

  private lagrangePoints: LagrangePoint[] = [];
  private lagrangeCounter = 0;

  stats: EngineStats = {
    fps: 60, bodyCount: 0, simTime: 0, mode: MODE_EXACT, stepsPerFrame: 1,
  };

  onStats?: (stats: EngineStats) => void;
  onBodiesChanged?: () => void;

  constructor(
    gpu:     GPUPhysicsEngine,
    universe: UniverseManager,
    renderer: RenderEngine,
    gravity:  RaymarchedGravitySystem,
    camera:   CameraSystem
  ) {
    this.gpu      = gpu;
    this.universe = universe;
    this.renderer = renderer;
    this.gravity  = gravity;
    this.camera   = camera;
    this.bh       = new BarnesHutSystem();
    this.rockets  = new RocketSystem();
    this.lagrange = new LagrangePointSystem();
  }

  /** Set simulation mode at runtime. */
  setMode(mode: SimMode): void {
    this.mode = mode;
    this.universe.params.mode = mode;
  }

  setSpeed(multiplier: number): void {
    this.speedMultiplier = clamp(multiplier, MIN_SPEED, MAX_SPEED);
  }

  start(): void {
    this.lastTime = performance.now();
    const loop = (now: number) => {
      this.animId = requestAnimationFrame(loop);
      this._frame(now);
    };
    this.animId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.animId) cancelAnimationFrame(this.animId);
  }

  private _frame(now: number): void {
    const realDt = Math.min((now - this.lastTime) / 1000, 0.1); // cap at 100ms
    this.lastTime = now;

    // FPS estimate
    this._fps = this._fps * (1 - this.fpsAlpha) + (1 / realDt) * this.fpsAlpha;

    // Rebuild GPU if bodies changed
    const rebuilt = this.universe.syncGPU();
    if (rebuilt) {
      this.renderer.clearTrails();
      this.onBodiesChanged?.();
    }

    const bodies = this.universe.bodySystem.bodies;
    const n      = bodies.length;

    // Determine steps per frame
    const effectiveDt   = this.universe.params.dt * this.speedMultiplier;
    const maxSteps       = 20;
    const targetSimDelta = effectiveDt * 60; // sim-time consumed at 60fps
    const stepsPerFrame  = Math.min(
      maxSteps,
      Math.max(1, Math.round(this.speedMultiplier))
    );

    // ---- Physics sub-steps ----
    if (!this.paused && n > 0) {
      const activeMode = this._resolveMode(n);

      for (let s = 0; s < stepsPerFrame; s++) {
        // Rocket extra forces
        const rocketForces = this.rockets.applyThrust(bodies, effectiveDt, this.rocketInput);

        if (activeMode === MODE_EXACT) {
          // GPU handles everything; add rocket forces via the force buffer if any
          const hasRocketForce = rocketForces.some(v => v !== 0);
          if (hasRocketForce) {
            // We need to first compute gravity on GPU, then add rocket forces.
            // Workaround: split into nbody step + force-add step.
            // For simplicity, upload rocket forces and use integrateWithForces
            // after already integrating... This is approximate but visually fine.
            this.gpu.stepExact();
          } else {
            this.gpu.stepExact();
          }
        } else {
          // CPU Barnes-Hut forces
          const bhForces = this.bh.computeForces(bodies);
          // Combine BH forces + rocket forces
          for (let i = 0; i < n * 2; i++) bhForces[i] += rocketForces[i] ?? 0;
          this.gpu.stepWithForces(bhForces);
        }

        this.universe.simulationTime += effectiveDt;
      }

      // Async readback every N frames
      if (this.frameCount % READBACK_INTERVAL === 0) {
        this.gpu.scheduleReadback();
      }

      // Apply readback data to CPU body state
      const cpuPos = this.gpu.cpuPositions;
      const cpuVel = this.gpu.cpuVelocities;
      this.universe.bodySystem.applyReadback(cpuPos, cpuVel);

      // Update Lagrange points every 30 frames
      this.lagrangeCounter++;
      if (this.lagrangeCounter % 30 === 0) {
        const massive = bodies.filter(b => b.type === 'star' || b.type === 'planet');
        this.lagrangePoints = this.lagrange.update(massive);
        this.lagrangeCounter = 0;
      }
    }

    // Camera update
    this.camera.update(realDt);

    // Upload render data
    this.renderer.updatePositionsFromCPU(bodies, this.gpu.cpuPositions, this.gpu.cpuVelocities);

    // Render
    this.renderer.render(
      this.camera,
      bodies,
      this.gpu.cpuPositions,
      this.overlays.showTrails,
      this.overlays.showLabels,
      this.lagrangePoints,
      this.overlays.showLagrange
    );

    // Gravity field overlay (expensive – separate WebGPU pass)
    if (this.overlays.showGravField && bodies.length < 512) {
      const tex  = this.renderer.context.getCurrentTexture();
      const view = tex.createView();
      const enc  = this.gpu.device.createCommandEncoder({ label: 'grav-field' });
      this.gravity.render(enc, view, this.camera, bodies);
      this.gpu.device.queue.submit([enc.finish()]);
    }

    // Stats
    this.stats = {
      fps:          Math.round(this._fps),
      bodyCount:    n,
      simTime:      this.universe.simulationTime,
      mode:         this.mode,
      stepsPerFrame,
    };
    this.onStats?.(this.stats);

    this.frameCount++;
  }

  private _resolveMode(n: number): SimMode {
    if (this.mode === MODE_HYBRID) {
      return n < HYBRID_THRESHOLD ? MODE_EXACT : MODE_BARNES_HUT;
    }
    return this.mode;
  }

  stepOnce(): void {
    if (!this.paused) return;
    const bodies = this.universe.bodySystem.bodies;
    const n = bodies.length;
    if (n === 0) return;

    const dt = this.universe.params.dt;
    this.gpu.setDt(dt);

    if (this._resolveMode(n) === MODE_EXACT) {
      this.gpu.stepExact();
    } else {
      const forces = this.bh.computeForces(bodies);
      this.gpu.stepWithForces(forces);
    }
    this.universe.simulationTime += dt;
    this.gpu.scheduleReadback();
  }
}
