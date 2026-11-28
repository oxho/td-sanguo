import { VIEW, scaleAt, worldToDesign } from './projection';

export interface PadLike { id: string; x: number; y: number; r?: number }

export interface HitTarget {
  padId: string;
  kind: 'pad' | 'tower';
}

function ellipseHit(dx: number, dy: number, rx: number, ry: number): boolean {
  if (rx <= 0 || ry <= 0) return false;
  return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
}

function padRadii(y: number, cssScale: number): { rx: number; ry: number } {
  const row = Math.max(0, Math.floor(y));
  const worldR = 0.5 * (row <= 3 ? 1.3 : 1);
  const s = scaleAt(y);
  const fromWorld = worldR * VIEW.S0 * s;
  const floorR = VIEW.hitFloorPt / Math.max(cssScale, 0.01);
  const rx = Math.max(fromWorld, floorR);
  return { rx, ry: rx * VIEW.k };
}

/** Screen point in design pixels. Ellipse pads win over tower bodies; nearer feet win ties. */
export function pickPad(designX: number, designY: number, cssScale: number, pads: PadLike[]): HitTarget | null {
  let best: { padId: string; kind: 'pad' | 'tower'; feet: number } | null = null;
  for (const pad of pads) {
    const foot = worldToDesign(pad.x, pad.y, 0);
    const { rx, ry } = padRadii(pad.y, cssScale);
    if (ellipseHit(designX - foot.x, designY - foot.y, rx, ry)) {
      const feet = pad.y;
      if (!best || best.kind === 'tower' || feet > best.feet) best = { padId: pad.id, kind: 'pad', feet };
    }
  }
  if (best?.kind === 'pad') return { padId: best.padId, kind: 'pad' };
  for (const pad of pads) {
    const foot = worldToDesign(pad.x, pad.y, 0);
    const box = towerBox(pad.y);
    const left = foot.x - box.w / 2;
    const right = foot.x + box.w / 2;
    const bottom = foot.y;
    const top = foot.y - box.h;
    if (designX >= left && designX <= right && designY >= top && designY <= bottom) {
      if (!best || pad.y > best.feet) best = { padId: pad.id, kind: 'tower', feet: pad.y };
    }
  }
  return best ? { padId: best.padId, kind: best.kind } : null;
}

export function towerBox(y: number): { w: number; h: number } {
  const s = scaleAt(y);
  return { w: 0.9 * VIEW.S0 * s, h: 1.4 * VIEW.S0 * s };
}

export function towerTop(pad: PadLike): { x: number; y: number } {
  const foot = worldToDesign(pad.x, pad.y, 0);
  const box = towerBox(pad.y);
  return { x: foot.x, y: foot.y - box.h + 2 };
}
