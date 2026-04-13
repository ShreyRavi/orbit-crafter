// N-body gravity compute shader (exact O(N²) mode)
// Uses tiled workgroup shared memory for cache efficiency.
// Semi-implicit Euler integration (symplectic – good energy conservation).

struct SimParams {
    numBodies : u32,
    dt        : f32,
    G         : f32,
    softening2: f32,
}

@group(0) @binding(0) var<uniform>            params  : SimParams;
@group(0) @binding(1) var<storage, read>      posIn   : array<vec2<f32>>;
@group(0) @binding(2) var<storage, read>      velIn   : array<vec2<f32>>;
@group(0) @binding(3) var<storage, read>      masses  : array<f32>;
@group(0) @binding(4) var<storage, read_write> posOut : array<vec2<f32>>;
@group(0) @binding(5) var<storage, read_write> velOut : array<vec2<f32>>;

// Workgroup shared tile – size must match WORKGROUP_SIZE in constants.ts (256)
var<workgroup> tilePos  : array<vec2<f32>, 256>;
var<workgroup> tileMass : array<f32, 256>;

@compute @workgroup_size(256, 1, 1)
fn nbodyStep(
    @builtin(global_invocation_id) gid : vec3<u32>,
    @builtin(local_invocation_id)  lid : vec3<u32>,
) {
    let i   = gid.x;
    let tid = lid.x;
    let n   = params.numBodies;

    var acc  = vec2<f32>(0.0, 0.0);
    var posI = vec2<f32>(0.0, 0.0);
    var velI = vec2<f32>(0.0, 0.0);

    if (i < n) {
        posI = posIn[i];
        velI = velIn[i];
    }

    let numTiles = (n + 255u) / 256u;

    for (var tile = 0u; tile < numTiles; tile++) {
        let j = tile * 256u + tid;

        // Load tile into workgroup shared memory
        if (j < n) {
            tilePos[tid]  = posIn[j];
            tileMass[tid] = masses[j];
        } else {
            tilePos[tid]  = vec2<f32>(1e20, 1e20);
            tileMass[tid] = 0.0;
        }

        workgroupBarrier();

        // Accumulate forces from this tile
        if (i < n) {
            for (var k = 0u; k < 256u; k++) {
                let jGlobal = tile * 256u + k;
                if (jGlobal >= n || jGlobal == i) { continue; }

                let dp    = tilePos[k] - posI;
                let r2    = dot(dp, dp) + params.softening2;
                let invR  = inverseSqrt(r2);
                let invR3 = invR * invR * invR;
                acc += dp * (params.G * tileMass[k] * invR3);
            }
        }

        workgroupBarrier();
    }

    if (i >= n) { return; }

    // Semi-implicit (symplectic) Euler integration
    let newVel = velI + acc * params.dt;
    let newPos = posI + newVel * params.dt;

    velOut[i] = newVel;
    posOut[i] = newPos;
}
