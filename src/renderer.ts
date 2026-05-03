import type { BodyData, Camera } from './constants';
import {
  TRAIL_BUFFER_LENGTH,
  worldToScreen,
} from './constants';
import type { BodyState } from './bodyState';
import { isBlackHole, temperatureToColor } from './bodyState';
import type { FeatureFlags } from './toolbar';

// ─── WGSL shaders ────────────────────────────────────────────────────────────

const SHADER_SRC = /* wgsl */ `
struct Body {
  pos: vec2f,
  vel: vec2f,
  mass: f32,
  radius: f32,
  _pad: vec2f,
}

struct RenderUniforms {
  cameraCenter: vec2f,
  cameraScale: f32,
  n: u32,
  canvasSize: vec2f,
  _pad: vec2f,
}

@group(0) @binding(0) var<storage, read> bodies: array<Body>;
@group(0) @binding(1) var<uniform> uniforms: RenderUniforms;

struct VertOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) color: vec3f,
}

var<private> QUAD: array<vec2f, 6> = array<vec2f, 6>(
  vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0,  1.0),
  vec2f( 1.0, -1.0), vec2f(1.0,  1.0), vec2f(-1.0,  1.0),
);

fn bodyColor(mass: f32) -> vec3f {
  if (mass > 500000.0) {
    return vec3f(1.0, 0.96, 0.80);  // star: warm golden glow
  } else if (mass > 50000.0) {
    return vec3f(0.80, 0.88, 0.98); // gas giant: cool blue-white
  } else if (mass > 5000.0) {
    return vec3f(0.88, 0.84, 0.78); // rocky/ice: warm cream
  }
  return vec3f(0.65, 0.66, 0.68);   // moon: neutral grey
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VertOut {
  let body = bodies[ii];
  let center = uniforms.canvasSize * 0.5;
  let screenPos = (body.pos - uniforms.cameraCenter) * uniforms.cameraScale + center;
  let uv = QUAD[vi];
  let logM = clamp(log(max(body.mass, 1.0)) / log(10.0), 0.5, 8.0);
  let visR = max(4.0, (logM - 1.0) * 5.0 + 2.0) * uniforms.cameraScale;
  let glowR = visR * 4.0;
  let pixelPos = screenPos + uv * glowR;
  let clip = vec4f(
    pixelPos.x / uniforms.canvasSize.x * 2.0 - 1.0,
    1.0 - pixelPos.y / uniforms.canvasSize.y * 2.0,
    0.0, 1.0,
  );
  return VertOut(clip, uv, bodyColor(body.mass));
}

@fragment
fn fs(v: VertOut) -> @location(0) vec4f {
  let d = length(v.uv);
  if (d > 1.0) { discard; }
  let core = 1.0 - smoothstep(0.0, 0.18, d);
  let glow = pow(1.0 - d, 2.5) * 0.5;
  let a = clamp(core + glow, 0.0, 1.0);
  return vec4f(v.color * (core + glow * 2.0), a);
}
`;

// ─── Public types ─────────────────────────────────────────────────────────────

export interface DragState {
  active: boolean;
  bodyIndex: number;
  bodyWorldPos: [number, number];
  mouseHistory: [number, number][]; // last 5 world positions
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface Star {
  x: number; // normalised 0..1
  y: number;
  r: number;
  a: number;
}

interface Pulse {
  idx: number;
  startTime: number;
}

interface GasParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lcg(seed: number): number {
  return (seed * 1664525 + 1013904223) & 0xffffffff;
}

/** Map mass → CSS-like colour string for trail / glow drawing on 2D canvas. */
function trailColor(mass: number): string {
  if (mass > 100_000) return '255,245,224';   // star  #FFF5E0
  if (mass > 1_000)   return '192,216,255';   // planet #C0D8FF
  return '136,153,170';                        // moon  #8899AA
}

/** Visual disc radius in screen pixels — decoupled from physics collision radius. */
function visRadius(mass: number, scale: number): number {
  const logM = Math.max(0.5, Math.min(8, Math.log10(Math.max(mass, 1))));
  return Math.max(4, (logM - 1) * 5 + 2) * scale;
}

// ─── Renderer ─────────────────────────────────────────────────────────────────

export class Renderer {
  // Public trail state (main.ts may inspect/manipulate)
  trails: Float32Array[];
  trailHead: number[];
  trailLen: number[];

  // WebGPU
  private device: GPUDevice;
  private gpuCanvas: HTMLCanvasElement;
  private ctx: GPUCanvasContext;
  private format: GPUTextureFormat;
  private pipeline: GPURenderPipeline;
  private uniformBuffer: GPUBuffer;
  // 2D overlay
  private overlayCanvas: HTMLCanvasElement;
  private ctx2d: CanvasRenderingContext2D;
  private hudEl: HTMLElement;

  // Starfield
  private stars: Star[];

  // Collision pulses
  private pulses: Pulse[] = [];

  // Gas particle system
  private _gasParticles: GasParticle[] = [];

  // Random seed for gas particles
  private _gasRng: number = 0xaabbccdd;

  // Reusable uniform buffer staging data (both views share the same backing buffer)
  private _uniBuffer = new ArrayBuffer(32);
  private _uniF = new Float32Array(this._uniBuffer);
  private _uniU = new Uint32Array(this._uniBuffer);

  // Bind group cache — physics ping-pong cycles through 2 buffers, cache both
  private _bindGroupCache: Map<GPUBuffer, GPUBindGroup> = new Map();

  constructor(
    device: GPUDevice,
    gpuCanvas: HTMLCanvasElement,
    overlayCanvas: HTMLCanvasElement,
    hudEl: HTMLElement,
  ) {
    this.device = device;
    this.gpuCanvas = gpuCanvas;
    this.overlayCanvas = overlayCanvas;
    this.hudEl = hudEl;

    // Trails
    this.trails = [];
    this.trailHead = [];
    this.trailLen = [];

    // ── WebGPU context ──────────────────────────────────────────────────────
    const gpuCtx = gpuCanvas.getContext('webgpu');
    if (!gpuCtx) throw new Error('WebGPU context unavailable on #webgpu-canvas');
    this.ctx = gpuCtx;

    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device, format: this.format, alphaMode: 'premultiplied' });

    // ── Pipeline ────────────────────────────────────────────────────────────
    const module = device.createShaderModule({ code: SHADER_SRC });

    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{
          format: this.format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one',       dstFactor: 'one', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-list' },
    });

    // ── Uniform buffer (32 bytes) ────────────────────────────────────────────
    this.uniformBuffer = device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // ── 2D overlay ──────────────────────────────────────────────────────────
    const ctx2d = overlayCanvas.getContext('2d');
    if (!ctx2d) throw new Error('2D context unavailable on #overlay');
    this.ctx2d = ctx2d;

    // ── Starfield ────────────────────────────────────────────────────────────
    this.stars = this.generateStars(300);

    // Size both canvases on creation
    this.resize();
  }

  // ── Starfield generation ──────────────────────────────────────────────────

  private generateStars(count: number): Star[] {
    const stars: Star[] = [];
    let seed = 0xdeadbeef;
    for (let i = 0; i < count; i++) {
      seed = lcg(seed);
      const x = ((seed >>> 0) / 0x100000000);
      seed = lcg(seed);
      const y = ((seed >>> 0) / 0x100000000);
      seed = lcg(seed);
      const r = 0.3 + ((seed >>> 0) / 0x100000000) * 0.9;
      seed = lcg(seed);
      const a = 0.3 + ((seed >>> 0) / 0x100000000) * 0.7;
      stars.push({ x, y, r, a });
    }
    return stars;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  resize(): void {
    const w = this.gpuCanvas.width;
    const h = this.gpuCanvas.height;
    this.overlayCanvas.width = w;
    this.overlayCanvas.height = h;
  }

  setBodyCount(n: number): void {
    const prev = this.trails.length;
    if (n > prev) {
      for (let i = prev; i < n; i++) {
        this.trails.push(new Float32Array(TRAIL_BUFFER_LENGTH * 2));
        this.trailHead.push(0);
        this.trailLen.push(0);
      }
    } else if (n < prev) {
      this.trails.length = n;
      this.trailHead.length = n;
      this.trailLen.length = n;
    }
  }

  /** Remove trail data for the body at `index`, shifting remaining entries down. */
  removeBodyTrail(index: number): void {
    this.trails.splice(index, 1);
    this.trailHead.splice(index, 1);
    this.trailLen.splice(index, 1);
  }

  addPulse(bodyIndex: number): void {
    this.pulses.push({ idx: bodyIndex, startTime: performance.now() });
  }

  render(
    bodyBuffer: GPUBuffer,
    bodies: BodyData[],
    n: number,
    camera: Camera,
    hoveredIndex: number,
    dragState: DragState,
    ghostBody: BodyData | null,
    timeScale: number,
    paused: boolean,
    bodyStates: BodyState[],
    featureFlags: FeatureFlags,
    selectedBodyIndex: number,
    lagrangePoints: [number, number][] | null,
    orbitPaths: [number, number][][],
    attractors: number[],
  ): void {
    const W = this.gpuCanvas.width;
    const H = this.gpuCanvas.height;
    const now = performance.now();

    // ── Push trail positions ───────────────────────────────────────────────
    if (featureFlags.trails) {
      for (let i = 0; i < n && i < this.trails.length; i++) {
        const buf = this.trails[i];
        const head = this.trailHead[i];
        buf[head * 2]     = bodies[i].pos[0];
        buf[head * 2 + 1] = bodies[i].pos[1];
        this.trailHead[i] = (head + 1) % TRAIL_BUFFER_LENGTH;
        if (this.trailLen[i] < TRAIL_BUFFER_LENGTH) this.trailLen[i]++;
      }
    }

    // ── Update uniforms ───────────────────────────────────────────────────
    this._uniF[0] = camera.center[0];
    this._uniF[1] = camera.center[1];
    this._uniF[2] = camera.scale;
    this._uniU[3] = n;
    this._uniF[4] = W;
    this._uniF[5] = H;
    this._uniF[6] = 0;
    this._uniF[7] = 0;
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this._uniBuffer);

    // ── Bind group — cache per buffer reference (physics ping-pongs 2 bufs) ─
    let bindGroup = this._bindGroupCache.get(bodyBuffer);
    if (!bindGroup) {
      bindGroup = this.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: bodyBuffer } },
          { binding: 1, resource: { buffer: this.uniformBuffer } },
        ],
      });
      this._bindGroupCache.set(bodyBuffer, bindGroup);
    }

    // ── WebGPU render pass ────────────────────────────────────────────────
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.ctx.getCurrentTexture().createView(),
        loadOp: 'clear',
        clearValue: { r: 0.02, g: 0.039, b: 0.078, a: 1 },
        storeOp: 'store',
      }],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup);
    if (n > 0) pass.draw(6, n);
    pass.end();
    this.device.queue.submit([encoder.finish()]);

    // ── Canvas 2D overlay ─────────────────────────────────────────────────
    const c = this.ctx2d;
    c.clearRect(0, 0, W, H);

    this.drawStarfield(W, H);

    // Find primary (largest) body for orbit/label filtering
    let largestIdx = 0;
    for (let i = 1; i < n && i < bodies.length; i++) {
      if (bodies[i].mass > bodies[largestIdx].mass) largestIdx = i;
    }

    if (featureFlags.orbitPaths) {
      this.drawOrbitPaths(orbitPaths, camera, W, H, bodies, n, selectedBodyIndex, attractors, largestIdx);
    }

    if (featureFlags.trails) {
      this.drawTrails(bodies, n, camera, W, H);
    }

    if (featureFlags.velocityArrows) {
      this.drawVelocityArrows(bodies, n, camera, W, H, dragState, selectedBodyIndex);
    }

    this.drawPlanetBodies(bodies, bodyStates, n, camera, W, H);
    this.drawCollisionPulses(bodies, n, camera, W, H, now);
    this.drawHoverRing(bodies, n, camera, W, H, hoveredIndex);
    this.drawDragVector(dragState, camera, W, H);
    this.drawGhostBody(ghostBody, camera, W, H);

    if (featureFlags.gasExchange) {
      this.drawGasExchange(bodies, n, camera, W, H);
    }

    if (featureFlags.labels) {
      this.drawLabels(bodies, bodyStates, n, camera, W, H, selectedBodyIndex);
    }

    if (featureFlags.lagrangePoints && lagrangePoints !== null) {
      this.drawLagrangePoints(lagrangePoints, featureFlags.lagrangeCount, camera, W, H);
    }

    this.drawBlackHoles(bodies, bodyStates, n, camera, W, H);

    // ── HUD ───────────────────────────────────────────────────────────────
    this.hudEl.innerHTML =
      `<span class="label">BODIES</span> ${n}` +
      `<br><span class="label">SPEED</span>  ${timeScale.toFixed(1)}×` +
      (paused ? '<br><span class="ksp-status">● PAUSED</span>' : '');
  }

  destroy(): void {
    this.uniformBuffer.destroy();
  }

  // ── Private drawing helpers ───────────────────────────────────────────────

  private drawStarfield(W: number, H: number): void {
    const c = this.ctx2d;
    for (const s of this.stars) {
      c.beginPath();
      c.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
      c.fillStyle = `rgba(255,255,255,${s.a})`;
      c.fill();
    }
  }

  private drawTrails(
    bodies: BodyData[],
    n: number,
    camera: Camera,
    W: number,
    H: number,
  ): void {
    const c = this.ctx2d;
    for (let i = 0; i < n && i < this.trails.length; i++) {
      const len = this.trailLen[i];
      if (len < 2) continue;

      const buf   = this.trails[i];
      const head  = this.trailHead[i];
      const color = trailColor(bodies[i].mass);

      c.beginPath();
      let first = true;
      for (let j = 0; j < len; j++) {
        // oldest point first: (head - len + j + TRAIL_BUFFER_LENGTH) % TRAIL_BUFFER_LENGTH
        const idx = (head - len + j + TRAIL_BUFFER_LENGTH) % TRAIL_BUFFER_LENGTH;
        const wx = buf[idx * 2];
        const wy = buf[idx * 2 + 1];
        const [sx, sy] = worldToScreen([wx, wy], camera, W, H);
        const alpha = (j / (len - 1)) * 0.7;
        if (first) {
          c.moveTo(sx, sy);
          first = false;
        } else {
          // Draw segment by segment so we can vary alpha
          c.strokeStyle = `rgba(${color},${alpha.toFixed(3)})`;
          c.lineWidth = 1.5;
          c.lineTo(sx, sy);
          c.stroke();
          c.beginPath();
          c.moveTo(sx, sy);
        }
      }
    }
  }

  private drawCollisionPulses(
    bodies: BodyData[],
    n: number,
    camera: Camera,
    W: number,
    H: number,
    now: number,
  ): void {
    const c = this.ctx2d;
    this.pulses = this.pulses.filter(pulse => {
      const progress = (now - pulse.startTime) / 500;
      if (progress >= 1) return false;
      const bi = pulse.idx;
      if (bi >= n || bi >= bodies.length) return false;

      const body = bodies[bi];
      const [sx, sy] = worldToScreen(body.pos, camera, W, H);
      const r = visRadius(body.mass, camera.scale) * (1 + progress * 2);
      const alpha = 1 - progress;

      c.beginPath();
      c.arc(sx, sy, r, 0, Math.PI * 2);
      c.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
      c.lineWidth = 1.5;
      c.stroke();
      return true;
    });
  }

  private drawHoverRing(
    bodies: BodyData[],
    n: number,
    camera: Camera,
    W: number,
    H: number,
    hoveredIndex: number,
  ): void {
    if (hoveredIndex < 0 || hoveredIndex >= n) return;
    const body = bodies[hoveredIndex];
    const [sx, sy] = worldToScreen(body.pos, camera, W, H);
    const r = visRadius(body.mass, camera.scale) * 1.3;
    const c = this.ctx2d;
    c.beginPath();
    c.arc(sx, sy, r, 0, Math.PI * 2);
    c.strokeStyle = 'rgba(255,255,255,0.6)';
    c.lineWidth = 1;
    c.stroke();
  }

  private drawDragVector(
    dragState: DragState,
    camera: Camera,
    W: number,
    H: number,
  ): void {
    if (!dragState.active) return;
    const hist = dragState.mouseHistory;
    if (hist.length < 2) return;

    // Velocity vector from history: diff between oldest and newest
    const oldest = hist[0];
    const newest  = hist[hist.length - 1];
    let vx = (newest[0] - oldest[0]) * 20;
    let vy = (newest[1] - oldest[1]) * 20;

    // Clamp to 200px
    const vLen = Math.sqrt(vx * vx + vy * vy);
    if (vLen > 200) { vx = (vx / vLen) * 200; vy = (vy / vLen) * 200; }
    if (vLen < 1) return;

    const [sx, sy] = worldToScreen(dragState.bodyWorldPos, camera, W, H);
    const ex = sx + vx;
    const ey = sy + vy;

    const c = this.ctx2d;
    c.save();
    c.setLineDash([5, 4]);
    c.strokeStyle = 'rgba(255,255,255,0.7)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(sx, sy);
    c.lineTo(ex, ey);
    c.stroke();

    // Arrowhead
    c.setLineDash([]);
    const angle = Math.atan2(ey - sy, ex - sx);
    const headLen = 8;
    c.beginPath();
    c.moveTo(ex, ey);
    c.lineTo(
      ex - headLen * Math.cos(angle - Math.PI / 6),
      ey - headLen * Math.sin(angle - Math.PI / 6),
    );
    c.moveTo(ex, ey);
    c.lineTo(
      ex - headLen * Math.cos(angle + Math.PI / 6),
      ey - headLen * Math.sin(angle + Math.PI / 6),
    );
    c.stroke();
    c.restore();
  }

  private drawGhostBody(
    ghostBody: BodyData | null,
    camera: Camera,
    W: number,
    H: number,
  ): void {
    if (!ghostBody) return;
    const [sx, sy] = worldToScreen(ghostBody.pos, camera, W, H);
    const r   = visRadius(ghostBody.mass, camera.scale);
    const glowR = r * 3;
    const c = this.ctx2d;

    c.save();
    c.globalAlpha = 0.4;

    // Glow gradient approximation
    const grad = c.createRadialGradient(sx, sy, 0, sx, sy, glowR);
    const color = trailColor(ghostBody.mass);
    grad.addColorStop(0,   `rgba(${color},1)`);
    grad.addColorStop(0.18,`rgba(${color},1)`);
    grad.addColorStop(1,   `rgba(${color},0)`);
    c.beginPath();
    c.arc(sx, sy, glowR, 0, Math.PI * 2);
    c.fillStyle = grad;
    c.fill();

    // Dashed outline at actual radius
    c.setLineDash([4, 4]);
    c.strokeStyle = `rgba(${color},0.8)`;
    c.lineWidth = 1;
    c.beginPath();
    c.arc(sx, sy, r, 0, Math.PI * 2);
    c.stroke();

    c.restore();
  }

  private drawVelocityArrows(
    bodies: BodyData[],
    n: number,
    camera: Camera,
    W: number,
    H: number,
    dragState: DragState,
    selectedBodyIndex: number,
  ): void {
    const c = this.ctx2d;
    const VEL_SCALE = 1;
    const VEL_MAX_PX = 80;
    const VEL_MIN_PX = 8;
    const HEAD_LEN = 7;

    for (let i = 0; i < n && i < bodies.length; i++) {
      if (dragState.active && dragState.bodyIndex === i) continue;
      if (selectedBodyIndex === i) continue;
      const body = bodies[i];
      const [vx, vy] = body.vel;
      const speed = Math.sqrt(vx * vx + vy * vy);
      if (speed < 0.1) continue;

      const [sx, sy] = worldToScreen(body.pos, camera, W, H);
      const rawLen = speed * camera.scale * VEL_SCALE;
      const pxLen = Math.max(VEL_MIN_PX, Math.min(rawLen, VEL_MAX_PX));
      const nx = vx / speed;
      const ny = vy / speed;
      const ex = sx + nx * pxLen;
      const ey = sy + ny * pxLen;

      const color = trailColor(body.mass);
      const angle = Math.atan2(ey - sy, ex - sx);

      c.save();
      c.strokeStyle = `rgba(${color},0.55)`;
      c.lineWidth = 1.5;

      c.beginPath();
      c.moveTo(sx, sy);
      c.lineTo(ex, ey);
      c.stroke();

      c.beginPath();
      c.moveTo(ex, ey);
      c.lineTo(ex - HEAD_LEN * Math.cos(angle - Math.PI / 6), ey - HEAD_LEN * Math.sin(angle - Math.PI / 6));
      c.moveTo(ex, ey);
      c.lineTo(ex - HEAD_LEN * Math.cos(angle + Math.PI / 6), ey - HEAD_LEN * Math.sin(angle + Math.PI / 6));
      c.stroke();

      c.restore();
    }
  }

  private drawOrbitPaths(
    paths: [number, number][][],
    camera: Camera,
    W: number,
    H: number,
    bodies: BodyData[],
    n: number,
    selectedIdx: number,
    attractors: number[],
    largestIdx: number,
  ): void {
    const c = this.ctx2d;
    for (let i = 0; i < paths.length && i < n; i++) {
      const path = paths[i];
      if (path.length < 2) continue;

      // Show orbit if: body orbits Sun (always), selected body, or moon of selected body
      const att = attractors[i] ?? -1;
      const showAlways = att === largestIdx && i !== largestIdx;
      const showSelected = i === selectedIdx;
      const showMoonOfSelected = selectedIdx >= 0 && att === selectedIdx;
      if (!showAlways && !showSelected && !showMoonOfSelected) continue;

      const color = trailColor(bodies[i]?.mass ?? 1);
      const isSelected = i === selectedIdx;

      c.save();
      c.setLineDash([4, 6]);
      // Selected orbit is brighter
      c.strokeStyle = isSelected
        ? `rgba(${color},0.55)`
        : `rgba(${color},0.22)`;
      c.lineWidth = isSelected ? 1.5 : 1;
      c.beginPath();
      for (let j = 0; j < path.length; j++) {
        const [wx, wy] = path[j];
        const [sx, sy] = worldToScreen([wx, wy], camera, W, H);
        if (j === 0) c.moveTo(sx, sy);
        else c.lineTo(sx, sy);
      }
      c.stroke();
      c.restore();

      // ── Apsis markers — only for selected body ─────────────────────────────
      if (!isSelected || path.length < 4) continue;

      // Find dominant attractor by locating body closest to orbit mean centre
      let sumX = 0, sumY = 0;
      for (const pt of path) { sumX += pt[0]; sumY += pt[1]; }
      const mX = sumX / path.length, mY = sumY / path.length;
      let attIdx = -1, minAttD = Infinity;
      for (let j = 0; j < n && j < bodies.length; j++) {
        if (j === i) continue;
        const dx = bodies[j].pos[0] - mX, dy = bodies[j].pos[1] - mY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < minAttD) { minAttD = d; attIdx = j; }
      }
      if (attIdx < 0) continue;
      const ap = bodies[attIdx].pos;

      let minD = Infinity, maxD = -Infinity;
      let periPt = path[0], apoPt = path[0];
      for (const pt of path) {
        const dx = pt[0] - ap[0], dy = pt[1] - ap[1];
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < minD) { minD = d; periPt = pt; }
        if (d > maxD) { maxD = d; apoPt = pt; }
      }

      // Only show when orbit is meaningfully eccentric (>2% variation)
      if (maxD / Math.max(minD, 1) < 1.02) continue;

      c.save();
      c.font = `bold 12px 'Geist Mono', monospace`;
      c.textBaseline = 'middle';
      c.shadowColor = 'rgba(0,0,0,0.9)';
      c.shadowBlur = 4;

      // Periapsis — orange
      const [psx, psy] = worldToScreen(periPt, camera, W, H);
      c.beginPath();
      c.arc(psx, psy, 3.5, 0, Math.PI * 2);
      c.fillStyle = '#FF8C00';
      c.fill();
      c.fillStyle = '#FF8C00';
      c.textAlign = 'left';
      c.fillText('Pe', psx + 6, psy);

      // Apoapsis — cyan
      const [asx, asy] = worldToScreen(apoPt, camera, W, H);
      c.beginPath();
      c.arc(asx, asy, 3.5, 0, Math.PI * 2);
      c.fillStyle = '#40A0FF';
      c.fill();
      c.fillStyle = '#40A0FF';
      c.fillText('Ap', asx + 6, asy);

      c.restore();
    }
  }

  private drawLabels(
    bodies: BodyData[],
    states: BodyState[],
    n: number,
    camera: Camera,
    W: number,
    H: number,
    selectedIdx: number,
  ): void {
    let largestIdx = 0;
    for (let i = 1; i < n && i < bodies.length; i++) {
      if (bodies[i].mass > bodies[largestIdx].mass) largestIdx = i;
    }

    const c = this.ctx2d;
    c.textAlign = 'center';
    c.textBaseline = 'bottom';

    for (let i = 0; i < n && i < bodies.length; i++) {
      const body = bodies[i];
      const state = states[i];
      if (!state) continue;
      const [sx, sy] = worldToScreen(body.pos, camera, W, H);
      const r = visRadius(body.mass, camera.scale);
      const labelY = sy - r - 4;

      const isSelected = i === selectedIdx;
      const isPrimary = i === largestIdx;

      c.save();
      c.shadowColor = 'rgba(0,0,0,0.9)';
      c.shadowBlur = 3;

      if (isSelected) {
        c.font = `bold 14px 'Geist Mono', monospace`;
        c.fillStyle = 'rgba(255,165,0,0.95)';
      } else if (isPrimary) {
        c.font = `bold 13px 'Geist Mono', monospace`;
        c.fillStyle = 'rgba(255,248,220,0.85)';
      } else if (body.mass > 1000) {
        c.font = `11px 'Geist Mono', monospace`;
        c.fillStyle = 'rgba(200,220,255,0.65)';
      } else {
        c.font = `10px 'Geist Mono', monospace`;
        c.fillStyle = 'rgba(180,185,195,0.50)';
      }

      c.fillText(state.name, sx, labelY);
      c.restore();
    }
  }

  private drawLagrangePoints(
    points: [number, number][],
    count: 0 | 2 | 5,
    camera: Camera,
    W: number,
    H: number,
  ): void {
    if (count === 0) return;
    const c = this.ctx2d;
    const labels = ['L1', 'L2', 'L3', 'L4', 'L5'];
    const startIdx = count === 2 ? 3 : 0;

    c.save();
    c.font = `bold 13px 'Geist Mono', monospace`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowColor = 'rgba(0,0,0,0.6)';
    c.shadowBlur = 3;

    for (let i = startIdx; i < points.length && i < 5; i++) {
      const pt = points[i];
      const [sx, sy] = worldToScreen(pt, camera, W, H);
      const s = 8;
      c.strokeStyle = 'rgba(80,230,130,0.75)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(sx - s, sy - s);
      c.lineTo(sx + s, sy + s);
      c.moveTo(sx + s, sy - s);
      c.lineTo(sx - s, sy + s);
      c.stroke();

      c.fillStyle = 'rgba(100,240,150,0.90)';
      c.fillText(labels[i], sx, sy - 14);
    }
    c.restore();
  }

  private _gasRng_next(): number {
    this._gasRng = lcg(this._gasRng);
    return (this._gasRng >>> 0) / 0x100000000;
  }

  private drawGasExchange(
    bodies: BodyData[],
    n: number,
    camera: Camera,
    W: number,
    H: number,
  ): void {
    const c = this.ctx2d;
    const MAX_PARTICLES = 200;
    const CLOSE_DIST = 120; // world units

    // Update existing particles
    for (const p of this._gasParticles) {
      p.x += p.vx;
      p.y += p.vy;
      p.life += 0.02;
    }

    // Remove dead particles
    this._gasParticles = this._gasParticles.filter(p => p.life < 1);

    // Spawn new particles for close pairs — planets only (skip moon-mass bodies)
    const GAS_MASS_THRESHOLD = 500;
    if (this._gasParticles.length < MAX_PARTICLES) {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const bi = bodies[i];
          const bj = bodies[j];
          if (bi.mass < GAS_MASS_THRESHOLD || bj.mass < GAS_MASS_THRESHOLD) continue;
          const dx = bj.pos[0] - bi.pos[0];
          const dy = bj.pos[1] - bi.pos[1];
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CLOSE_DIST && this._gasParticles.length < MAX_PARTICLES) {
            // Spawn up to 2 particles per pair per frame
            for (let k = 0; k < 2 && this._gasParticles.length < MAX_PARTICLES; k++) {
              // Spawn at source body
              const fromI = this._gasRng_next() < 0.5;
              const src = fromI ? bi : bj;
              const tgt = fromI ? bj : bi;
              const txd = tgt.pos[0] - src.pos[0];
              const tyd = tgt.pos[1] - src.pos[1];
              const tlen = Math.sqrt(txd * txd + tyd * tyd) || 1;
              const speed = 0.4 + this._gasRng_next() * 0.6;
              const randAngle = (this._gasRng_next() - 0.5) * 0.8;
              const cos = Math.cos(randAngle);
              const sin = Math.sin(randAngle);
              const bvx = txd / tlen;
              const bvy = tyd / tlen;
              const vx = (bvx * cos - bvy * sin) * speed;
              const vy = (bvx * sin + bvy * cos) * speed;
              const color = trailColor(src.mass);
              const spawnR = Math.max(3, Math.log10(Math.max(src.mass, 1)) * 3);
              this._gasParticles.push({
                x: src.pos[0] + (this._gasRng_next() - 0.5) * spawnR,
                y: src.pos[1] + (this._gasRng_next() - 0.5) * spawnR,
                vx,
                vy,
                life: 0,
                color,
              });
            }
          }
        }
      }
    }

    // Draw particles with soft glow
    for (const p of this._gasParticles) {
      const alpha = (1 - p.life) * 0.75;
      if (alpha <= 0) continue;
      const [sx, sy] = worldToScreen([p.x, p.y], camera, W, H);
      const pr = 3 * camera.scale + 1.5;
      const grad = c.createRadialGradient(sx, sy, 0, sx, sy, pr);
      grad.addColorStop(0,   `rgba(${p.color},${alpha.toFixed(3)})`);
      grad.addColorStop(1,   `rgba(${p.color},0)`);
      c.beginPath();
      c.arc(sx, sy, pr, 0, Math.PI * 2);
      c.fillStyle = grad;
      c.fill();
    }
  }

  private drawPlanetBodies(
    bodies: BodyData[],
    states: BodyState[],
    n: number,
    camera: Camera,
    W: number,
    H: number,
  ): void {
    const c = this.ctx2d;
    for (let i = 0; i < n && i < bodies.length; i++) {
      const body = bodies[i];
      const state = states[i];
      if (!state) continue;
      if (isBlackHole(body.mass, body.radius)) continue;

      const [sx, sy] = worldToScreen(body.pos, camera, W, H);
      const vr = visRadius(body.mass, camera.scale);

      // Atmospheric glow halo (temperature-based)
      const rgb = temperatureToColor(state.temperature);
      const haloGrad = c.createRadialGradient(sx, sy, vr * 0.85, sx, sy, vr * 2.8);
      haloGrad.addColorStop(0,   `rgba(${rgb},0.22)`);
      haloGrad.addColorStop(0.4, `rgba(${rgb},0.07)`);
      haloGrad.addColorStop(1,   `rgba(${rgb},0)`);
      c.beginPath();
      c.arc(sx, sy, vr * 2.8, 0, Math.PI * 2);
      c.fillStyle = haloGrad;
      c.fill();

      // Solid disc with radial lighting gradient
      const discColor = state.color || '160,162,165';
      const parts = discColor.split(',');
      const cr = parseInt(parts[0].trim());
      const cg = parseInt(parts[1].trim());
      const cb = parseInt(parts[2].trim());
      const hr = Math.min(255, cr + 40);
      const hg = Math.min(255, cg + 40);
      const hb = Math.min(255, cb + 40);

      const discGrad = c.createRadialGradient(sx - vr * 0.3, sy - vr * 0.3, 0, sx, sy, vr);
      discGrad.addColorStop(0, `rgb(${hr},${hg},${hb})`);
      discGrad.addColorStop(1, `rgb(${Math.max(0, cr - 20)},${Math.max(0, cg - 20)},${Math.max(0, cb - 20)})`);

      c.beginPath();
      c.arc(sx, sy, vr, 0, Math.PI * 2);
      c.fillStyle = discGrad;
      c.fill();

      // Gas giant horizontal bands (Jupiter-class and Saturn-class)
      if (body.mass > 25000 && body.mass < 500000) {
        c.save();
        c.beginPath();
        c.arc(sx, sy, vr, 0, Math.PI * 2);
        c.clip();

        const dk = (p: number) =>
          `rgba(${Math.max(0, cr - p)},${Math.max(0, cg - p)},${Math.max(0, cb - p)},0.22)`;
        const lt = (p: number) =>
          `rgba(${Math.min(255, cr + p)},${Math.min(255, cg + p)},${Math.min(255, cb + p)},0.18)`;

        const bands = [
          { yFrac: -0.55, hFrac: 0.18, col: dk(30) },
          { yFrac: -0.12, hFrac: 0.22, col: lt(25) },
          { yFrac:  0.22, hFrac: 0.18, col: dk(25) },
          { yFrac:  0.55, hFrac: 0.15, col: lt(20) },
        ];

        for (const band of bands) {
          c.fillStyle = band.col;
          c.fillRect(sx - vr, sy + band.yFrac * vr - (band.hFrac * vr) / 2, vr * 2, band.hFrac * vr);
        }

        c.restore();
      }
    }
  }

  private drawBlackHoles(
    bodies: BodyData[],
    states: BodyState[],
    n: number,
    camera: Camera,
    W: number,
    H: number,
  ): void {
    const c = this.ctx2d;
    for (let i = 0; i < n && i < bodies.length; i++) {
      const body = bodies[i];
      const state = states[i];
      if (!state) continue;
      if (!isBlackHole(body.mass, body.radius)) continue;

      const [sx, sy] = worldToScreen(body.pos, camera, W, H);
      const innerR = body.radius * camera.scale * 1.2;
      const outerR = innerR * 2.0;

      // Accretion ring gradient
      const grad = c.createRadialGradient(sx, sy, innerR * 1.3, sx, sy, outerR);
      grad.addColorStop(0,   'rgba(255,160,40,0.85)');
      grad.addColorStop(0.3, 'rgba(255,80,20,0.50)');
      grad.addColorStop(1,   'rgba(255,40,0,0.00)');

      c.beginPath();
      c.arc(sx, sy, outerR, 0, Math.PI * 2);
      c.fillStyle = grad;
      c.fill();

      // Black disk (covers WebGPU glow underneath)
      c.beginPath();
      c.arc(sx, sy, innerR, 0, Math.PI * 2);
      c.fillStyle = '#000000';
      c.fill();
    }
  }
}
