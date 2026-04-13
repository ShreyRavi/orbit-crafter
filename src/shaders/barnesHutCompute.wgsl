// Barnes-Hut GPU-assisted force evaluation shader.
// The CPU builds the quad-tree and flattens it to a node array.
// Each GPU thread evaluates forces for one body by tree traversal.

struct SimParams {
    numBodies : u32,
    dt        : f32,
    G         : f32,
    softening2: f32,
    theta2    : f32,   // theta^2, approximation threshold
    pad0      : f32,
    pad1      : f32,
    pad2      : f32,
}

// Flattened BH quad-tree node.
// Leaf: child[0..3] == 0xFFFFFFFF, bodyIndex >= 0
// Internal: centerX/Y is COM, totalMass is aggregate
struct BHNode {
    centerX   : f32,   //  0  – COM x (or body pos x for leaf)
    centerY   : f32,   //  4  – COM y
    totalMass : f32,   //  8
    size      : f32,   // 12  – cell half-width (for theta check)
    child0    : u32,   // 16
    child1    : u32,   // 20
    child2    : u32,   // 24
    child3    : u32,   // 28
}                      // 32 bytes, aligned to 4

@group(0) @binding(0) var<uniform>            params   : SimParams;
@group(0) @binding(1) var<storage, read>      posIn    : array<vec2<f32>>;
@group(0) @binding(2) var<storage, read>      velIn    : array<vec2<f32>>;
@group(0) @binding(3) var<storage, read>      masses   : array<f32>;
@group(0) @binding(4) var<storage, read>      bhNodes  : array<BHNode>;
@group(0) @binding(5) var<storage, read_write> posOut  : array<vec2<f32>>;
@group(0) @binding(6) var<storage, read_write> velOut  : array<vec2<f32>>;

const STACK_SIZE: u32 = 64u;
const LEAF_MARKER: u32 = 0xFFFFFFFFu;

@compute @workgroup_size(256, 1, 1)
fn bhStep(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= params.numBodies) { return; }

    let posI = posIn[i];
    var acc  = vec2<f32>(0.0, 0.0);

    // Iterative tree traversal using a fixed-size stack
    var stack : array<u32, 64>;
    var top   = 0u;

    // Start from root (index 0)
    stack[0] = 0u;
    top = 1u;

    while (top > 0u) {
        top -= 1u;
        let nodeIdx = stack[top];
        let node    = bhNodes[nodeIdx];

        let dx = node.centerX - posI.x;
        let dy = node.centerY - posI.y;
        let r2 = dx * dx + dy * dy + params.softening2;

        // Barnes-Hut opening criterion: s^2/r^2 < theta^2
        let s2 = node.size * node.size;
        let isLeaf = (node.child0 == LEAF_MARKER);

        if (isLeaf || s2 < params.theta2 * r2) {
            // Treat as point mass
            if (node.totalMass > 0.0) {
                let invR  = inverseSqrt(r2);
                let invR3 = invR * invR * invR;
                acc += vec2<f32>(dx, dy) * (params.G * node.totalMass * invR3);
            }
        } else {
            // Open node – push children
            if (node.child0 != LEAF_MARKER && top < STACK_SIZE - 4u) {
                if (node.child0 < arrayLength(&bhNodes)) { stack[top] = node.child0; top++; }
                if (node.child1 < arrayLength(&bhNodes)) { stack[top] = node.child1; top++; }
                if (node.child2 < arrayLength(&bhNodes)) { stack[top] = node.child2; top++; }
                if (node.child3 < arrayLength(&bhNodes)) { stack[top] = node.child3; top++; }
            }
        }
    }

    // Semi-implicit Euler integration
    let newVel = velIn[i] + acc * params.dt;
    let newPos = posI     + newVel * params.dt;

    velOut[i] = newVel;
    posOut[i] = newPos;
}
