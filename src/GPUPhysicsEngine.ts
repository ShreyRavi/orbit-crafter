import {
  MAX_BODIES, WORKGROUP_SIZE,
  EPSILON_SQ, G as G_CONST,
  MODE_EXACT, MODE_BARNES_HUT, MODE_HYBRID,
} from './utils/constants.js';
import {
  createStorageBuffer, createUniformBuffer, createReadbackBuffer,
  writeBuffer, packPositions, packVelocities, packMasses,
} from './utils/gpuBuffers.js';
import { Body } from './BodySystem.js';
import { BarnesHutSystem } from './BarnesHutSystem.js';

// WGSL shader sources (imported as strings by vite-plugin-wgsl)
import nbodyShaderSrc      from './shaders/gravityCompute.wgsl?raw';
import integrateShaderSrc  from './shaders/integrateForces.wgsl?raw';

export type SimMode = typeof MODE_EXACT | typeof MODE_BARNES_HUT | typeof MODE_HYBRID;

// Uniform buffer layout: numBodies(u32), dt(f32), G(f32), softening2(f32) = 16 bytes
const UNIFORM_BYTES = 16;
// Hybrid mode switches to BH above this body count
const HYBRID_THRESHOLD = 5000;

export class GPUPhysicsEngine {
  device!: GPUDevice;
  adapter!: GPUAdapter;
  private initialized = false;

  // Ping-pong position & velocity buffers
  private posBuffers: [GPUBuffer, GPUBuffer] = [] as any;
  private velBuffers: [GPUBuffer, GPUBuffer] = [] as any;
  private massBuffer!: GPUBuffer;
  private forceBuffer!: GPUBuffer;   // external forces (BH / rocket)
  private uniformBuffer!: GPUBuffer;

  // Readback
  private readbackPosBuffer!: GPUBuffer;
  private readbackVelBuffer!: GPUBuffer;
  private pendingReadback = false;
  public cpuPositions!: Float32Array;
  public cpuVelocities!: Float32Array;

  // Pipelines
  private nbodyPipeline!: GPUComputePipeline;
  private integratePipeline!: GPUComputePipeline;

  // Bind groups (two sets for ping-pong, for nbody)
  private nbodyBindGroups: [GPUBindGroup, GPUBindGroup] = [] as any;
  // Bind groups for integrate-only (BH mode)
  private integrateBindGroups: [GPUBindGroup, GPUBindGroup] = [] as any;

  private pingPong = 0;   // 0 or 1
  private currentN = 0;
  private dt = 0.05;
  private G  = G_CONST;

  // Barnes-Hut helper
  private bh = new BarnesHutSystem();
  private bhFlatBuffer!: GPUBuffer;

  // BH mode: flat tree GPU buffer (resized as needed)
  private bhNodeBuffer!: GPUBuffer;
  private bhNodeBufferSize = 0;

  get isReady(): boolean { return this.initialized; }

  async init(): Promise<boolean> {
    if (!navigator.gpu) return false;

    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return false;
    this.adapter = adapter;

    this.device = await adapter.requestDevice({
      label: 'OrbitCraft GPU',
    });
    this.device.lost.then(info => {
      console.error('WebGPU device lost:', info.message);
    });

    const byteSize = (n: number) => n * 8; // vec2<f32>
    const massByteSize = (n: number) => n * 4;

    // Allocate buffers at MAX_BODIES capacity
    const maxPos  = byteSize(MAX_BODIES);
    const maxMass = massByteSize(MAX_BODIES);
    const maxForce = byteSize(MAX_BODIES);

    this.posBuffers = [
      createStorageBuffer(this.device, maxPos, 'posA', true),
      createStorageBuffer(this.device, maxPos, 'posB', true),
    ];
    this.velBuffers = [
      createStorageBuffer(this.device, maxPos, 'velA', true),
      createStorageBuffer(this.device, maxPos, 'velB', true),
    ];
    this.massBuffer   = createStorageBuffer(this.device, maxMass,  'masses');
    this.forceBuffer  = createStorageBuffer(this.device, maxForce, 'forces');
    this.uniformBuffer = createUniformBuffer(this.device, UNIFORM_BYTES, 'simParams');

    this.readbackPosBuffer = createReadbackBuffer(this.device, maxPos, 'readPos');
    this.readbackVelBuffer = createReadbackBuffer(this.device, maxPos, 'readVel');

    this.cpuPositions  = new Float32Array(MAX_BODIES * 2);
    this.cpuVelocities = new Float32Array(MAX_BODIES * 2);

    // Allocate initial BH node buffer (will resize as needed)
    this.bhNodeBufferSize = 256 * 32;
    this.bhNodeBuffer = createStorageBuffer(this.device, this.bhNodeBufferSize, 'bhNodes');

    await this._buildPipelines();
    this.initialized = true;
    return true;
  }

  private async _buildPipelines(): Promise<void> {
    const device = this.device;

    // --- N-body exact pipeline ---
    const nbodyModule = device.createShaderModule({ code: nbodyShaderSrc, label: 'nbody' });
    this.nbodyPipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: nbodyModule, entryPoint: 'nbodyStep' },
    });

    // --- Integration-only pipeline (for BH mode) ---
    const intModule = device.createShaderModule({ code: integrateShaderSrc, label: 'integrate' });
    this.integratePipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: intModule, entryPoint: 'integrateForces' },
    });
  }

  /** Upload all body data to GPU and create bind groups. */
  uploadBodies(bodies: Body[]): void {
    const n = Math.min(bodies.length, MAX_BODIES);
    this.currentN = n;

    const pos  = new Float32Array(n * 2);
    const vel  = new Float32Array(n * 2);
    const mass = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 2]     = bodies[i].position[0];
      pos[i * 2 + 1] = bodies[i].position[1];
      vel[i * 2]     = bodies[i].velocity[0];
      vel[i * 2 + 1] = bodies[i].velocity[1];
      mass[i]        = bodies[i].mass;
    }

    writeBuffer(this.device, this.posBuffers[0], pos);
    writeBuffer(this.device, this.velBuffers[0], vel);
    writeBuffer(this.device, this.massBuffer,    mass);
    this.pingPong = 0;

    this._rebuildBindGroups();
  }

  private _rebuildBindGroups(): void {
    // N-body bind groups (ping-pong A→B and B→A)
    for (let p = 0; p < 2; p++) {
      const src = p;
      const dst = 1 - p;
      this.nbodyBindGroups[p] = this.device.createBindGroup({
        layout: this.nbodyPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: { buffer: this.posBuffers[src] } },
          { binding: 2, resource: { buffer: this.velBuffers[src] } },
          { binding: 3, resource: { buffer: this.massBuffer } },
          { binding: 4, resource: { buffer: this.posBuffers[dst] } },
          { binding: 5, resource: { buffer: this.velBuffers[dst] } },
        ],
        label: `nbodyBG_${p}`,
      });
    }

    // Integrate bind groups (ping-pong + external forces)
    for (let p = 0; p < 2; p++) {
      const src = p;
      const dst = 1 - p;
      this.integrateBindGroups[p] = this.device.createBindGroup({
        layout: this.integratePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: { buffer: this.posBuffers[src] } },
          { binding: 2, resource: { buffer: this.velBuffers[src] } },
          { binding: 3, resource: { buffer: this.massBuffer } },
          { binding: 4, resource: { buffer: this.forceBuffer } },
          { binding: 5, resource: { buffer: this.posBuffers[dst] } },
          { binding: 6, resource: { buffer: this.velBuffers[dst] } },
        ],
        label: `integrateBG_${p}`,
      });
    }
  }

  setDt(dt: number): void { this.dt = dt; }

  private _writeUniform(n: number): void {
    const data = new ArrayBuffer(UNIFORM_BYTES);
    const view = new DataView(data);
    view.setUint32(0, n, true);
    view.setFloat32(4, this.dt, true);
    view.setFloat32(8, this.G, true);
    view.setFloat32(12, EPSILON_SQ, true);
    writeBuffer(this.device, this.uniformBuffer, new Uint8Array(data));
  }

  /** Perform one physics sub-step in exact GPU mode. */
  stepExact(): void {
    if (!this.initialized || this.currentN === 0) return;
    this._writeUniform(this.currentN);

    const enc = this.device.createCommandEncoder({ label: 'nbody-step' });
    const pass = enc.beginComputePass();
    pass.setPipeline(this.nbodyPipeline);
    pass.setBindGroup(0, this.nbodyBindGroups[this.pingPong]);
    const wgCount = Math.ceil(this.currentN / WORKGROUP_SIZE);
    pass.dispatchWorkgroups(wgCount);
    pass.end();
    this.device.queue.submit([enc.finish()]);

    this.pingPong = 1 - this.pingPong;
  }

  /** Perform one physics sub-step using CPU-computed forces (BH / hybrid). */
  stepWithForces(forces: Float32Array): void {
    if (!this.initialized || this.currentN === 0) return;
    this._writeUniform(this.currentN);

    // Upload forces
    writeBuffer(this.device, this.forceBuffer, forces.subarray(0, this.currentN * 2));

    const enc = this.device.createCommandEncoder({ label: 'integrate-step' });
    const pass = enc.beginComputePass();
    pass.setPipeline(this.integratePipeline);
    pass.setBindGroup(0, this.integrateBindGroups[this.pingPong]);
    const wgCount = Math.ceil(this.currentN / WORKGROUP_SIZE);
    pass.dispatchWorkgroups(wgCount);
    pass.end();
    this.device.queue.submit([enc.finish()]);

    this.pingPong = 1 - this.pingPong;
  }

  /** Add extra forces to the force buffer (e.g. rocket thrust). Used after BH forces are loaded. */
  addForcesAndStep(baseForcesOrNull: Float32Array | null, extraForces: Float32Array): void {
    const n = this.currentN;
    let combined: Float32Array;
    if (baseForcesOrNull) {
      combined = new Float32Array(n * 2);
      for (let i = 0; i < n * 2; i++) {
        combined[i] = baseForcesOrNull[i] + extraForces[i];
      }
    } else {
      combined = extraForces;
    }
    this.stepWithForces(combined);
  }

  /** Trigger async GPU → CPU readback of positions and velocities. */
  scheduleReadback(): void {
    if (this.pendingReadback) return;
    this.pendingReadback = true;

    const n = this.currentN;
    const byteLen = n * 8;

    const enc = this.device.createCommandEncoder({ label: 'readback' });
    const curPos = this.posBuffers[this.pingPong];
    const curVel = this.velBuffers[this.pingPong];
    enc.copyBufferToBuffer(curPos, 0, this.readbackPosBuffer, 0, byteLen);
    enc.copyBufferToBuffer(curVel, 0, this.readbackVelBuffer, 0, byteLen);
    this.device.queue.submit([enc.finish()]);

    Promise.all([
      this.readbackPosBuffer.mapAsync(GPUMapMode.READ, 0, byteLen),
      this.readbackVelBuffer.mapAsync(GPUMapMode.READ, 0, byteLen),
    ]).then(() => {
      this.cpuPositions.set(new Float32Array(this.readbackPosBuffer.getMappedRange(0, byteLen)));
      this.cpuVelocities.set(new Float32Array(this.readbackVelBuffer.getMappedRange(0, byteLen)));
      this.readbackPosBuffer.unmap();
      this.readbackVelBuffer.unmap();
      this.pendingReadback = false;
    }).catch(() => { this.pendingReadback = false; });
  }

  /** Current active position buffer (for rendering). */
  get currentPosBuffer(): GPUBuffer {
    return this.posBuffers[this.pingPong];
  }

  /** Current active velocity buffer. */
  get currentVelBuffer(): GPUBuffer {
    return this.velBuffers[this.pingPong];
  }

  get bodyCount(): number { return this.currentN; }

  /** Force an immediate sync (copy GPU → CPU, then readback). Expensive – use sparingly. */
  async syncReadbackNow(): Promise<void> {
    if (!this.initialized || this.currentN === 0) return;
    const n = this.currentN;
    const byteLen = n * 8;
    await this.device.queue.onSubmittedWorkDone();
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(this.posBuffers[this.pingPong], 0, this.readbackPosBuffer, 0, byteLen);
    enc.copyBufferToBuffer(this.velBuffers[this.pingPong], 0, this.readbackVelBuffer, 0, byteLen);
    this.device.queue.submit([enc.finish()]);
    await Promise.all([
      this.readbackPosBuffer.mapAsync(GPUMapMode.READ, 0, byteLen),
      this.readbackVelBuffer.mapAsync(GPUMapMode.READ, 0, byteLen),
    ]);
    this.cpuPositions.set(new Float32Array(this.readbackPosBuffer.getMappedRange(0, byteLen)));
    this.cpuVelocities.set(new Float32Array(this.readbackVelBuffer.getMappedRange(0, byteLen)));
    this.readbackPosBuffer.unmap();
    this.readbackVelBuffer.unmap();
  }

  /** Update position/velocity of a single body in the GPU buffer (for editing). */
  patchBody(index: number, pos: [number, number], vel: [number, number]): void {
    const posData = new Float32Array([pos[0], pos[1]]);
    const velData = new Float32Array([vel[0], vel[1]]);
    this.device.queue.writeBuffer(this.posBuffers[this.pingPong], index * 8, posData);
    this.device.queue.writeBuffer(this.velBuffers[this.pingPong], index * 8, velData);
  }

  /** Update mass of a single body in the GPU mass buffer. */
  patchMass(index: number, mass: number): void {
    const massData = new Float32Array([mass]);
    this.device.queue.writeBuffer(this.massBuffer, index * 4, massData);
  }
}
