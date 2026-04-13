import { describe, it, expect, beforeEach } from 'vitest';
import { BodySystem, Body, newBodyId, bodyTypeToU32, u32ToBodyType } from '../src/BodySystem.js';
import {
  BODY_TYPE_STAR, BODY_TYPE_PLANET, BODY_TYPE_MOON,
  BODY_TYPE_ASTEROID, BODY_TYPE_ROCKET,
} from '../src/utils/constants.js';

function makeBody(overrides: Partial<Body> = {}): Body {
  return {
    id:       newBodyId(),
    name:     'Test',
    type:     'planet',
    position: [0, 0],
    velocity: [0, 0],
    mass:     1,
    radius:   0.5,
    color:    '#ffffff',
    ...overrides,
  };
}

describe('newBodyId', () => {
  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => newBodyId()));
    expect(ids.size).toBe(100);
  });
});

describe('bodyTypeToU32 / u32ToBodyType', () => {
  const pairs: [Body['type'], number][] = [
    ['star',     BODY_TYPE_STAR],
    ['planet',   BODY_TYPE_PLANET],
    ['moon',     BODY_TYPE_MOON],
    ['asteroid', BODY_TYPE_ASTEROID],
    ['rocket',   BODY_TYPE_ROCKET],
  ];
  for (const [type, u32] of pairs) {
    it(`encodes ${type} → ${u32} and back`, () => {
      expect(bodyTypeToU32(type)).toBe(u32);
      expect(u32ToBodyType(u32)).toBe(type);
    });
  }
});

describe('BodySystem – CRUD', () => {
  let sys: BodySystem;
  beforeEach(() => { sys = new BodySystem(); });

  it('starts empty', () => {
    expect(sys.count).toBe(0);
    expect(sys.bodies).toHaveLength(0);
  });

  it('adds a body', () => {
    sys.add(makeBody({ id: 'b1', name: 'Earth' }));
    expect(sys.count).toBe(1);
    expect(sys.get('b1')?.name).toBe('Earth');
  });

  it('add marks dirty', () => {
    sys.clearDirty();
    sys.add(makeBody());
    expect(sys.isDirty()).toBe(true);
  });

  it('removes a body by id', () => {
    sys.add(makeBody({ id: 'b1' }));
    sys.add(makeBody({ id: 'b2' }));
    const removed = sys.remove('b1');
    expect(removed).toBe(true);
    expect(sys.count).toBe(1);
    expect(sys.get('b1')).toBeUndefined();
  });

  it('remove returns false for unknown id', () => {
    expect(sys.remove('no-such-id')).toBe(false);
  });

  it('remove marks dirty', () => {
    sys.add(makeBody({ id: 'x' }));
    sys.clearDirty();
    sys.remove('x');
    expect(sys.isDirty()).toBe(true);
  });

  it('updates body fields', () => {
    sys.add(makeBody({ id: 'p1', mass: 1 }));
    sys.update('p1', { mass: 5, name: 'BigPlanet' });
    const b = sys.get('p1')!;
    expect(b.mass).toBe(5);
    expect(b.name).toBe('BigPlanet');
  });

  it('update marks dirty', () => {
    sys.add(makeBody({ id: 'p1' }));
    sys.clearDirty();
    sys.update('p1', { mass: 99 });
    expect(sys.isDirty()).toBe(true);
  });

  it('update on unknown id is a no-op', () => {
    expect(() => sys.update('ghost', { mass: 1 })).not.toThrow();
  });

  it('clear removes all bodies', () => {
    for (let i = 0; i < 5; i++) sys.add(makeBody());
    sys.clear();
    expect(sys.count).toBe(0);
    expect(sys.isDirty()).toBe(true);
  });
});

describe('BodySystem – dirty flag', () => {
  it('clearDirty / isDirty round-trip', () => {
    const sys = new BodySystem();
    sys.add(makeBody());
    expect(sys.isDirty()).toBe(true);
    sys.clearDirty();
    expect(sys.isDirty()).toBe(false);
    sys.markDirty();
    expect(sys.isDirty()).toBe(true);
  });
});

describe('BodySystem – assignGPUIndices', () => {
  it('assigns sequential indices from 0', () => {
    const sys = new BodySystem();
    for (let i = 0; i < 4; i++) sys.add(makeBody());
    sys.assignGPUIndices();
    sys.bodies.forEach((b, i) => expect(b.gpuIndex).toBe(i));
  });
});

describe('BodySystem – applyReadback', () => {
  it('updates position and velocity from typed arrays', () => {
    const sys = new BodySystem();
    sys.add(makeBody({ id: 'b0' }));
    sys.add(makeBody({ id: 'b1' }));

    const posData = new Float32Array([10, 20, 30, 40]);
    const velData = new Float32Array([1, 2, 3, 4]);
    sys.applyReadback(posData, velData);

    expect(sys.get('b0')!.position).toEqual([10, 20]);
    expect(sys.get('b0')!.velocity).toEqual([1, 2]);
    expect(sys.get('b1')!.position).toEqual([30, 40]);
    expect(sys.get('b1')!.velocity).toEqual([3, 4]);
  });
});

describe('BodySystem – snapshot', () => {
  it('returns a deep clone that does not share references', () => {
    const sys = new BodySystem();
    const original = makeBody({ id: 'b1', position: [1, 2], velocity: [3, 4] });
    sys.add(original);

    const snap = sys.snapshot();
    expect(snap).toHaveLength(1);

    // Mutate original body
    sys.bodies[0].position[0] = 999;
    // Snapshot should be unaffected
    expect(snap[0].position[0]).toBe(1);
  });
});
