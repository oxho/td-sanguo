import view from '../data/view.json';

export interface ViewParams {
  S0: number;
  k: number;
  kz: number;
  CX: number;
  Y0: number;
  sFar: number;
  sNear: number;
  span: number;
  mapTop: number;
  mapW: number;
  mapH: number;
  frameW: number;
  frameH: number;
  hitFloorPt: number;
  safeTop: number;
  safeBottom: number;
  safeLeft: number;
  safeRight: number;
}

export const VIEW = view as ViewParams;

const bSpan = () => (VIEW.sNear - VIEW.sFar) / VIEW.span;
const aPrime = () => VIEW.sFar - 0.5 * bSpan();

/** s(y) = 0.75 + 0.40·(y−0.5)/15, read from view.json. */
export function scaleAt(y: number): number {
  return VIEW.sFar + bSpan() * (y - 0.5);
}

export function groundY(y: number): number {
  const b = bSpan();
  return VIEW.Y0 + VIEW.S0 * VIEW.k * (aPrime() * y + (b * y * y) / 2);
}

export function worldToDesign(x: number, y: number, z = 0): { x: number; y: number } {
  const s = scaleAt(y);
  return {
    x: VIEW.CX + (x - 4.5) * VIEW.S0 * s,
    y: groundY(y) - z * VIEW.S0 * s * VIEW.kz,
  };
}

/** Design point inside the map canvas (origin at the map slot). */
export function worldToCanvas(x: number, y: number, z = 0): { x: number; y: number } {
  const p = worldToDesign(x, y, z);
  return { x: p.x, y: p.y - VIEW.mapTop };
}

export function designToGround(X: number, Y: number): { x: number; y: number } | null {
  const b = bSpan();
  const ap = aPrime();
  const D = (Y - VIEW.Y0) / (VIEW.S0 * VIEW.k);
  const disc = ap * ap + 2 * b * D;
  if (disc < 0 || b === 0) return null;
  const y = (-ap + Math.sqrt(disc)) / b;
  const s = scaleAt(y);
  if (s === 0) return null;
  const x = 4.5 + (X - VIEW.CX) / (VIEW.S0 * s);
  return { x, y };
}

/** 48 samples of a world-space circle, in canvas pixels. */
export function rangePolygon(x: number, y: number, radius: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < 48; i++) {
    const ang = (i / 48) * Math.PI * 2;
    pts.push(worldToCanvas(x + Math.cos(ang) * radius, y + Math.sin(ang) * radius, 0));
  }
  return pts;
}

export function unitPixels(y: number, cellsWide: number, cellsTall: number): { w: number; h: number } {
  const s = scaleAt(y);
  return { w: cellsWide * VIEW.S0 * s, h: cellsTall * VIEW.S0 * s };
}
