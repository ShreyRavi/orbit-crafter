import type { BodyData } from "./constants";
import {
  G,
  DT,
  SUBSTEP_COUNT,
  MAX_BODIES,
  BODY_STRIDE,
  SOFTENING_EPSILON,
  COLLISION_OVERLAP,
} from "./constants";

// ---------------------------------------------------------------------------
// WGSL compute shader — staggered leapfrog (drift-kick style)
// Velocities are stored at half-integer steps; positions at integer steps.
// ---------------------------------------------------------------------------
const COMPUTE_SHADER = /* wgsl */ `
struct Body {
  pos    : vec2f,
  vel    : vec2f,
  mass   : f32,
  radius : f32,
  _pad   : vec2f,
}

struct Params {
  n   : u32,
  dt  : f32,
  G   : f32,
  _pad : f32,
}

@group(0) @binding(0) var<storage, read>       bodyIn  : array<Body>;
@group(0) @binding(1) var<storage, read_write> bodyOut : array<Body>;
@group(0) @binding(2) var<uniform>             params  : Params;

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let i = gid.x;
  if (i >= params.n) { return; }

  var b = bodyIn[i];
  var acc = vec2f(0.0);

  for (var j : u32 = 0u; j < params.n; j++) {
    if (j == i) { continue; }
    let r  = bodyIn[j].pos - b.pos;
    let r2 = dot(r, r) + ${SOFTENING_EPSILON * SOFTENING_EPSILON};
    let dist_sq = dot(r, r);
    let dist = sqrt(dist_sq);
    let aMag = params.G * bodyIn[j].mass / r2;
    let closeThresh = (b.radius + bodyIn[j].radius) * 3.0;
    let tidalFactor = select(1.0, 1.0 + 0.3 * (1.0 - dist / max(closeThresh, 0.001)), dist < closeThresh);
    acc += r * ((aMag / sqrt(r2)) * tidalFactor);
  }

  b.vel += acc * params.dt;
  b.pos += b.vel * params.dt;
  bodyOut[i] = b;
}
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Write a single BodyData into a DataView at the given byte offset. */
function writeBody(view: DataView, byteOffset: number, b: BodyData): void {
  view.setFloat32(byteOffset + 0,  b.pos[0],  true);
  view.setFloat32(byteOffset + 4,  b.pos[1],  true);
  view.setFloat32(byteOffset + 8,  b.vel[0],  true);
  view.setFloat32(byteOffset + 12, b.vel[1],  true);
  view.setFloat32(byteOffset + 16, b.mass,    true);
  view.setFloat32(byteOffset + 20, b.radius,  true);
  view.setFloat32(byteOffset + 24, 0,         true); // _pad0
  view.setFloat32(byteOffset + 28, 0,         true); // _pad1
}

/** Read a single BodyData from a DataView at the given byte offset. */
function readBody(view: DataView, byteOffset: number): BodyData {
  return {
    pos:    [view.getFloat32(byteOffset + 0,  true), view.getFloat32(byteOffset + 4,  true)],
    vel:    [view.getFloat32(byteOffset + 8,  true), view.getFloat32(byteOffset + 12, true)],
    mass:   view.getFloat32(byteOffset + 16, true),
    radius: view.getFloat32(byteOffset + 20, true),
  };
}

/**
 * Compute net acceleration on body `i` from all other bodies (CPU, O(N²)).
 * Uses the same softening as the GPU shader.
 */
function cpuAcceleration(bodies: BodyData[], i: number): [number, number] {
  let ax = 0;
  let ay = 0;
  const bi = bodies[i];
  for (let j = 0; j < bodies.length; j++) {
    if (j === i) continue;
    const bj = bodies[j];
    const dx = bj.pos[0] - bi.pos[0];
    const dy = bj.pos[1] - bi.pos[1];
    const r2 = dx * dx + dy * dy + SOFTENING_EPSILON * SOFTENING_EPSILON;
    const aMag = (G * bj.mass) / r2;
    const r = Math.sqrt(r2);
    ax += (aMag * dx) / r;
    ay += (aMag * dy) / r;
  }
  return [ax, ay];
}

// ---------------------------------------------------------------------------
// PhysicsEngine
// ---------------------------------------------------------------------------

export class PhysicsEngine {
  /** CPU mirror of body state (1-frame lag is acceptable). */
  cpuBodies: BodyData[] = [];

  /** Current body count. */
  N: number = 0;

  /** Fires when two bodies overlap. Set by main.ts. */
  onMerge: (i: number, j: number) => void = () => {};

  // -- WebGPU objects --------------------------------------------------------
  private device: GPUDevice;
  private pipeline!: GPUComputePipeline;
  private bindGroupLayout!: GPUBindGroupLayout;

  /** Ping-pong body buffers. */
  private bufA!: GPUBuffer;
  private bufB!: GPUBuffer;

  /** Bind groups: bgAtoB reads A → writes B; bgBtoA reads B → writes A. */
  private bgAtoB!: GPUBindGroup;
  private bgBtoA!: GPUBindGroup;

  /** Params uniform buffer (16 bytes). */
  private paramsBuffer!: GPUBuffer;

  /** Staging buffer for CPU readback. */
  private stagingBuffer!: GPUBuffer;

  /**
   * 0 = current source is A, output goes to B.
   * 1 = current source is B, output goes to A.
   */
  private pingIndex: number = 0;

  /** True while a mapAsync is in-flight. */
  private mapPending: boolean = false;

  /** Incremented by init/setBodies; lets mapAsync callbacks detect stale reads. */
  private generation: number = 0;

  // -------------------------------------------------------------------------

  constructor(device: GPUDevice) {
    this.device = device;
    this._buildPipeline();
  }

  // -- Public API ------------------------------------------------------------

  /**
   * Load initial bodies.  Backs velocities off by half a substep so the first
   * leapfrog step is correctly offset (prevents energy drift on startup).
   */
  init(bodies: BodyData[]): void {
    if (bodies.length > MAX_BODIES) {
      throw new Error(`Too many bodies: ${bodies.length} > MAX_BODIES (${MAX_BODIES})`);
    }

    // Deep-copy so we don't mutate the caller's array.
    const adjusted: BodyData[] = bodies.map((b) => ({
      pos:    [b.pos[0],  b.pos[1]]  as [number, number],
      vel:    [b.vel[0],  b.vel[1]]  as [number, number],
      mass:   b.mass,
      radius: b.radius,
    }));

    // Half-step velocity back-initialisation.
    const dtSub = DT / SUBSTEP_COUNT;
    const halfDt = dtSub * 0.5;
    for (let i = 0; i < adjusted.length; i++) {
      const [ax, ay] = cpuAcceleration(adjusted, i);
      adjusted[i].vel[0] -= ax * halfDt;
      adjusted[i].vel[1] -= ay * halfDt;
    }

    this.N = adjusted.length;
    this.cpuBodies = adjusted;
    this.pingIndex = 0;
    this.generation++;
    this._uploadBothBuffers(adjusted);
  }

  /**
   * Run SUBSTEP_COUNT compute dispatches for a single frame.
   * Returns the last written GPU buffer (ready for use as vertex/copy source).
   */
  tick(dt: number): GPUBuffer {
    const dtSub = dt / SUBSTEP_COUNT;
    const encoder = this.device.createCommandEncoder();

    for (let s = 0; s < SUBSTEP_COUNT; s++) {
      // Update params uniform for this substep.
      const paramData = new ArrayBuffer(16);
      const paramView = new DataView(paramData);
      paramView.setUint32(0,  this.N,   true);
      paramView.setFloat32(4, dtSub,    true);
      paramView.setFloat32(8, G,        true);
      paramView.setFloat32(12, 0,       true); // _pad
      this.device.queue.writeBuffer(this.paramsBuffer, 0, paramData);

      const pass = encoder.beginComputePass();
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.pingIndex === 0 ? this.bgAtoB : this.bgBtoA);
      pass.dispatchWorkgroups(Math.max(this.N, 1), 1, 1);
      pass.end();

      this.pingIndex ^= 1; // swap
    }

    this.device.queue.submit([encoder.finish()]);

    // After SUBSTEP_COUNT swaps the output buffer is:
    //   even SUBSTEP_COUNT → same parity as start → bufB (if we started at 0→B)
    // More precisely: pingIndex after all swaps tells us which buffer is the SOURCE
    // for the NEXT tick, so the last WRITTEN buffer is the one that was output last.
    //
    // After one swap pingIndex = 1 → source is now B → last write was to B.
    // After two swaps pingIndex = 0 → source is now A → last write was to A.
    // In general: last written = (pingIndex === 0) ? bufA : bufB
    //   because pingIndex was flipped past the last write.
    return this.pingIndex === 0 ? this.bufA : this.bufB;
  }

  /**
   * Schedule an async CPU readback of the current output buffer.
   * Skipped (no-op) if a readback is already in-flight.
   * After reading, runs collision detection and calls onMerge for overlapping pairs.
   */
  scheduleCpuRead(callback: (bodies: BodyData[]) => void): void {
    if (this.mapPending) return;

    // The last written buffer is the same as tick()'s return value.
    const srcBuffer = this.pingIndex === 0 ? this.bufA : this.bufB;
    const byteLen = this.N * BODY_STRIDE;
    if (byteLen === 0) return;

    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(srcBuffer, 0, this.stagingBuffer, 0, byteLen);
    this.device.queue.submit([encoder.finish()]);

    this.mapPending = true;
    const n = this.N;
    const gen = this.generation;

    this.stagingBuffer.mapAsync(GPUMapMode.READ, 0, byteLen).then(() => {
      const mapped = this.stagingBuffer.getMappedRange(0, byteLen);
      const view   = new DataView(mapped);
      const bodies: BodyData[] = [];
      for (let i = 0; i < n; i++) {
        bodies.push(readBody(view, i * BODY_STRIDE));
      }
      this.stagingBuffer.unmap();
      this.mapPending = false;

      // Discard if init/setBodies ran while this read was in-flight.
      if (gen !== this.generation) return;

      this.cpuBodies = bodies;
      callback(bodies);
      this._checkCollisions(bodies);
    }).catch(() => {
      this.mapPending = false;
    });
  }

  /**
   * Write a new body array to BOTH GPU buffers and reset pingIndex.
   * Use after add / remove / reset operations.
   */
  setBodies(bodies: BodyData[]): void {
    if (bodies.length > MAX_BODIES) {
      throw new Error(`Too many bodies: ${bodies.length} > MAX_BODIES (${MAX_BODIES})`);
    }
    this.N = bodies.length;
    this.cpuBodies = bodies.map((b) => ({ ...b, pos: [...b.pos] as [number, number], vel: [...b.vel] as [number, number] }));
    this.pingIndex = 0;
    this.generation++;
    this._uploadBothBuffers(bodies);
  }

  destroy(): void {
    this.bufA.destroy();
    this.bufB.destroy();
    this.paramsBuffer.destroy();
    this.stagingBuffer.destroy();
  }

  // -- Private helpers -------------------------------------------------------

  private _buildPipeline(): void {
    const device = this.device;
    const bufferSize = MAX_BODIES * BODY_STRIDE;

    // Body buffers (ping-pong)
    const bufUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
    this.bufA = device.createBuffer({ size: bufferSize, usage: bufUsage });
    this.bufB = device.createBuffer({ size: bufferSize, usage: bufUsage });

    // Params uniform buffer
    this.paramsBuffer = device.createBuffer({
      size:  16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Staging buffer for CPU readback
    this.stagingBuffer = device.createBuffer({
      size:  bufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    // Shader module
    const shaderModule = device.createShaderModule({ code: COMPUTE_SHADER });

    // Bind group layout
    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage"           } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform"            } },
      ],
    });

    // Pipeline
    this.pipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
      compute: { module: shaderModule, entryPoint: "main" },
    });

    // Bind groups
    this.bgAtoB = this._makeBindGroup(this.bufA, this.bufB);
    this.bgBtoA = this._makeBindGroup(this.bufB, this.bufA);
  }

  private _makeBindGroup(src: GPUBuffer, dst: GPUBuffer): GPUBindGroup {
    return this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: src               } },
        { binding: 1, resource: { buffer: dst               } },
        { binding: 2, resource: { buffer: this.paramsBuffer } },
      ],
    });
  }

  private _uploadBothBuffers(bodies: BodyData[]): void {
    const arrayBuf = new ArrayBuffer(MAX_BODIES * BODY_STRIDE);
    const view     = new DataView(arrayBuf);
    for (let i = 0; i < bodies.length; i++) {
      writeBody(view, i * BODY_STRIDE, bodies[i]);
    }
    this.device.queue.writeBuffer(this.bufA, 0, arrayBuf);
    this.device.queue.writeBuffer(this.bufB, 0, arrayBuf);
  }

  private _checkCollisions(bodies: BodyData[]): void {
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const bi = bodies[i];
        const bj = bodies[j];
        const dx   = bj.pos[0] - bi.pos[0];
        const dy   = bj.pos[1] - bi.pos[1];
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < (bi.radius + bj.radius) * COLLISION_OVERLAP) {
          this.onMerge(i, j);
          // One merge per readback frame — indices invalidated after merge, stop.
          return;
        }
      }
    }
  }
}
