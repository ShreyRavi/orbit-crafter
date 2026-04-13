import { describe, it, expect, beforeEach } from 'vitest';
import { BarnesHutSystem } from '../src/BarnesHutSystem.js';
import { Body } from '../src/BodySystem.js';

function makeBody(id: string, x: number, y: number, mass: number): Body {
  return {
    id, name: id, type: 'asteroid',
    position: [x, y], velocity: [0, 0],
    mass, radius: 0.1, color: '#fff',
  };
}

/** Exact O(N²) force calculation for reference. */
function exactForce(
  bodies: Body[], index: number, G: number, eps2: number
): [number, number] {
  let fx = 0, fy = 0;
  const bi = bodies[index];
  for (let j = 0; j < bodies.length; j++) {
    if (j === index) continue;
    const bj = bodies[j];
    const dx = bj.position[0] - bi.position[0];
    const dy = bj.position[1] - bi.position[1];
    const r2 = dx * dx + dy * dy + eps2;
    const invR  = 1 / Math.sqrt(r2);
    const invR3 = invR * invR * invR;
    const f = G * bi.mass * bj.mass * invR3;
    fx += f * dx;
    fy += f * dy;
  }
  return [fx, fy];
}

describe('BarnesHutSystem – tree construction', () => {
  let bh: BarnesHutSystem;
  beforeEach(() => { bh = new BarnesHutSystem(); });

  it('returns empty forces for empty body list', () => {
    const f = bh.computeForces([]);
    expect(f.length).toBe(0);
  });

  it('returns zero force for single body', () => {
    const bodies = [makeBody('a', 0, 0, 10)];
    const f = bh.computeForces(bodies);
    expect(f[0]).toBeCloseTo(0);
    expect(f[1]).toBeCloseTo(0);
  });

  it('two bodies attract each other with equal and opposite forces', () => {
    const bodies = [
      makeBody('a', -50, 0, 1),
      makeBody('b',  50, 0, 1),
    ];
    const f = bh.computeForces(bodies);
    // Body a should be pulled right (+x), body b pulled left (-x)
    expect(f[0]).toBeGreaterThan(0);  // fx on a
    expect(f[2]).toBeLessThan(0);     // fx on b
    // Equal and opposite
    expect(f[0]).toBeCloseTo(-f[2], 5);
    expect(f[1]).toBeCloseTo(-f[3], 5);
  });

  it('force on mass-2 body is twice force on mass-1 body at same position', () => {
    const bh1 = new BarnesHutSystem();
    const bh2 = new BarnesHutSystem();

    const shared = makeBody('src', 0, 0, 100);

    const bodyLight: Body = { ...makeBody('t', 50, 0, 1), id: 't' };
    const bodyHeavy: Body = { ...makeBody('t2', 50, 0, 2), id: 't2' };

    const f1 = bh1.computeForces([shared, bodyLight]);
    const f2 = bh2.computeForces([shared, bodyHeavy]);

    // Force on target body scales with its mass
    expect(Math.abs(f2[2])).toBeCloseTo(Math.abs(f1[2]) * 2, 3);
  });
});

describe('BarnesHutSystem – force accuracy vs exact', () => {
  let bh: BarnesHutSystem;
  beforeEach(() => {
    bh = new BarnesHutSystem();
    bh.theta = 0.3;  // tighter approximation for test accuracy
  });

  it('matches exact forces within 5% for 20 random bodies', () => {
    const bodies: Body[] = [];
    const rng = mulberry32(42);  // deterministic
    for (let i = 0; i < 20; i++) {
      bodies.push(makeBody(`b${i}`, (rng() - 0.5) * 200, (rng() - 0.5) * 200, rng() * 5 + 0.1));
    }

    const bhForces = bh.computeForces(bodies);
    const eps2 = bh.epsilon2;
    const G    = bh.G_val;

    for (let i = 0; i < bodies.length; i++) {
      const [ex, ey] = exactForce(bodies, i, G, eps2);
      const [bx, by] = [bhForces[i * 2], bhForces[i * 2 + 1]];

      // Skip bodies with near-zero forces (relative error undefined)
      const mag = Math.hypot(ex, ey);
      if (mag < 1e-6) continue;

      const relErrX = Math.abs(bx - ex) / mag;
      const relErrY = Math.abs(by - ey) / mag;
      expect(relErrX).toBeLessThan(0.05);
      expect(relErrY).toBeLessThan(0.05);
    }
  });

  it('larger theta gives larger error but runs same code path', () => {
    bh.theta = 1.5;
    const bodies: Body[] = [];
    const rng = mulberry32(99);
    for (let i = 0; i < 10; i++) {
      bodies.push(makeBody(`b${i}`, (rng() - 0.5) * 100, (rng() - 0.5) * 100, rng() * 3 + 0.1));
    }
    // Should complete without throwing
    expect(() => bh.computeForces(bodies)).not.toThrow();
  });
});

describe('BarnesHutSystem – flat tree for GPU', () => {
  it('produces a non-empty flat array for 4 bodies', () => {
    const bh = new BarnesHutSystem();
    const bodies = [
      makeBody('a',  10,  10, 1),
      makeBody('b', -10,  10, 1),
      makeBody('c',  10, -10, 1),
      makeBody('d', -10, -10, 1),
    ];
    const flat = bh.buildFlatTree(bodies);
    expect(flat.length).toBeGreaterThan(0);
    // Each node is 8 floats = 32 bytes
    expect(flat.length % 8).toBe(0);
  });

  it('returns empty array for empty input', () => {
    const bh = new BarnesHutSystem();
    expect(bh.buildFlatTree([])).toHaveLength(0);
  });
});

// Deterministic PRNG (Mulberry32) for reproducible tests
function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
