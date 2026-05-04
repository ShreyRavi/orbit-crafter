import type { BodyData } from './constants';
import type { BodyState } from './bodyState';
import { G, STAR_MASS, bodyRadius } from './constants';

function toRad(deg: number): number {
  return deg * Math.PI / 180;
}

function bodyAtPerihelion(
  a: number,
  e: number,
  periAngle: number,
  centralMass: number,
  centralPos: [number, number],
  centralVel: [number, number],
  myMass: number,
  retrograde = false,
): BodyData {
  const mu  = G * centralMass;
  const r_p = a * (1 - e);
  const v_p = Math.sqrt(Math.max(0, mu * (1 + e) / r_p));
  const ca  = Math.cos(periAngle);
  const sa  = Math.sin(periAngle);
  const px  = centralPos[0] + r_p * ca;
  const py  = centralPos[1] + r_p * sa;
  const vx  = retrograde ? centralVel[0] + v_p * sa : centralVel[0] - v_p * sa;
  const vy  = retrograde ? centralVel[1] - v_p * ca : centralVel[1] + v_p * ca;
  return { pos: [px, py], vel: [vx, vy], mass: myMass, radius: bodyRadius(myMass) };
}

export function makeInitialBodies(): BodyData[] {
  const SM = STAR_MASS;
  const sp: [number, number] = [0, 0];
  const sv: [number, number] = [0, 0];

  const sun: BodyData = { pos: sp, vel: sv, mass: SM, radius: bodyRadius(SM) };

  const P = (a: number, e: number, deg: number, mass: number) =>
    bodyAtPerihelion(a, e, toRad(deg), SM, sp, sv, mass);

  const mercury = P( 220,  0.206, 320,   800);
  const venus   = P( 420,  0.007,  45, 20000);
  const earth   = P( 650,  0.017,  90, 30000);
  const mars    = P(1000,  0.093, 150, 10000);
  const jupiter = P(2200,  0.049, 210, 80000);
  const saturn  = P(4000,  0.057, 270, 35000);
  const uranus  = P(7500,  0.047, 320,  8000);
  const neptune = P(12000, 0.010,  30,  8000);

  const Mo = (
    parent: BodyData, pm: number,
    a: number, e: number, deg: number, mass: number, retro = false,
  ) => bodyAtPerihelion(a, e, toRad(deg), pm, parent.pos, parent.vel, mass, retro);

  // Earth Moon — Hill sphere ~111 at a=650; 40 is safely inside (36% of Hill sphere)
  const luna     = Mo(earth,   30000,  40, 0.050,  0, 30);

  // Jupiter moons — Hill sphere ~524 at a=2200; well inside
  const io       = Mo(jupiter, 80000,  70, 0.004,  0, 30);
  const ganymede = Mo(jupiter, 80000, 130, 0.001, 90, 50);

  // Saturn → Titan — Hill sphere ~719 at a=4000; 110 is safe
  const titan    = Mo(saturn,  35000, 110, 0.029, 45, 40);

  return [
    sun, mercury, venus, earth, luna,
    mars,
    jupiter, io, ganymede,
    saturn, titan,
    uranus, neptune,
  ];
}

export function makeInitialBodyStates(): BodyState[] {
  return [
    { name: 'Sol',      temperature: 5800, manualRadius: false, color: [255, 248, 220] },
    { name: 'Mercury',  temperature: 440,  manualRadius: false, color: [172, 157, 145] },
    { name: 'Venus',    temperature: 737,  manualRadius: false, color: [228, 198, 104] },
    { name: 'Earth',    temperature: 288,  manualRadius: false, color: [ 72, 140, 195] },
    { name: 'Moon',     temperature: 250,  manualRadius: false, color: [175, 175, 178] },
    { name: 'Mars',     temperature: 210,  manualRadius: false, color: [195,  88,  50] },
    { name: 'Jupiter',  temperature: 120,  manualRadius: false, color: [195, 162, 110] },
    { name: 'Io',       temperature: 130,  manualRadius: false, color: [224, 194,  60] },
    { name: 'Ganymede', temperature: 110,  manualRadius: false, color: [142, 144, 148] },
    { name: 'Saturn',   temperature: 134,  manualRadius: false, color: [228, 208, 152] },
    { name: 'Titan',    temperature:  94,  manualRadius: false, color: [208, 152,  80] },
    { name: 'Uranus',   temperature:  76,  manualRadius: false, color: [148, 208, 215] },
    { name: 'Neptune',  temperature:  72,  manualRadius: false, color: [ 80, 108, 205] },
  ];
}
