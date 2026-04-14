import { BODY_TYPE_STAR, BODY_TYPE_PLANET, BODY_TYPE_MOON, BODY_TYPE_ASTEROID, BODY_TYPE_ROCKET, BODY_TYPE_BLACK_HOLE } from './utils/constants.js';
import { Vec2 } from './utils/math.js';

export type BodyType = 'star' | 'planet' | 'moon' | 'asteroid' | 'rocket' | 'black_hole';

export interface Body {
  id: string;
  name: string;
  type: BodyType;
  position: Vec2;
  velocity: Vec2;
  mass: number;
  radius: number;
  color: string;
  // Rocket-specific
  thrust?: Vec2;
  fuel?: number;
  thrustMagnitude?: number;
  thrustActive?: boolean;
  // Runtime GPU index (assigned when uploading to GPU)
  gpuIndex?: number;
  // Whether this body is pinned (infinite mass effectively)
  pinned?: boolean;
}

let _idCounter = 0;
export function newBodyId(): string {
  return `body_${++_idCounter}`;
}

export function bodyTypeToU32(t: BodyType): number {
  switch (t) {
    case 'star':       return BODY_TYPE_STAR;
    case 'planet':     return BODY_TYPE_PLANET;
    case 'moon':       return BODY_TYPE_MOON;
    case 'asteroid':   return BODY_TYPE_ASTEROID;
    case 'rocket':     return BODY_TYPE_ROCKET;
    case 'black_hole': return BODY_TYPE_BLACK_HOLE;
  }
}

export function u32ToBodyType(n: number): BodyType {
  switch (n) {
    case BODY_TYPE_STAR:       return 'star';
    case BODY_TYPE_PLANET:     return 'planet';
    case BODY_TYPE_MOON:       return 'moon';
    case BODY_TYPE_ASTEROID:   return 'asteroid';
    case BODY_TYPE_BLACK_HOLE: return 'black_hole';
    default:                   return 'rocket';
  }
}

/** Build the 48-byte per-body render buffer entry. */
export function packBodyRenderEntry(body: Body, out: Float32Array, offset: number): void {
  const [r, g, b] = hexToRGBf(body.color);
  out[offset +  0] = body.position[0];
  out[offset +  1] = body.position[1];
  out[offset +  2] = body.velocity[0];
  out[offset +  3] = body.velocity[1];
  out[offset +  4] = r;
  out[offset +  5] = g;
  out[offset +  6] = b;
  out[offset +  7] = 1.0;         // alpha
  out[offset +  8] = body.radius;
  // bodyType u32 written via Uint32 view
  // out[offset + 9] written below
  out[offset + 10] = 0;
  out[offset + 11] = 0;
}

function hexToRGBf(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  return [
    parseInt(c.substring(0, 2), 16) / 255,
    parseInt(c.substring(2, 4), 16) / 255,
    parseInt(c.substring(4, 6), 16) / 255,
  ];
}

export class BodySystem {
  bodies: Body[] = [];
  private _dirty = true;

  add(body: Body): void {
    if (!body.id) body.id = newBodyId();
    this.bodies.push(body);
    this._dirty = true;
  }

  remove(id: string): boolean {
    const idx = this.bodies.findIndex(b => b.id === id);
    if (idx === -1) return false;
    this.bodies.splice(idx, 1);
    this._dirty = true;
    return true;
  }

  get(id: string): Body | undefined {
    return this.bodies.find(b => b.id === id);
  }

  update(id: string, patch: Partial<Body>): void {
    const b = this.get(id);
    if (!b) return;
    Object.assign(b, patch);
    this._dirty = true;
  }

  get count(): number { return this.bodies.length; }

  isDirty(): boolean { return this._dirty; }
  clearDirty(): void { this._dirty = false; }
  markDirty(): void  { this._dirty = true; }

  /** Assign sequential GPU indices. */
  assignGPUIndices(): void {
    this.bodies.forEach((b, i) => { b.gpuIndex = i; });
  }

  /** Update CPU positions/velocities from a readback Float32Array (x,y interleaved). */
  applyReadback(posData: Float32Array, velData: Float32Array): void {
    for (let i = 0; i < this.bodies.length; i++) {
      this.bodies[i].position = [posData[i * 2], posData[i * 2 + 1]];
      this.bodies[i].velocity = [velData[i * 2], velData[i * 2 + 1]];
    }
  }

  /** Shallow-clone all bodies (for save/fork). */
  snapshot(): Body[] {
    return this.bodies.map(b => ({ ...b, position: [...b.position] as Vec2, velocity: [...b.velocity] as Vec2 }));
  }

  clear(): void {
    this.bodies = [];
    this._dirty = true;
  }
}
