import { G } from './utils/constants.js';
import { Vec2, vec2Add, vec2Sub, vec2Scale, vec2Len, vec2Normalize } from './utils/math.js';
import { Body } from './BodySystem.js';

export type LagrangeStability = 'stable' | 'semi-stable' | 'unstable';

export interface LagrangePoint {
  label: string;       // L1 – L5
  position: Vec2;
  stability: LagrangeStability;
  primaryId: string;
  secondaryId: string;
}

/** Newton's method root-finder for L1/L2/L3 along the x-axis (rotating frame). */
function solveLagrangeCollinear(mu: number, init: number, sign: number): number {
  let r = init;
  for (let iter = 0; iter < 60; iter++) {
    const r1 = r;
    const r2 = r - 1;
    const f  =  r
      - (1 - mu) / (r1 * r1 * Math.sign(r1))
      - mu / (r2 * r2 * Math.sign(r2));
    const df = 1
      + 2 * (1 - mu) / Math.pow(Math.abs(r1), 3)
      + 2 * mu        / Math.pow(Math.abs(r2), 3);
    const dr = f / df;
    r -= dr;
    if (Math.abs(dr) < 1e-12) break;
  }
  return r;
}

export class LagrangePointSystem {
  private points: LagrangePoint[] = [];

  /** Detect dominant body pairs and compute L1–L5 for each. */
  update(bodies: Body[]): LagrangePoint[] {
    this.points = [];

    // Find massive bodies (stars and planets only)
    const massive = bodies
      .filter(b => b.type === 'star' || b.type === 'planet')
      .sort((a, b) => b.mass - a.mass);

    if (massive.length < 2) return this.points;

    // Process top N pairs by combined mass (limit for performance)
    const MAX_PAIRS = 3;
    let count = 0;
    for (let i = 0; i < massive.length && count < MAX_PAIRS; i++) {
      for (let j = i + 1; j < massive.length && count < MAX_PAIRS; j++) {
        const primary   = massive[i];
        const secondary = massive[j];
        const pts = this._computePoints(primary, secondary);
        this.points.push(...pts);
        count++;
      }
    }
    return this.points;
  }

  private _computePoints(primary: Body, secondary: Body): LagrangePoint[] {
    const m1 = primary.mass;
    const m2 = secondary.mass;
    const M  = m1 + m2;
    const mu = m2 / M;

    const r12   = vec2Sub(secondary.position, primary.position);
    const dist  = vec2Len(r12);
    if (dist < 1e-10) return [];

    const dir = vec2Normalize(r12);
    const perp: Vec2 = [-dir[1], dir[0]];

    // L1: between primary and secondary
    const xL1 = solveLagrangeCollinear(mu, 1 - mu - 0.1, -1);
    // L2: beyond secondary
    const xL2 = solveLagrangeCollinear(mu, 1 - mu + 0.1,  1);
    // L3: beyond primary (opposite side)
    const xL3 = solveLagrangeCollinear(mu, -(1 + mu / 3), -1);

    const toWorld = (x: number, y: number): Vec2 => vec2Add(
      primary.position,
      vec2Add(vec2Scale(dir, x * dist), vec2Scale(perp, y * dist))
    );

    const pts: LagrangePoint[] = [
      {
        label: 'L1',
        position: toWorld(xL1, 0),
        stability: 'unstable',
        primaryId: primary.id,
        secondaryId: secondary.id,
      },
      {
        label: 'L2',
        position: toWorld(xL2, 0),
        stability: 'unstable',
        primaryId: primary.id,
        secondaryId: secondary.id,
      },
      {
        label: 'L3',
        position: toWorld(xL3, 0),
        stability: 'unstable',
        primaryId: primary.id,
        secondaryId: secondary.id,
      },
      {
        label: 'L4',
        position: toWorld(1 - mu, +Math.sqrt(3) / 2),
        stability: mu < 0.0385 ? 'stable' : 'semi-stable',
        primaryId: primary.id,
        secondaryId: secondary.id,
      },
      {
        label: 'L5',
        position: toWorld(1 - mu, -Math.sqrt(3) / 2),
        stability: mu < 0.0385 ? 'stable' : 'semi-stable',
        primaryId: primary.id,
        secondaryId: secondary.id,
      },
    ];
    return pts;
  }

  getPoints(): LagrangePoint[] { return this.points; }
}
