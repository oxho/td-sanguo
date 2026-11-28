import { DATA_HASH, DATA_HASH_V1 } from '../../data/catalog';
import { bondBetween } from '../../core/bonds';
import { checksumValid, stampChecksum } from '../../core/hash';
import { newMeta, unlocks } from '../../core/progress';
import { createRun, type Sim } from '../../core/sim';
import type { MetaSave, RunEnvelope, RunState } from '../../core/types';

const META_A = 'td.meta.a';
const META_B = 'td.meta.b';
const META_W = 'td.meta.which';
const RUN_A = 'td.run.a';
const RUN_B = 'td.run.b';
const RUN_W = 'td.run.which';
const SPEED_KEY = 'td.settings.speed';

/** Battle speed lives outside the account save, so export and MetaSave never carry it. */
export function loadBattleSpeed(): 1 | 2 {
  try {
    return localStorage.getItem(SPEED_KEY) === '2' ? 2 : 1;
  } catch {
    return 1;
  }
}

export function saveBattleSpeed(speed: number) {
  try {
    localStorage.setItem(SPEED_KEY, speed === 2 ? '2' : '1');
  } catch {
    /* private mode */
  }
}

function readRaw(key: string): unknown {
  try {
    const text = localStorage.getItem(key);
    if (!text) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function writePair(whichKey: string, aKey: string, bKey: string, value: unknown) {
  const current = localStorage.getItem(whichKey) === 'b' ? 'b' : 'a';
  const next = current === 'a' ? 'b' : 'a';
  localStorage.setItem(next === 'a' ? aKey : bKey, JSON.stringify(value));
  localStorage.setItem(whichKey, next);
}

export function migrateMeta(value: unknown): MetaSave | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Omit<MetaSave, 'version'> & { version?: number; dataHash?: string };
  if (!checksumValid(raw)) return null;
  if (!Array.isArray(raw.heroes) || typeof raw.talisman !== 'number') return null;
  const v1 = raw.version === 1 && raw.dataHash === DATA_HASH_V1;
  const v2 = raw.version === 2 && raw.dataHash === DATA_HASH;
  if (!v1 && !v2) return null;
  if (v2) return raw as MetaSave;
  const next = newMeta();
  next.talisman = raw.talisman;
  next.heroes = raw.heroes.slice();
  next.pity = raw.pity ?? 0;
  next.firstSingleFree = raw.firstSingleFree ?? false;
  next.rng = raw.rng ?? next.rng;
  next.levels = raw.levels ?? next.levels;
  next.tutorial = raw.tutorial ?? next.tutorial;
  next.codex = Array.isArray(raw.codex) ? raw.codex.slice() : [];
  next.settings = { muted: Boolean(raw.settings?.muted) };
  next.dailyChallengeUnlocked = Boolean(raw.dailyChallengeUnlocked);
  next.endlessBest = raw.endlessBest ?? 0;
  return stampChecksum({ ...next, checksum: '' });
}

function asMeta(value: unknown): MetaSave | null {
  return migrateMeta(value);
}

export function loadMeta(): MetaSave {
  const which = localStorage.getItem(META_W) === 'b' ? 'b' : 'a';
  const order = which === 'b' ? [META_B, META_A] : [META_A, META_B];
  for (const key of order) {
    const meta = asMeta(readRaw(key));
    if (meta) return meta;
  }
  const fresh = newMeta();
  saveMeta(fresh);
  return fresh;
}

export function saveMeta(meta: MetaSave) {
  const stamped = stampChecksum({ ...meta, checksum: '' });
  writePair(META_W, META_A, META_B, stamped);
}

export function exportMeta(meta: MetaSave): string {
  const stamped = stampChecksum({ ...meta, checksum: '' });
  const json = JSON.stringify(stamped);
  return btoa(unescape(encodeURIComponent(json)));
}

export function importMeta(text: string): MetaSave | null {
  try {
    const json = decodeURIComponent(escape(atob(text.trim())));
    const parsed = JSON.parse(json) as unknown;
    return asMeta(parsed);
  } catch {
    return null;
  }
}

function sane(state: RunState | null | undefined): state is RunState {
  return !!state
    && state.version === 2
    && typeof state.levelId === 'string'
    && typeof state.munition === 'number'
    && Array.isArray(state.towers)
    && Array.isArray(state.enemies)
    && Array.isArray(state.heroes);
}

export let discardedRunNotice = false;

function revive(env: RunEnvelope, state: RunState): Sim {
  const meta = loadMeta();
  const sim = createRun({
    seed: state.seed || 1,
    levelId: state.levelId,
    heroes: state.heroIds ?? [],
    cards: state.cardIds ?? [],
    allowedTowers: unlocks(meta).towers,
  });
  sim.state = state;
  sim.rng.state = env.rng >>> 0 || 1;
  const ids = state.heroIds ?? [];
  sim.bond = ids.length === 2 ? bondBetween(ids[0]!, ids[1]!) : bondBetween('', '');
  sim.state.paused = true;
  return sim;
}

export function loadRun(): { sim: Sim; prewave: RunState | null; recovered: boolean } | null {
  const which = localStorage.getItem(RUN_W) === 'b' ? 'b' : 'a';
  const order = which === 'b' ? [RUN_B, RUN_A] : [RUN_A, RUN_B];
  for (const key of order) {
    const raw = readRaw(key);
    if (!raw || typeof raw !== 'object') continue;
    const env = raw as RunEnvelope;
    if (!checksumValid(env)) continue;
    const envVersion = (env as { version?: number }).version;
    if (envVersion === 1 || env.dataHash === DATA_HASH_V1) {
      clearRun();
      discardedRunNotice = true;
      return null;
    }
    if (env.version !== 2 || env.dataHash !== DATA_HASH) continue;
    try {
      if (sane(env.state)) return { sim: revive(env, env.state), prewave: sane(env.prewave) ? env.prewave : null, recovered: false };
      if (sane(env.prewave)) return { sim: revive(env, env.prewave), prewave: env.prewave, recovered: true };
    } catch {
      continue;
    }
  }
  return null;
}

export function saveRun(sim: Sim, prewave: RunState | null) {
  const env = stampChecksum({
    version: 2 as const,
    dataHash: DATA_HASH,
    checksum: '',
    state: sim.state,
    prewave,
    rng: sim.rng.state,
  });
  writePair(RUN_W, RUN_A, RUN_B, env);
}

export function clearRun() {
  localStorage.removeItem(RUN_A);
  localStorage.removeItem(RUN_B);
  localStorage.removeItem(RUN_W);
}

export function clearAll() {
  clearRun();
  localStorage.removeItem(META_A);
  localStorage.removeItem(META_B);
  localStorage.removeItem(META_W);
}
