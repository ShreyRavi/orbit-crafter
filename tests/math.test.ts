import { describe, it, expect } from 'vitest';
import {
  vec2Add, vec2Sub, vec2Scale, vec2Dot, vec2Len, vec2LenSq,
  vec2Normalize, vec2Perp, vec2Dist, vec2Lerp,
  circularOrbitVelocity, circularOrbitVelocityAround,
  hexToRGB, clamp, randRange, lerp, smoothstep,
} from '../src/utils/math.js';
import type { Vec2 } from '../src/utils/math.js';

describe('vec2Add', () => {
  it('adds two vectors', () => {
    expect(vec2Add([1, 2], [3, 4])).toEqual([4, 6]);
  });
  it('adds zero vector', () => {
    expect(vec2Add([5, -3], [0, 0])).toEqual([5, -3]);
  });
});

describe('vec2Sub', () => {
  it('subtracts two vectors', () => {
    expect(vec2Sub([5, 7], [2, 3])).toEqual([3, 4]);
  });
});

describe('vec2Scale', () => {
  it('scales by positive scalar', () => {
    expect(vec2Scale([2, 3], 4)).toEqual([8, 12]);
  });
  it('scales by zero', () => {
    expect(vec2Scale([2, 3], 0)).toEqual([0, 0]);
  });
  it('scales by negative scalar', () => {
    expect(vec2Scale([2, -3], -1)).toEqual([-2, 3]);
  });
});

describe('vec2Dot', () => {
  it('computes dot product', () => {
    expect(vec2Dot([1, 0], [0, 1])).toBe(0);        // perpendicular
    expect(vec2Dot([1, 0], [1, 0])).toBe(1);         // parallel
    expect(vec2Dot([2, 3], [4, 5])).toBe(23);
  });
});

describe('vec2Len / vec2LenSq', () => {
  it('computes length of unit vectors', () => {
    expect(vec2Len([1, 0])).toBeCloseTo(1);
    expect(vec2Len([0, 1])).toBeCloseTo(1);
  });
  it('computes 3-4-5 triangle', () => {
    expect(vec2Len([3, 4])).toBeCloseTo(5);
    expect(vec2LenSq([3, 4])).toBeCloseTo(25);
  });
  it('length of zero vector is zero', () => {
    expect(vec2Len([0, 0])).toBe(0);
  });
});

describe('vec2Normalize', () => {
  it('returns unit vector', () => {
    const n = vec2Normalize([3, 4]);
    expect(vec2Len(n)).toBeCloseTo(1);
    expect(n[0]).toBeCloseTo(0.6);
    expect(n[1]).toBeCloseTo(0.8);
  });
  it('handles zero vector without NaN', () => {
    const n = vec2Normalize([0, 0]);
    expect(n[0]).toBe(0);
    expect(n[1]).toBe(0);
  });
});

describe('vec2Perp', () => {
  it('returns a perpendicular vector', () => {
    const v: Vec2 = [3, 4];
    const p = vec2Perp(v);
    expect(vec2Dot(v, p)).toBeCloseTo(0);
  });
  it('rotates (1,0) to (0,1) direction', () => {
    const p = vec2Perp([1, 0]);
    expect(p[0]).toBeCloseTo(0);
    expect(p[1]).toBeCloseTo(1);
  });
});

describe('vec2Dist', () => {
  it('computes distance between two points', () => {
    expect(vec2Dist([0, 0], [3, 4])).toBeCloseTo(5);
    expect(vec2Dist([1, 1], [1, 1])).toBe(0);
  });
});

describe('vec2Lerp', () => {
  it('returns start at t=0', () => {
    expect(vec2Lerp([0, 0], [10, 10], 0)).toEqual([0, 0]);
  });
  it('returns end at t=1', () => {
    expect(vec2Lerp([0, 0], [10, 10], 1)).toEqual([10, 10]);
  });
  it('returns midpoint at t=0.5', () => {
    expect(vec2Lerp([0, 0], [10, 20], 0.5)).toEqual([5, 10]);
  });
});

describe('circularOrbitVelocity', () => {
  const G = 1;

  it('gives correct speed at radius r', () => {
    const M = 1000, r = 100;
    const vel = circularOrbitVelocity([r, 0], M, G);
    const speed = vec2Len(vel);
    expect(speed).toBeCloseTo(Math.sqrt(G * M / r), 5);
  });

  it('velocity is perpendicular to radius vector', () => {
    const vel = circularOrbitVelocity([50, 0], 1000, G);
    // radius is [50,0], velocity should be along [0,1]
    expect(vec2Dot([50, 0], vel)).toBeCloseTo(0, 5);
  });

  it('velocity direction is counter-clockwise', () => {
    // body at (r, 0) should orbit upward (positive y velocity)
    const vel = circularOrbitVelocity([50, 0], 1000, G);
    expect(vel[1]).toBeGreaterThan(0);
  });

  it('returns zero for zero radius', () => {
    const vel = circularOrbitVelocity([0, 0], 1000, G);
    expect(vec2Len(vel)).toBe(0);
  });
});

describe('circularOrbitVelocityAround', () => {
  it('adds central body velocity', () => {
    const G = 1;
    const centralPos: Vec2 = [10, 0];
    const centralVel: Vec2 = [0, 5];  // central body is moving
    const bodyPos: Vec2 = [60, 0];    // 50 units from central
    const vel = circularOrbitVelocityAround(bodyPos, centralPos, 1000, G, centralVel);
    // y-component should be orbital speed + 5
    const relVel = circularOrbitVelocity([50, 0], 1000, G);
    expect(vel[0]).toBeCloseTo(relVel[0] + centralVel[0], 4);
    expect(vel[1]).toBeCloseTo(relVel[1] + centralVel[1], 4);
  });
});

describe('hexToRGB', () => {
  it('converts white', () => {
    expect(hexToRGB('#ffffff')).toEqual([1, 1, 1]);
  });
  it('converts black', () => {
    expect(hexToRGB('#000000')).toEqual([0, 0, 0]);
  });
  it('converts red', () => {
    const [r, g, b] = hexToRGB('#ff0000');
    expect(r).toBeCloseTo(1);
    expect(g).toBeCloseTo(0);
    expect(b).toBeCloseTo(0);
  });
  it('converts arbitrary colour', () => {
    const [r, g, b] = hexToRGB('#4B9CD3');
    expect(r).toBeCloseTo(0x4B / 255, 3);
    expect(g).toBeCloseTo(0x9C / 255, 3);
    expect(b).toBeCloseTo(0xD3 / 255, 3);
  });
  it('works without leading #', () => {
    expect(hexToRGB('ffffff')).toEqual([1, 1, 1]);
  });
});

describe('clamp', () => {
  it('clamps below min', () => expect(clamp(-5, 0, 10)).toBe(0));
  it('clamps above max', () => expect(clamp(15, 0, 10)).toBe(10));
  it('passes through in-range value', () => expect(clamp(5, 0, 10)).toBe(5));
  it('handles min == max', () => expect(clamp(7, 3, 3)).toBe(3));
});

describe('randRange', () => {
  it('always returns value in [min, max)', () => {
    for (let i = 0; i < 100; i++) {
      const v = randRange(5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThan(10);
    }
  });
});

describe('lerp', () => {
  it('interpolates correctly', () => {
    expect(lerp(0, 100, 0)).toBe(0);
    expect(lerp(0, 100, 1)).toBe(100);
    expect(lerp(0, 100, 0.5)).toBe(50);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });
});

describe('smoothstep', () => {
  it('returns 0 at edge0', () => {
    expect(smoothstep(0, 1, 0)).toBe(0);
  });
  it('returns 1 at edge1', () => {
    expect(smoothstep(0, 1, 1)).toBe(1);
  });
  it('returns 0.5 at midpoint', () => {
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
  });
  it('clamps below edge0', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
  });
  it('clamps above edge1', () => {
    expect(smoothstep(0, 1, 2)).toBe(1);
  });
  it('is monotonically increasing', () => {
    let prev = -Infinity;
    for (let x = 0; x <= 1; x += 0.05) {
      const v = smoothstep(0, 1, x);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});
