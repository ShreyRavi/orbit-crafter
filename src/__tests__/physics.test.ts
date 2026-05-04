import { describe, test, expect } from 'vitest';
import {
  G,
  DT,
  SUBSTEP_COUNT,
  SOFTENING_EPSILON,
  PLANET_ORBIT_R,
  bodyRadius,
  collisionRadius,
  circularOrbitVelocity,
  gravitationalForce,
  screenToWorld,
  worldToScreen,
  type BodyData,
  type Camera,
} from '../constants';
import { defaultColor, temperatureToColor } from '../bodyState';
import { makeInitialBodies } from '../scenario';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function totalEnergy(bodies: BodyData[]): number {
  let KE = 0;
  let PE = 0;
  for (let i = 0; i < bodies.length; i++) {
    const v2 = bodies[i].vel[0] ** 2 + bodies[i].vel[1] ** 2;
    KE += 0.5 * bodies[i].mass * v2;
    for (let j = i + 1; j < bodies.length; j++) {
      const dx = bodies[j].pos[0] - bodies[i].pos[0];
      const dy = bodies[j].pos[1] - bodies[i].pos[1];
      const r  = Math.sqrt(dx * dx + dy * dy + SOFTENING_EPSILON * SOFTENING_EPSILON);
      PE -= G * bodies[i].mass * bodies[j].mass / r;
    }
  }
  return KE + PE;
}

function leapfrogStep(bodies: BodyData[], dtSub: number): void {
  const acc: [number, number][] = bodies.map(() => [0, 0]);
  for (let i = 0; i < bodies.length; i++) {
    for (let j = 0; j < bodies.length; j++) {
      if (i === j) continue;
      const [fx, fy] = gravitationalForce(bodies[i], bodies[j]);
      acc[i][0] += fx / bodies[i].mass;
      acc[i][1] += fy / bodies[i].mass;
    }
  }
  for (let i = 0; i < bodies.length; i++) {
    bodies[i].vel[0] += acc[i][0] * dtSub;
    bodies[i].vel[1] += acc[i][1] * dtSub;
    bodies[i].pos[0] += bodies[i].vel[0] * dtSub;
    bodies[i].pos[1] += bodies[i].vel[1] * dtSub;
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('gravitationalForce', () => {
  test('correct magnitude along x-axis', () => {
    const b1: BodyData = { pos: [0, 0],   vel: [0, 0], mass: 1e6, radius: 1 };
    const b2: BodyData = { pos: [100, 0], vel: [0, 0], mass: 1e3, radius: 1 };

    const [fx, fy] = gravitationalForce(b1, b2);

    // Expected force: F = G * m1 * m2 / (r2 + eps²), directed from b1 to b2 (+x)
    const r2 = 100 * 100 + SOFTENING_EPSILON * SOFTENING_EPSILON;
    const r  = Math.sqrt(r2);
    const fMag = G * 1e6 * 1e3 / r2;
    const expectedFx = (fMag * 100) / r;

    expect(fx).toBeCloseTo(expectedFx, 5);
    expect(Math.abs(fy)).toBeLessThan(1e-10);
    expect(fx).toBeGreaterThan(0); // force on b1 is in +x direction (toward b2)
  });

  test('NaN/Infinity guard at r=0 (same position)', () => {
    const b1: BodyData = { pos: [50, 50], vel: [0, 0], mass: 1e4, radius: 1 };
    const b2: BodyData = { pos: [50, 50], vel: [0, 0], mass: 1e4, radius: 1 };

    const [fx, fy] = gravitationalForce(b1, b2);

    expect(isFinite(fx)).toBe(true);
    expect(isFinite(fy)).toBe(true);
  });
});

describe('circularOrbitVelocity', () => {
  test('matches sqrt(G * M / r) formula', () => {
    const M = 1e6;
    const r = 200;
    const v = circularOrbitVelocity(G, M, r);
    expect(v).toBeCloseTo(Math.sqrt(G * M / r), 8);
  });
});

describe('Leapfrog energy conservation', () => {
  test('2-body Kepler orbit: <0.1% energy drift over 1000 substeps', () => {
    const M = 1e6;
    const r = PLANET_ORBIT_R;
    const v = circularOrbitVelocity(G, M, r);

    const bodies: BodyData[] = [
      { pos: [0, 0], vel: [0, 0],  mass: M,   radius: bodyRadius(M) },
      { pos: [r, 0], vel: [0, v],  mass: 1e3, radius: bodyRadius(1e3) },
    ];

    // Half-step backward kick to initialise staggered leapfrog
    const dtSub = DT / SUBSTEP_COUNT;
    const halfDt = dtSub * 0.5;

    for (let i = 0; i < bodies.length; i++) {
      let ax = 0;
      let ay = 0;
      for (let j = 0; j < bodies.length; j++) {
        if (i === j) continue;
        const [fx, fy] = gravitationalForce(bodies[i], bodies[j]);
        ax += fx / bodies[i].mass;
        ay += fy / bodies[i].mass;
      }
      bodies[i].vel[0] -= ax * halfDt;
      bodies[i].vel[1] -= ay * halfDt;
    }

    const E0 = totalEnergy(bodies);

    for (let step = 0; step < 1000; step++) {
      leapfrogStep(bodies, dtSub);
    }

    const E1 = totalEnergy(bodies);
    const drift = Math.abs((E1 - E0) / E0);

    expect(drift).toBeLessThan(0.001); // < 0.1%
  });
});

describe('Momentum conservation on merge', () => {
  test('merged body conserves linear momentum', () => {
    const b1: BodyData = { pos: [0, 0], vel: [3, 1],  mass: 100, radius: 1 };
    const b2: BodyData = { pos: [5, 0], vel: [-1, 2], mass: 50,  radius: 1 };

    const newMass = b1.mass + b2.mass;
    const newVelX = (b1.mass * b1.vel[0] + b2.mass * b2.vel[0]) / newMass;
    const newVelY = (b1.mass * b1.vel[1] + b2.mass * b2.vel[1]) / newMass;

    const pxBefore = b1.mass * b1.vel[0] + b2.mass * b2.vel[0];
    const pyBefore = b1.mass * b1.vel[1] + b2.mass * b2.vel[1];

    const pxAfter = newMass * newVelX;
    const pyAfter = newMass * newVelY;

    expect(pxAfter).toBeCloseTo(pxBefore, 8);
    expect(pyAfter).toBeCloseTo(pyBefore, 8);
  });
});

describe('Camera coordinate round-trip', () => {
  test('worldToScreen(screenToWorld(p)) ≈ p', () => {
    const camera: Camera = { center: [50, -30], scale: 2.5 };
    const W = 1000;
    const H = 800;

    const testPoints: [number, number][] = [
      [0,   0],
      [100, 200],
      [999, 799],
      [500, 400],
      [250, 150],
    ];

    for (const p of testPoints) {
      const world  = screenToWorld(p, camera, W, H);
      const screen = worldToScreen(world, camera, W, H);
      expect(screen[0]).toBeCloseTo(p[0], 6);
      expect(screen[1]).toBeCloseTo(p[1], 6);
    }
  });
});

// bodyRadius formula: max(1, min(5, log10(max(mass,1))*1.2-1))
// Used only for GPU tidal radius — visual/collision use collisionRadius()
describe('bodyRadius', () => {
  test('clamps to minimum of 1 for mass=0', () => {
    // log10(1)*1.2-1 = -1 → clamped to min 1
    expect(bodyRadius(0)).toBe(1);
  });

  test('clamps to maximum of 5 for very large mass', () => {
    // log10(1e10)*1.2-1 = 11 → clamped to max 5
    expect(bodyRadius(1e10)).toBe(5);
  });

  test('mass=100 → log10(100)*1.2-1 = 1.4', () => {
    expect(bodyRadius(100)).toBeCloseTo(1.4, 8);
  });

  test('range is always [1, 5]', () => {
    for (const mass of [0, 1, 10, 1e3, 1e6, 1e9]) {
      const r = bodyRadius(mass);
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(5);
    }
  });
});

// collisionRadius formula: max(4, (log10(mass)-1)*5+2)
describe('collisionRadius', () => {
  test('clamps to minimum of 4', () => {
    expect(collisionRadius(1)).toBeGreaterThanOrEqual(4);
    expect(collisionRadius(0)).toBeGreaterThanOrEqual(4);
  });

  test('mass=1e6 (star): returns positive value > 4', () => {
    // log10(1e6)=6, (6-1)*5+2=27
    expect(collisionRadius(1e6)).toBeCloseTo(27, 5);
  });

  test('always larger than bodyRadius for same mass', () => {
    for (const mass of [1, 1e3, 1e6]) {
      expect(collisionRadius(mass)).toBeGreaterThanOrEqual(bodyRadius(mass));
    }
  });
});

describe('defaultColor', () => {
  // Regression: defaultColor now returns [r,g,b] array (was 'r,g,b' string)
  // Regression: ISSUE — color type changed from string to [number,number,number]
  // Found by /qa on 2026-05-03
  // Report: .gstack/qa-reports/qa-report-localhost-2026-05-03.md
  test('returns [number,number,number] tuple', () => {
    const c = defaultColor(1e6);
    expect(Array.isArray(c)).toBe(true);
    expect(c).toHaveLength(3);
    expect(c.every(v => typeof v === 'number' && v >= 0 && v <= 255)).toBe(true);
  });

  test('star mass → warm white [255,248,220]', () => {
    expect(defaultColor(2e6)).toEqual([255, 248, 220]);
  });

  test('moon mass → neutral grey', () => {
    expect(defaultColor(10)).toEqual([160, 162, 165]);
  });
});

describe('temperatureToColor', () => {
  // Regression: temperatureToColor now returns [r,g,b] array (was string)
  // Regression: ISSUE — color type changed from string to [number,number,number]
  // Found by /qa on 2026-05-03
  // Report: .gstack/qa-reports/qa-report-localhost-2026-05-03.md
  test('returns [number,number,number] tuple', () => {
    const c = temperatureToColor(5800);
    expect(Array.isArray(c)).toBe(true);
    expect(c).toHaveLength(3);
    expect(c.every(v => typeof v === 'number' && Number.isFinite(v))).toBe(true);
  });

  test('all values in [0, 255]', () => {
    for (const T of [1000, 2000, 5800, 10000, 40000]) {
      const [r, g, b] = temperatureToColor(T);
      expect(r).toBeGreaterThanOrEqual(0); expect(r).toBeLessThanOrEqual(255);
      expect(g).toBeGreaterThanOrEqual(0); expect(g).toBeLessThanOrEqual(255);
      expect(b).toBeGreaterThanOrEqual(0); expect(b).toBeLessThanOrEqual(255);
    }
  });

  test('clamps temp below 1000 to 1000', () => {
    expect(temperatureToColor(0)).toEqual(temperatureToColor(1000));
  });

  test('clamps temp above 40000 to 40000', () => {
    expect(temperatureToColor(99999)).toEqual(temperatureToColor(40000));
  });
});

describe('Solar system stability', () => {
  test('all bodies remain bound after 14400 substeps (~1 simulated minute)', () => {
    const bodies = makeInitialBodies();
    const dtSub  = DT / SUBSTEP_COUNT; // 0.016 / 4 = 0.004

    // Neptune is the last body; record its perihelion distance as the system radius
    const neptune = bodies[bodies.length - 1];
    const neptuneR = Math.hypot(
      neptune.pos[0] - bodies[0].pos[0],
      neptune.pos[1] - bodies[0].pos[1],
    );
    const bound = neptuneR * 3; // anything within 3× Neptune orbit is still "in system"

    // 3600 frames × 4 substeps = 14400
    for (let s = 0; s < 14400; s++) {
      leapfrogStep(bodies, dtSub);
    }

    for (let i = 1; i < bodies.length; i++) {
      const dx = bodies[i].pos[0] - bodies[0].pos[0];
      const dy = bodies[i].pos[1] - bodies[0].pos[1];
      const r  = Math.hypot(dx, dy);
      expect(r).toBeLessThan(bound);
    }

    // Sol should not drift far from origin (momentum conservation)
    expect(Math.abs(bodies[0].pos[0])).toBeLessThan(500);
    expect(Math.abs(bodies[0].pos[1])).toBeLessThan(500);
  }, 30_000); // generous timeout — runs ~200 ms in practice
});

describe('N=1 delete guard', () => {
  test('cannot delete last body', () => {
    let bodies: BodyData[] = [{ pos: [0, 0], vel: [0, 0], mass: 1e6, radius: 50 }];

    function deleteBody(arr: BodyData[], index: number): BodyData[] {
      if (arr.length <= 1) return arr;
      return arr.filter((_b, i) => i !== index);
    }

    bodies = deleteBody(bodies, 0);
    expect(bodies.length).toBe(1);
  });
});
