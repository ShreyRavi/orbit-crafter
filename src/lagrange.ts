import type { BodyData } from './constants';

type Point2D = [number, number];

export function computeLagrangePoints(
  m1: BodyData,
  m2: BodyData,
): [Point2D, Point2D, Point2D, Point2D, Point2D] {
  const dx = m2.pos[0] - m1.pos[0];
  const dy = m2.pos[1] - m1.pos[1];
  const r = Math.sqrt(dx * dx + dy * dy);

  if (r < 1e-10) {
    // Bodies at same position — return degenerate points
    const p: Point2D = [m1.pos[0], m1.pos[1]];
    return [p, p, p, p, p];
  }

  // Unit vectors
  const ex = dx / r;
  const ey = dy / r;
  // Perpendicular (CCW)
  const px = -ey;
  const py = ex;

  const mu = m2.mass / (m1.mass + m2.mass);
  const alpha = Math.cbrt(mu / 3);

  // L1: between m1 and m2, at distance r*(1-alpha) from m1
  const l1d = r * (1 - alpha);
  const L1: Point2D = [m1.pos[0] + l1d * ex, m1.pos[1] + l1d * ey];

  // L2: beyond m2 from m1, at distance r*(1+alpha) from m1
  const l2d = r * (1 + alpha);
  const L2: Point2D = [m1.pos[0] + l2d * ex, m1.pos[1] + l2d * ey];

  // L3: beyond m1 from m2's perspective, at distance r*(1 + 5*mu/12) from m1 (opposite direction)
  const l3d = r * (1 + (5 * mu) / 12);
  const L3: Point2D = [m1.pos[0] - l3d * ex, m1.pos[1] - l3d * ey];

  // Midpoint
  const midX = (m1.pos[0] + m2.pos[0]) / 2;
  const midY = (m1.pos[1] + m2.pos[1]) / 2;
  const perpDist = (Math.sqrt(3) / 2) * r;

  // L4: equilateral above (CCW from m1→m2)
  const L4: Point2D = [midX + perpDist * px, midY + perpDist * py];

  // L5: equilateral below
  const L5: Point2D = [midX - perpDist * px, midY - perpDist * py];

  return [L1, L2, L3, L4, L5];
}
