import { RENDER_STRIDE } from './utils/constants.js';
import { createStorageBuffer, createUniformBuffer, writeBuffer } from './utils/gpuBuffers.js';
import { Body, bodyTypeToU32 } from './BodySystem.js';
import { CameraSystem } from './CameraSystem.js';
import { hexToRGB } from './utils/math.js';
import { LagrangePoint } from './LagrangePointSystem.js';

import renderBodiesSrc from './shaders/renderBodies.wgsl?raw';

const CAMERA_UNIFORM_SIZE = 16; // 4 × f32

export class RenderEngine {
  device!:  GPUDevice;
  context!: GPUCanvasContext;   // public – needed for gravity field pass
  format!: GPUTextureFormat;

  private bodyRenderBuffer!: GPUBuffer;
  private cameraUniformBuffer!: GPUBuffer;
  private renderPipeline!: GPURenderPipeline;
  private renderBindGroup!: GPUBindGroup;

  private maxBodies: number;
  private currentN = 0;

  // The 2D overlay canvas for trails, labels, Lagrange markers
  overlayCanvas!: HTMLCanvasElement;
  overlayCtx!: CanvasRenderingContext2D;

  // Trail ring-buffer per body: [bodyIndex][trailLength] = [x, y]
  private trailPositions: Map<string, Float32Array> = new Map();
  private trailIndex:     Map<string, number>       = new Map();
  private readonly TRAIL_LEN = 300;
  private trailUpdateCounter = 0;

  constructor(maxBodies: number) {
    this.maxBodies = maxBodies;
  }

  async init(
    canvas: HTMLCanvasElement,
    overlayCanvas: HTMLCanvasElement,
    device: GPUDevice
  ): Promise<void> {
    this.device = device;
    this.overlayCanvas = overlayCanvas;
    this.overlayCtx    = overlayCanvas.getContext('2d')!;

    this.context = canvas.getContext('webgpu') as GPUCanvasContext;
    this.format  = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({ device, format: this.format, alphaMode: 'premultiplied' });

    this.cameraUniformBuffer = createUniformBuffer(device, CAMERA_UNIFORM_SIZE, 'camera');
    this.bodyRenderBuffer    = createStorageBuffer(
      device, this.maxBodies * RENDER_STRIDE, 'bodyRender'
    );

    await this._buildPipeline();
  }

  private async _buildPipeline(): Promise<void> {
    const device = this.device;
    const module = device.createShaderModule({ code: renderBodiesSrc, label: 'renderBodies' });

    this.renderPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex:   { module, entryPoint: 'vs_main' },
      fragment: {
        module,
        entryPoint: 'fs_main',
        targets: [{
          format: this.format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one',        dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-list' },
    });

    this._rebuildBindGroup();
  }

  private _rebuildBindGroup(): void {
    this.renderBindGroup = this.device.createBindGroup({
      layout: this.renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.cameraUniformBuffer } },
        { binding: 1, resource: { buffer: this.bodyRenderBuffer } },
      ],
    });
  }

  /** Pack body render data and upload to GPU. */
  uploadBodyRenderData(bodies: Body[]): void {
    const n = Math.min(bodies.length, this.maxBodies);
    this.currentN = n;

    const data = new ArrayBuffer(n * RENDER_STRIDE);
    const fView = new Float32Array(data);
    const uView = new Uint32Array(data);

    for (let i = 0; i < n; i++) {
      const b   = bodies[i];
      const off = i * 12;  // 48 bytes / 4 = 12 floats
      const [r, g, bl] = hexToRGB(b.color);
      fView[off + 0]  = b.position[0];
      fView[off + 1]  = b.position[1];
      fView[off + 2]  = b.velocity[0];
      fView[off + 3]  = b.velocity[1];
      fView[off + 4]  = r;
      fView[off + 5]  = g;
      fView[off + 6]  = bl;
      fView[off + 7]  = 1.0;
      fView[off + 8]  = b.radius;
      uView[off + 9]  = bodyTypeToU32(b.type);
      fView[off + 10] = 0;
      fView[off + 11] = 0;
    }

    writeBuffer(this.device, this.bodyRenderBuffer, new Uint8Array(data));
  }

  /** Update body render positions from CPU readback (called each frame after readback). */
  updatePositionsFromCPU(
    bodies: Body[],
    cpuPos: Float32Array,
    cpuVel: Float32Array
  ): void {
    const n = Math.min(bodies.length, this.maxBodies);
    if (n === 0) return;

    // We only update position+velocity floats (offsets 0-3 per body)
    const data = new ArrayBuffer(n * RENDER_STRIDE);
    const fView = new Float32Array(data);
    const uView = new Uint32Array(data);

    for (let i = 0; i < n; i++) {
      const b   = bodies[i];
      const off = i * 12;
      const [r, g, bl] = hexToRGB(b.color);
      fView[off + 0]  = cpuPos[i * 2];
      fView[off + 1]  = cpuPos[i * 2 + 1];
      fView[off + 2]  = cpuVel[i * 2];
      fView[off + 3]  = cpuVel[i * 2 + 1];
      fView[off + 4]  = r;
      fView[off + 5]  = g;
      fView[off + 6]  = bl;
      fView[off + 7]  = 1.0;
      fView[off + 8]  = b.radius;
      uView[off + 9]  = bodyTypeToU32(b.type);
      fView[off + 10] = 0;
      fView[off + 11] = 0;
    }

    writeBuffer(this.device, this.bodyRenderBuffer, new Uint8Array(data));
  }

  /** Main render call – draws background + bodies via WebGPU, then overlay via Canvas 2D. */
  render(
    camera: CameraSystem,
    bodies: Body[],
    cpuPos: Float32Array,
    showTrails: boolean,
    showLabels: boolean,
    lagrangePoints: LagrangePoint[],
    showLagrange: boolean
  ): void {
    if (this.currentN === 0) return;

    // Update camera uniform
    writeBuffer(this.device, this.cameraUniformBuffer, camera.getUniformData());

    // ---- WebGPU render pass ----
    const tex = this.context.getCurrentTexture();
    const enc = this.device.createCommandEncoder({ label: 'render' });

    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view:       tex.createView(),
        clearValue: { r: 0.04, g: 0.04, b: 0.07, a: 1 },
        loadOp:     'clear',
        storeOp:    'store',
      }],
    });

    pass.setPipeline(this.renderPipeline);
    pass.setBindGroup(0, this.renderBindGroup);
    // 6 vertices per instance (two triangles = one quad)
    pass.draw(6, this.currentN);
    pass.end();
    this.device.queue.submit([enc.finish()]);

    // ---- Canvas 2D overlay ----
    this._renderOverlay(camera, bodies, cpuPos, showTrails, showLabels, lagrangePoints, showLagrange);
  }

  private _renderOverlay(
    camera: CameraSystem,
    bodies: Body[],
    cpuPos: Float32Array,
    showTrails: boolean,
    showLabels: boolean,
    lagrangePoints: LagrangePoint[],
    showLagrange: boolean
  ): void {
    const ctx = this.overlayCtx;
    const W   = this.overlayCanvas.width;
    const H   = this.overlayCanvas.height;
    ctx.clearRect(0, 0, W, H);

    const n = Math.min(bodies.length, this.currentN);

    // Update trail ring buffers
    this.trailUpdateCounter++;
    const doTrailUpdate = this.trailUpdateCounter % 3 === 0;

    if (showTrails && doTrailUpdate) {
      for (let i = 0; i < n; i++) {
        const b  = bodies[i];
        const bx = cpuPos[i * 2];
        const by = cpuPos[i * 2 + 1];

        if (!this.trailPositions.has(b.id)) {
          this.trailPositions.set(b.id, new Float32Array(this.TRAIL_LEN * 2));
          this.trailIndex.set(b.id, 0);
        }
        const trail = this.trailPositions.get(b.id)!;
        const idx   = this.trailIndex.get(b.id)!;
        trail[idx * 2]     = bx;
        trail[idx * 2 + 1] = by;
        this.trailIndex.set(b.id, (idx + 1) % this.TRAIL_LEN);
      }
    }

    // Draw trails
    if (showTrails) {
      ctx.lineWidth = 1;
      for (let i = 0; i < n; i++) {
        const b = bodies[i];
        if (!this.trailPositions.has(b.id)) continue;
        const trail   = this.trailPositions.get(b.id)!;
        const startIdx = this.trailIndex.get(b.id)!;

        ctx.beginPath();
        let started = false;
        for (let k = 0; k < this.TRAIL_LEN; k++) {
          const ridx = (startIdx + k) % this.TRAIL_LEN;
          const wx = trail[ridx * 2];
          const wy = trail[ridx * 2 + 1];
          if (wx === 0 && wy === 0) continue;
          const [sx, sy] = camera.worldToScreen(wx, wy);
          const alpha = k / this.TRAIL_LEN * 0.7;
          if (!started) {
            ctx.moveTo(sx, sy);
            started = true;
          } else {
            ctx.lineTo(sx, sy);
          }
        }
        ctx.strokeStyle = b.color + '99';
        ctx.stroke();
      }
    }

    // Draw labels
    if (showLabels) {
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      for (let i = 0; i < n; i++) {
        const b = bodies[i];
        if (b.type === 'asteroid') continue; // skip asteroids
        const bx = cpuPos[i * 2];
        const by = cpuPos[i * 2 + 1];
        const [sx, sy] = camera.worldToScreen(bx, by);
        const sr = camera.worldToScreenSize(b.radius);
        ctx.fillStyle = '#c9d1d9';
        ctx.fillText(b.name, sx + sr + 4, sy - 4);
      }
    }

    // Draw Lagrange points
    if (showLagrange) {
      for (const lp of lagrangePoints) {
        const [sx, sy] = camera.worldToScreen(lp.position[0], lp.position[1]);
        const color =
          lp.stability === 'stable'      ? '#44ff88' :
          lp.stability === 'semi-stable' ? '#ffcc44' : '#ff4444';

        ctx.beginPath();
        ctx.arc(sx, sy, 5, 0, Math.PI * 2);
        ctx.fillStyle = color + '99';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.font = '10px monospace';
        ctx.fillStyle = color;
        ctx.fillText(lp.label, sx + 8, sy + 4);
      }
    }
  }

  resize(width: number, height: number): void {
    this.overlayCanvas.width  = width;
    this.overlayCanvas.height = height;
  }

  clearTrails(): void {
    this.trailPositions.clear();
    this.trailIndex.clear();
  }
}
