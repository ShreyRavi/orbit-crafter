import type { BodyData } from './constants';
import { G } from './constants';
import { temperatureToColor, defaultColor } from './bodyState';

// ─── Context Menu ──────────────────────────────────────────────────────────────

export interface ContextMenuItem {
  label?: string;
  header?: boolean;
  separator?: boolean;
  action?: () => void;
}

export class ContextMenu {
  private el: HTMLElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'ctx-menu';
    document.body.appendChild(this.el);

    document.addEventListener('mousedown', (e) => {
      if (this.el.classList.contains('ctx-visible') && !this.el.contains(e.target as Node)) {
        this.hide();
      }
    }, true);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hide();
    });
  }

  show(cssX: number, cssY: number, items: ContextMenuItem[]): void {
    this.el.innerHTML = '';
    for (const item of items) {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'ctx-sep';
        this.el.appendChild(sep);
        continue;
      }
      if (item.header) {
        const h = document.createElement('div');
        h.className = 'ctx-header';
        h.textContent = item.label ?? '';
        this.el.appendChild(h);
        continue;
      }
      const btn = document.createElement('button');
      btn.className = 'ctx-item';
      btn.textContent = item.label ?? '';
      btn.addEventListener('click', () => {
        this.hide();
        item.action?.();
      });
      this.el.appendChild(btn);
    }

    this.el.style.left = `${cssX}px`;
    this.el.style.top  = `${cssY}px`;
    this.el.classList.add('ctx-visible');

    requestAnimationFrame(() => {
      const rect = this.el.getBoundingClientRect();
      if (rect.right > window.innerWidth - 8) {
        this.el.style.left = `${cssX - rect.width}px`;
      }
      if (rect.bottom > window.innerHeight - 8) {
        this.el.style.top = `${cssY - rect.height}px`;
      }
    });
  }

  hide(): void {
    this.el.classList.remove('ctx-visible');
  }
}

// ─── Spawn Wizard ──────────────────────────────────────────────────────────────

export interface SpawnResult {
  pos:         [number, number];
  vel:         [number, number];
  mass:        number;
  temperature: number;
  name:        string;
}

interface Preset { label: string; massLog: number; temp: number; prefix: string; }

const PRESETS: Preset[] = [
  { label: 'Moon',   massLog: 1.5, temp: 150,  prefix: 'Moon'   },
  { label: 'Rocky',  massLog: 3.5, temp: 300,  prefix: 'Planet' },
  { label: 'Gas',    massLog: 4.7, temp: 120,  prefix: 'Planet' },
  { label: 'Star',   massLog: 6.3, temp: 5800, prefix: 'Star'   },
];

export class SpawnWizard {
  private el:       HTMLElement;
  private spawnCb:  ((r: SpawnResult) => void) | null = null;
  private worldPos: [number, number] = [0, 0];
  private bodies:   BodyData[] = [];

  private nameInput!:   HTMLInputElement;
  private massSlider!:  HTMLInputElement;
  private massVal!:     HTMLElement;
  private massType!:    HTMLElement;
  private tempSlider!:  HTMLInputElement;
  private colorSwatch!: HTMLElement;
  private vxInput!:     HTMLInputElement;
  private vyInput!:     HTMLInputElement;
  private preview!:     HTMLCanvasElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'wz-overlay';
    this.el.innerHTML = `
<div class="wz-card">
  <div class="wz-hdr">
    <span class="wz-title">Spawn Body</span>
    <button class="wz-x">✕</button>
  </div>
  <div class="wz-presets">
    ${PRESETS.map((p, i) => `<button class="wz-preset" data-i="${i}">${p.label}</button>`).join('')}
  </div>
  <div class="wz-preview-strip">
    <canvas class="wz-preview"></canvas>
  </div>
  <div class="wz-fields">
    <div class="wz-row"><span class="wz-lbl">Name</span><input class="wz-input wz-name" type="text"/></div>
    <div class="wz-row">
      <span class="wz-lbl">Mass</span>
      <span class="wz-mass-type wz-dim"></span>
      <span class="wz-mass-val"></span>
    </div>
    <input class="wz-range wz-mass-log" type="range" min="0" max="7" step="0.01"/>
    <div class="wz-row" style="margin-top:6px">
      <span class="wz-lbl">Temp (K)</span>
      <span class="wz-swatch"></span>
    </div>
    <input class="wz-range wz-temp" type="range" min="1000" max="40000" step="100"/>
    <div class="wz-row" style="margin-top:8px">
      <span class="wz-lbl">Velocity</span>
      <button class="wz-circ">Circular ↺</button>
    </div>
    <div class="wz-vrow">
      <input class="wz-input wz-vx" type="number" step="any" placeholder="vx"/>
      <input class="wz-input wz-vy" type="number" step="any" placeholder="vy"/>
    </div>
  </div>
  <div class="wz-footer">
    <button class="wz-cancel">Cancel</button>
    <button class="wz-spawn">Spawn →</button>
  </div>
</div>`;
    document.body.appendChild(this.el);
    this._bind();
  }

  private _bind(): void {
    this.nameInput   = this.el.querySelector('.wz-name')!;
    this.massSlider  = this.el.querySelector('.wz-mass-log')!;
    this.massVal     = this.el.querySelector('.wz-mass-val')!;
    this.massType    = this.el.querySelector('.wz-mass-type')!;
    this.tempSlider  = this.el.querySelector('.wz-temp')!;
    this.colorSwatch = this.el.querySelector('.wz-swatch')!;
    this.vxInput     = this.el.querySelector('.wz-vx')!;
    this.vyInput     = this.el.querySelector('.wz-vy')!;
    this.preview     = this.el.querySelector('.wz-preview')!;

    this.el.querySelectorAll('.wz-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt((btn as HTMLElement).dataset.i!, 10);
        this._applyPreset(i);
        this.el.querySelectorAll('.wz-preset').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    this.massSlider.addEventListener('input', () => { this._refreshMass(); this._drawPreview(); });
    this.tempSlider.addEventListener('input', () => { this._refreshTemp(); this._drawPreview(); });
    this.el.querySelector('.wz-circ')!.addEventListener('click', () => this._setCirc());
    this.el.querySelector('.wz-x')!.addEventListener('click', () => this.hide());
    this.el.querySelector('.wz-cancel')!.addEventListener('click', () => this.hide());
    this.el.querySelector('.wz-spawn')!.addEventListener('click', () => this._doSpawn());
    this.el.addEventListener('click', e => { if (e.target === this.el) this.hide(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.el.classList.contains('wz-open')) this.hide();
    });
  }

  private _applyPreset(i: number): void {
    const p = PRESETS[i];
    this.massSlider.value = String(p.massLog);
    this.tempSlider.value = String(Math.max(1000, p.temp));
    this.nameInput.value  = p.prefix;
    this._refreshMass();
    this._refreshTemp();
    this._drawPreview();
  }

  private _refreshMass(): void {
    const mass = Math.pow(10, parseFloat(this.massSlider.value));
    this.massVal.textContent  = this._fmt(mass);
    this.massType.textContent = mass > 2e5 ? 'Star' : mass > 1e3 ? 'Planet' : 'Moon';
  }

  private _refreshTemp(): void {
    const temp = parseInt(this.tempSlider.value, 10);
    const rgb  = temperatureToColor(temp);
    this.colorSwatch.style.background = `rgb(${rgb})`;
  }

  private _drawPreview(): void {
    const canvas = this.preview;
    const dpr    = window.devicePixelRatio || 1;
    const cssSize = 96;
    canvas.width  = Math.round(cssSize * dpr);
    canvas.height = Math.round(cssSize * dpr);
    canvas.style.width  = cssSize + 'px';
    canvas.style.height = cssSize + 'px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    ctx.clearRect(0, 0, W, H);

    const mass = Math.pow(10, parseFloat(this.massSlider.value));
    const temp = parseInt(this.tempSlider.value, 10);
    const rgb  = temperatureToColor(temp);
    const col  = defaultColor(mass);
    // Body radius: log-scaled, DPR-aware, capped so body fits within canvas
    const r    = Math.min(32 * dpr, Math.max(7 * dpr, Math.log10(Math.max(mass, 1)) * 3.5 * dpr));

    const glowR = Math.min(r * 2.2, cx - 1); // clamp glow to canvas bounds
    const glow  = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, glowR);
    glow.addColorStop(0, `rgba(${rgb},0.35)`);
    glow.addColorStop(1, `rgba(${rgb},0)`);
    ctx.beginPath();
    ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    const body = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.20, 0, cx, cy, r);
    body.addColorStop(0,    `rgba(255,255,255,0.12)`);
    body.addColorStop(0.15, `rgb(${col})`);
    body.addColorStop(1,    `rgba(${col},0.45)`);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();
  }

  private _setCirc(): void {
    const [wx, wy] = this.worldPos;
    let maxF = 0;
    let att: BodyData | null = null;
    for (const b of this.bodies) {
      const dx = b.pos[0] - wx;
      const dy = b.pos[1] - wy;
      const r2 = dx * dx + dy * dy + 0.0625;
      const f  = G * b.mass / r2;
      if (f > maxF) { maxF = f; att = b; }
    }
    if (!att) return;
    const dx = wx - att.pos[0];
    const dy = wy - att.pos[1];
    const r  = Math.sqrt(dx * dx + dy * dy);
    if (r < 1e-6) return;
    const v  = Math.sqrt(G * att.mass / r);
    this.vxInput.value = (att.vel[0] + (-dy / r) * v).toFixed(3);
    this.vyInput.value = (att.vel[1] + ( dx / r) * v).toFixed(3);
  }

  private _doSpawn(): void {
    if (!this.spawnCb) return;
    this.spawnCb({
      pos:         [this.worldPos[0], this.worldPos[1]],
      vel:         [parseFloat(this.vxInput.value) || 0, parseFloat(this.vyInput.value) || 0],
      mass:        Math.pow(10, parseFloat(this.massSlider.value)),
      temperature: parseInt(this.tempSlider.value, 10),
      name:        this.nameInput.value.trim() || 'Body',
    });
    this.hide();
  }

  show(worldPos: [number, number], bodies: BodyData[], cb: (r: SpawnResult) => void): void {
    this.worldPos = worldPos;
    this.bodies   = bodies;
    this.spawnCb  = cb;
    this._applyPreset(1); // default: rocky planet
    this.vxInput.value = '0';
    this.vyInput.value = '0';
    this.el.querySelectorAll('.wz-preset').forEach((b, i) =>
      b.classList.toggle('active', i === 1));
    this.el.classList.add('wz-open');
  }

  hide(): void {
    this.el.classList.remove('wz-open');
    this.spawnCb = null;
  }

  private _fmt(n: number): string {
    if (n < 1e4) return Math.round(n).toString();
    const e = Math.floor(Math.log10(n));
    return `${(n / Math.pow(10, e)).toFixed(2)}e${e}`;
  }
}
