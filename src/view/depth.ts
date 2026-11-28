export type DepthKind = 'building' | 'hero' | 'soldier' | 'enemy';

const KIND: Record<DepthKind, number> = { building: 0, hero: 1, soldier: 2, enemy: 3 };

/** Larger foot-y is nearer and paints later. Kind, x, then id keep the order stable. */
export function depthKey(y: number, kind: DepthKind, x: number, id: number): number {
  return y * 1_000_000 + KIND[kind] * 10_000 + x * 10 + (id % 1000) / 1000;
}
