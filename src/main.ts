import { GPUPhysicsEngine } from './GPUPhysicsEngine.js';
import { UniverseManager } from './UniverseManager.js';
import { SimulationEngine } from './SimulationEngine.js';
import { RenderEngine } from './RenderEngine.js';
import { RaymarchedGravitySystem } from './RaymarchedGravitySystem.js';
import { CameraSystem } from './CameraSystem.js';
import { BodyList } from './ui/BodyList.js';
import { Inspector } from './ui/Inspector.js';
import { ControlBar } from './ui/ControlBar.js';
import { ModeSelector } from './ui/ModeSelector.js';
import { UniverseManagerPanel } from './ui/UniverseManagerPanel.js';
import { MAX_BODIES, ROCKET_INITIAL_FUEL } from './utils/constants.js';
import { Body } from './BodySystem.js';
import { circularOrbitVelocityAround } from './utils/math.js';

async function main() {
  // ── Detect WebGPU ──────────────────────────────────────────────────────────
  if (!navigator.gpu) {
    document.getElementById('webgpu-error')!.style.display = 'flex';
    return;
  }

  // ── DOM elements ───────────────────────────────────────────────────────────
  const canvas        = document.getElementById('gpu-canvas')  as HTMLCanvasElement;
  const overlay       = document.getElementById('overlay')     as HTMLCanvasElement;
  const leftPanel     = document.getElementById('left-panel')  as HTMLElement;
  const rightPanel    = document.getElementById('right-panel') as HTMLElement;
  const topBar        = document.getElementById('top-bar')     as HTMLElement;
  const bottomBar     = document.getElementById('bottom-bar')  as HTMLElement;
  const univPanel     = document.getElementById('univ-panel')  as HTMLElement;

  function resizeCanvases() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width  = w;
    canvas.height = h;
    overlay.width  = w;
    overlay.height = h;
  }
  resizeCanvases();
  window.addEventListener('resize', resizeCanvases);

  // ── Initialise systems ─────────────────────────────────────────────────────
  const gpu      = new GPUPhysicsEngine();
  const ok       = await gpu.init();
  if (!ok) {
    document.getElementById('webgpu-error')!.style.display = 'flex';
    return;
  }

  const universe  = new UniverseManager(gpu);
  const renderer  = new RenderEngine(MAX_BODIES);
  const gravField = new RaymarchedGravitySystem();
  const camera    = new CameraSystem(canvas);

  await renderer.init(canvas, overlay, gpu.device);
  await gravField.init(gpu.device, navigator.gpu.getPreferredCanvasFormat());

  // ── Generate initial universe ──────────────────────────────────────────────
  universe.generateInitialUniverse();
  universe.syncGPU();
  // Upload initial render data
  renderer.uploadBodyRenderData(universe.bodySystem.bodies);

  // ── Simulation engine ──────────────────────────────────────────────────────
  const sim = new SimulationEngine(gpu, universe, renderer, gravField, camera);

  // ── UI components ──────────────────────────────────────────────────────────
  const bodyList    = new BodyList(leftPanel);
  const inspector   = new Inspector(rightPanel);
  const controlBar  = new ControlBar(bottomBar);
  const modeBar     = new ModeSelector(topBar);
  const univManager = new UniverseManagerPanel(
    univPanel, universe.saveSystem, universe, camera
  );

  let selectedBodyId: string | null = null;
  let addMode = false;
  let addType: Body['type'] = 'planet';

  // ── Body list callbacks ────────────────────────────────────────────────────
  bodyList.onSelect = (id) => {
    selectedBodyId = id;
    const b = universe.bodySystem.get(id);
    inspector.render(b ?? null);
  };

  bodyList.onDelete = (id) => {
    universe.removeBody(id);
    if (selectedBodyId === id) {
      selectedBodyId = null;
      inspector.render(null);
    }
  };

  bodyList.onFocus = (body) => {
    camera.focusOn(body.position[0], body.position[1]);
  };

  // ── Inspector callbacks ────────────────────────────────────────────────────
  inspector.onUpdate = (id, patch) => {
    universe.updateBody(id, patch);
  };

  inspector.onThrustToggle = (id, active) => {
    universe.updateBody(id, { thrustActive: active });
    const b = universe.bodySystem.get(id);
    inspector.render(b ?? null);
  };

  inspector.onAutopilot = (id) => {
    const rocket = universe.bodySystem.get(id);
    if (!rocket || rocket.type !== 'rocket') return;
    // Find nearest massive body
    const target = universe.bodySystem.bodies
      .filter(b => b.id !== id && (b.type === 'star' || b.type === 'planet'))
      .sort((a, b) => {
        const da = Math.hypot(a.position[0] - rocket.position[0], a.position[1] - rocket.position[1]);
        const db = Math.hypot(b.position[0] - rocket.position[0], b.position[1] - rocket.position[1]);
        return da - db;
      })[0];
    if (!target) return;
    sim.rockets.autopilotCircularise(rocket, target);
    universe.updateBody(id, { thrust: rocket.thrust, thrustActive: rocket.thrustActive });
    inspector.render(rocket);
  };

  // ── Control bar ────────────────────────────────────────────────────────────
  controlBar.onPause = (paused) => { sim.paused = paused; };
  controlBar.onSpeed = (mult)   => { sim.setSpeed(mult); };
  controlBar.onStepOnce = ()    => { sim.stepOnce(); };

  // ── Mode selector ──────────────────────────────────────────────────────────
  modeBar.onModeChange = (mode) => { sim.setMode(mode); };
  modeBar.onOverlayChange = (flags) => { Object.assign(sim.overlays, flags); };

  modeBar.setAddClickListener(() => {
    addMode = !addMode;
    addType = modeBar.getAddType() as Body['type'];
    overlay.style.cursor         = addMode ? 'crosshair' : 'default';
    overlay.style.pointerEvents  = addMode ? 'auto' : 'none';
  });

  // ── Universe manager ───────────────────────────────────────────────────────
  univManager.onLoadSnapshot = (uid, sid) => {
    universe.loadSnapshot(uid, sid);
    renderer.clearTrails();
    renderer.uploadBodyRenderData(universe.bodySystem.bodies);
    univManager.render();
  };

  univManager.onNewUniverse = () => {
    const u = universe.saveSystem.createUniverse(`Universe ${Date.now()}`);
    universe.activeUniverseId = u.id;
    universe.generateInitialUniverse();
    universe.syncGPU();
    renderer.clearTrails();
    renderer.uploadBodyRenderData(universe.bodySystem.bodies);
    univManager.render();
  };

  univManager.onSwitchUniverse = (uid) => {
    const u = universe.saveSystem.getUniverse(uid);
    if (!u || u.snapshots.length === 0) return;
    universe.activeUniverseId = uid;
    const lastSnap = u.snapshots[u.snapshots.length - 1];
    universe.loadSnapshot(uid, lastSnap.id);
    renderer.clearTrails();
    renderer.uploadBodyRenderData(universe.bodySystem.bodies);
    univManager.render();
  };

  // ── Canvas click: add body ─────────────────────────────────────────────────
  overlay.addEventListener('click', (e) => {
    if (!addMode) return;
    const [wx, wy] = camera.screenToWorld(e.clientX, e.clientY);

    // Find most massive nearby body for orbital velocity reference
    const bodies = universe.bodySystem.bodies;
    let centralBody = bodies[0];
    let minDist = Infinity;
    for (const b of bodies) {
      const d = Math.hypot(b.position[0] - wx, b.position[1] - wy);
      if (d < minDist) { minDist = d; centralBody = b; }
    }
    const refMass = centralBody?.type === 'star' || centralBody?.type === 'planet'
      ? centralBody.mass : 0;
    const refPos  = centralBody?.position ?? [0, 0] as [number, number];
    const refVel  = centralBody?.velocity ?? [0, 0] as [number, number];
    const vel     = refMass > 0
      ? circularOrbitVelocityAround([wx, wy], refPos, refMass, universe.params.G, refVel)
      : [0, 0] as [number, number];

    const massMap: Record<string, number> = {
      star: 1000, planet: 1, moon: 0.01, asteroid: 0.0001, rocket: 0.05,
    };

    const added = universe.addBody({
      type:     addType,
      position: [wx, wy],
      velocity: vel,
      mass:     massMap[addType] ?? 1,
      fuel:     addType === 'rocket' ? ROCKET_INITIAL_FUEL : undefined,
      thrustActive: false,
    });

    selectedBodyId = added.id;
    addMode = false;
    overlay.style.cursor        = 'default';
    overlay.style.pointerEvents = 'none';
    inspector.render(added);
  });

  // ── Keyboard controls for rocket ──────────────────────────────────────────
  const keys: Set<string> = new Set();
  window.addEventListener('keydown', e => {
    keys.add(e.key);
    // Find selected rocket or first rocket
    const rocketId = selectedBodyId
      && universe.bodySystem.get(selectedBodyId)?.type === 'rocket'
      ? selectedBodyId
      : universe.bodySystem.bodies.find(b => b.type === 'rocket')?.id;
    if (!rocketId) return;
    const rocket = universe.bodySystem.get(rocketId);
    if (!rocket) return;

    const map: Record<string, [number, number]> = {
      ArrowUp:    [0,  1],
      ArrowDown:  [0, -1],
      ArrowLeft:  [-1, 0],
      ArrowRight: [ 1, 0],
      w:          [0,  1],
      s:          [0, -1],
      a:          [-1, 0],
      d:          [ 1, 0],
    };
    const dir = map[e.key];
    if (dir) {
      sim.rocketInput.thrustX = dir[0];
      sim.rocketInput.thrustY = dir[1];
      universe.updateBody(rocketId, { thrustActive: true, thrust: dir });
    }
    if (e.key === ' ') {
      const active = !rocket.thrustActive;
      universe.updateBody(rocketId, { thrustActive: active });
    }
  });

  window.addEventListener('keyup', e => {
    keys.delete(e.key);
    const isThrust = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(e.key);
    if (isThrust) {
      sim.rocketInput.thrustX = 0;
      sim.rocketInput.thrustY = 0;
    }
  });

  // ── Stats loop ─────────────────────────────────────────────────────────────
  sim.onStats = (stats) => {
    controlBar.updateStats(stats);
  };

  sim.onBodiesChanged = () => {
    bodyList.render(universe.bodySystem);
    const b = selectedBodyId ? universe.bodySystem.get(selectedBodyId) : null;
    inspector.render(b ?? null);
  };

  // Initial UI render
  bodyList.render(universe.bodySystem);
  inspector.render(null);

  // ── Auto-save snapshot every 60 seconds ────────────────────────────────────
  setInterval(() => {
    const cam = camera.get();
    universe.saveCurrentSnapshot('auto', { x: cam.x, y: cam.y, zoom: cam.zoom });
    univManager.render();
  }, 60_000);

  // ── UI refresh loop (separate from render loop) ───────────────────────────
  setInterval(() => {
    bodyList.render(universe.bodySystem);
    if (selectedBodyId) {
      const b = universe.bodySystem.get(selectedBodyId);
      if (b) inspector.render(b);
    }
  }, 250);

  // ── Start simulation ───────────────────────────────────────────────────────
  sim.start();
}

main().catch(err => {
  console.error('OrbitCraft init failed:', err);
  const errEl = document.getElementById('webgpu-error');
  if (errEl) {
    errEl.style.display = 'flex';
    errEl.querySelector('.err-msg')!.textContent = String(err);
  }
});
