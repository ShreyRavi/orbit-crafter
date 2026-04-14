import { MODE_EXACT, MODE_BARNES_HUT, MODE_HYBRID } from '../utils/constants.js';
import { SimMode } from '../GPUPhysicsEngine.js';
import { OverlayFlags } from '../SimulationEngine.js';

export class ModeSelector {
  private container: HTMLElement;
  onModeChange?:    (mode: SimMode) => void;
  onOverlayChange?: (flags: OverlayFlags) => void;

  private flags: OverlayFlags = {
    showTrails:    true,
    showLabels:    true,
    showLagrange:  true,
    showGravField: false,
    showVectors:   false,
  };

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.innerHTML = `
      <div class="topbar-inner">
        <div class="mode-group">
          <label class="topbar-label">Mode</label>
          <select id="mode-select" class="mode-select">
            <option value="${MODE_EXACT}">Exact (GPU)</option>
            <option value="${MODE_BARNES_HUT}">Barnes-Hut</option>
            <option value="${MODE_HYBRID}">Hybrid</option>
          </select>
        </div>
        <div class="overlay-group">
          <label class="topbar-label">Overlays</label>
          <label class="toggle-label"><input type="checkbox" id="chk-trails"   ${this.flags.showTrails   ? 'checked' : ''} /> Trails</label>
          <label class="toggle-label"><input type="checkbox" id="chk-labels"   ${this.flags.showLabels   ? 'checked' : ''} /> Labels</label>
          <label class="toggle-label"><input type="checkbox" id="chk-vectors"  ${this.flags.showVectors  ? 'checked' : ''} /> Vectors</label>
          <label class="toggle-label"><input type="checkbox" id="chk-lagrange" ${this.flags.showLagrange ? 'checked' : ''} /> L-Points</label>
          <label class="toggle-label"><input type="checkbox" id="chk-grav"     ${this.flags.showGravField? 'checked' : ''} /> Grav Field</label>
        </div>
        <div class="add-body-group">
          <select id="add-type-select" class="mode-select">
            <option value="star">Star</option>
            <option value="planet" selected>Planet</option>
            <option value="moon">Moon</option>
            <option value="asteroid">Asteroid</option>
            <option value="rocket">Rocket</option>
            <option value="black_hole">Black Hole</option>
          </select>
          <button id="btn-add-click" class="action-btn">+ Add (click canvas)</button>
        </div>
      </div>
    `;

    this.container.querySelector('#mode-select')!.addEventListener('change', e => {
      this.onModeChange?.((e.target as HTMLSelectElement).value as SimMode);
    });

    const chkIds: [string, keyof OverlayFlags][] = [
      ['chk-trails',   'showTrails'],
      ['chk-labels',   'showLabels'],
      ['chk-vectors',  'showVectors'],
      ['chk-lagrange', 'showLagrange'],
      ['chk-grav',     'showGravField'],
    ];
    for (const [id, flag] of chkIds) {
      this.container.querySelector<HTMLInputElement>('#' + id)!.addEventListener('change', e => {
        this.flags[flag] = (e.target as HTMLInputElement).checked;
        this.onOverlayChange?.(this.flags);
      });
    }
  }

  getAddType(): string {
    return (this.container.querySelector<HTMLSelectElement>('#add-type-select')?.value) ?? 'planet';
  }

  setAddClickListener(cb: () => void): void {
    this.container.querySelector('#btn-add-click')!.addEventListener('click', cb);
  }

  setMode(mode: SimMode): void {
    const sel = this.container.querySelector<HTMLSelectElement>('#mode-select');
    if (sel) sel.value = mode;
  }
}
