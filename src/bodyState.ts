import { STAR_MASS, PLANET_MASS, SCHWARZSCHILD_CONST } from './constants';

export interface BodyState {
  name: string;
  temperature: number;              // Kelvin, blackbody color
  manualRadius: boolean;            // if true, don't auto-update radius from mass
  color: [number, number, number];  // [r, g, b] solid disc color
}

export function generateName(mass: number, existingStates: BodyState[]): string {
  let type: string;
  if (mass > 0.1 * STAR_MASS) {
    type = 'Star';
  } else if (mass > 0.1 * PLANET_MASS) {
    type = 'Planet';
  } else {
    type = 'Moon';
  }
  const count = existingStates.filter(s => s.name.startsWith(type)).length + 1;
  return `${type} ${count}`;
}

export function defaultTemperature(mass: number): number {
  if (mass > 0.1 * STAR_MASS) return 5800;
  if (mass > PLANET_MASS) return 300;
  return 100;
}

export function defaultColor(mass: number): [number, number, number] {
  if (mass > 0.1 * STAR_MASS) return [255, 248, 220]; // star — warm white
  if (mass > 50000)            return [190, 160, 110]; // gas giant — tan-orange
  if (mass > 20000)            return [160, 185, 215]; // large body — cool blue-grey
  if (mass > 3000)             return [175, 145, 115]; // rocky — warm brown
  return [160, 162, 165];                              // moon — neutral grey
}

export function temperatureToColor(T: number): [number, number, number] {
  // Tanner Helland blackbody approximation
  const temp = Math.max(1000, Math.min(40000, T)) / 100;

  let r: number;
  let g: number;
  let b: number;

  // Red
  if (temp <= 66) {
    r = 255;
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    r = Math.max(0, Math.min(255, r));
  }

  // Green
  if (temp <= 66) {
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
    g = Math.max(0, Math.min(255, g));
  } else {
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
    g = Math.max(0, Math.min(255, g));
  }

  // Blue
  if (temp >= 66) {
    b = 255;
  } else if (temp <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
    b = Math.max(0, Math.min(255, b));
  }

  return [Math.round(r), Math.round(g), Math.round(b)];
}

export function isBlackHole(mass: number, radius: number): boolean {
  return SCHWARZSCHILD_CONST * mass > radius;
}

export function schwarzschildRadius(mass: number): number {
  return SCHWARZSCHILD_CONST * mass;
}
