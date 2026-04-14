import { DEFAULT_ZOOM } from './utils/constants.js';
import { Vec2, lerp, clamp } from './utils/math.js';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
  targetX: number;
  targetY: number;
  targetZoom: number;
}

export class CameraSystem {
  private cam: Camera;
  private canvas: HTMLCanvasElement;
  private dragging = false;
  private lastMouse: [number, number] = [0, 0];
  private _dragBlocked = false;
  private _followId: string | null = null;

  constructor(canvas: HTMLCanvasElement, eventCanvas?: HTMLElement) {
    this.canvas = canvas;
    this.cam = {
      x: 0, y: 0, zoom: 1 / DEFAULT_ZOOM,
      targetX: 0, targetY: 0, targetZoom: 1 / DEFAULT_ZOOM,
    };
    this._bindEvents(eventCanvas ?? canvas);
  }

  private _bindEvents(el: HTMLElement): void {
    el.addEventListener('mousedown', e => {
      if (e.button !== 0 || this._dragBlocked) return;
      this.dragging = true;
      this.lastMouse = [e.clientX, e.clientY];
    });

    el.addEventListener('mousemove', e => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastMouse[0];
      const dy = e.clientY - this.lastMouse[1];
      // Break follow only when actually moving
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) this._followId = null;
      this.lastMouse = [e.clientX, e.clientY];
      const hh = this.canvas.height / 2;
      this.cam.targetX += -dx / hh / this.cam.zoom;
      this.cam.targetY +=  dy / hh / this.cam.zoom;
      this.cam.x = this.cam.targetX;
      this.cam.y = this.cam.targetY;
    });

    el.addEventListener('mouseup',    () => { this.dragging = false; });
    el.addEventListener('mouseleave', () => { this.dragging = false; });

    el.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.85 : 1.0 / 0.85;
      this.cam.targetZoom = clamp(this.cam.targetZoom * factor, 1e-6, 1e3);
      this.cam.zoom = this.cam.targetZoom;
    }, { passive: false });

    // Touch pan & pinch-zoom
    let lastTouchDist = 0;
    el.addEventListener('touchstart', e => {
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

    el.addEventListener('touchmove', e => {
      const hh = this.canvas.height / 2;
      if (e.touches.length === 1 && this.dragging) {
        const dx = e.touches[0].clientX - this.lastMouse[0];
        const dy = e.touches[0].clientY - this.lastMouse[1];
        this.lastMouse = [e.touches[0].clientX, e.touches[0].clientY];
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) this._followId = null;
        this.cam.targetX += -dx / hh / this.cam.zoom;
        this.cam.targetY +=  dy / hh / this.cam.zoom;
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

    el.addEventListener('touchend', () => { this.dragging = false; });
  }

  /** Block camera panning (e.g. while dragging a body). */
  blockDrag(v: boolean): void {
    this._dragBlocked = v;
    if (v) this.dragging = false;
  }

  cancelDrag(): void {
    this.dragging = false;
  }

  /** Set the body ID to follow each frame. Pass null to stop. */
  setFollow(id: string | null): void {
    this._followId = id;
  }

  getFollowId(): string | null { return this._followId; }

  /** Call each frame. If trackedPos provided and followId set, smoothly track it. */
  update(dt: number, trackedPos?: Vec2): void {
    if (this._followId !== null && trackedPos) {
      this.cam.targetX = trackedPos[0];
      this.cam.targetY = trackedPos[1];
    }
    const alpha = clamp(1 - Math.exp(-dt * 10), 0, 1);
    this.cam.x    = lerp(this.cam.x,    this.cam.targetX,    alpha);
    this.cam.y    = lerp(this.cam.y,    this.cam.targetY,    alpha);
    this.cam.zoom = lerp(this.cam.zoom, this.cam.targetZoom, alpha);
  }

  /** Snap camera to world position (breaks follow). */
  focusOn(wx: number, wy: number, zoom?: number): void {
    this.cam.targetX = wx; this.cam.x = wx;
    this.cam.targetY = wy; this.cam.y = wy;
    this._followId = null;
    if (zoom !== undefined) {
      this.cam.targetZoom = zoom;
      this.cam.zoom = zoom;
    }
  }

  screenToWorld(sx: number, sy: number): Vec2 {
    const hw = this.canvas.width  / 2;
    const hh = this.canvas.height / 2;
    return [
       (sx - hw) / (hh * this.cam.zoom) + this.cam.x,
      -(sy - hh) / (hh * this.cam.zoom) + this.cam.y,
    ];
  }

  worldToScreen(wx: number, wy: number): [number, number] {
    const hw = this.canvas.width  / 2;
    const hh = this.canvas.height / 2;
    return [
       (wx - this.cam.x) * hh * this.cam.zoom + hw,
      -(wy - this.cam.y) * hh * this.cam.zoom + hh,
    ];
  }

  worldToScreenSize(worldSize: number): number {
    return worldSize * (this.canvas.height / 2) * this.cam.zoom;
  }

  get(): Camera { return this.cam; }

  getUniformData(): Float32Array {
    const ar = this.canvas.width / this.canvas.height;
    return new Float32Array([this.cam.x, this.cam.y, this.cam.zoom, ar]);
  }
}
