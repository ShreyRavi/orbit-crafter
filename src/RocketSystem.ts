import { ROCKET_THRUST, ROCKET_FUEL_BURN, ROCKET_INITIAL_FUEL } from './utils/constants.js';
import { vec2Add, vec2Scale, vec2Normalize, Vec2 } from './utils/math.js';
import { Body } from './BodySystem.js';

export interface RocketInput {
  thrustX: number; // -1 to 1
  thrustY: number; // -1 to 1
  boost:   boolean;
}

export class RocketSystem {
  /** Apply thrust forces for all rockets and return force additions (same length as bodies). */
  applyThrust(
    bodies: Body[],
    dt: number,
    input: RocketInput = { thrustX: 0, thrustY: 0, boost: false }
  ): Float32Array {
    const extraForces = new Float32Array(bodies.length * 2);

    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (b.type !== 'rocket') continue;
      if (b.fuel === undefined) b.fuel = ROCKET_INITIAL_FUEL;
      if (b.thrustMagnitude === undefined) b.thrustMagnitude = ROCKET_THRUST;
      if (b.thrust === undefined) b.thrust = [0, 0];
      if (!b.thrustActive) continue;
      if (b.fuel <= 0) { b.thrustActive = false; continue; }

      // Thrust direction
      let dir: Vec2 = [b.thrust[0], b.thrust[1]];
      // Allow external keyboard control for the first rocket
      if (b.id === 'rocket_0' || b.name?.startsWith('Rocket')) {
        const tx = input.thrustX, ty = input.thrustY;
        if (Math.abs(tx) + Math.abs(ty) > 0.01) {
          dir = vec2Normalize([tx, ty]);
        }
      }

      const thrust = b.thrustMagnitude * b.mass;
      extraForces[i * 2]     += dir[0] * thrust;
      extraForces[i * 2 + 1] += dir[1] * thrust;

      // Fuel burn
      const burnRate = b.fuel > 0 ? ROCKET_FUEL_BURN : 0;
      b.fuel = Math.max(0, b.fuel - burnRate * dt);
    }

    return extraForces;
  }

  /** Set rocket thrust direction (normalised). */
  setThrust(body: Body, dir: Vec2): void {
    body.thrust = vec2Normalize(dir);
    body.thrustActive = true;
  }

  stopThrust(body: Body): void {
    body.thrustActive = false;
  }

  /** Attempt to set up a prograde burn to circularise orbit relative to a target body. */
  autopilotCircularise(rocket: Body, target: Body): void {
    const rel: Vec2 = [
      rocket.position[0] - target.position[0],
      rocket.position[1] - target.position[1],
    ];
    const perp: Vec2 = [-rel[1], rel[0]];
    rocket.thrust = vec2Normalize(perp);
    rocket.thrustActive = true;
  }
}
