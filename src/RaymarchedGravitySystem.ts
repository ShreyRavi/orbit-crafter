import { createStorageBuffer, createUniformBuffer, writeBuffer } from './utils/gpuBuffers.js';
import { Body } from './BodySystem.js';
import { CameraSystem } from './CameraSystem.js';
import { EPSILON_SQ, G as G_CONST } from './utils/constants.js';

import raymarchSrc from './shaders/raymarchGravity.wgsl?raw';

// Camera uniform: 4 × f32 = 16 bytes
// FieldParams: numBodies(u32), G(f32), softening2(f32), intensity(f32) = 16 bytes
// BodyFieldData: posX(f32), posY(f32), mass(f32), pad(f32) = 16 bytes per body

const BODY_FIELD_STRIDE = 16;
const MAX_FIELD_BODIES  = 256; // limit for performance

export class RaymarchedGravitySystem {
  private device!: GPUDevice;
  private pipeline!: GPURenderPipeline;
  private cameraBuffer!: GPUBuffer;
  private fieldParamsBuffer!: GPUBuffer;
  private bodiesBuffer!: GPUBuffer;
  private bindGroup!: GPUBindGroup;
  private format!: GPUTextureFormat;

  async init(device: GPUDevice, format: GPUTextureFormat): Promise<void> {
    this.device = device;
    this.format = format;

    this.cameraBuffer      = createUniformBuffer(device, 16,  'fieldCamera');
    this.fieldParamsBuffer = createUniformBuffer(device, 16,  'fieldParams');
    this.bodiesBuffer      = createStorageBuffer(device, MAX_FIELD_BODIES * BODY_FIELD_STRIDE, 'fieldBodies');

    await this._buildPipeline();
  }

  private async _buildPipeline(): Promise<void> {
    const module = this.device.createShaderModule({ code: raymarchSrc, label: 'raymarch' });

    this.pipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex:   { module, entryPoint: 'vs_main' },
      fragment: {
        module,
        entryPoint: 'fs_main',
        targets: [{
          format: this.format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one',        dstFactor: 'one', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  private _rebuildBindGroup(): void {
    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.cameraBuffer } },
        { binding: 1, resource: { buffer: this.fieldParamsBuffer } },
        { binding: 2, resource: { buffer: this.bodiesBuffer } },
      ],
    });
  }

  /** Render the gravity field overlay into an already-open render pass. */
  render(
    cmdEncoder: GPUCommandEncoder,
    targetView: GPUTextureView,
    camera: CameraSystem,
    bodies: Body[],
    intensity = 1.0
  ): void {
    // Use a subset of bodies (most massive first) for performance
    const relevant = [...bodies]
      .filter(b => b.type !== 'asteroid')
      .sort((a, b) => b.mass - a.mass)
      .slice(0, MAX_FIELD_BODIES);
    const n = relevant.length;
    if (n === 0) return;

    // Upload camera
    writeBuffer(this.device, this.cameraBuffer, camera.getUniformData());

    // Upload field params
    const fp = new ArrayBuffer(16);
    const fpv = new DataView(fp);
    fpv.setUint32(0, n, true);
    fpv.setFloat32(4, G_CONST, true);
    fpv.setFloat32(8, EPSILON_SQ, true);
    fpv.setFloat32(12, intensity, true);
    writeBuffer(this.device, this.fieldParamsBuffer, new Uint8Array(fp));

    // Upload body field data
    const bData = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      bData[i * 4 + 0] = relevant[i].position[0];
      bData[i * 4 + 1] = relevant[i].position[1];
      bData[i * 4 + 2] = relevant[i].mass;
      bData[i * 4 + 3] = 0;
    }
    writeBuffer(this.device, this.bodiesBuffer, bData);
    this._rebuildBindGroup();

    const pass = cmdEncoder.beginRenderPass({
      colorAttachments: [{
        view:    targetView,
        loadOp:  'load',
        storeOp: 'store',
      }],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3); // fullscreen triangle
    pass.end();
  }
}
