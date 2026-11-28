import enemyAtlas from '../../public/assets/atlas/atlas_enemy_0.json';
import towerAtlas from '../../public/assets/atlas/atlas_tower_0.json';

interface AtlasFrame {
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  pivot: { x: number; y: number };
}

interface AtlasFile {
  frames: Record<string, AtlasFrame>;
  meta: { td?: Record<string, unknown> };
}

const enemy = enemyAtlas as AtlasFile;
const tower = towerAtlas as AtlasFile;

export function actorMeta(kind: 'enemy' | 'tower'): Record<string, unknown> {
  return (kind === 'enemy' ? enemy.meta.td : tower.meta.td) ?? {};
}

export function pxPerCell(kind: 'enemy' | 'tower'): number {
  const value = Number(actorMeta(kind).pxPerCell);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function refSpeed(): number {
  const value = Number(actorMeta('enemy').refSpeed);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** Cells covered by one walk cycle. Used as the stride behind timeScale. */
export function walkCycleCells(): number {
  const value = Number(actorMeta('enemy').walkCycleCells_s);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function walkFrameRate(): number {
  const rate = animBook('enemy').e_luanbing_walk_f?.frameRate;
  return rate && rate > 0 ? rate : 12;
}

/** Speed the 12 fps cycle was drawn for: stride × (fps / 6 frames). */
export function strideRefSpeed(): number {
  const cycle = walkCycleCells();
  const rate = walkFrameRate();
  if (cycle > 0) return cycle * (rate / 6);
  return refSpeed();
}

export function frameOf(kind: 'enemy' | 'tower', name: string): AtlasFrame | null {
  const book = kind === 'enemy' ? enemy : tower;
  return book.frames[name] ?? null;
}

/** Positive means the sprite origin sits above the pad center and must move down. */
export function anchorDropPx(kind: 'enemy' | 'tower', frameName: string): number {
  const frame = frameOf(kind, frameName);
  const meta = actorMeta(kind);
  if (!frame) return 0;
  const aboveBottom = (1 - frame.pivot.y) * frame.sourceSize.h;
  const ground = Number(meta.groundCenterFromBottomPx);
  if (!Number.isFinite(ground)) return 0;
  return ground - aboveBottom;
}

/** Opaque top above the ground/pad center, in source pixels. */
export function heightAboveGroundPx(kind: 'enemy' | 'tower', frameName: string): number {
  const frame = frameOf(kind, frameName);
  if (!frame) return 0;
  const meta = actorMeta(kind);
  const groundFromBottom = Number(meta.groundCenterFromBottomPx);
  const groundY = Number.isFinite(groundFromBottom)
    ? frame.sourceSize.h - groundFromBottom
    : frame.pivot.y * frame.sourceSize.h;
  return Math.max(0, groundY - frame.spriteSourceSize.y);
}

/** Arrow launch point in source pixels, relative to the pad-center anchor. */
export function firePointFromAnchor(): { x: number; y: number } {
  const point = actorMeta('tower').firePoint as { fromAnchorPx?: number[] } | undefined;
  const pair = point?.fromAnchorPx;
  const x = Number(pair?.[0]);
  const y = Number(pair?.[1]);
  return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
}

export function animBook(kind: 'enemy' | 'tower'): Record<string, { frames: string[]; frameRate: number; repeat: number; releaseFrame?: string }> {
  const anims = actorMeta(kind).anims;
  return (anims && typeof anims === 'object' ? anims : {}) as Record<string, { frames: string[]; frameRate: number; repeat: number; releaseFrame?: string }>;
}
