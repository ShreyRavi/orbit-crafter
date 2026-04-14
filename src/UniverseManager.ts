import {
  G as G_CONST, EPSILON_SQ, DEFAULT_DT,
  STAR_MASS, PLANET_MASS, MOON_MASS, ASTEROID_MASS, ROCKET_MASS,
  ROCKET_INITIAL_FUEL, MODE_EXACT,
  BODY_TYPE_STAR, BLACK_HOLE_MASS,
} from './utils/constants.js';
import {
  Vec2, randAngle, randRange, circularOrbitVelocityAround, hexToRGB,
} from './utils/math.js';
import { Body, BodySystem, newBodyId } from './BodySystem.js';
import { GPUPhysicsEngine } from './GPUPhysicsEngine.js';
import { MultiUniverseSaveSystem, SimParameters, CameraState } from './persistence/MultiUniverseSaveSystem.js';

let _nameCounter = { star: 0, planet: 0, moon: 0, asteroid: 0, rocket: 0, black_hole: 0 };

function autoName(type: Body['type']): string {
  const names: Record<string, string[]> = {
    star:       ['Sol', 'Alpha', 'Proxima', 'Rigel', 'Vega'],
    planet:     ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'],
    moon:       ['Luna', 'Phobos', 'Deimos', 'Titan', 'Ganymede', 'Europa', 'Io'],
    asteroid:   ['Ceres', 'Vesta', 'Pallas', 'Hygiea'],
    rocket:     ['Eagle', 'Falcon', 'Apollo', 'Artemis'],
    black_hole: ['Sagittarius A*', 'M87*', 'Cygnus X-1', 'NGC 1277'],
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
    _nameCounter = { star: 0, planet: 0, moon: 0, asteroid: 0, rocket: 0, black_hole: 0 };

    const G = this.params.G;

    // --- Star ---
    const star: Body = {
      id: newBodyId(), name: autoName('star'), type: 'star',
      position: [0, 0], velocity: [0, 0],
      mass: STAR_MASS, radius: 3.5, color: '#FDB813',
    };
    this.bodySystem.add(star);

    // --- Planet 1 (Earth-like, r=55) ---
    const p1Pos: Vec2 = [55, 0];
    const p1Vel = circularOrbitVelocityAround(p1Pos, star.position, star.mass, G, star.velocity);
    const planet1: Body = {
      id: newBodyId(), name: autoName('planet'), type: 'planet',
      position: p1Pos, velocity: p1Vel,
      mass: PLANET_MASS, radius: 0.9, color: '#4B9CD3',
    };
    this.bodySystem.add(planet1);

    // --- Moon (orbiting planet1) ---
    const mPos: Vec2 = [planet1.position[0] + 4.5, planet1.position[1]];
    const mVel = circularOrbitVelocityAround(mPos, planet1.position, planet1.mass, G, planet1.velocity);
    this.bodySystem.add({
      id: newBodyId(), name: autoName('moon'), type: 'moon',
      position: mPos, velocity: mVel,
      mass: MOON_MASS, radius: 0.35, color: '#aaaaaa',
    });

    // --- Planet 2 (r=95, opposite side) ---
    const p2Pos: Vec2 = [-95, 0];
    const p2Vel = circularOrbitVelocityAround(p2Pos, star.position, star.mass, G, star.velocity);
    const planet2: Body = {
      id: newBodyId(), name: autoName('planet'), type: 'planet',
      position: p2Pos, velocity: p2Vel,
      mass: PLANET_MASS * 2, radius: 1.4, color: '#C88B3A',
    };
    this.bodySystem.add(planet2);

    // --- Moon of planet2 ---
    const m2Pos: Vec2 = [planet2.position[0], planet2.position[1] + 5.5];
    const m2Vel = circularOrbitVelocityAround(m2Pos, planet2.position, planet2.mass, G, planet2.velocity);
    this.bodySystem.add({
      id: newBodyId(), name: autoName('moon'), type: 'moon',
      position: m2Pos, velocity: m2Vel,
      mass: MOON_MASS, radius: 0.28, color: '#bbaa88',
    });

    // --- Planet 3 (Jupiter-like, r=155) ---
    const p3Pos: Vec2 = [0, 155];
    const p3Vel = circularOrbitVelocityAround(p3Pos, star.position, star.mass, G, star.velocity);
    const planet3: Body = {
      id: newBodyId(), name: autoName('planet'), type: 'planet',
      position: p3Pos, velocity: p3Vel,
      mass: PLANET_MASS * 5, radius: 2.2, color: '#8B6914',
    };
    this.bodySystem.add(planet3);

    // --- 3 representative asteroids ---
    const BELT_R = [85, 95, 105];
    const BELT_ANG = [1.1, 2.5, 4.7];
    for (let i = 0; i < 3; i++) {
      const pos: Vec2 = [BELT_R[i] * Math.cos(BELT_ANG[i]), BELT_R[i] * Math.sin(BELT_ANG[i])];
      const vel = circularOrbitVelocityAround(pos, star.position, star.mass, G, star.velocity);
      vel[0] += randRange(-0.04, 0.04);
      vel[1] += randRange(-0.04, 0.04);
      this.bodySystem.add({
        id: newBodyId(), name: `Ast-${i + 1}`, type: 'asteroid',
        position: pos, velocity: vel,
        mass: ASTEROID_MASS * 5, radius: 0.3, color: '#998877',
      });
    }

    // --- Rocket (low orbit around planet1) ---
    const rocketPos: Vec2 = [planet1.position[0] + 2, planet1.position[1]];
    const rocketVel = circularOrbitVelocityAround(rocketPos, planet1.position, planet1.mass, G, planet1.velocity);
    this.bodySystem.add({
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
    });

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
      case 'star':       return 3.5;
      case 'planet':     return 1.0;
      case 'moon':       return 0.35;
      case 'asteroid':   return 0.25;
      case 'rocket':     return 0.4;
      case 'black_hole': return 2.5;
    }
  }

  private _defaultColor(type: Body['type']): string {
    switch (type) {
      case 'star':       return '#FDB813';
      case 'planet':     return '#4B9CD3';
      case 'moon':       return '#aaaaaa';
      case 'asteroid':   return '#998877';
      case 'rocket':     return '#ff6b35';
      case 'black_hole': return '#6622cc';
    }
  }

  defaultMass(type: Body['type']): number {
    switch (type) {
      case 'star':       return 1000;
      case 'planet':     return 1;
      case 'moon':       return 0.01;
      case 'asteroid':   return 0.001;
      case 'rocket':     return 0.05;
      case 'black_hole': return BLACK_HOLE_MASS;
    }
  }
}
