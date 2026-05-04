import type { BodyData, Camera } from './constants';
import { DT, bodyRadius, collisionRadius, screenToWorld, DEFAULT_GHOST_MASS_LOG } from './constants';
import type { DragState } from './renderer';

// ─── Hit testing ──────────────────────────────────────────────────────────────

function hitTest(
  mouseWorld: [number, number],
  bodies: BodyData[],
  _camera: Camera,
): number {
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    const dx = mouseWorld[0] - b.pos[0];
    const dy = mouseWorld[1] - b.pos[1];
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Use world-space visual radius (same formula as renderer's visRadius at scale=1).
    if (dist <= collisionRadius(b.mass)) {
      return i;
    }
  }
  return -1;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PanStart {
  clientX: number;
  clientY: number;
  cameraCenter: [number, number];
  moved: boolean;
}

interface BodyPressStart {
  index: number;
  clientX: number;
  clientY: number;
}

// ─── InputHandler ─────────────────────────────────────────────────────────────

export class InputHandler {
  // ── Public state ────────────────────────────────────────────────────────────
  hoveredIndex: number = -1;
  selectedBodyIndex: number = -1;

  dragState: DragState = {
    active: false,
    bodyIndex: -1,
    bodyWorldPos: [0, 0],
    mouseHistory: [],
  };

  ghostBody: BodyData | null = null;
  ghostMassLog: number = DEFAULT_GHOST_MASS_LOG;

  velocityDragMode: boolean = false;

  // ── Callbacks ───────────────────────────────────────────────────────────────
  onAddBody: (body: BodyData) => void = () => {};
  onDeleteBody: (index: number) => void = () => {};
  onReset: () => void = () => {};
  onPauseToggle: () => void = () => {};
  onStep: () => void = () => {};
  onTimeScaleUp: () => void = () => {};
  onTimeScaleDown: () => void = () => {};
  onZoom: (delta: number) => void = () => {};
  onDragRelease: (index: number, pos: [number, number], vel: [number, number]) => void = () => {};
  onDragStart: (index: number) => void = () => {};
  onSelectBody: (index: number) => void = () => {};
  onVelocityDrag: (index: number, vel: [number, number]) => void = () => {};
  onContextMenu: (worldPos: [number, number], bodyIndex: number, cssX: number, cssY: number) => void = () => {};
  onFollow:  (index: number) => void = () => {};
  onEscape:  () => void = () => {};

  // ── Private ──────────────────────────────────────────────────────────────────
  private canvas: HTMLCanvasElement;
  private getCamera: () => Camera;
  private getBodies: () => BodyData[];
  private placingBody: boolean = false;
  private _panStart: PanStart | null = null;
  private _bodyPressStart: BodyPressStart | null = null;

  // Velocity drag mode state
  private _velDragStart: [number, number] | null = null;

  private readonly PAN_THRESHOLD = 5; // CSS pixels before pan activates
  private readonly BODY_DRAG_THRESHOLD = 4; // CSS pixels before body drag starts
  private readonly PAN_STEP = 40;     // physical pixels per WASD keypress

  // Bound event handler references (for removeEventListener)
  private _onMouseMove: (e: MouseEvent) => void;
  private _onMouseDown: (e: MouseEvent) => void;
  private _onMouseUp: (e: MouseEvent) => void;
  private _onWheel: (e: WheelEvent) => void;
  private _onKeyDown: (e: KeyboardEvent) => void;
  private _onTouchStart: (e: TouchEvent) => void;
  private _onTouchMove: (e: TouchEvent) => void;
  private _onTouchEnd: (e: TouchEvent) => void;
  private _onContextMenu: (e: MouseEvent) => void;
  private _onDblClick: (e: MouseEvent) => void;

  constructor(
    canvas: HTMLCanvasElement,
    getCamera: () => Camera,
    getBodies: () => BodyData[],
  ) {
    this.canvas = canvas;
    this.getCamera = getCamera;
    this.getBodies = getBodies;

    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseDown = this._handleMouseDown.bind(this);
    this._onMouseUp   = this._handleMouseUp.bind(this);
    this._onWheel     = this._handleWheel.bind(this);
    this._onKeyDown   = this._handleKeyDown.bind(this);
    this._onTouchStart   = this._handleTouchStart.bind(this);
    this._onTouchMove    = this._handleTouchMove.bind(this);
    this._onTouchEnd     = this._handleTouchEnd.bind(this);
    this._onContextMenu  = this._handleContextMenu.bind(this);
    this._onDblClick     = this._handleDblClick.bind(this);

    canvas.addEventListener('mousemove',    this._onMouseMove);
    canvas.addEventListener('mousedown',    this._onMouseDown);
    canvas.addEventListener('mouseup',      this._onMouseUp);
    canvas.addEventListener('wheel',        this._onWheel, { passive: false });
    canvas.addEventListener('contextmenu',  this._onContextMenu);
    canvas.addEventListener('dblclick',     this._onDblClick);
    window.addEventListener('keydown',      this._onKeyDown);
    canvas.addEventListener('touchstart',   this._onTouchStart, { passive: false });
    canvas.addEventListener('touchmove',    this._onTouchMove,  { passive: false });
    canvas.addEventListener('touchend',     this._onTouchEnd,   { passive: false });
  }

  destroy(): void {
    this.canvas.removeEventListener('mousemove',   this._onMouseMove);
    this.canvas.removeEventListener('mousedown',   this._onMouseDown);
    this.canvas.removeEventListener('mouseup',     this._onMouseUp);
    this.canvas.removeEventListener('wheel',       this._onWheel);
    this.canvas.removeEventListener('contextmenu', this._onContextMenu);
    this.canvas.removeEventListener('dblclick',    this._onDblClick);
    window.removeEventListener('keydown',          this._onKeyDown);
    this.canvas.removeEventListener('touchstart',  this._onTouchStart);
    this.canvas.removeEventListener('touchmove',   this._onTouchMove);
    this.canvas.removeEventListener('touchend',    this._onTouchEnd);
  }

  // ── Private: coordinate helpers ───────────────────────────────────────────

  private _cssToWorld(clientX: number, clientY: number): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    const dpr  = window.devicePixelRatio || 1;
    const physX = (clientX - rect.left) * dpr;
    const physY = (clientY - rect.top)  * dpr;
    return screenToWorld([physX, physY], this.getCamera(), this.canvas.width, this.canvas.height);
  }

  // ── Private: mouse handlers ───────────────────────────────────────────────

  private _handleMouseDown(e: MouseEvent): void {
    const world  = this._cssToWorld(e.clientX, e.clientY);
    const camera = this.getCamera();
    const bodies = this.getBodies();
    const hit    = hitTest(world, bodies, camera);

    if (this.velocityDragMode && this.selectedBodyIndex >= 0) {
      // Start velocity drag
      this._velDragStart = [e.clientX, e.clientY];
      return;
    }

    if (hit >= 0) {
      // Track body press — don't start drag yet (wait for movement)
      this._bodyPressStart = { index: hit, clientX: e.clientX, clientY: e.clientY };
    } else if (!this.placingBody) {
      // Track whether this becomes a pan or a click-to-place
      this._panStart = {
        clientX: e.clientX,
        clientY: e.clientY,
        cameraCenter: [camera.center[0], camera.center[1]],
        moved: false,
      };
    }
    // placingBody=true: mousedown does nothing — placement confirmed on mouseup
  }

  private _handleMouseMove(e: MouseEvent): void {
    const world  = this._cssToWorld(e.clientX, e.clientY);
    const camera = this.getCamera();
    const bodies = this.getBodies();

    // Velocity drag mode
    if (this.velocityDragMode && this._velDragStart !== null && this.selectedBodyIndex >= 0) {
      const dx = e.clientX - this._velDragStart[0];
      const dy = e.clientY - this._velDragStart[1];
      const vel: [number, number] = [dx * 0.5, dy * 0.5];
      this.onVelocityDrag(this.selectedBodyIndex, vel);
      return;
    }

    if (this.dragState.active) {
      this.dragState.bodyWorldPos = world;
      this.dragState.mouseHistory.push(world);
      if (this.dragState.mouseHistory.length > 5) {
        this.dragState.mouseHistory.shift();
      }
    } else if (this._bodyPressStart !== null) {
      const dx = e.clientX - this._bodyPressStart.clientX;
      const dy = e.clientY - this._bodyPressStart.clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > this.BODY_DRAG_THRESHOLD) {
        // Convert body press to actual drag
        const idx = this._bodyPressStart.index;
        const bodyWorld = this._cssToWorld(this._bodyPressStart.clientX, this._bodyPressStart.clientY);
        this.dragState = {
          active: true,
          bodyIndex: idx,
          bodyWorldPos: bodyWorld,
          mouseHistory: [bodyWorld],
        };
        this.onDragStart(idx);
        this._bodyPressStart = null;
      }
    } else if (this._panStart !== null) {
      const dx = e.clientX - this._panStart.clientX;
      const dy = e.clientY - this._panStart.clientY;
      if (!this._panStart.moved && Math.sqrt(dx * dx + dy * dy) > this.PAN_THRESHOLD) {
        this._panStart.moved = true;
      }
      if (this._panStart.moved) {
        const dpr = window.devicePixelRatio || 1;
        camera.center[0] = this._panStart.cameraCenter[0] - dx * dpr / camera.scale;
        camera.center[1] = this._panStart.cameraCenter[1] - dy * dpr / camera.scale;
      }
    } else if (this.placingBody && this.ghostBody !== null) {
      this.ghostBody = { ...this.ghostBody, pos: world };
    } else {
      this.hoveredIndex = hitTest(world, bodies, camera);
    }
  }

  private _handleMouseUp(e: MouseEvent): void {
    // Velocity drag mode end
    if (this.velocityDragMode && this._velDragStart !== null) {
      this._velDragStart = null;
      return;
    }

    if (this.dragState.active) {
      const hist = this.dragState.mouseHistory;
      let vel: [number, number] = [0, 0];
      if (hist.length >= 2) {
        const dt = DT;
        let totalVx = 0;
        let totalVy = 0;
        for (let i = 1; i < hist.length; i++) {
          totalVx += (hist[i][0] - hist[i - 1][0]) / dt;
          totalVy += (hist[i][1] - hist[i - 1][1]) / dt;
        }
        vel = [totalVx / (hist.length - 1), totalVy / (hist.length - 1)];
      }
      this.onDragRelease(this.dragState.bodyIndex, this.dragState.bodyWorldPos, vel);
      this.dragState = {
        active: false,
        bodyIndex: -1,
        bodyWorldPos: [0, 0],
        mouseHistory: [],
      };
    } else if (this._bodyPressStart !== null) {
      // No drag movement — treat as select
      const idx = this._bodyPressStart.index;
      this.selectedBodyIndex = idx;
      this.onSelectBody(idx);
      this._bodyPressStart = null;
    } else if (this.placingBody && this.ghostBody !== null) {
      this.onAddBody(this.ghostBody);
      this.ghostBody = null;
      this.placingBody = false;
    } else if (this._panStart !== null) {
      if (!this._panStart.moved) {
        // Quick click (no pan) → start ghost placement.
        // Fall back to panStart coords on touch (touchend passes {} with no clientX).
        const cx = e.clientX ?? this._panStart.clientX;
        const cy = e.clientY ?? this._panStart.clientY;
        const world = this._cssToWorld(cx, cy);
        const mass  = Math.pow(10, this.ghostMassLog);
        this.ghostBody   = { pos: world, vel: [0, 0], mass, radius: bodyRadius(mass) };
        this.placingBody = true;
      }
      this._panStart = null;
    }
  }

  private _handleWheel(e: WheelEvent): void {
    e.preventDefault();
    if (this.placingBody && this.ghostBody !== null) {
      const sign = e.deltaY > 0 ? -1 : 1;
      this.ghostMassLog = Math.max(0, Math.min(5, this.ghostMassLog + sign * 0.1));
      const mass = Math.pow(10, this.ghostMassLog);
      this.ghostBody = { ...this.ghostBody, mass, radius: bodyRadius(mass) };
    } else {
      this.onZoom(e.deltaY);
    }
  }

  private _handleKeyDown(e: KeyboardEvent): void {
    const camera = this.getCamera();
    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        if (this.hoveredIndex >= 0) {
          this.onDeleteBody(this.hoveredIndex);
        }
        break;
      case 'r':
      case 'R':
        this.onReset();
        break;
      case ' ':
        e.preventDefault();
        this.onPauseToggle();
        break;
      case '.':
        this.onStep();
        break;
      case '+':
      case '=':
        this.onTimeScaleUp();
        break;
      case '-':
        this.onTimeScaleDown();
        break;
      case 'f':
      case 'F':
        if (this.selectedBodyIndex >= 0) this.onFollow(this.selectedBodyIndex);
        break;
      case 'Escape':
        this.ghostBody   = null;
        this.placingBody = false;
        this.velocityDragMode = false;
        this._velDragStart = null;
        this.onEscape();
        break;
      // ── Pan ──────────────────────────────────────────────────────────────
      case 'w':
      case 'W':
        camera.center[1] -= this.PAN_STEP / camera.scale;
        break;
      case 's':
      case 'S':
        camera.center[1] += this.PAN_STEP / camera.scale;
        break;
      case 'a':
      case 'A':
        camera.center[0] -= this.PAN_STEP / camera.scale;
        break;
      case 'd':
      case 'D':
        camera.center[0] += this.PAN_STEP / camera.scale;
        break;
    }
  }

  // ── Private: context menu & double-click ─────────────────────────────────

  private _handleContextMenu(e: MouseEvent): void {
    e.preventDefault();
    const world = this._cssToWorld(e.clientX, e.clientY);
    const hit   = hitTest(world, this.getBodies(), this.getCamera());
    this.onContextMenu(world, hit, e.clientX, e.clientY);
  }

  private _handleDblClick(e: MouseEvent): void {
    const world = this._cssToWorld(e.clientX, e.clientY);
    const hit   = hitTest(world, this.getBodies(), this.getCamera());
    if (hit >= 0) {
      this.selectedBodyIndex = hit;
      this.onSelectBody(hit);
      this.onFollow(hit);
    }
  }

  // ── Private: touch handlers ───────────────────────────────────────────────

  private _handleTouchStart(e: TouchEvent): void {
    e.preventDefault();
    if (e.touches.length === 0) return;
    const t = e.touches[0];
    this._handleMouseDown({ clientX: t.clientX, clientY: t.clientY } as MouseEvent);
  }

  private _handleTouchMove(e: TouchEvent): void {
    e.preventDefault();
    if (e.touches.length === 0) return;
    const t = e.touches[0];
    this._handleMouseMove({ clientX: t.clientX, clientY: t.clientY } as MouseEvent);
  }

  private _handleTouchEnd(e: TouchEvent): void {
    e.preventDefault();
    this._handleMouseUp({} as MouseEvent);
  }
}
