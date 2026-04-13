// Gravity field visualisation – fullscreen fragment pass.
// Samples gravitational potential at each pixel and renders a heatmap overlay.

struct CameraUniform {
    centerX     : f32,
    centerY     : f32,
    zoom        : f32,
    aspectRatio : f32,
}

struct FieldParams {
    numBodies   : u32,
    G           : f32,
    softening2  : f32,
    intensity   : f32,   // scale factor for colour mapping
}

struct BodyFieldData {
    posX : f32,
    posY : f32,
    mass : f32,
    pad  : f32,
}

@group(0) @binding(0) var<uniform>       camera : CameraUniform;
@group(0) @binding(1) var<uniform>       fp     : FieldParams;
@group(0) @binding(2) var<storage, read> bodies : array<BodyFieldData>;

struct VSOut {
    @builtin(position) pos : vec4<f32>,
    @location(0)       uv  : vec2<f32>,
}

// Fullscreen triangle trick (no vertex buffer needed)
@vertex
fn vs_main(@builtin(vertex_index) vIdx: u32) -> VSOut {
    var pos = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -3.0),
        vec2<f32>( 3.0,  1.0),
        vec2<f32>(-1.0,  1.0),
    );
    var out : VSOut;
    out.pos = vec4<f32>(pos[vIdx], 0.0, 1.0);
    out.uv  = pos[vIdx];
    return out;
}

// Map NDC to world space
fn ndcToWorld(ndc: vec2<f32>) -> vec2<f32> {
    let wx = ndc.x * camera.aspectRatio / camera.zoom + camera.centerX;
    let wy = ndc.y / camera.zoom + camera.centerY;
    return vec2<f32>(wx, wy);
}

// Colour map: dark blue → cyan → yellow → red
fn heatmapColor(t: f32) -> vec3<f32> {
    let t1 = clamp(t, 0.0, 1.0);
    var col = vec3<f32>(0.0, 0.0, 0.0);
    if (t1 < 0.25) {
        col = mix(vec3<f32>(0.0, 0.0, 0.3), vec3<f32>(0.0, 0.5, 1.0), t1 / 0.25);
    } else if (t1 < 0.5) {
        col = mix(vec3<f32>(0.0, 0.5, 1.0), vec3<f32>(0.0, 1.0, 0.5), (t1 - 0.25) / 0.25);
    } else if (t1 < 0.75) {
        col = mix(vec3<f32>(0.0, 1.0, 0.5), vec3<f32>(1.0, 1.0, 0.0), (t1 - 0.5) / 0.25);
    } else {
        col = mix(vec3<f32>(1.0, 1.0, 0.0), vec3<f32>(1.0, 0.0, 0.0), (t1 - 0.75) / 0.25);
    }
    return col;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
    let worldPos = ndcToWorld(in.uv);

    // Compute gravitational potential φ = -G * Σ m_i / r_i
    var potential = 0.0;
    for (var i = 0u; i < fp.numBodies; i++) {
        let dx = worldPos.x - bodies[i].posX;
        let dy = worldPos.y - bodies[i].posY;
        let r2 = dx * dx + dy * dy + fp.softening2;
        potential += fp.G * bodies[i].mass / sqrt(r2);
    }

    // Log scale for wide dynamic range
    let logPot = log(max(potential * fp.intensity, 1e-6)) / log(1e6);
    let t      = clamp(logPot, 0.0, 1.0);

    let col   = heatmapColor(t);
    let alpha = clamp(t * 0.55, 0.0, 0.55);

    return vec4<f32>(col, alpha);
}
