import { BodySystem, Body } from '../BodySystem.js';

export interface MassEditCallbacks {
  onDeleteByType:  (type: Body['type'] | 'all') => void;
  onSelectByType:  (type: Body['type'] | 'all') => void;
  onScaleMasses:   (type: Body['type'] | 'all', factor: number) => void;
  onSetVelocities: (type: Body['type'] | 'all', vx: number, vy: number) => void;
}

export class MassEditPanel {
  private container: HTMLElement;
  private cbs: MassEditCallbacks;

  constructor(container: HTMLElement, cbs: MassEditCallbacks) {
    this.container = container;
    this.cbs = cbs;
    this._build();
  }

  private _build(): void {
    this.container.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">Mass Edit</span>
      </div>
      <div class="mass-edit-content">

        <div class="section-header">Delete bodies</div>
        <div class="mass-edit-row">
          <select id="me-delete-type" class="mode-select me-select">
            <option value="all">All bodies</option>
            <option value="asteroid">All asteroids</option>
            <option value="planet">All planets</option>
            <option value="moon">All moons</option>
            <option value="rocket">All rockets</option>
            <option value="star">All stars</option>
          </select>
          <button id="me-delete-btn" class="danger-btn">Delete</button>
        </div>

        <div class="section-header">Select bodies</div>
        <div class="mass-edit-row">
          <select id="me-select-type" class="mode-select me-select">
            <option value="all">All bodies</option>
            <option value="asteroid">Asteroids</option>
            <option value="planet">Planets</option>
            <option value="moon">Moons</option>
            <option value="rocket">Rockets</option>
            <option value="star">Stars</option>
          </select>
          <button id="me-select-btn" class="action-btn">Select</button>
        </div>

        <div class="section-header">Scale masses</div>
        <div class="mass-edit-row">
          <select id="me-scale-type" class="mode-select me-select">
            <option value="all">All bodies</option>
            <option value="asteroid">Asteroids</option>
            <option value="planet">Planets</option>
            <option value="moon">Moons</option>
          </select>
          <input id="me-scale-factor" type="number" value="2" step="0.1" min="0.01" class="num-input me-num" />
          <span class="field-val">×</span>
          <button id="me-scale-btn" class="action-btn">Apply</button>
        </div>

        <div class="section-header">Set velocity</div>
        <div class="mass-edit-row">
          <select id="me-vel-type" class="mode-select me-select">
            <option value="all">All bodies</option>
            <option value="asteroid">Asteroids</option>
            <option value="rocket">Rockets</option>
          </select>
        </div>
        <div class="mass-edit-row">
          <label class="ctrl-label">VX</label>
          <input id="me-vx" type="number" value="0" step="0.1" class="num-input me-num" />
          <label class="ctrl-label">VY</label>
          <input id="me-vy" type="number" value="0" step="0.1" class="num-input me-num" />
          <button id="me-vel-btn" class="action-btn">Set</button>
        </div>

      </div>
    `;

    const get = <T extends HTMLElement>(id: string) =>
      this.container.querySelector<T>('#' + id)!;

    get('me-delete-btn').addEventListener('click', () => {
      const type = get<HTMLSelectElement>('me-delete-type').value as Body['type'] | 'all';
      const label = type === 'all' ? 'ALL bodies' : `all ${type} bodies`;
      if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
      this.cbs.onDeleteByType(type);
    });

    get('me-select-btn').addEventListener('click', () => {
      const type = get<HTMLSelectElement>('me-select-type').value as Body['type'] | 'all';
      this.cbs.onSelectByType(type);
    });

    get('me-scale-btn').addEventListener('click', () => {
      const type   = get<HTMLSelectElement>('me-scale-type').value as Body['type'] | 'all';
      const factor = parseFloat(get<HTMLInputElement>('me-scale-factor').value);
      if (!isFinite(factor) || factor <= 0) return;
      this.cbs.onScaleMasses(type, factor);
    });

    get('me-vel-btn').addEventListener('click', () => {
      const type = get<HTMLSelectElement>('me-vel-type').value as Body['type'] | 'all';
      const vx   = parseFloat(get<HTMLInputElement>('me-vx').value);
      const vy   = parseFloat(get<HTMLInputElement>('me-vy').value);
      if (!isFinite(vx) || !isFinite(vy)) return;
      this.cbs.onSetVelocities(type, vx, vy);
    });
  }

  /** Update the body-count hint shown next to the delete selector. */
  updateCounts(bodySystem: BodySystem): void {
    // Could update option labels with counts — kept simple for now
  }
}
