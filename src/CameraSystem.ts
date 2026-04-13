import { DEFAULT_ZOOM } from './utils/constants.js';
import { Vec2, lerp, clamp } from './utils/math.js';

export interface Camera {
  x: number;   // world X at screen centre
  y: number;   // world Y at screen centre
  zoom: number; // world-units visible in half-screen height
  // Target for smooth interpolation
  targetX: number;
  targetY: number;
  targetZoom: number;
}

export class CameraSystem {
  private cam: Camera;
  private canvas: HTMLCanvasElement;
  private dragging = false;
  private lastMouse: [number, number] = [0, 0];
  private followId: string | null = null;
  private followPos: Vec2 = [0, 0];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.cam = {
      x: 0, y: 0, zoom: 1 / DEFAULT_ZOOM,
      targetX: 0, targetY: 0, targetZoom: 1 / DEFAULT_ZOOM,
    };
    this.bindEvents();
  }

  private bindEvents(): void {
    const c = this.canvas;

    c.addEventListener('mousedown', e => {
      this.dragging = true;
      this.lastMouse = [e.clientX, e.clientY];
      this.followId = null;
    });

    c.addEventListener('mousemove', e => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastMouse[0];
      const dy = e.clientY - this.lastMouse[1];
      this.lastMouse = [e.clientX, e.clientY];
      // Convert screen pixels → world units
      const worldDx = -dx / (c.height / 2) / this.cam.zoom;
      const worldDy =  dy / (c.height / 2) / this.cam.zoom;
      this.cam.targetX += worldDx;
      this.cam.targetY += worldDy;
      this.cam.x = this.cam.targetX;
      this.cam.y = this.cam.targetY;
    });

    c.addEventListener('mouseup',    () => { this.dragging = false; });
    c.addEventListener('mouseleave', () => { this.dragging = false; });

    c.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.85 : 1.0 / 0.85;
      this.cam.targetZoom = clamp(this.cam.targetZoom * factor, 1e-6, 1e3);
      this.cam.zoom = this.cam.targetZoom;
    }, { passive: false });

    // Touch pan
    let lastTouchDist = 0;
    c.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        this.dragging = true;
        this.lastMouse = [e.touches[0].clientX, e.touches[0].clientY];
      }
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDist = Math.hypot(dx, dy);
      }
    }, { passive: true });

    c.addEventListener('touchmove', e => {
      if (e.touches.length === 1 && this.dragging) {
        const dx = e.touches[0].clientX - this.lastMouse[0];
        const dy = e.touches[0].clientY - this.lastMouse[1];
        this.lastMouse = [e.touches[0].clientX, e.touches[0].clientY];
        const worldDx = -dx / (c.height / 2) / this.cam.zoom;
        const worldDy =  dy / (c.height / 2) / this.cam.zoom;
        this.cam.targetX += worldDx;
        this.cam.targetY += worldDy;
        this.cam.x = this.cam.targetX;
        this.cam.y = this.cam.targetY;
      }
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const factor = dist / lastTouchDist;
        lastTouchDist = dist;
        this.cam.targetZoom = clamp(this.cam.targetZoom * factor, 1e-6, 1e3);
        this.cam.zoom = this.cam.targetZoom;
      }
    }, { passive: true });

    c.addEventListener('touchend', () => { this.dragging = false; });
  }

  /** Follow a specific body each frame; pass null to stop. */
  followBody(id: string | null, pos: Vec2): void {
    this.followId = id;
    if (id !== null) {
      this.followPos = pos;
      this.cam.targetX = pos[0];
      this.cam.targetY = pos[1];
    }
  }

  /** Call each frame to update follow & smooth lerp. */
  update(dt: number, trackedPos?: Vec2): void {
    if (this.followId !== null && trackedPos) {
      this.cam.targetX = trackedPos[0];
      this.cam.targetY = trackedPos[1];
    }
    const alpha = clamp(1 - Math.exp(-dt * 10), 0, 1);
    this.cam.x    = lerp(this.cam.x,    this.cam.targetX,    alpha);
    this.cam.y    = lerp(this.cam.y,    this.cam.targetY,    alpha);
    this.cam.zoom = lerp(this.cam.zoom, this.cam.targetZoom, alpha);
  }

  /** Snap camera to target world position. */
  focusOn(wx: number, wy: number, zoom?: number): void {
    this.cam.targetX = wx;
    this.cam.targetY = wy;
    this.cam.x       = wx;
    this.cam.y       = wy;
    this.followId    = null;
    if (zoom !== undefined) {
      this.cam.targetZoom = zoom;
      this.cam.zoom       = zoom;
    }
  }

  /** Convert screen pixel coords to world coords. */
  screenToWorld(sx: number, sy: number): Vec2 {
    const hw = this.canvas.width  / 2;
    const hh = this.canvas.height / 2;
    const wx = (sx - hw) / (hh * this.cam.zoom) + this.cam.x;
    const wy = -(sy - hh) / (hh * this.cam.zoom) + this.cam.y;
    return [wx, wy];
  }

  /** Convert world coords to screen pixel coords. */
  worldToScreen(wx: number, wy: number): [number, number] {
    const hw = this.canvas.width  / 2;
    const hh = this.canvas.height / 2;
    const sx =  (wx - this.cam.x) * hh * this.cam.zoom + hw;
    const sy = -(wy - this.cam.y) * hh * this.cam.zoom + hh;
    return [sx, sy];
  }

  /** World-space size → screen pixels. */
  worldToScreenSize(worldSize: number): number {
    return worldSize * (this.canvas.height / 2) * this.cam.zoom;
  }

  get(): Camera { return this.cam; }

  /** GPU uniform struct: [centerX, centerY, zoom, aspectRatio] */
  getUniformData(): Float32Array {
    const ar = this.canvas.width / this.canvas.height;
    return new Float32Array([this.cam.x, this.cam.y, this.cam.zoom, ar]);
  }
}
