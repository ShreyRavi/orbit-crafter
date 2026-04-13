import { MIN_SPEED, MAX_SPEED } from '../utils/constants.js';
import { EngineStats } from '../SimulationEngine.js';

export class ControlBar {
  private container: HTMLElement;
  onPause?:     (paused: boolean) => void;
  onSpeed?:     (mult: number) => void;
  onStepOnce?: () => void;

  private pauseBtn!: HTMLButtonElement;
  private speedSlider!: HTMLInputElement;
  private speedLabel!: HTMLSpanElement;
  private statsLabel!: HTMLSpanElement;
  private paused = false;
  private speed  = 1.0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.innerHTML = `
      <div class="control-bar-inner">
        <button id="btn-pause" class="ctrl-btn" title="Play/Pause">⏸</button>
        <button id="btn-step"  class="ctrl-btn" title="Step frame">⏭</button>
        <div class="speed-wrap">
          <label class="ctrl-label">Speed</label>
          <input id="speed-slider" type="range" min="-4" max="4" step="0.01" value="0" class="speed-slider" />
          <span id="speed-label" class="ctrl-val">×1.0</span>
        </div>
        <div class="stats-wrap">
          <span id="stats-label" class="stats-text">0 bodies · 0 fps</span>
        </div>
      </div>
    `;

    this.pauseBtn   = this.container.querySelector('#btn-pause')!;
    this.speedSlider = this.container.querySelector('#speed-slider')!;
    this.speedLabel  = this.container.querySelector('#speed-label')!;
    this.statsLabel  = this.container.querySelector('#stats-label')!;

    this.pauseBtn.addEventListener('click', () => {
      this.paused = !this.paused;
      this.pauseBtn.textContent = this.paused ? '▶' : '⏸';
      this.onPause?.(this.paused);
    });

    this.container.querySelector('#btn-step')!.addEventListener('click', () => {
      this.onStepOnce?.();
    });

    this.speedSlider.addEventListener('input', () => {
      const exp = parseFloat(this.speedSlider.value);
      this.speed = Math.pow(10, exp);
      this.speedLabel.textContent = `×${this.speed < 1 ? this.speed.toExponential(1) : this.speed.toFixed(this.speed >= 100 ? 0 : 1)}`;
      this.onSpeed?.(this.speed);
    });
  }

  updateStats(stats: EngineStats): void {
    const t = stats.simTime;
    const tStr = t >= 1000 ? `${(t / 1000).toFixed(1)}k` : t.toFixed(1);
    this.statsLabel.textContent =
      `${stats.bodyCount} bodies · ${stats.fps} fps · T=${tStr} · ${stats.mode} · ×${stats.stepsPerFrame}`;
  }

  setPaused(p: boolean): void {
    this.paused = p;
    this.pauseBtn.textContent = p ? '▶' : '⏸';
  }
}
