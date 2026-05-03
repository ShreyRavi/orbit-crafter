import type { BodyData } from './constants';
import type { BodyState } from './bodyState';
import { temperatureToColor, isBlackHole, schwarzschildRadius } from './bodyState';
import { bodyRadius } from './constants';

export interface SidebarCallbacks {
  onNameChange: (idx: number, name: string) => void;
  onMassChange: (idx: number, mass: number) => void;
  onRadiusChange: (idx: number, radius: number, manual: boolean) => void;
  onVelocityChange: (idx: number, vel: [number, number]) => void;
  onTempChange: (idx: number, temp: number) => void;
  onClose: () => void;
  onStartVelocityDrag: () => void;  // activates viewport velocity-drag mode
}

export class Sidebar {
  isOpen: boolean = false;

  private callbacks: SidebarCallbacks;
  private currentIdx: number = -1;

  // DOM elements
  private el: HTMLElement;
  private nameInput!: HTMLInputElement;
  private previewCanvas!: HTMLCanvasElement;
  private massInput!: HTMLInputElement;
  private typeLabel!: HTMLElement;
  private radiusInput!: HTMLInputElement;
  private volumeVal!: HTMLElement;
  private densityVal!: HTMLElement;
  private velDial!: HTMLCanvasElement;
  private vxInput!: HTMLInputElement;
  private vyInput!: HTMLInputElement;
  private tempRange!: HTMLInputElement;
  private colorSwatch!: HTMLElement;
  private schwarVal!: HTMLElement;
  private bhWarning!: HTMLElement;

  // Velocity dial state
  private _dialDragging: boolean = false;
  private _currentVel: [number, number] = [0, 0];

  constructor(container: HTMLElement, callbacks: SidebarCallbacks) {
    this.callbacks = callbacks;
    this.el = container;
    this.el.id = 'sidebar';
    this._build();
  }

  private _build(): void {
    this.el.innerHTML = `
      <div class="sb-header">
        <input class="sb-name" type="text" placeholder="Name" />
        <button class="sb-close">✕</button>
      </div>
      <div class="sb-preview">
        <canvas class="sb-preview-canvas" width="80" height="80"></canvas>
      </div>
      <div class="sb-section">
        <div class="sb-section-title">Physical</div>
        <div class="sb-row">
          <span class="sb-label">Mass</span>
          <span class="sb-type-label sb-value"></span>
          <input class="sb-input sb-mass-input" type="number" step="any" />
        </div>
        <div class="sb-row">
          <span class="sb-label">Radius</span>
          <input class="sb-input sb-radius-input" type="number" step="any" min="1" />
        </div>
        <div class="sb-row">
          <span class="sb-label">Volume</span>
          <span class="sb-value sb-vol-val"></span>
        </div>
        <div class="sb-row">
          <span class="sb-label">Density</span>
          <span class="sb-value sb-den-val"></span>
        </div>
      </div>
      <div class="sb-section">
        <div class="sb-section-title">Motion</div>
        <canvas class="sb-vel-dial" width="100" height="100"></canvas>
        <div class="sb-vel-row">
          <input class="sb-input sb-vx-input" type="number" step="any" placeholder="vx" />
          <input class="sb-input sb-vy-input" type="number" step="any" placeholder="vy" />
        </div>
        <button class="sb-btn sb-vel-drag-btn">Drag in viewport →</button>
      </div>
      <div class="sb-section">
        <div class="sb-section-title">Appearance</div>
        <div class="sb-temp-row">
          <input class="sb-range sb-temp-range" type="range" min="1000" max="40000" step="100" />
          <div class="sb-color-swatch"></div>
        </div>
      </div>
      <div class="sb-bh-warning" style="display:none"></div>
    `;

    // Grab references
    this.nameInput = this.el.querySelector('.sb-name')!;
    this.previewCanvas = this.el.querySelector('.sb-preview-canvas')!;
    this.massInput = this.el.querySelector('.sb-mass-input')!;
    this.typeLabel = this.el.querySelector('.sb-type-label')!;
    this.radiusInput = this.el.querySelector('.sb-radius-input')!;
    this.volumeVal = this.el.querySelector('.sb-vol-val')!;
    this.densityVal = this.el.querySelector('.sb-den-val')!;
    this.velDial = this.el.querySelector('.sb-vel-dial')!;
    this.vxInput = this.el.querySelector('.sb-vx-input')!;
    this.vyInput = this.el.querySelector('.sb-vy-input')!;
    this.tempRange = this.el.querySelector('.sb-temp-range')!;
    this.colorSwatch = this.el.querySelector('.sb-color-swatch')!;
    this.schwarVal = this.el.querySelector('.sb-bh-warning')!;
    this.bhWarning = this.schwarVal;

    // Helper: fire on blur OR Enter key
    const onCommit = (input: HTMLInputElement, fn: () => void) => {
      input.addEventListener('change', fn);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { fn(); input.blur(); } });
    };

    // Event listeners
    const closeBtn = this.el.querySelector('.sb-close')!;
    closeBtn.addEventListener('click', () => this.callbacks.onClose());

    onCommit(this.nameInput, () => {
      if (this.currentIdx < 0) return;
      this.callbacks.onNameChange(this.currentIdx, this.nameInput.value);
    });

    onCommit(this.massInput, () => {
      if (this.currentIdx < 0) return;
      const mass = parseFloat(this.massInput.value);
      if (isFinite(mass) && mass > 0) {
        this.callbacks.onMassChange(this.currentIdx, mass);
      }
    });

    onCommit(this.radiusInput, () => {
      if (this.currentIdx < 0) return;
      const r = parseFloat(this.radiusInput.value);
      if (isFinite(r) && r > 0) {
        this.callbacks.onRadiusChange(this.currentIdx, r, true);
      }
    });

    const commitVelocity = () => {
      if (this.currentIdx < 0) return;
      const vx = parseFloat(this.vxInput.value);
      const vy = parseFloat(this.vyInput.value);
      if (isFinite(vx) && isFinite(vy)) {
        this._currentVel = [vx, vy];
        this.callbacks.onVelocityChange(this.currentIdx, [vx, vy]);
        this._drawDial();
      }
    };
    onCommit(this.vxInput, commitVelocity);
    onCommit(this.vyInput, commitVelocity);

    this.tempRange.addEventListener('input', () => {
      if (this.currentIdx < 0) return;
      const temp = parseInt(this.tempRange.value, 10);
      this._updateColorSwatch(temp);
      this.callbacks.onTempChange(this.currentIdx, temp);
    });

    const velDragBtn = this.el.querySelector('.sb-vel-drag-btn')!;
    velDragBtn.addEventListener('click', () => this.callbacks.onStartVelocityDrag());

    // Velocity dial mouse events
    this.velDial.addEventListener('mousedown', (e) => this._dialStart(e));
    window.addEventListener('mousemove', (e) => this._dialMove(e));
    window.addEventListener('mouseup', () => { this._dialDragging = false; });

    this._drawDial();
  }

  private _dialStart(e: MouseEvent): void {
    this._dialDragging = true;
    this._dialUpdate(e);
  }

  private _dialMove(e: MouseEvent): void {
    if (!this._dialDragging) return;
    this._dialUpdate(e);
  }

  private _dialUpdate(e: MouseEvent): void {
    const rect = this.velDial.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const maxR = rect.width / 2;
    // Map to velocity: full radius = speed of ~100 units
    const scale = 100 / maxR;
    const vx = dx * scale;
    const vy = dy * scale;
    this._currentVel = [vx, vy];
    this.vxInput.value = vx.toFixed(2);
    this.vyInput.value = vy.toFixed(2);
    this._drawDial();
    if (this.currentIdx >= 0) {
      this.callbacks.onVelocityChange(this.currentIdx, [vx, vy]);
    }
  }

  private _drawDial(): void {
    const canvas = this.velDial;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const maxR = Math.min(cx, cy) - 2;

    ctx.clearRect(0, 0, W, H);

    // Background circle
    ctx.beginPath();
    ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Crosshairs
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.moveTo(cx, cy - maxR);
    ctx.lineTo(cx, cy + maxR);
    ctx.moveTo(cx - maxR, cy);
    ctx.lineTo(cx + maxR, cy);
    ctx.stroke();

    // Velocity dot
    const [vx, vy] = this._currentVel;
    const speed = Math.sqrt(vx * vx + vy * vy);
    const scale = maxR / 100;
    const dotX = cx + vx * scale;
    const dotY = cy + vy * scale;

    if (speed > 0.01) {
      // Arrow line
      ctx.strokeStyle = 'rgba(120,200,255,0.70)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(dotX, dotY);
      ctx.stroke();
    }

    // Dot
    ctx.beginPath();
    ctx.arc(
      Math.max(cx - maxR, Math.min(cx + maxR, dotX)),
      Math.max(cy - maxR, Math.min(cy + maxR, dotY)),
      4,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = 'rgba(120,200,255,0.90)';
    ctx.fill();
  }

  private _updateColorSwatch(temp: number): void {
    const rgb = temperatureToColor(temp);
    this.colorSwatch.style.backgroundColor = `rgb(${rgb})`;
  }

  private _drawPreview(temp: number, mass?: number): void {
    const canvas = this.previewCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;

    ctx.clearRect(0, 0, W, H);

    const rgb = temperatureToColor(temp);
    const r   = mass ? Math.min(28, Math.max(9, Math.sqrt(mass) * 0.9)) : 22;

    // Subtle corona — only just outside the solid body
    const glow = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.7);
    glow.addColorStop(0,   `rgba(${rgb},0.30)`);
    glow.addColorStop(0.5, `rgba(${rgb},0.08)`);
    glow.addColorStop(1,   `rgba(${rgb},0)`);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.7, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // Solid body with limb darkening (off-centre highlight)
    const body = ctx.createRadialGradient(cx - r * 0.28, cy - r * 0.22, 0, cx, cy, r);
    body.addColorStop(0,    `rgba(255,255,255,0.10)`);
    body.addColorStop(0.15, `rgba(${rgb},1)`);
    body.addColorStop(0.75, `rgba(${rgb},0.93)`);
    body.addColorStop(1,    `rgba(${rgb},0.45)`);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();
  }

  private _massTypeLabel(mass: number): string {
    if (mass > 0.1 * 1e6) return 'Star';
    if (mass > 0.1 * 1e3) return 'Planet';
    return 'Moon';
  }

  private _formatSci(n: number): string {
    if (n === 0) return '0';
    const exp = Math.floor(Math.log10(Math.abs(n)));
    const mant = n / Math.pow(10, exp);
    if (Math.abs(exp) < 4) return n.toFixed(2);
    return `${mant.toFixed(2)}e${exp}`;
  }

  open(idx: number, body: BodyData, state: BodyState): void {
    this.currentIdx = idx;
    this.isOpen = true;
    this.el.classList.add('open');
    this.updateBody(body, state);
  }

  close(): void {
    this.isOpen = false;
    this.currentIdx = -1;
    this.el.classList.remove('open');
  }

  updateBody(body: BodyData, state: BodyState): void {
    this.nameInput.value = state.name;

    const mass = body.mass;
    const radius = body.radius;

    this.massInput.value = this._formatSci(mass);
    this.typeLabel.textContent = this._massTypeLabel(mass);
    this.radiusInput.value = radius.toFixed(2);

    const volume = (4 / 3) * Math.PI * radius * radius * radius;
    const density = volume > 0 ? mass / volume : 0;
    this.volumeVal.textContent = this._formatSci(volume);
    this.densityVal.textContent = this._formatSci(density);

    // Velocity
    this._currentVel = [body.vel[0], body.vel[1]];
    this.vxInput.value = body.vel[0].toFixed(3);
    this.vyInput.value = body.vel[1].toFixed(3);
    this._drawDial();

    // Temperature
    this.tempRange.value = String(Math.round(state.temperature));
    this._updateColorSwatch(state.temperature);

    // Preview
    this._drawPreview(state.temperature, mass);

    // Schwarzschild
    const rSch = schwarzschildRadius(mass);
    if (isBlackHole(mass, radius)) {
      this.bhWarning.style.display = '';
      this.bhWarning.textContent = `⚠ Black hole! r_s = ${rSch.toFixed(2)}, body r = ${radius.toFixed(2)}`;
    } else if (rSch > radius * 0.5) {
      this.bhWarning.style.display = '';
      this.bhWarning.textContent = `r_s = ${rSch.toFixed(2)} (approaching body radius ${radius.toFixed(2)})`;
    } else {
      this.bhWarning.style.display = 'none';
    }
  }

  destroy(): void {
    this.el.innerHTML = '';
    this.el.classList.remove('open');
    this.isOpen = false;
    this.currentIdx = -1;
  }
}

// Needed for unused import suppression in strict mode
void bodyRadius;
