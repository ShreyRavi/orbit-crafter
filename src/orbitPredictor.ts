import type { BodyData } from './constants';
import { G, DT, SOFTENING_EPSILON } from './constants';

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
  const useKepler = bodies.length === 2 || (secondForce > 0 && maxForce / secondForce > 10);

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

function numericalPath(idx: number, bodies: BodyData[]): Point2D[] {
  const n = bodies.length;
  const posX = new Float64Array(n);
  const posY = new Float64Array(n);
  const velX = new Float64Array(n);
  const velY = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    posX[i] = bodies[i].pos[0];
    posY[i] = bodies[i].pos[1];
    velX[i] = bodies[i].vel[0];
    velY[i] = bodies[i].vel[1];
  }

  const dt = DT * 4;
  const totalSteps = 300;
  const recordEvery = 5;
  const points: Point2D[] = [];

  for (let step = 0; step < totalSteps; step++) {
    // Euler integration for all bodies
    for (let i = 0; i < n; i++) {
      let ax = 0;
      let ay = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const dx = posX[j] - posX[i];
        const dy = posY[j] - posY[i];
        const r2 = dx * dx + dy * dy + SOFTENING_EPSILON * SOFTENING_EPSILON;
        const aMag = G * bodies[j].mass / r2;
        const r = Math.sqrt(r2);
        ax += (aMag * dx) / r;
        ay += (aMag * dy) / r;
      }
      velX[i] += ax * dt;
      velY[i] += ay * dt;
    }
    for (let i = 0; i < n; i++) {
      posX[i] += velX[i] * dt;
      posY[i] += velY[i] * dt;
    }

    if (step % recordEvery === 0) {
      points.push([posX[idx], posY[idx]]);
    }
  }

  return points;
}
