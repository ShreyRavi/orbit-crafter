import { Body } from '../BodySystem.js';

export interface SimParameters {
  G: number;
  dt: number;
  epsilon: number;
  mode: string;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface UniverseSnapshot {
  id: string;
  name: string;
  createdAt: number;
  simulationTime: number;
  bodies: Body[];
  params: SimParameters;
  camera: CameraState;
}

export interface SavedUniverse {
  id: string;
  name: string;
  createdAt: number;
  modifiedAt: number;
  snapshots: UniverseSnapshot[];
  activeSnapshotId: string | null;
}

const STORAGE_KEY = 'orbitcraft_universes';

export class MultiUniverseSaveSystem {
  private universes: Map<string, SavedUniverse> = new Map();

  constructor() {
    this._load();
  }

  private _load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const list: SavedUniverse[] = JSON.parse(raw);
      for (const u of list) this.universes.set(u.id, u);
    } catch {
      // ignore corrupt data
    }
  }

  private _persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.universes.values()]));
    } catch {
      console.warn('Failed to persist universes to localStorage');
    }
  }

  createUniverse(name: string): SavedUniverse {
    const id = `universe_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const u: SavedUniverse = {
      id, name,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      snapshots: [],
      activeSnapshotId: null,
    };
    this.universes.set(id, u);
    this._persist();
    return u;
  }

  deleteUniverse(id: string): void {
    this.universes.delete(id);
    this._persist();
  }

  renameUniverse(id: string, name: string): void {
    const u = this.universes.get(id);
    if (!u) return;
    u.name = name;
    u.modifiedAt = Date.now();
    this._persist();
  }

  duplicateUniverse(id: string, newName?: string): SavedUniverse | null {
    const src = this.universes.get(id);
    if (!src) return null;
    const copy = JSON.parse(JSON.stringify(src)) as SavedUniverse;
    copy.id = `universe_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    copy.name = newName ?? src.name + ' (copy)';
    copy.createdAt = copy.modifiedAt = Date.now();
    this.universes.set(copy.id, copy);
    this._persist();
    return copy;
  }

  saveSnapshot(
    universeId: string,
    bodies: Body[],
    params: SimParameters,
    camera: CameraState,
    simTime: number,
    label?: string
  ): UniverseSnapshot {
    const u = this.universes.get(universeId);
    if (!u) throw new Error(`Universe ${universeId} not found`);

    const snapId = `snap_${Date.now()}`;
    const snap: UniverseSnapshot = {
      id: snapId,
      name: label ?? new Date().toLocaleTimeString(),
      createdAt: Date.now(),
      simulationTime: simTime,
      bodies: JSON.parse(JSON.stringify(bodies)),
      params: { ...params },
      camera: { ...camera },
    };

    u.snapshots.push(snap);
    // Keep latest 50 snapshots per universe
    if (u.snapshots.length > 50) u.snapshots.shift();
    u.activeSnapshotId = snapId;
    u.modifiedAt = Date.now();
    this._persist();
    return snap;
  }

  loadSnapshot(universeId: string, snapId: string): UniverseSnapshot | null {
    const u = this.universes.get(universeId);
    if (!u) return null;
    return u.snapshots.find(s => s.id === snapId) ?? null;
  }

  deleteSnapshot(universeId: string, snapId: string): void {
    const u = this.universes.get(universeId);
    if (!u) return;
    u.snapshots = u.snapshots.filter(s => s.id !== snapId);
    if (u.activeSnapshotId === snapId) u.activeSnapshotId = null;
    this._persist();
  }

  forkFromSnapshot(universeId: string, snapId: string, newName: string): SavedUniverse | null {
    const snap = this.loadSnapshot(universeId, snapId);
    if (!snap) return null;
    const u = this.createUniverse(newName);
    this.saveSnapshot(u.id, snap.bodies, snap.params, snap.camera, snap.simulationTime, 'initial');
    return u;
  }

  exportUniverseJSON(universeId: string): string {
    const u = this.universes.get(universeId);
    if (!u) throw new Error(`Universe ${universeId} not found`);
    return JSON.stringify(u, null, 2);
  }

  importUniverseJSON(json: string): SavedUniverse {
    const u = JSON.parse(json) as SavedUniverse;
    // Assign new ID to avoid collision
    u.id = `universe_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    u.modifiedAt = Date.now();
    this.universes.set(u.id, u);
    this._persist();
    return u;
  }

  listUniverses(): SavedUniverse[] {
    return [...this.universes.values()].sort((a, b) => b.modifiedAt - a.modifiedAt);
  }

  getUniverse(id: string): SavedUniverse | undefined {
    return this.universes.get(id);
  }
}
