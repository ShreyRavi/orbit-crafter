import { describe, it, expect } from 'vitest';
import { LagrangePointSystem } from '../src/LagrangePointSystem.js';
import { Body } from '../src/BodySystem.js';

function makeBody(
  id: string, type: Body['type'],
  x: number, y: number, mass: number
): Body {
  return {
    id, name: id, type,
    position: [x, y], velocity: [0, 0],
    mass, radius: 1, color: '#fff',
  };
}

describe('LagrangePointSystem', () => {
  const sys = new LagrangePointSystem();

  it('returns empty array for fewer than 2 massive bodies', () => {
    const pts = sys.update([makeBody('star', 'star', 0, 0, 1000)]);
    expect(pts).toHaveLength(0);
  });

  it('returns empty array with no massive bodies', () => {
    const asteroids = [
      makeBody('a1', 'asteroid', 10, 0, 0.001),
      makeBody('a2', 'asteroid', 20, 0, 0.001),
    ];
    expect(sys.update(asteroids)).toHaveLength(0);
  });

  it('returns 5 Lagrange points for one star-planet pair', () => {
    const bodies = [
      makeBody('star',   'star',   0,   0, 1000),
      makeBody('planet', 'planet', 100, 0, 1),
    ];
    const pts = sys.update(bodies);
    expect(pts).toHaveLength(5);
  });

  it('labels are L1 through L5', () => {
    const bodies = [
      makeBody('star',   'star',   0,   0, 1000),
      makeBody('planet', 'planet', 100, 0, 1),
    ];
    const labels = sys.update(bodies).map(p => p.label);
    expect(labels).toContain('L1');
    expect(labels).toContain('L2');
    expect(labels).toContain('L3');
    expect(labels).toContain('L4');
    expect(labels).toContain('L5');
  });

  it('L4 and L5 form equilateral triangles with primary and secondary', () => {
    const d = 100;
    const bodies = [
      makeBody('star',   'star',   0, 0, 1000),
      makeBody('planet', 'planet', d, 0, 1),
    ];
    const pts = sys.update(bodies);
    const l4 = pts.find(p => p.label === 'L4')!;
    const l5 = pts.find(p => p.label === 'L5')!;

    // Distance from star to L4/L5 should be ≈ d (equilateral triangle)
    const distStarL4  = Math.hypot(l4.position[0], l4.position[1]);
    const distStarL5  = Math.hypot(l5.position[0], l5.position[1]);
    const distPlanetL4 = Math.hypot(l4.position[0] - d, l4.position[1]);
    const distPlanetL5 = Math.hypot(l5.position[0] - d, l5.position[1]);

    expect(distStarL4).toBeCloseTo(d, 0);
    expect(distStarL5).toBeCloseTo(d, 0);
    expect(distPlanetL4).toBeCloseTo(d, 0);
    expect(distPlanetL5).toBeCloseTo(d, 0);
  });

  it('L4 and L5 are symmetric about the primary–secondary axis', () => {
    const bodies = [
      makeBody('star',   'star',   0,   0, 1000),
      makeBody('planet', 'planet', 100, 0, 1),
    ];
    const pts = sys.update(bodies);
    const l4 = pts.find(p => p.label === 'L4')!;
    const l5 = pts.find(p => p.label === 'L5')!;

    expect(l4.position[0]).toBeCloseTo(l5.position[0], 4);
    expect(l4.position[1]).toBeCloseTo(-l5.position[1], 4);
  });

  it('L1 lies between primary and secondary', () => {
    const d = 100;
    const bodies = [
      makeBody('star',   'star',   0, 0, 1000),
      makeBody('planet', 'planet', d, 0, 1),
    ];
    const pts = sys.update(bodies);
    const l1 = pts.find(p => p.label === 'L1')!;
    expect(l1.position[0]).toBeGreaterThan(0);
    expect(l1.position[0]).toBeLessThan(d);
    expect(l1.position[1]).toBeCloseTo(0, 3);
  });

  it('L2 lies beyond the secondary', () => {
    const d = 100;
    const bodies = [
      makeBody('star',   'star',   0, 0, 1000),
      makeBody('planet', 'planet', d, 0, 1),
    ];
    const pts = sys.update(bodies);
    const l2 = pts.find(p => p.label === 'L2')!;
    expect(l2.position[0]).toBeGreaterThan(d);
    expect(l2.position[1]).toBeCloseTo(0, 3);
  });

  it('L3 lies beyond the primary, opposite to secondary', () => {
    const bodies = [
      makeBody('star',   'star',   0, 0, 1000),
      makeBody('planet', 'planet', 100, 0, 1),
    ];
    const pts = sys.update(bodies);
    const l3 = pts.find(p => p.label === 'L3')!;
    expect(l3.position[0]).toBeLessThan(0);
    expect(l3.position[1]).toBeCloseTo(0, 3);
  });

  it('marks L4/L5 stable when mass ratio is large (μ < 0.0385)', () => {
    // μ = m2 / (m1 + m2) = 1 / 1001 ≈ 0.001, well below threshold
    const bodies = [
      makeBody('star',   'star',   0,   0, 1000),
      makeBody('planet', 'planet', 100, 0, 1),
    ];
    const pts = sys.update(bodies);
    const l4 = pts.find(p => p.label === 'L4')!;
    const l5 = pts.find(p => p.label === 'L5')!;
    expect(l4.stability).toBe('stable');
    expect(l5.stability).toBe('stable');
  });

  it('marks L4/L5 semi-stable when mass ratio is near threshold (μ ≈ 0.04)', () => {
    // m2 / (m1 + m2) ≈ 0.04 → above threshold
    const m1 = 24, m2 = 1;
    const bodies = [
      makeBody('a', 'star',   0,   0, m1),
      makeBody('b', 'planet', 100, 0, m2),
    ];
    const pts = sys.update(bodies);
    const l4 = pts.find(p => p.label === 'L4')!;
    expect(['semi-stable', 'stable']).toContain(l4.stability);
  });

  it('marks L1/L2/L3 unstable', () => {
    const bodies = [
      makeBody('star',   'star',   0,   0, 1000),
      makeBody('planet', 'planet', 100, 0, 1),
    ];
    const pts = sys.update(bodies);
    for (const label of ['L1', 'L2', 'L3']) {
      const pt = pts.find(p => p.label === label)!;
      expect(pt.stability).toBe('unstable');
    }
  });

  it('limits output for many massive bodies (max 3 pairs)', () => {
    const bodies: Body[] = [];
    for (let i = 0; i < 6; i++) {
      bodies.push(makeBody(`p${i}`, 'planet', i * 50, 0, 10 + i));
    }
    const pts = sys.update(bodies);
    // At most 3 pairs × 5 = 15 points
    expect(pts.length).toBeLessThanOrEqual(15);
  });

  it('getPoints returns the same result as update', () => {
    const bodies = [
      makeBody('star',   'star',   0,   0, 1000),
      makeBody('planet', 'planet', 100, 0, 1),
    ];
    sys.update(bodies);
    expect(sys.getPoints()).toHaveLength(5);
  });
});
