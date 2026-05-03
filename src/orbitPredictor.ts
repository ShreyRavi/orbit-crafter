import type { BodyData } from './constants';
import { G, DT, SOFTENING_EPSILON } from './constants';

/**
 * For each body, returns the index of its dominant gravitational attractor.
 * Returns -1 for the most massive body (it has no dominant attractor).
 */
export function findAttractors(bodies: BodyData[]): number[] {
  return bodies.map((body, idx) => {
    let maxForce = 0;
    let attractorIdx = -1;
    for (let j = 0; j < bodies.length; j++) {
      if (j === idx) continue;
      const dx = bodies[j].pos[0] - body.pos[0];
      const dy = bodies[j].pos[1] - body.pos[1];
      const r2 = dx * dx + dy * dy + SOFTENING_EPSILON * SOFTENING_EPSILON;
      const force = G * bodies[j].mass / r2;
      if (force > maxForce) {
        maxForce = force;
        attractorIdx = j;
      }
    }
    return attractorIdx;
  });
}

type Point2D = [number, number];

export function predictOrbit(idx: number, bodies: BodyData[]): Point2D[] {
  if (bodies.length < 2) return [];
  const body = bodies[idx];

  // Find dominant attractor
  let maxForce = 0;
  let secondForce = 0;
  let attractorIdx = -1;

  for (let j = 0; j < bodies.length; j++) {
    if (j === idx) continue;
    const bj = bodies[j];
    const dx = bj.pos[0] - body.pos[0];
    const dy = bj.pos[1] - body.pos[1];
    const r2 = dx * dx + dy * dy + SOFTENING_EPSILON * SOFTENING_EPSILON;
    const force = G * bj.mass / r2;
    if (force > maxForce) {
      secondForce = maxForce;
      maxForce = force;
      attractorIdx = j;
    } else if (force > secondForce) {
      secondForce = force;
    }
  }

  // Use Kepler if dominant attractor is 10× stronger or only one other body
  const useKepler = bodies.length === 2 || (secondForce > 0 && maxForce / secondForce > 4);

  if (useKepler && attractorIdx >= 0) {
    return keplerPath(body, bodies[attractorIdx]);
  }

  return numericalPath(idx, bodies);
}

function keplerPath(body: BodyData, attractor: BodyData): Point2D[] {
  // Relative position and velocity
  const rx = body.pos[0] - attractor.pos[0];
  const ry = body.pos[1] - attractor.pos[1];
  const vx = body.vel[0] - attractor.vel[0];
  const vy = body.vel[1] - attractor.vel[1];

  const r = Math.sqrt(rx * rx + ry * ry);
  if (r < 1e-10) return [];

  const v2 = vx * vx + vy * vy;
  const mu = G * (body.mass + attractor.mass);

  // Specific orbital energy
  const eps = v2 / 2 - mu / r;

  // Specific angular momentum (scalar, signed)
  const h = rx * vy - ry * vx;

  // Near-radial trajectory guard
  if (Math.abs(h) < 1e-8) return [];

  // Eccentricity
  const e = Math.sqrt(Math.max(0, 1 + (2 * eps * h * h) / (mu * mu)));

  // Eccentricity vector (periapsis direction)
  const rdotv = rx * vx + ry * vy;
  const evx = ((v2 - mu / r) * rx - rdotv * vx) / mu;
  const evy = ((v2 - mu / r) * ry - rdotv * vy) / mu;
  const eAngle = Math.atan2(evy, evx);

  const points: Point2D[] = [];

  if (eps < 0) {
    // Elliptic orbit
    const a = -mu / (2 * eps);
    const p = a * (1 - e * e);
    const count = 180;
    for (let k = 0; k < count; k++) {
      const theta = (k / count) * 2 * Math.PI;
      const denom = 1 + e * Math.cos(theta);
      if (Math.abs(denom) < 1e-10) continue;
      const rk = p / denom;
      const angle = theta + eAngle;
      const wx = attractor.pos[0] + rk * Math.cos(angle);
      const wy = attractor.pos[1] + rk * Math.sin(angle);
      points.push([wx, wy]);
    }
  } else {
    // Hyperbolic trajectory
    if (e <= 1) return [];
    const a = mu / (2 * Math.abs(eps));
    const p = a * (e * e - 1);
    const thetaMax = Math.acos(-1 / e) - 0.02;
    const count = 120;
    for (let k = 0; k < count; k++) {
      const theta = -thetaMax + (k / (count - 1)) * 2 * thetaMax;
      const denom = 1 + e * Math.cos(theta);
      if (denom < 1e-10) continue;
      const rk = p / denom;
      const angle = theta + eAngle;
      const wx = attractor.pos[0] + rk * Math.cos(angle);
      const wy = attractor.pos[1] + rk * Math.sin(angle);
      points.push([wx, wy]);
    }
  }

  return points;
}

function accel(
  i: number, n: number,
  px: Float64Array, py: Float64Array,
  masses: Float64Array,
): [number, number] {
  let ax = 0, ay = 0;
  for (let j = 0; j < n; j++) {
    if (j === i) continue;
    const dx = px[j] - px[i];
    const dy = py[j] - py[i];
    const r2 = dx * dx + dy * dy + SOFTENING_EPSILON * SOFTENING_EPSILON;
    const aMag = G * masses[j] / r2;
    const r = Math.sqrt(r2);
    ax += (aMag * dx) / r;
    ay += (aMag * dy) / r;
  }
  return [ax, ay];
}

function numericalPath(idx: number, bodies: BodyData[]): Point2D[] {
  const n = bodies.length;
  const px  = new Float64Array(n);
  const py  = new Float64Array(n);
  const vx  = new Float64Array(n);
  const vy  = new Float64Array(n);
  const mas = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    px[i]  = bodies[i].pos[0];
    py[i]  = bodies[i].pos[1];
    vx[i]  = bodies[i].vel[0];
    vy[i]  = bodies[i].vel[1];
    mas[i] = bodies[i].mass;
  }

  const dt = DT * 4;
  const totalSteps = 300;
  const recordEvery = 5;
  const points: Point2D[] = [];

  // RK4 staging arrays
  const k1px = new Float64Array(n); const k1py = new Float64Array(n);
  const k1vx = new Float64Array(n); const k1vy = new Float64Array(n);
  const k2px = new Float64Array(n); const k2py = new Float64Array(n);
  const k2vx = new Float64Array(n); const k2vy = new Float64Array(n);
  const k3px = new Float64Array(n); const k3py = new Float64Array(n);
  const k3vx = new Float64Array(n); const k3vy = new Float64Array(n);
  const k4px = new Float64Array(n); const k4py = new Float64Array(n);
  const k4vx = new Float64Array(n); const k4vy = new Float64Array(n);
  const tmpPx = new Float64Array(n); const tmpPy = new Float64Array(n);

  for (let step = 0; step < totalSteps; step++) {
    // k1
    for (let i = 0; i < n; i++) {
      k1px[i] = vx[i]; k1py[i] = vy[i];
      const [ax, ay] = accel(i, n, px, py, mas);
      k1vx[i] = ax; k1vy[i] = ay;
    }
    // k2
    for (let i = 0; i < n; i++) { tmpPx[i] = px[i] + k1px[i] * dt * 0.5; tmpPy[i] = py[i] + k1py[i] * dt * 0.5; }
    for (let i = 0; i < n; i++) {
      k2px[i] = vx[i] + k1vx[i] * dt * 0.5; k2py[i] = vy[i] + k1vy[i] * dt * 0.5;
      const [ax, ay] = accel(i, n, tmpPx, tmpPy, mas);
      k2vx[i] = ax; k2vy[i] = ay;
    }
    // k3
    for (let i = 0; i < n; i++) { tmpPx[i] = px[i] + k2px[i] * dt * 0.5; tmpPy[i] = py[i] + k2py[i] * dt * 0.5; }
    for (let i = 0; i < n; i++) {
      k3px[i] = vx[i] + k2vx[i] * dt * 0.5; k3py[i] = vy[i] + k2vy[i] * dt * 0.5;
      const [ax, ay] = accel(i, n, tmpPx, tmpPy, mas);
      k3vx[i] = ax; k3vy[i] = ay;
    }
    // k4
    for (let i = 0; i < n; i++) { tmpPx[i] = px[i] + k3px[i] * dt; tmpPy[i] = py[i] + k3py[i] * dt; }
    for (let i = 0; i < n; i++) {
      k4px[i] = vx[i] + k3vx[i] * dt; k4py[i] = vy[i] + k3vy[i] * dt;
      const [ax, ay] = accel(i, n, tmpPx, tmpPy, mas);
      k4vx[i] = ax; k4vy[i] = ay;
    }
    // Combine
    const sixth = dt / 6;
    for (let i = 0; i < n; i++) {
      px[i] += (k1px[i] + 2 * k2px[i] + 2 * k3px[i] + k4px[i]) * sixth;
      py[i] += (k1py[i] + 2 * k2py[i] + 2 * k3py[i] + k4py[i]) * sixth;
      vx[i] += (k1vx[i] + 2 * k2vx[i] + 2 * k3vx[i] + k4vx[i]) * sixth;
      vy[i] += (k1vy[i] + 2 * k2vy[i] + 2 * k3vy[i] + k4vy[i]) * sixth;
    }

    if (step % recordEvery === 0) {
      points.push([px[idx], py[idx]]);
    }
  }

  return points;
}
