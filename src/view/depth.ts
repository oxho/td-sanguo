export type DepthKind = 'building' | 'hero' | 'soldier' | 'enemy';

/** Shared bands so flyers, labels, and bars stay above every ground unit. */
export const LAYER = {
  ground: 0,
  shadow: 10,
  marker: 20,
  silhouette: 20_000_000,
  flying: 30_000_000,
  shot: 40_000_000,
  effect: 50_000_000,
  info: 60000000,
} as const;

const KIND: Record<DepthKind, number> = { building: 0, hero: 1, soldier: 2, enemy: 3 };

/** Larger foot-y is nearer and paints later. Kind, x, then id keep the order stable. */
export function depthKey(y: number, kind: DepthKind, x: number, id: number): number {
  return y * 1_000_000 + KIND[kind] * 10_000 + x * 10 + (id % 1000) / 1000;
}

export function flyingDepth(y: number): number {
  return LAYER.flying + y * 1000;
}

export function infoDepth(extra = 0): number {
  return LAYER.info + extra;
}
