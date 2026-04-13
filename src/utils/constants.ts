// Simulation constants – dimensionless units where G = 1

export const G = 1.0;

// Softening parameter (squared) for numerical stability
export const EPSILON = 0.1;
export const EPSILON_SQ = EPSILON * EPSILON;

// Default simulation timestep (sim units)
export const DEFAULT_DT = 0.05;

// Barnes-Hut theta threshold
export const BH_THETA = 0.5;

// GPU workgroup size (must match shader constant)
export const WORKGROUP_SIZE = 256;

// Maximum number of bodies (sets GPU buffer sizes)
export const MAX_BODIES = 200_000;

// Trail ring-buffer length per body
export const TRAIL_LENGTH = 300;

// Maximum bodies that get trails rendered
export const MAX_TRAIL_BODIES = 5000;

// Bytes per body in position / velocity buffers (vec2<f32>)
export const POS_STRIDE = 8;   // 2 * 4
export const VEL_STRIDE = 8;
export const MASS_STRIDE = 4;

// Render instance struct size in bytes (see renderBodies.wgsl)
// position(8) + velocity(8) + colorRGB(12) + radius(4) + bodyType(4) + pad(4) = 40 → pad to 48
export const RENDER_STRIDE = 48;

// Camera default zoom (world units visible in half-screen height)
export const DEFAULT_ZOOM = 180;

// Speed multiplier limits
export const MIN_SPEED = 0.0001;
export const MAX_SPEED = 10000;

// Body types (matches shader u32)
export const BODY_TYPE_STAR     = 0;
export const BODY_TYPE_PLANET   = 1;
export const BODY_TYPE_MOON     = 2;
export const BODY_TYPE_ASTEROID = 3;
export const BODY_TYPE_ROCKET   = 4;

// Simulation modes
export const MODE_EXACT      = 'EXACT';
export const MODE_BARNES_HUT = 'BARNES_HUT';
export const MODE_HYBRID     = 'HYBRID';

// Default universe parameters
export const STAR_MASS   = 1000;
export const PLANET_MASS = 1.0;
export const MOON_MASS   = 0.01;
export const ASTEROID_MASS = 0.0001;
export const ROCKET_MASS = 0.05;

// Rocket parameters
export const ROCKET_THRUST       = 0.005;   // acceleration per frame at full thrust
export const ROCKET_FUEL_BURN    = 0.01;    // fuel per second at full thrust
export const ROCKET_INITIAL_FUEL = 1000.0;
