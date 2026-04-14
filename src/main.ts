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
import { ContextMenu } from './ui/ContextMenu.js';
import { MassEditPanel } from './ui/MassEditPanel.js';
import { BodyCreateDialog } from './ui/BodyCreateDialog.js';
import { MAX_BODIES } from './utils/constants.js';
import { Body } from './BodySystem.js';
import { circularOrbitVelocityAround, Vec2 } from './utils/math.js';

async function main() {
  // ── WebGPU check ───────────────────────────────────────────────────────────
  if (!navigator.gpu) {
    document.getElementById('webgpu-error')!.style.display = 'flex';
    return;
  }

  // ── DOM elements ───────────────────────────────────────────────────────────
  const canvas     = document.getElementById('gpu-canvas')  as HTMLCanvasElement;
  const overlay    = document.getElementById('overlay')     as HTMLCanvasElement;
  const leftPanel  = document.getElementById('left-panel')  as HTMLElement;
  const rightPanel = document.getElementById('right-panel') as HTMLElement;
  const massPanel  = document.getElementById('mass-panel')  as HTMLElement;
  const univPanel  = document.getElementById('univ-panel')  as HTMLElement;
  const topBar     = document.getElementById('top-bar')     as HTMLElement;
  const bottomBar  = document.getElementById('bottom-bar')  as HTMLElement;

  function resizeCanvases() {
    canvas.width  = overlay.width  = window.innerWidth;
    canvas.height = overlay.height = window.innerHeight;
  }
  resizeCanvases();
  window.addEventListener('resize', resizeCanvases);

  // ── Tab switching (right column) ───────────────────────────────────────────
  const tabBtns  = document.querySelectorAll<HTMLButtonElement>('.tab-btn');
  const tabPanes = document.querySelectorAll<HTMLElement>('.tab-pane');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b  => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(
        btn.dataset.tab === 'inspector' ? 'right-panel'
        : btn.dataset.tab === 'mass-edit' ? 'mass-panel'
        : 'univ-panel'
      )?.classList.add('active');
    });
  });

  // ── Init systems ───────────────────────────────────────────────────────────
  const gpu = new GPUPhysicsEngine();
  const ok  = await gpu.init();
  if (!ok) { document.getElementById('webgpu-error')!.style.display = 'flex'; return; }

  const universe  = new UniverseManager(gpu);
  const renderer  = new RenderEngine(MAX_BODIES);
  const gravField = new RaymarchedGravitySystem();

  // Pass overlay as event canvas so zoom/pan work (overlay is always on top)
  const camera = new CameraSystem(canvas, overlay);

  await renderer.init(canvas, overlay, gpu.device);
  await gravField.init(gpu.device, navigator.gpu.getPreferredCanvasFormat());

  universe.generateInitialUniverse();
  universe.syncGPU();
  renderer.uploadBodyRenderData(universe.bodySystem.bodies);

  const sim = new SimulationEngine(gpu, universe, renderer, gravField, camera);

  // ── Shared state ───────────────────────────────────────────────────────────
  let selectedBodyId: string | null = null;
  let addMode                       = false;
  let addModeType: Body['type']     = 'planet';
  let dragBodyId: string | null     = null;

  // ── Session auto-name helper ───────────────────────────────────────────────
  const sessionCounters: Record<string, number> = {};
  const nameMap: Record<string, string[]> = {
    star:       ['Sirius', 'Betelgeuse', 'Canopus', 'Arcturus', 'Aldebaran'],
    planet:     ['Kepler-22b', 'Proxima b', 'Gliese 667', 'Trappist-1e'],
    moon:       ['Callisto', 'Oberon', 'Triton', 'Charon', 'Hyperion'],
    asteroid:   ['Ceres', 'Vesta', 'Pallas', 'Hygiea'],
    rocket:     ['Hermes', 'Voyager', 'Pioneer', 'New Horizons'],
    black_hole: ['Cygnus X-1', 'V404 Cygni', 'GRO J1655'],
  };
  function autoNameFor(type: string): string {
    const n    = sessionCounters[type] ?? 0;
    sessionCounters[type] = n + 1;
    const pool = nameMap[type] ?? ['Body'];
    return pool[n % pool.length] + (n >= pool.length ? ` ${Math.floor(n / pool.length) + 2}` : '');
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function computeSuggestedVelocity(worldPos: Vec2): Vec2 {
    const bodies = universe.bodySystem.bodies;
    let centralBody = bodies[0];
    let minDist = Infinity;
    for (const b of bodies) {
      const d = Math.hypot(b.position[0] - worldPos[0], b.position[1] - worldPos[1]);
      if (d < minDist) { minDist = d; centralBody = b; }
    }
    const refMass = (centralBody?.type === 'star' || centralBody?.type === 'planet' ||
                     (centralBody as any)?.type === 'black_hole')
      ? centralBody.mass : 0;
    const refPos  = centralBody?.position ?? ([0, 0] as Vec2);
    const refVel  = centralBody?.velocity ?? ([0, 0] as Vec2);
    return refMass > 0
      ? circularOrbitVelocityAround(worldPos, refPos, refMass, universe.params.G, refVel)
      : ([0, 0] as Vec2);
  }

  const bodyDialog = new BodyCreateDialog();

  async function openBodyDialog(type: Body['type'], worldPos: Vec2): Promise<void> {
    const params = await bodyDialog.show(type, computeSuggestedVelocity(worldPos), autoNameFor(type));
    if (!params) return;
    const added = universe.addBody({
      type:     params.type,
      name:     params.name,
      position: worldPos,
      velocity: params.velocity,
      mass:     params.mass,
      radius:   params.radius,
      color:    params.color,
      fuel:     params.fuel,
      thrustMagnitude: params.thrustMagnitude,
      thrustActive:    false,
    });
    selectBodyId(added.id);
    tabBtns[0].click();
  }

  function selectBodyId(id: string | null): void {
    selectedBodyId = id;
    bodyList.setSelectedId(id);
    inspector.render(id ? (universe.bodySystem.get(id) ?? null) : null);
  }

  // ── UI components ──────────────────────────────────────────────────────────
  const bodyList    = new BodyList(leftPanel);
  const inspector   = new Inspector(rightPanel);
  const controlBar  = new ControlBar(bottomBar);
  const modeBar     = new ModeSelector(topBar);
  const univManager = new UniverseManagerPanel(
    univPanel, universe.saveSystem, universe, camera
  );

  // ── Context menu ───────────────────────────────────────────────────────────
  const ctxMenu = new ContextMenu({
    onAddBody:    (type, worldPos) => openBodyDialog(type, worldPos),
    onFocusBody:  (body) => camera.focusOn(body.position[0], body.position[1]),
    onDeleteBody: (id) => {
      universe.removeBody(id);
      if (selectedBodyId === id) selectBodyId(null);
    },
    onPinBody:    (id, pinned) => universe.updateBody(id, { pinned }),
    screenToWorld: (sx, sy) => camera.screenToWorld(sx, sy),
  });

  // ── Overlay (always receives pointer events) ───────────────────────────────
  overlay.style.pointerEvents = 'auto';

  // Right-click → context menu
  overlay.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const [wx, wy] = camera.screenToWorld(e.clientX, e.clientY);
    let nearest: Body | null = null;
    let minDist = Infinity;
    for (const b of universe.bodySystem.bodies) {
      const d       = Math.hypot(b.position[0] - wx, b.position[1] - wy);
      const screenD = camera.worldToScreenSize(d);
      const screenR = camera.worldToScreenSize(b.radius);
      if (screenD < Math.max(screenR + 8, 12) && d < minDist) {
        minDist = d; nearest = b;
      }
    }
    nearest ? ctxMenu.showForBody(e.clientX, e.clientY, nearest)
            : ctxMenu.showForCanvas(e.clientX, e.clientY);
  });

  // ── Mouse down: start drag or mark click origin ────────────────────────────
  let mouseDownPos: [number, number] = [0, 0];

  overlay.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    mouseDownPos = [e.clientX, e.clientY];

    const [wx, wy] = camera.screenToWorld(e.clientX, e.clientY);
    for (const b of universe.bodySystem.bodies) {
      const d       = Math.hypot(b.position[0] - wx, b.position[1] - wy);
      const screenD = camera.worldToScreenSize(d);
      const screenR = camera.worldToScreenSize(b.radius);
      if (screenD < Math.max(screenR + 6, 10)) {
        dragBodyId = b.id;
        camera.blockDrag(true);
        camera.cancelDrag();
        return;
      }
    }
  });

  overlay.addEventListener('mousemove', (e) => {
    if (!dragBodyId) return;
    const [wx, wy] = camera.screenToWorld(e.clientX, e.clientY);
    universe.updateBody(dragBodyId, { position: [wx, wy], velocity: [0, 0] });
  });

  overlay.addEventListener('mouseup', (e) => {
    if (dragBodyId) {
      camera.blockDrag(false);
      dragBodyId = null;
      return;
    }
    if (e.button !== 0) return;
    const moved = Math.hypot(e.clientX - mouseDownPos[0], e.clientY - mouseDownPos[1]) > 5;
    if (moved) return;

    // Add-mode click
    if (addMode) {
      const [wx, wy] = camera.screenToWorld(e.clientX, e.clientY);
      openBodyDialog(addModeType, [wx, wy]);
      addMode = false;
      overlay.style.cursor = 'default';
      return;
    }

    // Select body click
    const [wx, wy] = camera.screenToWorld(e.clientX, e.clientY);
    let nearest: Body | null = null;
    let minDist = Infinity;
    for (const b of universe.bodySystem.bodies) {
      const d       = Math.hypot(b.position[0] - wx, b.position[1] - wy);
      const screenD = camera.worldToScreenSize(d);
      const screenR = camera.worldToScreenSize(b.radius);
      if (screenD < Math.max(screenR + 8, 12) && d < minDist) {
        minDist = d; nearest = b;
      }
    }
    selectBodyId(nearest?.id ?? null);
  });

  // ── Double-click to follow ─────────────────────────────────────────────────
  overlay.addEventListener('dblclick', (e) => {
    const [wx, wy] = camera.screenToWorld(e.clientX, e.clientY);
    for (const b of universe.bodySystem.bodies) {
      const d       = Math.hypot(b.position[0] - wx, b.position[1] - wy);
      const screenD = camera.worldToScreenSize(d);
      const screenR = camera.worldToScreenSize(b.radius);
      if (screenD < Math.max(screenR + 8, 12)) {
        const alreadyFollowing = camera.getFollowId() === b.id;
        camera.setFollow(alreadyFollowing ? null : b.id);
        inspector.syncFollowState(alreadyFollowing ? null : b.id);
        selectBodyId(b.id);
        return;
      }
    }
    camera.setFollow(null);
    inspector.syncFollowState(null);
  });

  // ── Mass-edit panel ────────────────────────────────────────────────────────
  new MassEditPanel(massPanel, {
    onDeleteByType: (type) => {
      const toRemove = type === 'all'
        ? universe.bodySystem.bodies.map(b => b.id)
        : universe.bodySystem.bodies.filter(b => b.type === type).map(b => b.id);
      for (const id of toRemove) {
        universe.removeBody(id);
        if (id === selectedBodyId) selectBodyId(null);
      }
    },
    onSelectByType: (type) => {
      const target = type === 'all'
        ? universe.bodySystem.bodies[0]
        : universe.bodySystem.bodies.find(b => b.type === type);
      if (target) { selectBodyId(target.id); tabBtns[0].click(); }
    },
    onScaleMasses: (type, factor) => {
      const targets = type === 'all'
        ? universe.bodySystem.bodies
        : universe.bodySystem.bodies.filter(b => b.type === type);
      for (const b of targets) universe.updateBody(b.id, { mass: b.mass * factor });
    },
    onSetVelocities: (type, vx, vy) => {
      const targets = type === 'all'
        ? universe.bodySystem.bodies
        : universe.bodySystem.bodies.filter(b => b.type === type);
      for (const b of targets) universe.updateBody(b.id, { velocity: [vx, vy] });
    },
  });

  // ── Body list callbacks ────────────────────────────────────────────────────
  bodyList.onSelect = (id) => selectBodyId(id);
  bodyList.onDelete = (id) => {
    universe.removeBody(id);
    if (selectedBodyId === id) selectBodyId(null);
  };
  bodyList.onFocus = (body) => camera.focusOn(body.position[0], body.position[1]);

  // ── Inspector callbacks ────────────────────────────────────────────────────
  inspector.onUpdate = (id, patch) => universe.updateBody(id, patch);
  inspector.onThrustToggle = (id, active) => {
    universe.updateBody(id, { thrustActive: active });
    inspector.render(universe.bodySystem.get(id) ?? null);
  };
  inspector.onAutopilot = (id) => {
    const rocket = universe.bodySystem.get(id);
    if (!rocket || rocket.type !== 'rocket') return;
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
  inspector.onFollow = (id) => camera.setFollow(id);

  // ── Control bar ────────────────────────────────────────────────────────────
  controlBar.onPause    = (p) => { sim.paused = p; };
  controlBar.onSpeed    = (m) => { sim.setSpeed(m); };
  controlBar.onStepOnce = ()  => { sim.stepOnce(); };

  // ── Mode selector ──────────────────────────────────────────────────────────
  modeBar.onModeChange    = (mode)  => sim.setMode(mode);
  modeBar.onOverlayChange = (flags) => Object.assign(sim.overlays, flags);
  modeBar.setAddClickListener(() => {
    addModeType = modeBar.getAddType() as Body['type'];
    addMode = !addMode;
    overlay.style.cursor = addMode ? 'crosshair' : 'default';
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
    universe.loadSnapshot(uid, u.snapshots[u.snapshots.length - 1].id);
    renderer.clearTrails();
    renderer.uploadBodyRenderData(universe.bodySystem.bodies);
    univManager.render();
  };
  univManager.onDeleteUniverse = (uid) => {
    const wasActive = uid === universe.activeUniverseId;
    universe.saveSystem.deleteUniverse(uid);
    if (wasActive) {
      let remaining = universe.saveSystem.listUniverses();
      if (remaining.length === 0) {
        const u = universe.saveSystem.createUniverse('Default Universe');
        universe.activeUniverseId = u.id;
      } else {
        universe.activeUniverseId = remaining[0].id;
      }
      universe.generateInitialUniverse();
      universe.syncGPU();
      renderer.clearTrails();
      renderer.uploadBodyRenderData(universe.bodySystem.bodies);
    }
    univManager.render();
  };

  // ── Keyboard rocket controls ───────────────────────────────────────────────
  window.addEventListener('keydown', e => {
    const rocketId = (selectedBodyId && universe.bodySystem.get(selectedBodyId)?.type === 'rocket')
      ? selectedBodyId
      : universe.bodySystem.bodies.find(b => b.type === 'rocket')?.id;
    if (!rocketId) return;
    const rocket = universe.bodySystem.get(rocketId);
    if (!rocket) return;
    const map: Record<string, [number, number]> = {
      ArrowUp: [0,1], ArrowDown: [0,-1], ArrowLeft: [-1,0], ArrowRight: [1,0],
      w: [0,1], s: [0,-1], a: [-1,0], d: [1,0],
    };
    const dir = map[e.key];
    if (dir) {
      sim.rocketInput.thrustX = dir[0];
      sim.rocketInput.thrustY = dir[1];
      universe.updateBody(rocketId, { thrustActive: true, thrust: dir });
    }
    if (e.key === ' ') {
      universe.updateBody(rocketId, { thrustActive: !rocket.thrustActive });
    }
  });
  window.addEventListener('keyup', e => {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(e.key)) {
      sim.rocketInput.thrustX = 0;
      sim.rocketInput.thrustY = 0;
    }
  });

  // ── Stats & UI refresh ─────────────────────────────────────────────────────
  sim.onStats = (stats) => controlBar.updateStats(stats);
  sim.onBodiesChanged = () => {
    bodyList.render(universe.bodySystem);
    if (selectedBodyId) inspector.render(universe.bodySystem.get(selectedBodyId) ?? null);
  };

  bodyList.render(universe.bodySystem);
  inspector.render(null);

  // UI refresh loop — also syncs follow button
  setInterval(() => {
    bodyList.render(universe.bodySystem);
    if (selectedBodyId) {
      const b = universe.bodySystem.get(selectedBodyId);
      if (b) inspector.render(b);
    }
    inspector.syncFollowState(camera.getFollowId());
  }, 250);

  // Auto-save every 60s
  setInterval(() => {
    const cam = camera.get();
    universe.saveCurrentSnapshot('auto', { x: cam.x, y: cam.y, zoom: cam.zoom });
    univManager.render();
  }, 60_000);

  sim.start();
}

main().catch(err => {
  console.error('OrbitCraft init failed:', err);
  const errEl = document.getElementById('webgpu-error');
  if (errEl) {
    errEl.style.display = 'flex';
    (errEl.querySelector('.err-msg') as HTMLElement).textContent = String(err);
  }
});
