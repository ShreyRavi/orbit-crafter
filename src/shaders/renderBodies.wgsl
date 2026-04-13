// Instanced body rendering shader.
// Each body maps to one quad (6 vertices, 2 triangles).
// Body data is read from a storage buffer via instance_index.

struct CameraUniform {
    centerX     : f32,   // world X of screen centre
    centerY     : f32,   // world Y of screen centre
    zoom        : f32,   // world-units visible in half-screen height
    aspectRatio : f32,   // width / height
}

// Tight packing: 48 bytes per body
struct BodyRenderData {
    posX    : f32,      //  0
    posY    : f32,      //  4
    velX    : f32,      //  8
    velY    : f32,      // 12
    colorR  : f32,      // 16
    colorG  : f32,      // 20
    colorB  : f32,      // 24
    colorA  : f32,      // 28
    radius  : f32,      // 32
    bodyType: u32,      // 36
    pad0    : f32,      // 40
    pad1    : f32,      // 44
}

@group(0) @binding(0) var<uniform>       camera : CameraUniform;
@group(0) @binding(1) var<storage, read> bodies : array<BodyRenderData>;

struct VSOut {
    @builtin(position) pos      : vec4<f32>,
    @location(0)       uv       : vec2<f32>,
    @location(1)       color    : vec4<f32>,
    @location(2)       bodyType : f32,
}

// Six corners for two-triangle quad
fn quadCorner(vIdx: u32) -> vec2<f32> {
    switch vIdx {
        case 0u: { return vec2<f32>(-1.0, -1.0); }
        case 1u: { return vec2<f32>( 1.0, -1.0); }
        case 2u: { return vec2<f32>(-1.0,  1.0); }
        case 3u: { return vec2<f32>(-1.0,  1.0); }
        case 4u: { return vec2<f32>( 1.0, -1.0); }
        default: { return vec2<f32>( 1.0,  1.0); }
    }
}

@vertex
fn vs_main(
    @builtin(vertex_index)   vIdx : u32,
    @builtin(instance_index) iIdx : u32,
) -> VSOut {
    let body   = bodies[iIdx];
    let corner = quadCorner(vIdx);

    let worldX = body.posX + corner.x * body.radius;
    let worldY = body.posY + corner.y * body.radius;

    // Camera transform → NDC
    let relX = (worldX - camera.centerX) * camera.zoom;
    let relY = (worldY - camera.centerY) * camera.zoom;
    let ndcX = relX / camera.aspectRatio;
    let ndcY = relY;

    var out : VSOut;
    out.pos      = vec4<f32>(ndcX, ndcY, 0.0, 1.0);
    out.uv       = corner;
    out.color    = vec4<f32>(body.colorR, body.colorG, body.colorB, body.colorA);
    out.bodyType = f32(body.bodyType);
    return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
    let d = length(in.uv);
    if (d > 1.0) { discard; }

    var alpha = 1.0 - smoothstep(0.65, 1.0, d);

    // Stars: wide atmospheric glow
    if (in.bodyType < 0.5) {
        let glow = exp(-d * 2.5) * 0.6;
        alpha = max(alpha, glow);
        // bright core
        if (d < 0.3) { alpha = 1.0; }
    }
    // Rockets: elongated exhaust hint in fragment
    if (in.bodyType > 3.5) {
        alpha *= 1.2;
    }

    return vec4<f32>(in.color.rgb, in.color.a * alpha);
}
