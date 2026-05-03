import type { BodyData, Camera } from './constants';
import { DT, bodyRadius, screenToWorld } from './constants';
import type { DragState } from './renderer';

// ─── Hit testing ──────────────────────────────────────────────────────────────

function hitTest(
  mouseWorld: [number, number],
  bodies: BodyData[],
  camera: Camera,
): number {
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    const dx = mouseWorld[0] - b.pos[0];
    const dy = mouseWorld[1] - b.pos[1];
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= (b.radius * 1.5) / camera.scale) {
      return i;
    }
  }
  return -1;
}

// ─── InputHandler ─────────────────────────────────────────────────────────────

export class InputHandler {
  // ── Public state ────────────────────────────────────────────────────────────
  hoveredIndex: number = -1;

  dragState: DragState = {
    active: false,
    bodyIndex: -1,
    bodyWorldPos: [0, 0],
    mouseHistory: [],
  };

  ghostBody: BodyData | null = null;
  ghostMassLog: number = 2; // mass = 10^2 = 100

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

  // ── Private ──────────────────────────────────────────────────────────────────
  private canvas: HTMLCanvasElement;
  private getCamera: () => Camera;
  private getBodies: () => BodyData[];
  private getCssSize: () => [number, number];
  private placingBody: boolean = false;

  // Bound event handler references (for removeEventListener)
  private _onMouseMove: (e: MouseEvent) => void;
  private _onMouseDown: (e: MouseEvent) => void;
  private _onMouseUp: (e: MouseEvent) => void;
  private _onWheel: (e: WheelEvent) => void;
  private _onKeyDown: (e: KeyboardEvent) => void;
  private _onTouchStart: (e: TouchEvent) => void;
  private _onTouchMove: (e: TouchEvent) => void;
  private _onTouchEnd: (e: TouchEvent) => void;

  constructor(
    canvas: HTMLCanvasElement,
    getCamera: () => Camera,
    getBodies: () => BodyData[],
    getCssSize: () => [number, number],
  ) {
    this.canvas = canvas;
    this.getCamera = getCamera;
    this.getBodies = getBodies;
    this.getCssSize = getCssSize;

    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseDown = this._handleMouseDown.bind(this);
    this._onMouseUp   = this._handleMouseUp.bind(this);
    this._onWheel     = this._handleWheel.bind(this);
    this._onKeyDown   = this._handleKeyDown.bind(this);
    this._onTouchStart = this._handleTouchStart.bind(this);
    this._onTouchMove  = this._handleTouchMove.bind(this);
    this._onTouchEnd   = this._handleTouchEnd.bind(this);

    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('mousedown', this._onMouseDown);
    canvas.addEventListener('mouseup',   this._onMouseUp);
    canvas.addEventListener('wheel',     this._onWheel, { passive: false });
    window.addEventListener('keydown',   this._onKeyDown);
    canvas.addEventListener('touchstart', this._onTouchStart, { passive: false });
    canvas.addEventListener('touchmove',  this._onTouchMove,  { passive: false });
    canvas.addEventListener('touchend',   this._onTouchEnd,   { passive: false });
  }

  destroy(): void {
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    this.canvas.removeEventListener('mouseup',   this._onMouseUp);
    this.canvas.removeEventListener('wheel',     this._onWheel);
    window.removeEventListener('keydown',        this._onKeyDown);
    this.canvas.removeEventListener('touchstart', this._onTouchStart);
    this.canvas.removeEventListener('touchmove',  this._onTouchMove);
    this.canvas.removeEventListener('touchend',   this._onTouchEnd);
  }

  // ── Private: coordinate helpers ───────────────────────────────────────────

  private _cssToWorld(clientX: number, clientY: number): [number, number] {
    const [cssW, cssH] = this.getCssSize();
    const rect = this.canvas.getBoundingClientRect();
    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;
    return screenToWorld([cssX, cssY], this.getCamera(), cssW, cssH);
  }

  // ── Private: mouse handlers ───────────────────────────────────────────────

  private _handleMouseMove(e: MouseEvent): void {
    const world = this._cssToWorld(e.clientX, e.clientY);
    const camera = this.getCamera();
    const bodies = this.getBodies();

    if (this.dragState.active) {
      this.dragState.bodyWorldPos = world;
      this.dragState.mouseHistory.push(world);
      if (this.dragState.mouseHistory.length > 5) {
        this.dragState.mouseHistory.shift();
      }
    } else if (this.placingBody && this.ghostBody !== null) {
      this.ghostBody = { ...this.ghostBody, pos: world };
    } else {
      this.hoveredIndex = hitTest(world, bodies, camera);
    }
  }

  private _handleMouseDown(e: MouseEvent): void {
    const world = this._cssToWorld(e.clientX, e.clientY);
    const camera = this.getCamera();
    const bodies = this.getBodies();
    const hit = hitTest(world, bodies, camera);

    if (hit >= 0) {
      // Start dragging an existing body
      this.dragState = {
        active: true,
        bodyIndex: hit,
        bodyWorldPos: world,
        mouseHistory: [world],
      };
      this.onDragStart(hit);
    } else if (!this.placingBody) {
      // Start ghost placement in empty space
      const mass = Math.pow(10, this.ghostMassLog);
      this.ghostBody = {
        pos: world,
        vel: [0, 0],
        mass,
        radius: bodyRadius(mass),
      };
      this.placingBody = true;
    }
  }

  private _handleMouseUp(_e: MouseEvent): void {
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
    } else if (this.placingBody && this.ghostBody !== null) {
      this.onAddBody(this.ghostBody);
      this.ghostBody = null;
      this.placingBody = false;
    }
  }

  private _handleWheel(e: WheelEvent): void {
    e.preventDefault();
    if (this.placingBody && this.ghostBody !== null) {
      // Adjust ghost mass
      const sign = e.deltaY > 0 ? -1 : 1;
      this.ghostMassLog = Math.max(0, Math.min(5, this.ghostMassLog + sign * 0.1));
      const mass = Math.pow(10, this.ghostMassLog);
      this.ghostBody = {
        ...this.ghostBody,
        mass,
        radius: bodyRadius(mass),
      };
    } else {
      this.onZoom(e.deltaY);
    }
  }

  private _handleKeyDown(e: KeyboardEvent): void {
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
      case 'Escape':
        this.ghostBody = null;
        this.placingBody = false;
        break;
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
