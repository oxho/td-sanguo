import { DATA_HASH, LEVELS, levelMeta, type LevelMeta } from '../data/catalog';
import type { MetaSave, RunState } from './types';
import { Rng } from './rng';

export const PLAYABLE = ['1-1', '1-2', '1-3', '1-4', '1-5'] as const;

export function newMeta(seed?: number): MetaSave {
  const rng = new Rng(seed ?? 0x53414e47);
  return {
    version: 1,
    dataHash: DATA_HASH,
    checksum: '',
    talisman: 0,
    heroes: ['huangzhong', 'machao'],
    pity: 0,
    firstSingleFree: true,
    rng: rng.state,
    levels: { '1-1': { stars: 0, clears: 0 } },
    tutorial: { skipped: false, done11: false, tip13: false, tip14: false, tipHero: false },
    codex: [],
    settings: { muted: false },
    dailyChallengeUnlocked: false,
    endlessBest: 0,
  };
}

export function prevLevel(id: string): string | null {
  const [c, n] = id.split('-').map(Number);
  if (!c || !n || n <= 1) return null;
  return `${c}-${n - 1}`;
}

export function levelUnlocked(meta: MetaSave, id: string): boolean {
  const metaRow = LEVELS.find((l) => l.id === id);
  if (!metaRow?.playable) return false;
  if (id === '1-1') return true;
  const prev = prevLevel(id);
  if (!prev) return false;
  return (meta.levels[prev]?.clears ?? 0) > 0;
}

export interface Unlocks {
  towers: string[];
  cards: string[];
  slots: number;
  branch: boolean;
}

/** Account unlocks once the granting level can be entered. */
export function unlocks(meta: MetaSave): Unlocks {
  const towers = ['jianlou', 'toushi'];
  const cards = ['huogong'];
  let slots = 1;
  let branch = false;
  if (levelUnlocked(meta, '1-3')) {
    towers.push('junqi');
    cards.push('wanjian');
    slots = 2;
  }
  if (levelUnlocked(meta, '1-4')) {
    towers.push('juma', 'qiangbing');
    branch = true;
  }
  return { towers, cards, slots, branch };
}

export function towerCap(levelId: string): number {
  return levelId === '1-4' || levelId === '1-5' ? 6 : 3;
}

export interface StarReport {
  stars: number;
  c1: boolean;
  c2: boolean;
  c3: boolean;
  hpPct: number;
  leaks: number;
  leakDamage: number;
  builds: number;
  star3Text: string;
}

export function starsOf(state: RunState, metaRow: LevelMeta = levelMeta(state.levelId)): StarReport {
  const hpPct = state.gate.maxHp > 0 ? state.gate.hp / state.gate.maxHp : 0;
  const c1 = state.phase === 'victory';
  const c2 = c1 && hpPct >= 0.5 - 1e-9;
  let c3 = false;
  if (c2) {
    if (metaRow.star3 === 'noLeak') c3 = state.stats.leaks === 0;
    else if (metaRow.star3 === 'noLeakDmg') c3 = state.stats.leakDamage <= 1e-9;
    else c3 = state.stats.builds <= 10;
  }
  const stars = !c1 ? 0 : c3 ? 3 : c2 ? 2 : 1;
  return {
    stars, c1, c2, c3, hpPct,
    leaks: state.stats.leaks,
    leakDamage: state.stats.leakDamage,
    builds: state.stats.builds,
    star3Text: metaRow.star3Text,
  };
}

export interface RewardLine { text: string; amount: number }

export function grantRewards(meta: MetaSave, state: RunState): { lines: RewardLine[]; total: number; stars: StarReport } {
  const row = levelMeta(state.levelId);
  const report = starsOf(state, row);
  const lines: RewardLine[] = [];
  const waveTalisman = state.stats.wavesCleared;
  if (waveTalisman > 0) lines.push({ text: `清波 +${waveTalisman}`, amount: waveTalisman });
  let total = waveTalisman;
  if (state.phase === 'victory') {
    const prev = meta.levels[state.levelId] ?? { stars: 0, clears: 0 };
    if (prev.clears <= 0) {
      const bonus = row.kind === '精英' ? 40 : row.kind === 'Boss' ? 60 : 30;
      lines.push({ text: `首通 +${bonus}`, amount: bonus });
      total += bonus;
    } else {
      lines.push({ text: '重复通关 +5', amount: 5 });
      total += 5;
    }
    const best = Math.max(prev.stars, report.stars);
    const starGain = (best - prev.stars) * 10;
    if (starGain > 0) {
      lines.push({ text: `新星 +${starGain}`, amount: starGain });
      total += starGain;
    }
    meta.levels[state.levelId] = { stars: best, clears: prev.clears + 1 };
    if (state.levelId === '1-5') meta.dailyChallengeUnlocked = true;
  }
  meta.talisman += total;
  for (const id of state.codex) {
    if (!meta.codex.includes(id)) meta.codex.push(id);
  }
  return { lines, total, stars: report };
}
