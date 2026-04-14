import { Body, BodyType } from '../BodySystem.js';
import { Vec2 } from '../utils/math.js';

export interface BodyCreateParams {
  type: BodyType;
  name: string;
  mass: number;
  radius: number;
  color: string;
  velocity: Vec2;
  fuel?: number;
  thrustMagnitude?: number;
}

const DEFAULT_COLORS: Record<BodyType, string> = {
  star:       '#FDB813',
  planet:     '#4B9CD3',
  moon:       '#aaaaaa',
  asteroid:   '#998877',
  rocket:     '#ff6b35',
  black_hole: '#6622cc',
};

const DEFAULT_MASS: Record<BodyType, number> = {
  star:       1000,
  planet:     1,
  moon:       0.01,
  asteroid:   0.001,
  rocket:     0.05,
  black_hole: 50000,
};

const DEFAULT_RADIUS: Record<BodyType, number> = {
  star:       3.5,
  planet:     1.0,
  moon:       0.35,
  asteroid:   0.25,
  rocket:     0.4,
  black_hole: 2.5,
};

const BODY_TYPES: BodyType[] = ['star', 'planet', 'moon', 'asteroid', 'rocket', 'black_hole'];

export class BodyCreateDialog {
  private el: HTMLElement;
  private velCanvas!: HTMLCanvasElement;
  private velCtx!: CanvasRenderingContext2D;
  private resolve: ((p: BodyCreateParams | null) => void) | null = null;

  // Current velocity state driven by direction picker
  private _velAngle = Math.PI / 2;  // radians, world coords (up = +Y)
  private _velSpeed = 0;
  private _suggestedVel: Vec2 = [0, 0];

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'modal-overlay';
    this.el.style.display = 'none';
    document.body.appendChild(this.el);
  }

  /**
   * Show the dialog. Returns a Promise that resolves to the params (or null if cancelled).
   * @param suggestedType     Pre-selected body type.
   * @param suggestedVelocity Auto-computed circular orbit velocity.
   * @param suggestedName     Name pre-filled.
   */
  show(
    suggestedType: BodyType,
    suggestedVelocity: Vec2,
    suggestedName: string
  ): Promise<BodyCreateParams | null> {
    return new Promise(resolve => {
      this.resolve = resolve;
      this._suggestedVel = suggestedVelocity;
      this._velSpeed = Math.hypot(suggestedVelocity[0], suggestedVelocity[1]);
      this._velAngle = this._velSpeed > 1e-6
        ? Math.atan2(suggestedVelocity[1], suggestedVelocity[0])
        : Math.PI / 2;
      this._render(suggestedType, suggestedName);
      this.el.style.display = 'flex';
    });
  }

  private _render(type: BodyType, name: string): void {
    this.el.innerHTML = `
      <div class="modal-box">
        <div class="modal-header">
          <span class="modal-title">Add Body</span>
          <button class="modal-close-btn" id="modal-close">×</button>
        </div>
        <div class="modal-body">

          <div class="modal-row">
            <label class="modal-label">Type</label>
            <select id="md-type" class="mode-select modal-input">
              ${BODY_TYPES.map(t =>
                `<option value="${t}" ${t === type ? 'selected' : ''}>${t.replace('_', ' ')}</option>`
              ).join('')}
            </select>
          </div>

          <div class="modal-row">
            <label class="modal-label">Name</label>
            <input id="md-name" class="text-input modal-input" type="text" value="${name}" />
          </div>

          <div class="modal-row">
            <label class="modal-label">Mass</label>
            <input id="md-mass" class="num-input modal-input" type="number" step="any"
              value="${DEFAULT_MASS[type]}" />
          </div>

          <div class="modal-row">
            <label class="modal-label">Radius</label>
            <input id="md-radius" class="num-input modal-input" type="number" step="0.01" min="0.01"
              value="${DEFAULT_RADIUS[type]}" />
          </div>

          <div class="modal-row">
            <label class="modal-label">Color</label>
            <input id="md-color" type="color" class="color-input" value="${DEFAULT_COLORS[type]}" />
          </div>

          <div class="modal-section-header">Initial Velocity</div>

          <div class="vel-picker-wrap">
            <canvas id="md-vel-canvas" class="vel-canvas" width="90" height="90"></canvas>
            <div class="vel-controls">
              <div class="modal-row">
                <label class="modal-label">Speed</label>
                <input id="md-speed" class="num-input modal-input" type="number"
                  step="0.01" min="0" value="${this._velSpeed.toFixed(3)}" />
              </div>
              <div class="modal-row">
                <label class="modal-label">Angle °</label>
                <input id="md-angle" class="num-input modal-input" type="number"
                  step="1" value="${Math.round(this._velAngle * 180 / Math.PI)}" />
              </div>
              <button id="md-circular" class="action-btn vel-circ-btn">↺ Circular orbit</button>
            </div>
          </div>

          <div class="modal-row">
            <label class="modal-label">VX</label>
            <input id="md-vx" class="num-input modal-input" type="number" step="any"
              value="${(this._velSpeed * Math.cos(this._velAngle)).toFixed(4)}" />
            <label class="modal-label" style="margin-left:8px">VY</label>
            <input id="md-vy" class="num-input modal-input" type="number" step="any"
              value="${(this._velSpeed * Math.sin(this._velAngle)).toFixed(4)}" />
          </div>

        </div>
        <div class="modal-footer">
          <button id="modal-cancel" class="action-btn">Cancel</button>
          <button id="modal-confirm" class="action-btn modal-confirm-btn">Add Body</button>
        </div>
      </div>
    `;

    // Cache elements
    const get = <T extends HTMLElement>(id: string) => this.el.querySelector<T>('#' + id)!;
    const typeEl   = get<HTMLSelectElement>('md-type');
    const nameEl   = get<HTMLInputElement>('md-name');
    const massEl   = get<HTMLInputElement>('md-mass');
    const radiusEl = get<HTMLInputElement>('md-radius');
    const colorEl  = get<HTMLInputElement>('md-color');
    const speedEl  = get<HTMLInputElement>('md-speed');
    const angleEl  = get<HTMLInputElement>('md-angle');
    const vxEl     = get<HTMLInputElement>('md-vx');
    const vyEl     = get<HTMLInputElement>('md-vy');

    // Velocity canvas
    this.velCanvas = get<HTMLCanvasElement>('md-vel-canvas');
    this.velCtx    = this.velCanvas.getContext('2d')!;
    this._drawVelPicker();

    // Type change → update defaults
    typeEl.addEventListener('change', () => {
      const t = typeEl.value as BodyType;
      massEl.value   = String(DEFAULT_MASS[t]);
      radiusEl.value = String(DEFAULT_RADIUS[t]);
      colorEl.value  = DEFAULT_COLORS[t];
    });

    // Velocity direction canvas mouse interaction
    const fromCanvasMouse = (e: MouseEvent | TouchEvent) => {
      const rect = this.velCanvas.getBoundingClientRect();
      const cx = this.velCanvas.width  / 2;
      const cy = this.velCanvas.height / 2;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const mx = clientX - rect.left - cx;
      const my = clientY - rect.top  - cy;
      const dist = Math.hypot(mx, my);
      const maxR = cx - 6;
      // Direction from mouse (flip Y for world coords: up = +Y)
      this._velAngle = Math.atan2(-my, mx);
      // Distance from center maps to speed (0..maxDisplaySpeed)
      const maxDisplaySpeed = Math.max(20, this._velSpeed * 2);
      this._velSpeed = Math.min(maxDisplaySpeed, dist / maxR * maxDisplaySpeed);
      this._syncVelUI(speedEl, angleEl, vxEl, vyEl);
      this._drawVelPicker();
    };

    let mouseDownVel = false;
    this.velCanvas.addEventListener('mousedown',  e => { mouseDownVel = true;  fromCanvasMouse(e); });
    this.velCanvas.addEventListener('mousemove',  e => { if (mouseDownVel) fromCanvasMouse(e); });
    this.velCanvas.addEventListener('mouseup',    () => { mouseDownVel = false; });
    this.velCanvas.addEventListener('mouseleave', () => { mouseDownVel = false; });

    // Speed/angle inputs → update canvas
    speedEl.addEventListener('input', () => {
      this._velSpeed = Math.max(0, parseFloat(speedEl.value) || 0);
      this._syncVelFromInputs(vxEl, vyEl);
      this._drawVelPicker();
    });
    angleEl.addEventListener('input', () => {
      this._velAngle = (parseFloat(angleEl.value) || 0) * Math.PI / 180;
      this._syncVelFromInputs(vxEl, vyEl);
      this._drawVelPicker();
    });

    // Manual VX/VY
    const syncFromVxVy = () => {
      const vx = parseFloat(vxEl.value) || 0;
      const vy = parseFloat(vyEl.value) || 0;
      this._velSpeed = Math.hypot(vx, vy);
      this._velAngle = Math.atan2(vy, vx);
      speedEl.value = this._velSpeed.toFixed(3);
      angleEl.value = String(Math.round(this._velAngle * 180 / Math.PI));
      this._drawVelPicker();
    };
    vxEl.addEventListener('input', syncFromVxVy);
    vyEl.addEventListener('input', syncFromVxVy);

    // Circular orbit helper
    get('md-circular').addEventListener('click', () => {
      this._velSpeed = Math.hypot(this._suggestedVel[0], this._suggestedVel[1]);
      this._velAngle = this._velSpeed > 1e-6
        ? Math.atan2(this._suggestedVel[1], this._suggestedVel[0])
        : Math.PI / 2;
      this._syncVelUI(speedEl, angleEl, vxEl, vyEl);
      this._drawVelPicker();
    });

    // Close/cancel/confirm
    get('modal-close').addEventListener('click',  () => this._finish(null));
    get('modal-cancel').addEventListener('click', () => this._finish(null));
    get('modal-confirm').addEventListener('click', () => {
      const t = typeEl.value as BodyType;
      const mass   = parseFloat(massEl.value);
      const radius = parseFloat(radiusEl.value);
      if (!isFinite(mass) || mass <= 0 || !isFinite(radius) || radius <= 0) return;
      const vx = parseFloat(vxEl.value) || 0;
      const vy = parseFloat(vyEl.value) || 0;
      this._finish({
        type: t,
        name: nameEl.value || `New ${t}`,
        mass,
        radius,
        color: colorEl.value,
        velocity: [vx, vy],
        fuel: t === 'rocket' ? 1000 : undefined,
        thrustMagnitude: t === 'rocket' ? 0.008 : undefined,
      });
    });

    // Click outside to close
    this.el.addEventListener('click', e => {
      if (e.target === this.el) this._finish(null);
    });
  }

  private _syncVelUI(
    speedEl: HTMLInputElement,
    angleEl: HTMLInputElement,
    vxEl: HTMLInputElement,
    vyEl: HTMLInputElement
  ): void {
    speedEl.value = this._velSpeed.toFixed(3);
    angleEl.value = String(Math.round(this._velAngle * 180 / Math.PI));
    vxEl.value    = (this._velSpeed * Math.cos(this._velAngle)).toFixed(4);
    vyEl.value    = (this._velSpeed * Math.sin(this._velAngle)).toFixed(4);
  }

  private _syncVelFromInputs(vxEl: HTMLInputElement, vyEl: HTMLInputElement): void {
    vxEl.value = (this._velSpeed * Math.cos(this._velAngle)).toFixed(4);
    vyEl.value = (this._velSpeed * Math.sin(this._velAngle)).toFixed(4);
  }

  private _drawVelPicker(): void {
    const canvas = this.velCanvas;
    const ctx    = this.velCtx;
    const w = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h / 2;
    const maxR = cx - 6;

    ctx.clearRect(0, 0, w, h);

    // Background circle
    ctx.beginPath();
    ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
    ctx.fillStyle   = '#0d1117';
    ctx.fill();
    ctx.strokeStyle = '#21262d';
    ctx.lineWidth   = 1;
    ctx.stroke();

    // Grid rings
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, maxR * i / 3, 0, Math.PI * 2);
      ctx.strokeStyle = '#21262d';
      ctx.lineWidth   = 0.5;
      ctx.stroke();
    }

    // Cross-hair
    ctx.strokeStyle = '#2d333b';
    ctx.lineWidth   = 0.5;
    ctx.beginPath(); ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR); ctx.stroke();

    if (this._velSpeed < 1e-6) return;

    // Arrow
    const maxDisplaySpeed = Math.max(20, this._velSpeed * 1.5);
    const r = Math.min(maxR, this._velSpeed / maxDisplaySpeed * maxR);
    const ex = cx + Math.cos(this._velAngle) * r;
    const ey = cy - Math.sin(this._velAngle) * r; // flip Y

    // Gradient line
    const grad = ctx.createLinearGradient(cx, cy, ex, ey);
    grad.addColorStop(0, '#58a6ff44');
    grad.addColorStop(1, '#58a6ff');
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ex, ey);
    ctx.strokeStyle = grad;
    ctx.lineWidth   = 2;
    ctx.stroke();

    // Arrowhead
    const dir     = Math.atan2(ey - cy, ex - cx);
    const headLen = 7;
    const headAng = Math.PI / 5;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - headLen * Math.cos(dir - headAng), ey - headLen * Math.sin(dir - headAng));
    ctx.lineTo(ex - headLen * Math.cos(dir + headAng), ey - headLen * Math.sin(dir + headAng));
    ctx.closePath();
    ctx.fillStyle = '#58a6ff';
    ctx.fill();

    // Handle dot
    ctx.beginPath();
    ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  private _finish(result: BodyCreateParams | null): void {
    this.el.style.display = 'none';
    this.resolve?.(result);
    this.resolve = null;
  }
}
