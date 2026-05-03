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
  ORBIT_PREDICT_INTERVAL,
} from './constants';
import { PhysicsEngine } from './physicsEngine';
import { Renderer } from './renderer';
import { InputHandler } from './input';
import type { BodyState } from './bodyState';
import {
  generateName,
  defaultTemperature,
} from './bodyState';
import type { FeatureFlags } from './toolbar';
import { Toolbar } from './toolbar';
import { Sidebar } from './sidebar';
import { computeLagrangePoints } from './lagrange';
import { predictOrbit } from './orbitPredictor';

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

function makeInitialBodyStates(): BodyState[] {
  return [
    { name: 'Sol',   temperature: 5800, manualRadius: false },
    { name: 'Earth', temperature: 300,  manualRadius: false },
    { name: 'Luna',  temperature: 100,  manualRadius: false },
  ];
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

  // ── State ─────────────────────────────────────────────────────────────────
  let bodyStates: BodyState[] = makeInitialBodyStates();
  let featureFlags: FeatureFlags = {
    trails: true,
    velocityArrows: true,
    orbitPaths: true,
    labels: true,
    lagrangePoints: true,
    lagrangeCount: 5,
    gasExchange: true,
  };
  let selectedBodyIndex: number = -1;
  let lagrangePoints: [number, number][] | null = null;
  let orbitPaths: [number, number][][] = [];
  let orbitUpdateCounter: number = 0;

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
  );

  // ── Toolbar & Sidebar ─────────────────────────────────────────────────────
  const toolbarEl = document.getElementById('toolbar')!;
  const sidebarEl = document.getElementById('sidebar')!;

  const toolbar = new Toolbar(toolbarEl);
  toolbar.onChange = (flags: FeatureFlags) => {
    featureFlags = flags;
  };

  const sidebar = new Sidebar(sidebarEl, {
    onNameChange: (idx, name) => {
      if (idx < bodyStates.length) {
        bodyStates[idx] = { ...bodyStates[idx], name };
      }
    },
    onMassChange: (idx, mass) => {
      const bodies = physics.cpuBodies.slice();
      if (idx < bodies.length) {
        const newRadius = bodyStates[idx]?.manualRadius
          ? bodies[idx].radius
          : bodyRadius(mass);
        bodies[idx] = { ...bodies[idx], mass, radius: newRadius };
        physics.setBodies(bodies);
        if (idx < bodyStates.length && !bodyStates[idx].manualRadius) {
          bodyStates[idx] = { ...bodyStates[idx] };
        }
        sidebar.updateBody(bodies[idx], bodyStates[idx]);
      }
    },
    onRadiusChange: (idx, radius, manual) => {
      const bodies = physics.cpuBodies.slice();
      if (idx < bodies.length) {
        bodies[idx] = { ...bodies[idx], radius };
        physics.setBodies(bodies);
        if (idx < bodyStates.length) {
          bodyStates[idx] = { ...bodyStates[idx], manualRadius: manual };
        }
        sidebar.updateBody(bodies[idx], bodyStates[idx]);
      }
    },
    onVelocityChange: (idx, vel) => {
      const bodies = physics.cpuBodies.slice();
      if (idx < bodies.length) {
        bodies[idx] = { ...bodies[idx], vel };
        physics.setBodies(bodies);
      }
    },
    onTempChange: (idx, temp) => {
      if (idx < bodyStates.length) {
        bodyStates[idx] = { ...bodyStates[idx], temperature: temp };
      }
    },
    onClose: () => {
      sidebar.close();
      selectedBodyIndex = -1;
      input.selectedBodyIndex = -1;
      lagrangePoints = null;
    },
    onStartVelocityDrag: () => {
      input.velocityDragMode = true;
    },
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  function recomputeLagrange(): void {
    const bodies = physics.cpuBodies;
    if (bodies.length < 2) {
      lagrangePoints = null;
      return;
    }

    let m1Idx = 0;
    let m2Idx = 1;

    if (selectedBodyIndex >= 0 && selectedBodyIndex < bodies.length) {
      // Use selected body + most massive other
      const selIdx = selectedBodyIndex;
      let bestOther = -1;
      let bestMass = -1;
      for (let i = 0; i < bodies.length; i++) {
        if (i === selIdx) continue;
        if (bodies[i].mass > bestMass) {
          bestMass = bodies[i].mass;
          bestOther = i;
        }
      }
      if (bestOther >= 0) {
        m1Idx = selIdx;
        m2Idx = bestOther;
        // Ensure m1 is more massive (Lagrange convention)
        if (bodies[m2Idx].mass > bodies[m1Idx].mass) {
          [m1Idx, m2Idx] = [m2Idx, m1Idx];
        }
      }
    } else {
      // Use two most massive bodies
      let best = [0, 1];
      if (bodies.length > 1 && bodies[1].mass > bodies[0].mass) {
        best = [1, 0];
      }
      for (let i = 2; i < bodies.length; i++) {
        if (bodies[i].mass > bodies[best[0]].mass) {
          best = [i, best[0]];
        } else if (bodies[i].mass > bodies[best[1]].mass) {
          best[1] = i;
        }
      }
      m1Idx = best[0];
      m2Idx = best[1];
    }

    const pts = computeLagrangePoints(bodies[m1Idx], bodies[m2Idx]);
    lagrangePoints = pts as [number, number][];
  }

  function recomputeOrbitPaths(): void {
    const bodies = physics.cpuBodies;
    const paths: [number, number][][] = [];
    for (let i = 0; i < bodies.length; i++) {
      paths.push(predictOrbit(i, bodies));
    }
    orbitPaths = paths;
  }

  // ── Callbacks ─────────────────────────────────────────────────────────────

  input.onSelectBody = (index: number): void => {
    selectedBodyIndex = index;
    input.selectedBodyIndex = index;
    const bodies = physics.cpuBodies;
    if (index >= 0 && index < bodies.length && index < bodyStates.length) {
      sidebar.open(index, bodies[index], bodyStates[index]);
    }
    recomputeLagrange();
  };

  input.onVelocityDrag = (index: number, vel: [number, number]): void => {
    const bodies = physics.cpuBodies.slice();
    if (index < bodies.length) {
      bodies[index] = { ...bodies[index], vel };
      physics.setBodies(bodies);
      if (sidebar.isOpen && index === selectedBodyIndex) {
        sidebar.updateBody(bodies[index], bodyStates[index]);
      }
    }
  };

  input.onAddBody = (body: BodyData): void => {
    if (physics.N >= MAX_BODIES) return;
    const bodies = [...physics.cpuBodies, body];
    physics.setBodies(bodies);
    renderer.setBodyCount(bodies.length);
    // Create state for new body
    const newState: BodyState = {
      name: generateName(body.mass, bodyStates),
      temperature: defaultTemperature(body.mass),
      manualRadius: false,
    };
    bodyStates.push(newState);
    recomputeOrbitPaths();
  };

  input.onDeleteBody = (index: number): void => {
    if (physics.N <= 1) return;
    const bodies = physics.cpuBodies.filter((_b, i) => i !== index);
    renderer.removeBodyTrail(index);
    physics.setBodies(bodies);
    renderer.setBodyCount(bodies.length);
    bodyStates.splice(index, 1);
    input.hoveredIndex = -1;
    if (selectedBodyIndex === index) {
      selectedBodyIndex = -1;
      input.selectedBodyIndex = -1;
      sidebar.close();
      lagrangePoints = null;
    } else if (selectedBodyIndex > index) {
      selectedBodyIndex--;
      input.selectedBodyIndex = selectedBodyIndex;
    }
    recomputeOrbitPaths();
  };

  input.onReset = (): void => {
    const bodies = makeInitialBodies();
    physics.init(bodies);
    renderer.setBodyCount(bodies.length);
    bodyStates = makeInitialBodyStates();
    timeScale = 1.0;
    selectedBodyIndex = -1;
    input.selectedBodyIndex = -1;
    sidebar.close();
    lagrangePoints = null;
    orbitPaths = [];
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

    // Merge body states
    if (i < bodyStates.length && j < bodyStates.length) {
      const stateI = bodyStates[i];
      const stateJ = bodyStates[j];
      // Keep surviving body's name if it was a larger body
      const survivingName = bi.mass >= bj.mass ? stateI.name : stateJ.name;
      // Use auto-generated name if mass category changed significantly
      const newState: BodyState = {
        name: survivingName,
        temperature: defaultTemperature(newMass),
        manualRadius: false,
      };
      bodyStates[i] = newState;
      bodyStates.splice(j, 1);
    }

    // Adjust selected index
    if (selectedBodyIndex === j) {
      selectedBodyIndex = i;
      input.selectedBodyIndex = i;
      sidebar.close();
    } else if (selectedBodyIndex > j) {
      selectedBodyIndex--;
      input.selectedBodyIndex = selectedBodyIndex;
    }

    recomputeLagrange();
  };

  // ── Animation state ───────────────────────────────────────────────────────
  let paused    = false;
  let timeScale = 1.0;
  let lastTime  = 0;
  let stepOnce  = false;

  // Initial computations
  recomputeLagrange();
  recomputeOrbitPaths();

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

        // Update sidebar if open
        if (sidebar.isOpen && selectedBodyIndex >= 0 && selectedBodyIndex < physics.cpuBodies.length) {
          sidebar.updateBody(physics.cpuBodies[selectedBodyIndex], bodyStates[selectedBodyIndex]);
        }
      });

      // Periodic orbit path recalculation
      orbitUpdateCounter++;
      if (orbitUpdateCounter >= ORBIT_PREDICT_INTERVAL) {
        orbitUpdateCounter = 0;
        recomputeOrbitPaths();
      }

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
      bodyStates,
      featureFlags,
      selectedBodyIndex,
      lagrangePoints,
      orbitPaths,
    );

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

init();
