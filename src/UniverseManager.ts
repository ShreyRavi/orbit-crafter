import {
  G as G_CONST, EPSILON_SQ, DEFAULT_DT,
  STAR_MASS, PLANET_MASS, MOON_MASS, ASTEROID_MASS, ROCKET_MASS,
  ROCKET_INITIAL_FUEL, MODE_EXACT,
  BODY_TYPE_STAR,
} from './utils/constants.js';
import {
  Vec2, randAngle, randRange, circularOrbitVelocityAround, hexToRGB,
} from './utils/math.js';
import { Body, BodySystem, newBodyId } from './BodySystem.js';
import { GPUPhysicsEngine } from './GPUPhysicsEngine.js';
import { MultiUniverseSaveSystem, SimParameters, CameraState } from './persistence/MultiUniverseSaveSystem.js';

let _nameCounter = { star: 0, planet: 0, moon: 0, asteroid: 0, rocket: 0 };

function autoName(type: Body['type']): string {
  const names: Record<string, string[]> = {
    star:     ['Sol', 'Alpha', 'Proxima', 'Rigel', 'Vega'],
    planet:   ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'],
    moon:     ['Luna', 'Phobos', 'Deimos', 'Titan', 'Ganymede', 'Europa', 'Io'],
    asteroid: ['Ceres', 'Vesta', 'Pallas', 'Hygiea'],
    rocket:   ['Eagle', 'Falcon', 'Apollo', 'Artemis'],
  };
  const pool = names[type] ?? [];
  const n = _nameCounter[type as keyof typeof _nameCounter]++;
  return pool[n % pool.length] + (n >= pool.length ? ` ${Math.floor(n / pool.length) + 2}` : '');
}

export interface UniverseState {
  id: string;
  name: string;
  params: SimParameters;
}

export class UniverseManager {
  bodySystem: BodySystem;
  gpu: GPUPhysicsEngine;
  saveSystem: MultiUniverseSaveSystem;

  activeUniverseId: string;
  params: SimParameters;
  simulationTime = 0;

  private _rebuildPending = false;

  constructor(gpu: GPUPhysicsEngine) {
    this.gpu        = gpu;
    this.bodySystem = new BodySystem();
    this.saveSystem = new MultiUniverseSaveSystem();

    this.params = {
      G:       G_CONST,
      dt:      DEFAULT_DT,
      epsilon: Math.sqrt(EPSILON_SQ),
      mode:    MODE_EXACT,
    };

    // Create or load default universe
    const existing = this.saveSystem.listUniverses();
    if (existing.length > 0) {
      this.activeUniverseId = existing[0].id;
    } else {
      const u = this.saveSystem.createUniverse('Default Universe');
      this.activeUniverseId = u.id;
    }
  }

  /** Generate the default initial solar system. */
  generateInitialUniverse(): void {
    this.bodySystem.clear();
    _nameCounter = { star: 0, planet: 0, moon: 0, asteroid: 0, rocket: 0 };

    const G = this.params.G;

    // --- Star ---
    const star: Body = {
      id: newBodyId(), name: autoName('star'), type: 'star',
      position: [0, 0], velocity: [0, 0],
      mass: STAR_MASS, radius: 3.5, color: '#FDB813',
    };
    this.bodySystem.add(star);

    // --- Planet 1 (Earth-like) ---
    const p1Pos: Vec2 = [55, 0];
    const p1Vel = circularOrbitVelocityAround(p1Pos, star.position, star.mass, G, star.velocity);
    const planet1: Body = {
      id: newBodyId(), name: autoName('planet'), type: 'planet',
      position: p1Pos, velocity: p1Vel,
      mass: PLANET_MASS, radius: 0.9, color: '#4B9CD3',
    };
    this.bodySystem.add(planet1);

    // --- Moon (orbiting planet1) ---
    const mOff: Vec2 = [4.5, 0];
    const mPos: Vec2 = [planet1.position[0] + mOff[0], planet1.position[1] + mOff[1]];
    const mVel = circularOrbitVelocityAround(mPos, planet1.position, planet1.mass, G, planet1.velocity);
    const moon: Body = {
      id: newBodyId(), name: autoName('moon'), type: 'moon',
      position: mPos, velocity: mVel,
      mass: MOON_MASS, radius: 0.35, color: '#aaaaaa',
    };
    this.bodySystem.add(moon);

    // --- Planet 2 (Jupiter-like) ---
    const angle2 = Math.PI * 0.67;
    const r2 = 130;
    const p2Pos: Vec2 = [r2 * Math.cos(angle2), r2 * Math.sin(angle2)];
    const p2Vel = circularOrbitVelocityAround(p2Pos, star.position, star.mass, G, star.velocity);
    const planet2: Body = {
      id: newBodyId(), name: autoName('planet'), type: 'planet',
      position: p2Pos, velocity: p2Vel,
      mass: PLANET_MASS * 3, radius: 1.8, color: '#C88B3A',
    };
    this.bodySystem.add(planet2);

    // --- Asteroid belt ---
    const N_AST = 700;
    const BELT_INNER = 75, BELT_OUTER = 115;
    for (let i = 0; i < N_AST; i++) {
      const r   = randRange(BELT_INNER, BELT_OUTER);
      const ang = randAngle();
      const pos: Vec2 = [r * Math.cos(ang), r * Math.sin(ang)];
      const vel = circularOrbitVelocityAround(pos, star.position, star.mass, G, star.velocity);
      // Small random perturbation
      vel[0] += randRange(-0.05, 0.05);
      vel[1] += randRange(-0.05, 0.05);
      this.bodySystem.add({
        id: newBodyId(), name: `Ast${i}`, type: 'asteroid',
        position: pos, velocity: vel,
        mass: ASTEROID_MASS, radius: 0.18, color: '#888888',
      });
    }

    // --- Rocket ---
    const rocketPos: Vec2 = [planet1.position[0] + 2, planet1.position[1]];
    const rocketVel = circularOrbitVelocityAround(rocketPos, planet1.position, planet1.mass, G, planet1.velocity);
    const rocket: Body = {
      id: 'rocket_0',
      name: autoName('rocket'),
      type: 'rocket',
      position: rocketPos,
      velocity: rocketVel,
      mass: ROCKET_MASS,
      radius: 0.4,
      color: '#ff6b35',
      thrust: [0, 1],
      fuel: ROCKET_INITIAL_FUEL,
      thrustMagnitude: 0.008,
      thrustActive: false,
    };
    this.bodySystem.add(rocket);

    this.bodySystem.assignGPUIndices();
    this._rebuildPending = true;
    this.simulationTime = 0;
  }

  /** Add a new body and schedule GPU rebuild. */
  addBody(partial: Partial<Body> & Pick<Body, 'type' | 'position' | 'velocity' | 'mass'>): Body {
    const body: Body = {
      ...partial,
      id:       newBodyId(),
      name:     partial.name   ?? autoName(partial.type),
      position: [...partial.position] as Vec2,
      velocity: [...partial.velocity] as Vec2,
      radius:   partial.radius ?? this._defaultRadius(partial.type),
      color:    partial.color  ?? this._defaultColor(partial.type),
    };
    this.bodySystem.add(body);
    this.scheduleRebuild();
    return body;
  }

  removeBody(id: string): void {
    this.bodySystem.remove(id);
    this.scheduleRebuild();
  }

  updateBody(id: string, patch: Partial<Body>): void {
    this.bodySystem.update(id, patch);
    const b = this.bodySystem.get(id);
    if (!b || b.gpuIndex === undefined) { this.scheduleRebuild(); return; }
    // Update GPU buffers directly for position/velocity/mass
    if (patch.position || patch.velocity) {
      this.gpu.patchBody(b.gpuIndex, b.position, b.velocity);
    }
    if (patch.mass !== undefined) {
      this.gpu.patchMass(b.gpuIndex, b.mass);
    }
  }

  scheduleRebuild(): void { this._rebuildPending = true; }

  /** Rebuild GPU buffers if dirty. Returns true if rebuild happened. */
  syncGPU(): boolean {
    if (!this._rebuildPending) return false;
    this.bodySystem.assignGPUIndices();
    this.gpu.uploadBodies(this.bodySystem.bodies);
    this._rebuildPending = false;
    return true;
  }

  /** Load a universe snapshot and rebuild GPU. */
  loadSnapshot(universeId: string, snapId: string): boolean {
    const snap = this.saveSystem.loadSnapshot(universeId, snapId);
    if (!snap) return false;
    this.bodySystem.clear();
    for (const b of snap.bodies) this.bodySystem.add({ ...b });
    this.params = { ...snap.params };
    this.simulationTime = snap.simulationTime;
    this.scheduleRebuild();
    this.syncGPU();
    return true;
  }

  /** Save current state as a snapshot. */
  saveCurrentSnapshot(label?: string, camera?: CameraState): string {
    const cameraState = camera ?? { x: 0, y: 0, zoom: 0.006 };
    const snap = this.saveSystem.saveSnapshot(
      this.activeUniverseId,
      this.bodySystem.bodies,
      this.params,
      cameraState,
      this.simulationTime,
      label
    );
    return snap.id;
  }

  private _defaultRadius(type: Body['type']): number {
    switch (type) {
      case 'star':     return 3.5;
      case 'planet':   return 1.0;
      case 'moon':     return 0.35;
      case 'asteroid': return 0.18;
      case 'rocket':   return 0.4;
    }
  }

  private _defaultColor(type: Body['type']): string {
    switch (type) {
      case 'star':     return '#FDB813';
      case 'planet':   return '#4B9CD3';
      case 'moon':     return '#aaaaaa';
      case 'asteroid': return '#777777';
      case 'rocket':   return '#ff6b35';
    }
  }
}
