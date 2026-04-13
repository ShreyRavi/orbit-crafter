import { G, EPSILON_SQ, BH_THETA } from './utils/constants.js';
import { Vec2 } from './utils/math.js';
import { Body } from './BodySystem.js';

// Flattened BH node for GPU upload (32 bytes)
export interface BHNodeFlat {
  centerX: number;
  centerY: number;
  totalMass: number;
  size: number;         // half-width of cell
  child0: number;       // 0xFFFFFFFF = leaf marker
  child1: number;
  child2: number;
  child3: number;
}

const LEAF = 0xFFFFFFFF;

class BHNode {
  cx = 0; cy = 0;            // centre of mass
  totalMass = 0;
  size = 0;                  // half-width
  minX = 0; minY = 0; maxX = 0; maxY = 0;
  bodyIdx = -1;              // >= 0 for leaf with one body
  children: (BHNode | null)[] = [null, null, null, null];
  isLeaf = true;

  constructor(minX: number, minY: number, maxX: number, maxY: number) {
    this.minX = minX; this.minY = minY;
    this.maxX = maxX; this.maxY = maxY;
    this.size = (maxX - minX) / 2;
  }
}

export class BarnesHutSystem {
  theta = BH_THETA;
  G_val = G;
  epsilon2 = EPSILON_SQ;

  // CPU-only force computation (returns force array)
  computeForces(bodies: Body[]): Float32Array {
    const n = bodies.length;
    const forces = new Float32Array(n * 2);
    if (n === 0) return forces;

    // Bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of bodies) {
      if (b.position[0] < minX) minX = b.position[0];
      if (b.position[1] < minY) minY = b.position[1];
      if (b.position[0] > maxX) maxX = b.position[0];
      if (b.position[1] > maxY) maxY = b.position[1];
    }
    const pad = (maxX - minX + maxY - minY + 1) * 0.1;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    // Make square
    const side = Math.max(maxX - minX, maxY - minY);
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    minX = midX - side / 2; maxX = midX + side / 2;
    minY = midY - side / 2; maxY = midY + side / 2;

    const root = new BHNode(minX, minY, maxX, maxY);

    // Insert bodies
    for (let i = 0; i < n; i++) {
      this._insert(root, bodies[i], i);
    }

    // Compute COM for all internal nodes
    this._computeCOM(root);

    // Compute force on each body
    for (let i = 0; i < n; i++) {
      const [fx, fy] = this._forceOn(bodies[i].position, bodies[i].mass, root, i);
      forces[i * 2]     = fx;
      forces[i * 2 + 1] = fy;
    }

    return forces;
  }

  private _insert(node: BHNode, body: Body, idx: number): void {
    if (node.isLeaf && node.bodyIdx === -1) {
      // Empty leaf – store body
      node.bodyIdx = idx;
      node.cx = body.position[0];
      node.cy = body.position[1];
      node.totalMass = body.mass;
      return;
    }

    if (node.isLeaf && node.bodyIdx >= 0) {
      // Occupied leaf – subdivide
      node.isLeaf = false;
      const prev = { pos: [node.cx, node.cy] as Vec2, mass: node.totalMass, bodyIdx: node.bodyIdx };
      node.bodyIdx = -1;
      this._ensureChildren(node);
      this._insertBodyIntoChild(node, prev.pos, prev.mass, prev.bodyIdx);
    }

    // Internal node – recurse
    this._insertBodyIntoChild(node, body.position, body.mass, idx);
  }

  private _insertBodyIntoChild(node: BHNode, pos: Vec2, mass: number, idx: number): void {
    const q = this._quadrant(node, pos[0], pos[1]);
    if (!node.children[q]) {
      const [cMinX, cMinY, cMaxX, cMaxY] = this._childBounds(node, q);
      node.children[q] = new BHNode(cMinX, cMinY, cMaxX, cMaxY);
    }
    const fakeBody: Body = {
      id: '', name: '', type: 'asteroid',
      position: pos, velocity: [0, 0],
      mass, radius: 0, color: '#fff',
    };
    this._insert(node.children[q]!, fakeBody, idx);
  }

  private _ensureChildren(node: BHNode): void {
    for (let q = 0; q < 4; q++) {
      if (!node.children[q]) {
        const [cMinX, cMinY, cMaxX, cMaxY] = this._childBounds(node, q);
        node.children[q] = new BHNode(cMinX, cMinY, cMaxX, cMaxY);
      }
    }
  }

  private _quadrant(node: BHNode, x: number, y: number): number {
    const midX = (node.minX + node.maxX) / 2;
    const midY = (node.minY + node.maxY) / 2;
    return (x >= midX ? 1 : 0) + (y >= midY ? 2 : 0);
  }

  private _childBounds(node: BHNode, q: number): [number, number, number, number] {
    const midX = (node.minX + node.maxX) / 2;
    const midY = (node.minY + node.maxY) / 2;
    return [
      q & 1 ? midX : node.minX,
      q & 2 ? midY : node.minY,
      q & 1 ? node.maxX : midX,
      q & 2 ? node.maxY : midY,
    ];
  }

  private _computeCOM(node: BHNode): void {
    if (node.isLeaf) return;
    let cx = 0, cy = 0, m = 0;
    for (const child of node.children) {
      if (!child) continue;
      this._computeCOM(child);
      m  += child.totalMass;
      cx += child.cx * child.totalMass;
      cy += child.cy * child.totalMass;
    }
    if (m > 0) { cx /= m; cy /= m; }
    node.cx = cx; node.cy = cy; node.totalMass = m;
  }

  private _forceOn(pos: Vec2, mass: number, node: BHNode, selfIdx: number): [number, number] {
    if (node.isLeaf) {
      if (node.bodyIdx === selfIdx || node.totalMass === 0) return [0, 0];
      return this._pairForce(pos, mass, node.cx, node.cy, node.totalMass);
    }

    const dx = node.cx - pos[0];
    const dy = node.cy - pos[1];
    const r2 = dx * dx + dy * dy + this.epsilon2;
    const s  = node.size;

    if ((s * s) / r2 < this.theta * this.theta) {
      // Far enough – treat as point mass
      return this._pairForce(pos, mass, node.cx, node.cy, node.totalMass);
    }

    // Recurse
    let fx = 0, fy = 0;
    for (const child of node.children) {
      if (!child || child.totalMass === 0) continue;
      const [cfx, cfy] = this._forceOn(pos, mass, child, selfIdx);
      fx += cfx; fy += cfy;
    }
    return [fx, fy];
  }

  private _pairForce(
    posI: Vec2, massI: number,
    cx: number, cy: number, massJ: number
  ): [number, number] {
    const dx = cx - posI[0];
    const dy = cy - posI[1];
    const r2 = dx * dx + dy * dy + this.epsilon2;
    const invR  = 1 / Math.sqrt(r2);
    const invR3 = invR * invR * invR;
    const f = this.G_val * massI * massJ * invR3;
    return [f * dx, f * dy];
  }

  /** Flatten tree to GPU-uploadable buffer (32 bytes × nodeCount). */
  buildFlatTree(bodies: Body[]): Float32Array {
    const n = bodies.length;
    if (n === 0) return new Float32Array(0);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of bodies) {
      if (b.position[0] < minX) minX = b.position[0];
      if (b.position[1] < minY) minY = b.position[1];
      if (b.position[0] > maxX) maxX = b.position[0];
      if (b.position[1] > maxY) maxY = b.position[1];
    }
    const pad = (maxX - minX + maxY - minY + 1) * 0.1;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const side = Math.max(maxX - minX, maxY - minY);
    const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
    minX = midX - side / 2; maxX = midX + side / 2;
    minY = midY - side / 2; maxY = midY + side / 2;

    const root = new BHNode(minX, minY, maxX, maxY);
    for (let i = 0; i < n; i++) this._insert(root, bodies[i], i);
    this._computeCOM(root);

    // Collect nodes in BFS order
    const nodes: BHNode[] = [];
    const queue: BHNode[] = [root];
    while (queue.length) {
      const node = queue.shift()!;
      nodes.push(node);
      if (!node.isLeaf) {
        for (const c of node.children) {
          if (c) queue.push(c);
        }
      }
    }

    // Assign indices
    const nodeIndex = new Map<BHNode, number>();
    nodes.forEach((node, i) => nodeIndex.set(node, i));

    // 8 floats = 32 bytes per node
    const flat = new Float32Array(nodes.length * 8);
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const base = i * 8;
      flat[base + 0] = node.cx;
      flat[base + 1] = node.cy;
      flat[base + 2] = node.totalMass;
      flat[base + 3] = node.size;
      // Children indices (LEAF marker if not present)
      for (let q = 0; q < 4; q++) {
        const child = node.children[q];
        const childIdx = child ? (nodeIndex.get(child) ?? LEAF) : LEAF;
        // Write as u32 via Float32Array reinterpret
        const u32 = new Uint32Array(flat.buffer, (base + 4 + q) * 4, 1);
        u32[0] = childIdx >>> 0;
      }
    }
    return flat;
  }
}
