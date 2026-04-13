// Integration-only compute shader used by Barnes-Hut mode.
// CPU supplies pre-computed force array; GPU applies semi-implicit Euler.

struct SimParams {
    numBodies : u32,
    dt        : f32,
    G         : f32,
    softening2: f32,
}

@group(0) @binding(0) var<uniform>            params    : SimParams;
@group(0) @binding(1) var<storage, read>      posIn     : array<vec2<f32>>;
@group(0) @binding(2) var<storage, read>      velIn     : array<vec2<f32>>;
@group(0) @binding(3) var<storage, read>      masses    : array<f32>;
@group(0) @binding(4) var<storage, read>      extForces : array<vec2<f32>>;
@group(0) @binding(5) var<storage, read_write> posOut   : array<vec2<f32>>;
@group(0) @binding(6) var<storage, read_write> velOut   : array<vec2<f32>>;

@compute @workgroup_size(256, 1, 1)
fn integrateForces(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= params.numBodies) { return; }

    let mass  = masses[i];
    let force = extForces[i];
    let acc   = force / max(mass, 1e-30);

    let newVel = velIn[i] + acc * params.dt;
    let newPos = posIn[i] + newVel * params.dt;

    velOut[i] = newVel;
    posOut[i] = newPos;
}
