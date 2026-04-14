import { Body } from '../BodySystem.js';
import { formatSI } from '../utils/math.js';

export class Inspector {
  private container: HTMLElement;
  private selectedId: string | null = null;
  onUpdate?: (id: string, patch: Partial<Body>) => void;
  onThrustToggle?: (id: string, active: boolean) => void;
  onAutopilot?: (id: string) => void;
  onFollow?: (id: string | null) => void;
  private _followingId: string | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this._renderEmpty();
  }

  /** Keep the follow button in sync when follow is broken externally (e.g. camera pan). */
  syncFollowState(followingId: string | null): void {
    this._followingId = followingId;
    const btn = this.container.querySelector<HTMLButtonElement>('#btn-follow');
    if (!btn || !this.selectedId) return;
    const following = followingId === this.selectedId;
    btn.classList.toggle('active', following);
    btn.textContent = following ? '📍 Following' : '🎯 Follow';
  }

  private _renderEmpty(): void {
    this.container.innerHTML = `
      <div class="panel-header"><span class="panel-title">Inspector</span></div>
      <div class="inspector-empty">Select a body to inspect</div>
    `;
  }

  render(body: Body | null): void {
    if (!body) { this._renderEmpty(); return; }
    this.selectedId = body.id;

    const speed = Math.hypot(body.velocity[0], body.velocity[1]);
    const fuelBar = body.fuel !== undefined
      ? `<div class="field-row">
           <label>Fuel</label>
           <div class="fuel-bar-wrap">
             <div class="fuel-bar" style="width:${Math.min(100, (body.fuel / 1000) * 100).toFixed(1)}%"></div>
           </div>
           <span class="field-val">${body.fuel.toFixed(0)}</span>
         </div>` : '';

    const rocketControls = body.type === 'rocket' ? `
      <div class="rocket-controls">
        <div class="field-row">
          <label>Thrust (N/E/S/W keys)</label>
        </div>
        <div class="field-row">
          <label>Thrust mag</label>
          <input class="num-input" id="inp-thrust-mag" type="number" step="0.001" min="0.001" max="0.1" value="${(body.thrustMagnitude ?? 0.008).toFixed(4)}" />
        </div>
        <div class="btn-row">
          <button id="btn-thrust-toggle" class="action-btn ${body.thrustActive ? 'active' : ''}">
            ${body.thrustActive ? 'Engine ON' : 'Engine OFF'}
          </button>
          <button id="btn-autopilot" class="action-btn">Circularise</button>
        </div>
        ${fuelBar}
      </div>` : '';

    const isFollowing = this._followingId === body.id;
    this.container.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">Inspector</span>
        <div class="body-color-swatch" style="background:${body.color}"></div>
      </div>
      <div class="inspector-content">
        <div class="btn-row" style="padding:4px 8px 0">
          <button id="btn-follow" class="action-btn ${isFollowing ? 'active' : ''}" title="Follow body with camera">
            ${isFollowing ? '📍 Following' : '🎯 Follow'}
          </button>
        </div>
        <div class="field-row">
          <label>Name</label>
          <input class="text-input" id="inp-name" type="text" value="${body.name}" />
        </div>
        <div class="field-row">
          <label>Type</label>
          <select id="inp-type" class="select-input">
            ${['star','planet','moon','asteroid','rocket','black_hole'].map(t =>
              `<option value="${t}" ${t === body.type ? 'selected' : ''}>${t.replace('_', ' ')}</option>`
            ).join('')}
          </select>
        </div>
        <div class="field-row">
          <label>Color</label>
          <input id="inp-color" type="color" value="${body.color}" class="color-input" />
        </div>
        <div class="section-header">Physics</div>
        <div class="field-row">
          <label>Mass</label>
          <input class="num-input" id="inp-mass" type="number" step="any" value="${body.mass}" />
        </div>
        <div class="field-row">
          <label>Radius</label>
          <input class="num-input" id="inp-radius" type="number" step="0.01" min="0.01" value="${body.radius}" />
        </div>
        <div class="section-header">Position</div>
        <div class="field-row">
          <label>X</label>
          <input class="num-input" id="inp-px" type="number" step="any" value="${body.position[0].toFixed(4)}" />
          <label>Y</label>
          <input class="num-input" id="inp-py" type="number" step="any" value="${body.position[1].toFixed(4)}" />
        </div>
        <div class="section-header">Velocity</div>
        <div class="field-row">
          <label>VX</label>
          <input class="num-input" id="inp-vx" type="number" step="any" value="${body.velocity[0].toFixed(4)}" />
          <label>VY</label>
          <input class="num-input" id="inp-vy" type="number" step="any" value="${body.velocity[1].toFixed(4)}" />
        </div>
        <div class="field-row">
          <label>Speed</label>
          <span class="field-val">${formatSI(speed, 3)}</span>
        </div>
        ${rocketControls}
      </div>
    `;

    this._bindEvents(body);
  }

  private _bindEvents(body: Body): void {
    const get = <T extends HTMLElement>(id: string) =>
      this.container.querySelector<T>('#' + id)!;

    // Debounced input commit
    const commit = () => {
      if (!this.selectedId) return;
      const patch: Partial<Body> = {
        name:   get<HTMLInputElement>('inp-name').value,
        type:   get<HTMLSelectElement>('inp-type').value as Body['type'],
        color:  get<HTMLInputElement>('inp-color').value,
        mass:   parseFloat(get<HTMLInputElement>('inp-mass').value),
        radius: parseFloat(get<HTMLInputElement>('inp-radius').value),
        position: [
          parseFloat(get<HTMLInputElement>('inp-px').value),
          parseFloat(get<HTMLInputElement>('inp-py').value),
        ],
        velocity: [
          parseFloat(get<HTMLInputElement>('inp-vx').value),
          parseFloat(get<HTMLInputElement>('inp-vy').value),
        ],
      };
      this.onUpdate?.(this.selectedId!, patch);
    };

    ['inp-name','inp-type','inp-color','inp-mass','inp-radius',
     'inp-px','inp-py','inp-vx','inp-vy'].forEach(id => {
      const el = this.container.querySelector<HTMLInputElement>('#' + id);
      if (!el) return;
      el.addEventListener('change', commit);
    });

    const thrustToggle = this.container.querySelector('#btn-thrust-toggle');
    if (thrustToggle) {
      thrustToggle.addEventListener('click', () => {
        const active = !body.thrustActive;
        this.onThrustToggle?.(body.id, active);
      });
    }

    const autopilot = this.container.querySelector('#btn-autopilot');
    if (autopilot) {
      autopilot.addEventListener('click', () => {
        this.onAutopilot?.(body.id);
      });
    }

    const followBtn = this.container.querySelector<HTMLButtonElement>('#btn-follow');
    if (followBtn) {
      followBtn.addEventListener('click', () => {
        const nowFollowing = this._followingId === body.id;
        this._followingId = nowFollowing ? null : body.id;
        this.onFollow?.(this._followingId);
        // Update button state without full re-render
        followBtn.classList.toggle('active', !nowFollowing);
        followBtn.textContent = !nowFollowing ? '📍 Following' : '🎯 Follow';
      });
    }

    const thrustMag = this.container.querySelector<HTMLInputElement>('#inp-thrust-mag');
    if (thrustMag) {
      thrustMag.addEventListener('change', () => {
        this.onUpdate?.(body.id, { thrustMagnitude: parseFloat(thrustMag.value) });
      });
    }
  }
}
