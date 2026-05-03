import type { BodyData, Camera } from './constants';
import {
  G,
  STAR_MASS,
  PLANET_MASS,
  MOON_MASS,
  PLANET_ORBIT_R,
  MOON_ORBIT_R,
  CAMERA_SCALE_MIN,
  CAMERA_SCALE_MAX,
  MAX_BODIES,
  bodyRadius,
  circularOrbitVelocity,
} from './constants';
import { PhysicsEngine } from './physicsEngine';
import { Renderer } from './renderer';
import { InputHandler } from './input';

// ─── Initial bodies ────────────────────────────────────────────────────────────

function makeInitialBodies(): BodyData[] {
  const star: BodyData = {
    pos: [0, 0],
    vel: [0, 0],
    mass: STAR_MASS,
    radius: bodyRadius(STAR_MASS),
  };

  const vPlanet = circularOrbitVelocity(G, STAR_MASS, PLANET_ORBIT_R);
  const planet: BodyData = {
    pos: [PLANET_ORBIT_R, 0],
    vel: [0, vPlanet],
    mass: PLANET_MASS,
    radius: bodyRadius(PLANET_MASS),
  };

  const vMoon = circularOrbitVelocity(G, PLANET_MASS, MOON_ORBIT_R);
  const moon: BodyData = {
    pos: [PLANET_ORBIT_R + MOON_ORBIT_R, 0],
    vel: [0, vPlanet + vMoon],
    mass: MOON_MASS,
    radius: bodyRadius(MOON_MASS),
  };

  return [star, planet, moon];
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  const errorBanner = document.getElementById('error-banner')!;
  const errorDetail = document.getElementById('error-detail')!;

  if (!navigator.gpu) {
    errorBanner.hidden = false;
    errorDetail.textContent = 'navigator.gpu not found — WebGPU is not supported in this browser.';
    return;
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    errorBanner.hidden = false;
    errorDetail.textContent = 'requestAdapter() returned null — no suitable GPU adapter found.';
    return;
  }

  const device = await adapter.requestDevice();
  let deviceLost = false;
  device.lost.then((info) => {
    deviceLost = true;
    console.error('GPU device lost:', info.message);
    errorBanner.hidden = false;
    errorDetail.textContent = `GPU device lost: ${info.message}`;
  });

  // ── Canvases ──────────────────────────────────────────────────────────────
  const gpuCanvas     = document.getElementById('webgpu-canvas') as HTMLCanvasElement;
  const overlayCanvas = document.getElementById('overlay')       as HTMLCanvasElement;
  const hudEl         = document.getElementById('hud')!;

  function resizeCanvases(): void {
    const dpr = devicePixelRatio;
    gpuCanvas.width     = window.innerWidth  * dpr;
    gpuCanvas.height    = window.innerHeight * dpr;
    overlayCanvas.width  = window.innerWidth  * dpr;
    overlayCanvas.height = window.innerHeight * dpr;
  }
  resizeCanvases();
  window.addEventListener('resize', () => {
    resizeCanvases();
    renderer.resize();
  });

  // ── Camera ────────────────────────────────────────────────────────────────
  const camera: Camera = { center: [0, 0], scale: 1.0 };

  // ── Subsystems ────────────────────────────────────────────────────────────
  const physics = new PhysicsEngine(device);
  const initialBodies = makeInitialBodies();
  physics.init(initialBodies);

  const renderer = new Renderer(device, gpuCanvas, overlayCanvas, hudEl);
  renderer.setBodyCount(initialBodies.length);

  const input = new InputHandler(
    overlayCanvas,
    () => camera,
    () => physics.cpuBodies,
    () => [window.innerWidth, window.innerHeight],
  );

  // ── Callbacks ─────────────────────────────────────────────────────────────

  input.onAddBody = (body: BodyData): void => {
    if (physics.N >= MAX_BODIES) return;
    const bodies = [...physics.cpuBodies, body];
    physics.setBodies(bodies);
    renderer.setBodyCount(bodies.length);
  };

  input.onDeleteBody = (index: number): void => {
    if (physics.N <= 1) return;
    const bodies = physics.cpuBodies.filter((_b, i) => i !== index);
    renderer.removeBodyTrail(index);
    physics.setBodies(bodies);
    renderer.setBodyCount(bodies.length);
    input.hoveredIndex = -1;
  };

  input.onReset = (): void => {
    const bodies = makeInitialBodies();
    physics.init(bodies);
    renderer.setBodyCount(bodies.length);
    timeScale = 1.0;
  };

  input.onPauseToggle = (): void => {
    paused = !paused;
  };

  input.onStep = (): void => {
    if (paused) stepOnce = true;
  };

  input.onTimeScaleUp = (): void => {
    timeScale = Math.min(10, timeScale * 1.5);
  };

  input.onTimeScaleDown = (): void => {
    timeScale = Math.max(0.1, timeScale / 1.5);
  };

  input.onZoom = (delta: number): void => {
    const factor = delta > 0 ? 0.9 : 1.1;
    camera.scale = Math.max(CAMERA_SCALE_MIN, Math.min(CAMERA_SCALE_MAX, camera.scale * factor));
  };

  input.onDragStart = (index: number): void => {
    // Freeze the dragged body so it doesn't drift while being held
    const bodies = physics.cpuBodies.slice();
    if (index < bodies.length) {
      bodies[index] = { ...bodies[index], vel: [0, 0] };
      physics.setBodies(bodies);
    }
  };

  input.onDragRelease = (index: number, pos: [number, number], vel: [number, number]): void => {
    const bodies = physics.cpuBodies.slice();
    if (index < bodies.length) {
      bodies[index] = { ...bodies[index], pos, vel };
      physics.setBodies(bodies);
    }
  };

  physics.onMerge = (i: number, j: number): void => {
    const bodies = physics.cpuBodies.slice();
    if (i >= bodies.length || j >= bodies.length) return;
    const bi = bodies[i];
    const bj = bodies[j];
    const newMass = bi.mass + bj.mass;
    const newVel: [number, number] = [
      (bi.mass * bi.vel[0] + bj.mass * bj.vel[0]) / newMass,
      (bi.mass * bi.vel[1] + bj.mass * bj.vel[1]) / newMass,
    ];
    bodies[i] = { ...bi, mass: newMass, radius: bodyRadius(newMass), vel: newVel };
    bodies.splice(j, 1);
    renderer.removeBodyTrail(j);
    physics.setBodies(bodies);
    renderer.setBodyCount(bodies.length);
    renderer.addPulse(i);
    input.hoveredIndex = -1;
  };

  // ── Animation state ───────────────────────────────────────────────────────
  let paused    = false;
  let timeScale = 1.0;
  let lastTime  = 0;
  let stepOnce  = false;

  // Prime the pump: run a dt=0 tick so we have a valid buffer before the first frame.
  let lastBodyBuffer: GPUBuffer = physics.tick(0);

  // ── Frame loop ────────────────────────────────────────────────────────────
  function frame(now: number): void {
    if (deviceLost) return;
    const rawDt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (!paused || stepOnce) {
      // Keep drag target pinned to cursor each frame
      if (input.dragState.active) {
        const bodies = physics.cpuBodies.slice();
        const idx    = input.dragState.bodyIndex;
        if (idx >= 0 && idx < bodies.length) {
          bodies[idx] = { ...bodies[idx], pos: input.dragState.bodyWorldPos, vel: [0, 0] };
          physics.setBodies(bodies);
        }
      }

      const dt = rawDt * timeScale;
      lastBodyBuffer = physics.tick(dt);

      physics.scheduleCpuRead((_bodies: BodyData[]) => {
        // cpuBodies is updated inside scheduleCpuRead; collision checks are
        // handled by PhysicsEngine itself (calls onMerge as needed).
      });

      stepOnce = false;
    }

    renderer.render(
      lastBodyBuffer,
      physics.cpuBodies,
      physics.N,
      camera,
      input.hoveredIndex,
      input.dragState,
      input.ghostBody,
      timeScale,
      paused,
    );

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

init();
