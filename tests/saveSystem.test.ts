import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MultiUniverseSaveSystem, SimParameters, CameraState } from '../src/persistence/MultiUniverseSaveSystem.js';
import { Body } from '../src/BodySystem.js';

// Provide a localStorage shim for Node/Vitest environment
const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem:    (k: string) => store[k] ?? null,
  setItem:    (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear:      () => { for (const k in store) delete store[k]; },
});

function makeBodies(): Body[] {
  return [
    { id: 'b0', name: 'Sol', type: 'star',   position: [0, 0],  velocity: [0, 0],  mass: 1000, radius: 3.5, color: '#FDB813' },
    { id: 'b1', name: 'Earth', type: 'planet', position: [55, 0], velocity: [0, 4], mass: 1,    radius: 0.9, color: '#4B9CD3' },
  ];
}

const defaultParams: SimParameters = { G: 1, dt: 0.05, epsilon: 0.1, mode: 'EXACT' };
const defaultCam: CameraState       = { x: 0, y: 0, zoom: 0.006 };

describe('MultiUniverseSaveSystem – universe CRUD', () => {
  let sys: MultiUniverseSaveSystem;
  beforeEach(() => {
    localStorage.clear();
    sys = new MultiUniverseSaveSystem();
  });

  it('starts with no universes', () => {
    expect(sys.listUniverses()).toHaveLength(0);
  });

  it('creates a universe', () => {
    const u = sys.createUniverse('Test');
    expect(u.name).toBe('Test');
    expect(u.id).toBeTruthy();
    expect(sys.listUniverses()).toHaveLength(1);
  });

  it('deletes a universe', () => {
    const u = sys.createUniverse('ToDelete');
    sys.deleteUniverse(u.id);
    expect(sys.listUniverses()).toHaveLength(0);
    expect(sys.getUniverse(u.id)).toBeUndefined();
  });

  it('renames a universe', () => {
    const u = sys.createUniverse('OldName');
    sys.renameUniverse(u.id, 'NewName');
    expect(sys.getUniverse(u.id)?.name).toBe('NewName');
  });

  it('duplicates a universe with new id', () => {
    const u = sys.createUniverse('Original');
    const copy = sys.duplicateUniverse(u.id)!;
    expect(copy).not.toBeNull();
    expect(copy.id).not.toBe(u.id);
    expect(copy.name).toContain('copy');
    expect(sys.listUniverses()).toHaveLength(2);
  });

  it('duplicates with custom name', () => {
    const u = sys.createUniverse('Src');
    const copy = sys.duplicateUniverse(u.id, 'MyFork')!;
    expect(copy.name).toBe('MyFork');
  });

  it('returns null when duplicating unknown id', () => {
    expect(sys.duplicateUniverse('nope')).toBeNull();
  });

  it('persists across re-initialisation (localStorage round-trip)', () => {
    sys.createUniverse('Persistent');
    const sys2 = new MultiUniverseSaveSystem();
    expect(sys2.listUniverses()).toHaveLength(1);
    expect(sys2.listUniverses()[0].name).toBe('Persistent');
  });
});

describe('MultiUniverseSaveSystem – snapshots', () => {
  let sys: MultiUniverseSaveSystem;
  let universeId: string;
  beforeEach(() => {
    localStorage.clear();
    sys = new MultiUniverseSaveSystem();
    universeId = sys.createUniverse('SimUniverse').id;
  });

  it('saves a snapshot', () => {
    const snap = sys.saveSnapshot(universeId, makeBodies(), defaultParams, defaultCam, 0);
    expect(snap.id).toBeTruthy();
    expect(sys.getUniverse(universeId)!.snapshots).toHaveLength(1);
  });

  it('snapshot stores bodies, params, camera, simTime', () => {
    const snap = sys.saveSnapshot(universeId, makeBodies(), defaultParams, defaultCam, 42.5);
    expect(snap.simulationTime).toBe(42.5);
    expect(snap.bodies).toHaveLength(2);
    expect(snap.params.mode).toBe('EXACT');
    expect(snap.camera.zoom).toBe(0.006);
  });

  it('loads a snapshot by id', () => {
    const saved = sys.saveSnapshot(universeId, makeBodies(), defaultParams, defaultCam, 10);
    const loaded = sys.loadSnapshot(universeId, saved.id)!;
    expect(loaded).not.toBeNull();
    expect(loaded.bodies).toHaveLength(2);
    expect(loaded.simulationTime).toBe(10);
  });

  it('returns null for unknown snapshot', () => {
    expect(sys.loadSnapshot(universeId, 'ghost')).toBeNull();
  });

  it('deletes a snapshot', () => {
    const s = sys.saveSnapshot(universeId, makeBodies(), defaultParams, defaultCam, 0);
    sys.deleteSnapshot(universeId, s.id);
    expect(sys.getUniverse(universeId)!.snapshots).toHaveLength(0);
  });

  it('caps snapshots at 50', () => {
    for (let i = 0; i < 55; i++) {
      sys.saveSnapshot(universeId, makeBodies(), defaultParams, defaultCam, i);
    }
    expect(sys.getUniverse(universeId)!.snapshots.length).toBeLessThanOrEqual(50);
  });

  it('saves snapshot with a custom label', () => {
    const s = sys.saveSnapshot(universeId, makeBodies(), defaultParams, defaultCam, 0, 'My Label');
    expect(s.name).toBe('My Label');
  });
});

describe('MultiUniverseSaveSystem – fork', () => {
  let sys: MultiUniverseSaveSystem;
  let universeId: string;
  beforeEach(() => {
    localStorage.clear();
    sys = new MultiUniverseSaveSystem();
    universeId = sys.createUniverse('Base').id;
  });

  it('forks from a snapshot into a new universe', () => {
    const snap = sys.saveSnapshot(universeId, makeBodies(), defaultParams, defaultCam, 5);
    const forked = sys.forkFromSnapshot(universeId, snap.id, 'Forked')!;
    expect(forked).not.toBeNull();
    expect(forked.id).not.toBe(universeId);
    expect(forked.name).toBe('Forked');
    expect(forked.snapshots).toHaveLength(1);
    expect(forked.snapshots[0].bodies).toHaveLength(2);
  });

  it('returns null when forking from unknown snapshot', () => {
    expect(sys.forkFromSnapshot(universeId, 'no-snap', 'Fork')).toBeNull();
  });
});

describe('MultiUniverseSaveSystem – JSON import/export', () => {
  let sys: MultiUniverseSaveSystem;
  let universeId: string;
  beforeEach(() => {
    localStorage.clear();
    sys = new MultiUniverseSaveSystem();
    universeId = sys.createUniverse('ExportTest').id;
    sys.saveSnapshot(universeId, makeBodies(), defaultParams, defaultCam, 1);
  });

  it('exports a universe as valid JSON', () => {
    const json = sys.exportUniverseJSON(universeId);
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe('ExportTest');
  });

  it('throws on export of unknown id', () => {
    expect(() => sys.exportUniverseJSON('bogus')).toThrow();
  });

  it('imports a universe from JSON and assigns a new id', () => {
    const json = sys.exportUniverseJSON(universeId);
    const imported = sys.importUniverseJSON(json);
    expect(imported.id).not.toBe(universeId);
    expect(imported.name).toBe('ExportTest');
    expect(sys.listUniverses()).toHaveLength(2);
  });

  it('round-trips body data through export/import', () => {
    const json    = sys.exportUniverseJSON(universeId);
    const impUni  = sys.importUniverseJSON(json);
    const snap    = impUni.snapshots[0];
    expect(snap.bodies[0].name).toBe('Sol');
    expect(snap.bodies[1].name).toBe('Earth');
  });
});
