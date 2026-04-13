// Helpers for creating and updating WebGPU buffers

/** Create a storage buffer (optionally with COPY_SRC for readback). */
export function createStorageBuffer(
  device: GPUDevice,
  byteSize: number,
  label?: string,
  copySource = false
): GPUBuffer {
  const usage =
    GPUBufferUsage.STORAGE |
    GPUBufferUsage.COPY_DST |
    (copySource ? GPUBufferUsage.COPY_SRC : 0);
  return device.createBuffer({ size: byteSize, usage, label });
}

/** Create a uniform buffer. */
export function createUniformBuffer(
  device: GPUDevice,
  byteSize: number,
  label?: string
): GPUBuffer {
  return device.createBuffer({
    size: byteSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label,
  });
}

/** Create a MAP_READ buffer for GPU → CPU readback. */
export function createReadbackBuffer(
  device: GPUDevice,
  byteSize: number,
  label?: string
): GPUBuffer {
  return device.createBuffer({
    size: byteSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    label,
  });
}

/** Write a typed array into a buffer, offsetting by byteOffset. */
export function writeBuffer(
  device: GPUDevice,
  buffer: GPUBuffer,
  data: Float32Array | Uint8Array | Uint32Array | Int32Array | Float64Array,
  byteOffset = 0
): void {
  device.queue.writeBuffer(buffer, byteOffset, data as unknown as GPUAllowSharedBufferSource);
}

/** Align size to the next multiple of alignment. */
export function alignTo(size: number, alignment: number): number {
  return Math.ceil(size / alignment) * alignment;
}

/** Build a Float32Array from body positions for upload. */
export function packPositions(
  positions: [number, number][],
  maxN: number
): Float32Array {
  const arr = new Float32Array(maxN * 2);
  for (let i = 0; i < positions.length; i++) {
    arr[i * 2]     = positions[i][0];
    arr[i * 2 + 1] = positions[i][1];
  }
  return arr;
}

/** Build a Float32Array from body velocities for upload. */
export function packVelocities(
  velocities: [number, number][],
  maxN: number
): Float32Array {
  const arr = new Float32Array(maxN * 2);
  for (let i = 0; i < velocities.length; i++) {
    arr[i * 2]     = velocities[i][0];
    arr[i * 2 + 1] = velocities[i][1];
  }
  return arr;
}

/** Build a Float32Array from body masses for upload. */
export function packMasses(masses: number[], maxN: number): Float32Array {
  const arr = new Float32Array(maxN);
  for (let i = 0; i < masses.length; i++) arr[i] = masses[i];
  return arr;
}
