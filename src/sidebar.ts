import type { BodyData } from './constants';
import type { BodyState } from './bodyState';
import { temperatureToColor, isBlackHole, schwarzschildRadius } from './bodyState';
import { STAR_MASS } from './constants';

export interface SidebarCallbacks {
  onNameChange: (idx: number, name: string) => void;
  onMassChange: (idx: number, mass: number) => void;
  onVisRadiusMultChange: (idx: number, mult: number) => void;
  onVelocityChange: (idx: number, vel: [number, number]) => void;
  onTempChange: (idx: number, temp: number) => void;
  onClose: () => void;
  onStartVelocityDrag: () => void;
}

export class Sidebar {
  isOpen: boolean = false;

  private callbacks: SidebarCallbacks;
  private currentIdx: number = -1;

  // DOM elements
  private el: HTMLElement;
  private nameInput!: HTMLInputElement;
  private previewCanvas!: HTMLCanvasElement;
  private massSlider!: HTMLInputElement;
  private typeBadgeEl!: HTMLElement;
  private massValEl!: HTMLElement;
  private sizeSlider!: HTMLInputElement;
  private sizeValEl!: HTMLElement;
  private velDial!: HTMLCanvasElement;
  private vxInput!: HTMLInputElement;
  private vyInput!: HTMLInputElement;
  private tempRange!: HTMLInputElement;
  private colorSwatch!: HTMLElement;
  private bhWarning!: HTMLElement;

  // Velocity dial state
  private _dialDragging: boolean = false;
  private _currentVel: [number, number] = [0, 0];
  private _boundDialMove!: (e: MouseEvent) => void;
  private _boundDialUp!: () => void;

  // Input focus tracking — prevents physics readbacks from overwriting in-progress edits
  private _focusedInputs = new Set<HTMLInputElement>();
  // Suppress counter — blocks stale GPU readback updates for N calls after a user commit
  private _suppressCount = 0;

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

        <div class="sb-slider-header">
          <span class="sb-label">Mass</span>
          <span class="sb-type-badge"></span>
        </div>
        <input class="sb-range sb-mass-slider" type="range" min="0" max="7.3" step="0.02" />
        <div class="sb-slider-readout">
          <span class="sb-mass-val"></span>
        </div>

        <div class="sb-slider-header" style="margin-top:10px">
          <span class="sb-label">Size</span>
          <span class="sb-size-val">1.0×</span>
        </div>
        <input class="sb-range sb-size-slider" type="range" min="0.2" max="5" step="0.05" />
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
    this.nameInput    = this.el.querySelector('.sb-name')!;
    this.previewCanvas = this.el.querySelector('.sb-preview-canvas')!;
    this.massSlider   = this.el.querySelector('.sb-mass-slider')!;
    this.typeBadgeEl  = this.el.querySelector('.sb-type-badge')!;
    this.massValEl    = this.el.querySelector('.sb-mass-val')!;
    this.sizeSlider   = this.el.querySelector('.sb-size-slider')!;
    this.sizeValEl    = this.el.querySelector('.sb-size-val')!;
    this.velDial      = this.el.querySelector('.sb-vel-dial')!;
    this.vxInput      = this.el.querySelector('.sb-vx-input')!;
    this.vyInput      = this.el.querySelector('.sb-vy-input')!;
    this.tempRange    = this.el.querySelector('.sb-temp-range')!;
    this.colorSwatch  = this.el.querySelector('.sb-color-swatch')!;
    this.bhWarning    = this.el.querySelector('.sb-bh-warning')!;

    // Track which inputs are currently focused to block physics readback overwrites
    const trackFocus = (el: HTMLInputElement) => {
      el.addEventListener('focus', () => this._focusedInputs.add(el));
      el.addEventListener('blur',  () => this._focusedInputs.delete(el));
    };
    trackFocus(this.nameInput);
    trackFocus(this.massSlider);
    trackFocus(this.sizeSlider);
    trackFocus(this.vxInput);
    trackFocus(this.vyInput);
    trackFocus(this.tempRange);

    // Helper: fire on blur OR Enter key; suppress stale GPU readbacks
    const onCommit = (input: HTMLInputElement, fn: () => void) => {
      const go = () => { this._suppressCount = 3; fn(); };
      input.addEventListener('change', go);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { go(); input.blur(); } });
    };

    // Name
    const closeBtn = this.el.querySelector('.sb-close')!;
    closeBtn.addEventListener('click', () => this.callbacks.onClose());
    onCommit(this.nameInput, () => {
      if (this.currentIdx < 0) return;
      this.callbacks.onNameChange(this.currentIdx, this.nameInput.value);
    });

    // Mass slider — live updates
    this.massSlider.addEventListener('input', () => {
      if (this.currentIdx < 0) return;
      const mass = Math.pow(10, parseFloat(this.massSlider.value));
      this.massValEl.textContent  = this._formatMass(mass);
      this.typeBadgeEl.textContent = this._massTypeLabel(mass);
      this.callbacks.onMassChange(this.currentIdx, mass);
    });

    // Size slider — live updates
    this.sizeSlider.addEventListener('input', () => {
      if (this.currentIdx < 0) return;
      const mult = parseFloat(this.sizeSlider.value);
      this.sizeValEl.textContent = this._formatMult(mult);
      this.callbacks.onVisRadiusMultChange(this.currentIdx, mult);
    });

    // Velocity
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
      this._suppressCount = 3;
      const temp = parseInt(this.tempRange.value, 10);
      this._updateColorSwatch(temp);
      this.callbacks.onTempChange(this.currentIdx, temp);
    });

    const velDragBtn = this.el.querySelector('.sb-vel-drag-btn')!;
    velDragBtn.addEventListener('click', () => this.callbacks.onStartVelocityDrag());

    // Velocity dial
    this._boundDialMove = (e: MouseEvent) => this._dialMove(e);
    this._boundDialUp   = () => { this._dialDragging = false; };
    this.velDial.addEventListener('mousedown', (e) => this._dialStart(e));
    window.addEventListener('mousemove', this._boundDialMove);
    window.addEventListener('mouseup',   this._boundDialUp);

    this._drawDial();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private _massTypeLabel(mass: number): string {
    if (mass >= 0.5 * STAR_MASS) return 'Star';
    if (mass >= 50000) return 'Giant';
    if (mass >= 1000) return 'Planet';
    if (mass >= 10) return 'Moon';
    return 'Dust';
  }

  private _formatMass(mass: number): string {
    if (mass >= 1e6) return `${(mass / 1e6).toFixed(1)}M`;
    if (mass >= 1000) return `${(mass / 1000).toFixed(1)}k`;
    return mass.toFixed(0);
  }

  private _formatMult(mult: number): string {
    const v = mult.toFixed(2);
    return mult === 1 || Math.abs(mult - 1) < 0.03 ? '1.0× (auto)' : `${v}×`;
  }

  // ── Dial ───────────────────────────────────────────────────────────────────

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
    ctx.beginPath();
    ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR);
    ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy);
    ctx.stroke();

    const [vx, vy] = this._currentVel;
    const speed = Math.sqrt(vx * vx + vy * vy);
    const scale = maxR / 100;
    const dotX = cx + vx * scale;
    const dotY = cy + vy * scale;

    if (speed > 0.01) {
      ctx.strokeStyle = 'rgba(120,200,255,0.70)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(dotX, dotY);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(
      Math.max(cx - maxR, Math.min(cx + maxR, dotX)),
      Math.max(cy - maxR, Math.min(cy + maxR, dotY)),
      4, 0, Math.PI * 2,
    );
    ctx.fillStyle = 'rgba(120,200,255,0.90)';
    ctx.fill();
  }

  private _updateColorSwatch(temp: number): void {
    const rgb = temperatureToColor(temp);
    this.colorSwatch.style.backgroundColor = `rgb(${rgb})`;
  }

  private _drawPreview(temp: number, mass?: number, mult = 1): void {
    const canvas = this.previewCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;

    ctx.clearRect(0, 0, W, H);

    const rgb = temperatureToColor(temp);
    const baseR = mass ? Math.min(28, Math.max(9, Math.sqrt(mass) * 0.9)) : 22;
    const r     = Math.min(32, baseR * Math.max(0.2, Math.min(mult, 3.5)));

    const glow = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.7);
    glow.addColorStop(0,   `rgba(${rgb},0.30)`);
    glow.addColorStop(0.5, `rgba(${rgb},0.08)`);
    glow.addColorStop(1,   `rgba(${rgb},0)`);
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(r * 1.7, cx - 1), 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

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

  // ── Open / close ───────────────────────────────────────────────────────────

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

  suppressPhysicsUpdates(n: number): void {
    this._suppressCount = Math.max(this._suppressCount, n);
  }

  // Called from scheduleCpuRead — skipped if suppress counter > 0 (stale GPU data)
  updateBody(body: BodyData, state: BodyState): void {
    if (this._suppressCount > 0) {
      this._suppressCount--;
      return;
    }
    this._doUpdate(body, state);
  }

  // Called directly after a user commit — always applies and resets the suppress counter
  updateBodyImmediate(body: BodyData, state: BodyState): void {
    this._suppressCount = 3;
    this._doUpdate(body, state);
  }

  private _doUpdate(body: BodyData, state: BodyState): void {
    if (!this._focusedInputs.has(this.nameInput)) {
      this.nameInput.value = state.name;
    }

    const mass = body.mass;
    const mult = state.visRadiusMult ?? 1;

    if (!this._focusedInputs.has(this.massSlider)) {
      this.massSlider.value       = String(Math.log10(Math.max(mass, 1)));
      this.massValEl.textContent  = this._formatMass(mass);
      this.typeBadgeEl.textContent = this._massTypeLabel(mass);
    }

    if (!this._focusedInputs.has(this.sizeSlider)) {
      this.sizeSlider.value      = String(mult);
      this.sizeValEl.textContent = this._formatMult(mult);
    }

    if (!this._focusedInputs.has(this.vxInput) && !this._focusedInputs.has(this.vyInput) && !this._dialDragging) {
      this._currentVel   = [body.vel[0], body.vel[1]];
      this.vxInput.value = body.vel[0].toFixed(3);
      this.vyInput.value = body.vel[1].toFixed(3);
      this._drawDial();
    }

    if (!this._focusedInputs.has(this.tempRange)) {
      this.tempRange.value = String(Math.round(state.temperature));
      this._updateColorSwatch(state.temperature);
    }

    this._drawPreview(state.temperature, mass, mult);

    const rSch = schwarzschildRadius(mass);
    if (isBlackHole(mass, body.radius)) {
      this.bhWarning.style.display = '';
      this.bhWarning.textContent = `⚠ Black hole! r_s = ${rSch.toFixed(2)}, body r = ${body.radius.toFixed(2)}`;
    } else if (rSch > body.radius * 0.5) {
      this.bhWarning.style.display = '';
      this.bhWarning.textContent = `r_s = ${rSch.toFixed(2)} (approaching body radius ${body.radius.toFixed(2)})`;
    } else {
      this.bhWarning.style.display = 'none';
    }
  }

  destroy(): void {
    window.removeEventListener('mousemove', this._boundDialMove);
    window.removeEventListener('mouseup',   this._boundDialUp);
    this._focusedInputs.clear();
    this.el.innerHTML = '';
    this.el.classList.remove('open');
    this.isOpen = false;
    this.currentIdx = -1;
  }
}
