export const G = 1.0;
export const DT = 0.016;
export const SUBSTEP_COUNT = 4;
export const STAR_MASS = 1e6;
export const PLANET_MASS = 1e3;
export const MOON_MASS = 1;
export const PLANET_ORBIT_R = 200;
export const MOON_ORBIT_R = 30;
export const TRAIL_BUFFER_LENGTH = 300;
export const CAMERA_SCALE_MIN = 0.25;
export const CAMERA_SCALE_MAX = 8.0;
export const SOFTENING_EPSILON = 0.25;
export const MAX_BODIES = 64;
export const BODY_STRIDE = 32; // bytes per body in GPU buffer

export function bodyRadius(mass: number): number {
  return Math.max(2, Math.min(80, Math.sqrt(mass) * 0.5));
}

// G parameter kept explicit so tests can pass in a custom G value
export function circularOrbitVelocity(g: number, centralMass: number, r: number): number {
  return Math.sqrt(g * centralMass / r);
}

export function gravitationalForce(
  b1: { pos: [number, number]; mass: number },
  b2: { pos: [number, number]; mass: number },
): [number, number] {
  const dx = b2.pos[0] - b1.pos[0];
  const dy = b2.pos[1] - b1.pos[1];
  const r2 = dx * dx + dy * dy + SOFTENING_EPSILON * SOFTENING_EPSILON;
  const r = Math.sqrt(r2);
  const fMag = (G * b1.mass * b2.mass) / r2;
  return [(fMag * dx) / r, (fMag * dy) / r];
}

export interface BodyData {
  pos: [number, number];
  vel: [number, number];
  mass: number;
  radius: number;
}

export interface Camera {
  center: [number, number];
  scale: number;
}

export function screenToWorld(
  screen: [number, number],
  camera: Camera,
  canvasW: number,
  canvasH: number,
): [number, number] {
  return [
    (screen[0] - canvasW / 2) / camera.scale + camera.center[0],
    (screen[1] - canvasH / 2) / camera.scale + camera.center[1],
  ];
}

export function worldToScreen(
  world: [number, number],
  camera: Camera,
  canvasW: number,
  canvasH: number,
): [number, number] {
  return [
    (world[0] - camera.center[0]) * camera.scale + canvasW / 2,
    (world[1] - camera.center[1]) * camera.scale + canvasH / 2,
  ];
}
