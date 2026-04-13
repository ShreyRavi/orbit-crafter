// Vector math utilities

export type Vec2 = [number, number];

export function vec2Add(a: Vec2, b: Vec2): Vec2 {
  return [a[0] + b[0], a[1] + b[1]];
}

export function vec2Sub(a: Vec2, b: Vec2): Vec2 {
  return [a[0] - b[0], a[1] - b[1]];
}

export function vec2Scale(a: Vec2, s: number): Vec2 {
  return [a[0] * s, a[1] * s];
}

export function vec2Dot(a: Vec2, b: Vec2): number {
  return a[0] * b[0] + a[1] * b[1];
}

export function vec2LenSq(a: Vec2): number {
  return a[0] * a[0] + a[1] * a[1];
}

export function vec2Len(a: Vec2): number {
  return Math.sqrt(vec2LenSq(a));
}

export function vec2Normalize(a: Vec2): Vec2 {
  const l = vec2Len(a);
  if (l < 1e-20) return [0, 0];
  return [a[0] / l, a[1] / l];
}

export function vec2Perp(a: Vec2): Vec2 {
  return [-a[1], a[0]];
}

export function vec2Dist(a: Vec2, b: Vec2): number {
  return vec2Len(vec2Sub(a, b));
}

export function vec2Lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Circular orbit velocity around a mass at origin. Returns velocity vector. */
export function circularOrbitVelocity(
  pos: Vec2,
  centralMass: number,
  G: number
): Vec2 {
  const r = vec2Len(pos);
  if (r < 1e-10) return [0, 0];
  const speed = Math.sqrt(G * centralMass / r);
  // Perpendicular direction (counter-clockwise)
  const perp: Vec2 = [-pos[1] / r, pos[0] / r];
  return vec2Scale(perp, speed);
}

/** Circular orbit velocity around a body at a given position. */
export function circularOrbitVelocityAround(
  bodyPos: Vec2,
  centralPos: Vec2,
  centralMass: number,
  G: number,
  centralVelocity: Vec2 = [0, 0]
): Vec2 {
  const rel = vec2Sub(bodyPos, centralPos);
  const orbVel = circularOrbitVelocity(rel, centralMass, G);
  return vec2Add(orbVel, centralVelocity);
}

/** Convert hex color string to [r, g, b] floats in [0,1]. */
export function hexToRGB(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  return [r, g, b];
}

/** Clamp value between min and max. */
export function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

/** Random float in [min, max). */
export function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Random angle in [0, 2π). */
export function randAngle(): number {
  return Math.random() * Math.PI * 2;
}

/** Format a number with SI prefix (k, M, G). */
export function formatSI(x: number, decimals = 2): string {
  const abs = Math.abs(x);
  if (abs >= 1e9) return (x / 1e9).toFixed(decimals) + 'G';
  if (abs >= 1e6) return (x / 1e6).toFixed(decimals) + 'M';
  if (abs >= 1e3) return (x / 1e3).toFixed(decimals) + 'k';
  if (abs >= 1) return x.toFixed(decimals);
  if (abs >= 1e-3) return (x * 1e3).toFixed(decimals) + 'm';
  return x.toExponential(decimals);
}

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Smooth-step easing. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
