import { MultiUniverseSaveSystem, SavedUniverse } from '../persistence/MultiUniverseSaveSystem.js';
import { CameraSystem } from '../CameraSystem.js';
import { UniverseManager } from '../UniverseManager.js';

export class UniverseManagerPanel {
  private container: HTMLElement;
  private saveSystem: MultiUniverseSaveSystem;
  private universe: UniverseManager;
  private camera: CameraSystem;

  onLoadSnapshot?:   (universeId: string, snapId: string) => void;
  onNewUniverse?:    () => void;
  onSwitchUniverse?: (universeId: string) => void;
  onDeleteUniverse?: (universeId: string) => void;

  constructor(
    container: HTMLElement,
    saveSystem: MultiUniverseSaveSystem,
    universe: UniverseManager,
    camera: CameraSystem
  ) {
    this.container  = container;
    this.saveSystem = saveSystem;
    this.universe   = universe;
    this.camera     = camera;
    this._build();
  }

  private _build(): void {
    this.container.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">Universes</span>
      </div>
      <div class="univ-actions">
        <button id="btn-new-univ"  class="action-btn">New</button>
        <button id="btn-dup-univ"  class="action-btn">Fork</button>
        <button id="btn-save-snap" class="action-btn">Snapshot</button>
        <button id="btn-export"    class="action-btn">Export</button>
        <button id="btn-import"    class="action-btn">Import</button>
      </div>
      <div id="univ-list" class="univ-list"></div>
    `;

    this.container.querySelector('#btn-new-univ')!.addEventListener('click', () => {
      this.onNewUniverse?.();
      this.render();
    });

    this.container.querySelector('#btn-dup-univ')!.addEventListener('click', () => {
      const copy = this.saveSystem.duplicateUniverse(this.universe.activeUniverseId);
      if (copy) this.render();
    });

    this.container.querySelector('#btn-save-snap')!.addEventListener('click', () => {
      const cam = this.camera.get();
      this.universe.saveCurrentSnapshot(
        new Date().toLocaleTimeString(),
        { x: cam.x, y: cam.y, zoom: cam.zoom }
      );
      this.render();
    });

    this.container.querySelector('#btn-export')!.addEventListener('click', () => {
      try {
        const json = this.saveSystem.exportUniverseJSON(this.universe.activeUniverseId);
        const blob = new Blob([json], { type: 'application/json' });
        const a    = document.createElement('a');
        a.href     = URL.createObjectURL(blob);
        a.download = 'universe.json';
        a.click();
      } catch (e) {
        alert('Export failed: ' + e);
      }
    });

    this.container.querySelector('#btn-import')!.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async () => {
        if (!input.files?.length) return;
        const text = await input.files[0].text();
        try {
          this.saveSystem.importUniverseJSON(text);
          this.render();
        } catch (e) {
          alert('Import failed: ' + e);
        }
      };
      input.click();
    });

    this.render();
  }

  render(): void {
    const listEl = this.container.querySelector<HTMLElement>('#univ-list')!;
    if (!listEl) return;
    const universes = this.saveSystem.listUniverses();
    listEl.innerHTML = '';

    for (const u of universes) {
      const item = document.createElement('div');
      item.className = 'univ-item' + (u.id === this.universe.activeUniverseId ? ' active' : '');
      item.innerHTML = `
        <div class="univ-header-row">
          <span class="univ-name">${u.name}</span>
          ${universes.length > 1
            ? `<button class="snap-del-btn univ-del-btn" data-univ-del="${u.id}" title="Delete universe">🗑</button>`
            : ''}
        </div>
        <div class="univ-meta">${u.snapshots.length} snapshots · ${new Date(u.modifiedAt).toLocaleDateString()}</div>
        ${u.snapshots.length > 0 ? `
        <details class="snap-list">
          <summary>Snapshots (${u.snapshots.length})</summary>
          ${u.snapshots.slice(-10).reverse().map(s => `
            <div class="snap-item" data-univ="${u.id}" data-snap="${s.id}">
              <span class="snap-name">${s.name}</span>
              <span class="snap-time">T=${s.simulationTime.toFixed(0)}</span>
              <button class="snap-load-btn" data-univ="${u.id}" data-snap="${s.id}">Load</button>
              <button class="snap-del-btn"  data-univ="${u.id}" data-snap="${s.id}">×</button>
            </div>
          `).join('')}
        </details>` : ''}
      `;

      item.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.dataset.univDel) {
          e.stopPropagation();
          if (confirm(`Delete universe "${u.name}"? This cannot be undone.`)) {
            this.onDeleteUniverse?.(u.id);
          }
        } else if (target.classList.contains('snap-load-btn')) {
          const uid = target.dataset.univ!;
          const sid = target.dataset.snap!;
          this.onLoadSnapshot?.(uid, sid);
        } else if (target.classList.contains('snap-del-btn')) {
          const uid = target.dataset.univ!;
          const sid = target.dataset.snap!;
          this.saveSystem.deleteSnapshot(uid, sid);
          this.render();
        } else if (!target.classList.contains('snap-item') && u.id !== this.universe.activeUniverseId) {
          this.onSwitchUniverse?.(u.id);
        }
      });

      listEl.appendChild(item);
    }
  }
}
