import { GACHA, HEROES, type Rarity } from '../data/catalog';
import type { MetaSave } from './types';
import { Rng } from './rng';

export interface PullCard {
  heroId: string;
  name: string;
  rarity: Rarity;
  duplicate: boolean;
  refund: number;
  pity: boolean;
}

export interface PullResult {
  ok: boolean;
  reason?: string;
  cards: PullCard[];
  cost: number;
  talisman: number;
}

function rollRarity(rng: Rng, pity: number, tenForce: boolean): { rarity: Rarity; pity: number; forced: boolean } {
  let rarity: Rarity;
  let forced = false;
  if (pity >= GACHA.pity - 1) {
    rarity = 'legendary';
    forced = true;
  } else if (tenForce) {
    rarity = rng.next() < 21 / 25 ? 'epic' : 'legendary';
  } else {
    const r = rng.next();
    if (r < GACHA.base.rare) rarity = 'rare';
    else if (r < GACHA.base.rare + GACHA.base.epic) rarity = 'epic';
    else rarity = 'legendary';
  }
  return { rarity, pity: rarity === 'legendary' ? 0 : pity + 1, forced };
}

function pick(rng: Rng, rarity: Rarity): string {
  const pool = HEROES.filter((h) => h.rarity === rarity);
  return pool[rng.int(pool.length)]!.id;
}

/** Mutates meta (talisman, pity, heroes, rng, firstSingleFree). */
export function pull(meta: MetaSave, kind: 'single' | 'ten'): PullResult {
  const free = kind === 'single' && meta.firstSingleFree;
  const cost = free ? 0 : kind === 'single' ? GACHA.singleCost : GACHA.tenCost;
  if (meta.talisman < cost) {
    return { ok: false, reason: '虎符不足', cards: [], cost, talisman: meta.talisman };
  }
  meta.talisman -= cost;
  if (free) meta.firstSingleFree = false;
  const rng = new Rng(meta.rng);
  const n = kind === 'single' ? 1 : 10;
  const cards: PullCard[] = [];
  let seenNonRare = false;
  for (let i = 0; i < n; i++) {
    const tenForce = kind === 'ten' && i === 9 && !seenNonRare;
    const before = meta.pity;
    const rolled = rollRarity(rng, meta.pity, tenForce);
    meta.pity = rolled.pity;
    if (rolled.rarity !== 'rare') seenNonRare = true;
    const heroId = pick(rng, rolled.rarity);
    const hero = HEROES.find((h) => h.id === heroId)!;
    const duplicate = meta.heroes.includes(heroId);
    let refund = 0;
    if (duplicate) {
      refund = GACHA.dupRefund;
      meta.talisman += refund;
    } else {
      meta.heroes.push(heroId);
    }
    cards.push({
      heroId,
      name: hero.name,
      rarity: rolled.rarity,
      duplicate,
      refund,
      pity: rolled.forced && before >= GACHA.pity - 1,
    });
  }
  meta.rng = rng.state;
  return { ok: true, cards, cost, talisman: meta.talisman };
}
