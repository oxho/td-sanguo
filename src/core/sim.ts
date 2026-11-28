import {
  BOSSES, CARDS, DECREES, ENEMIES, PACTS, TOWERS,
  enemyById, flagAura, heroById, levelMeta, liangcangGold, towerById, towerStat,
} from '../data/catalog';
import levelsFile from '../data/levels.json';
import mapM1 from '../data/maps/M1.json';
import mapM1b from '../data/maps/M1b.json';
import { bondBetween, type Bond } from './bonds';
import { gateMaxHp, gateUpgradeCost, skillScale, waveClearGold, waveHpScale } from './formula';
import { Rng } from './rng';
import type {
  CardState, DamageType, EnemyState, HeroSpecial, HeroState, Priority, RunState,
  SimEvent, SoldierState, SpawnSpec, TowerState, ZoneState,
} from './types';

export const DT = 1 / 30;

const COUNTER: Record<DamageType, Record<string, number>> = {
  pierce: { infantry: 1, cavalry: 1.5, archer: 1, siege: 0.66, flying: 1.25, boss: 1 },
  blunt: { infantry: 1.5, cavalry: 0.66, archer: 1, siege: 1.5, flying: 0, boss: 1 },
  fire: { infantry: 1, cavalry: 0.66, archer: 1.5, siege: 1.5, flying: 1, boss: 1 },
};

interface WaveJson {
  wave: number;
  enemies: Record<string, number>;
  boss: [string, number] | null;
  elite_count: number;
  spawn_override?: { group?: number; intra?: number; gap?: number };
}
interface LevelJson {
  id: string;
  map: string;
  type: string;
  waves: WaveJson[];
  elite_affixes: string[];
  dongfeng: boolean;
  start_gold?: number;
  hp_growth?: number;
  hp_mul?: number;
}
interface RulesJson {
  pacing?: {
    prep_first: number;
    prep: number;
    early_bonus_per_sec: number;
    early_bonus_cap?: number;
    spawn: { group: number; intra: number; gap: number };
  };
  enemy_speed?: Record<string, number>;
}
interface MapJson {
  id: string;
  name: string;
  cols: number;
  rows: number;
  gate: { c: number; r: number; x: number; y: number };
  entrance: { x: number; y: number };
  pads: { id: string; c: number; r: number; x: number; y: number }[];
  path: { c: number; r: number; x: number; y: number; gate?: boolean }[];
  length: number;
}

const LEVEL_FILE = levelsFile as { rules: RulesJson; levels: LevelJson[] };
const LEVELS_JSON = LEVEL_FILE.levels;

function prepSeconds(level: LevelJson, waveIndex: number): number {
  const pacing = LEVEL_FILE.rules.pacing;
  if (!pacing) return 15;
  return waveIndex === 0 ? pacing.prep_first : pacing.prep;
}

function spawnGap(level: LevelJson, wave: WaveJson | undefined): { group: number; intra: number; gap: number } {
  const base = LEVEL_FILE.rules.pacing?.spawn ?? { group: 3, intra: 0.5, gap: 2.5 };
  return {
    group: wave?.spawn_override?.group ?? base.group,
    intra: wave?.spawn_override?.intra ?? base.intra,
    gap: wave?.spawn_override?.gap ?? base.gap,
  };
}
const MAPS: Record<string, MapJson> = { M1: mapM1 as MapJson, M1b: mapM1b as MapJson };

export interface Sim {
  state: RunState;
  rng: Rng;
  events: SimEvent[];
  map: MapJson;
  level: LevelJson;
  bond: Bond;
  allowedTowers: string[];
  cap: number;
}

export type Command =
  | { type: 'build'; padId: string; towerId: string }
  | { type: 'upgrade'; id: number }
  | { type: 'branch'; id: number; branch: string }
  | { type: 'sell'; id: number }
  | { type: 'priority'; id: number; priority: Priority }
  | { type: 'repair'; id: number }
  | { type: 'start' }
  | { type: 'pact'; id: string | null }
  | { type: 'card'; index: number; x: number; y: number }
  | { type: 'skill'; hero: number }
  | { type: 'move'; hero: number; x: number; y: number }
  | { type: 'gate' }
  | { type: 'decree'; id: string | null }
  | { type: 'hold'; on: boolean };

export interface CmdResult { ok: boolean; reason?: string }

export function loadLevel(id: string): LevelJson {
  const level = LEVELS_JSON.find((l) => l.id === id);
  if (!level) throw new Error(`关卡 ${id} 不在数据里`);
  if (!['1-1', '1-2', '1-3', '1-4', '1-5'].includes(id)) throw new Error('V0.1 只开放 1-1 到 1-5');
  if (level.dongfeng) throw new Error('本关不应开启东风');
  if (level.map !== 'M1' && level.map !== 'M1b') throw new Error('V0.1 只用 M1 / M1b');
  if (id === '1-5') {
    const last = level.waves[level.waves.length - 1];
    if (!last?.boss || last.boss[0] !== 'duwei' || Math.abs(last.boss[1] - 0.6) > 1e-6) {
      throw new Error('1-5 第 10 波必须是乱军都尉 ×0.6');
    }
    const aff = level.elite_affixes.join(',');
    if (aff !== '坚韧,迅捷') throw new Error('1-5 精英词缀必须是坚韧、迅捷');
  }
  return level;
}

export function createRun(opts: {
  seed: number;
  levelId: string;
  heroes: string[];
  cards: string[];
  allowedTowers: string[];
}): Sim {
  const level = loadLevel(opts.levelId);
  const map = MAPS[level.map];
  if (!map) throw new Error('缺少地图');
  const metaRow = levelMeta(opts.levelId);
  const bond = opts.heroes.length === 2 ? bondBetween(opts.heroes[0]!, opts.heroes[1]!) : bondBetween('', '');
  const heroes: HeroState[] = opts.heroes.slice(0, 2).map((id, i) => {
    const def = heroById(id);
    const hp = Math.round(def.hp * (1 + bond.hp));
    const spot = i === 0 ? { x: 3.5, y: 15.5 } : { x: 5.5, y: 15.5 };
    return {
      id: i + 1, defId: id, x: spot.x, y: spot.y, px: spot.x, py: spot.y,
      hp, maxHp: hp, cd: 0, skillReadyAt: 0, downUntil: 0, move: [], still: 0,
      attacks: 0, lvbUntil: [], aspdMul: 1, aspdUntil: 0, guardUntil: 0, invulnUntil: 0,
      special: null, selected: false,
    };
  });
  const state: RunState = {
    version: 2,
    levelId: opts.levelId,
    seed: opts.seed >>> 0 || 1,
    time: 0,
    tick: 0,
    phase: 'prep',
    paused: false,
    munition: level.start_gold ?? metaRow.munition,
    gate: { level: 1, hp: 100, maxHp: 100, cd: 0 },
    towers: [],
    soldiers: [],
    enemies: [],
    heroes,
    cards: opts.cards.map((id) => ({ id, cdUntil: 0, channelUntil: 0, hit: false })),
    zones: [],
    decrees: [],
    decreeOffer: null,
    pendingPact: null,
    pact: null,
    countdown: prepSeconds(level, 0),
    countdownHold: false,
    waveIndex: 0,
    spawns: [],
    spawnIndex: 0,
    spawnCd: 0,
    groupPos: 0,
    eliteCursor: 0,
    firstLeakHalved: false,
    fireUntil: 0,
    burnCapUntil: 0,
    nextId: 10,
    stats: { leaks: 0, leakDamage: 0, builds: 0, kills: 0, cardCasts: 0, wavesCleared: 0 },
    log: [`${opts.levelId} ${metaRow.name} 初始军资 ${metaRow.munition}`],
    lastFormula: '尚无伤害',
    banners: [],
    codex: [],
    heroIds: opts.heroes.slice(0, 2),
    cardIds: opts.cards.slice(),
  };
  return {
    state,
    rng: new Rng(state.seed),
    events: [],
    map,
    level,
    bond,
    allowedTowers: opts.allowedTowers.filter((id) => !towerById(id).v01Hidden),
    cap: opts.levelId === '1-4' || opts.levelId === '1-5' ? 6 : 3,
  };
}

function nid(s: RunState): number { return s.nextId++; }
function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function hasDecree(s: RunState, id: string): boolean { return s.decrees.includes(id); }
function pushLog(s: RunState, line: string) {
  s.log.push(line);
  if (s.log.length > 80) s.log.splice(0, s.log.length - 80);
}
function banner(s: RunState, text: string) {
  s.banners.push({ text, until: s.time + 2.2 });
}

function pointOnPath(map: MapJson, progress: number): { x: number; y: number } {
  let left = Math.max(0, progress);
  for (let i = 1; i < map.path.length; i++) {
    const a = map.path[i - 1]!;
    const b = map.path[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= seg || i === map.path.length - 1) {
      const t = seg === 0 ? 0 : Math.min(1, left / seg);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= seg;
  }
  const last = map.path[map.path.length - 1]!;
  return { x: last.x, y: last.y };
}

function placeEnemy(map: MapJson, e: EnemyState) {
  if (e.flying) {
    const t = e.pathLength <= 0 ? 1 : e.progress / e.pathLength;
    e.x = map.entrance.x + (map.gate.x - map.entrance.x) * t;
    e.y = map.entrance.y + (map.gate.y - map.entrance.y) * t;
  } else {
    const p = pointOnPath(map, e.progress);
    e.x = p.x;
    e.y = p.y;
  }
}

function flyLength(map: MapJson): number {
  return Math.hypot(map.gate.x - map.entrance.x, map.gate.y - map.entrance.y);
}

function walkable(map: MapJson, c: number, r: number): boolean {
  if (c < 0 || r < 0 || c >= map.cols || r >= map.rows) return false;
  if (map.gate.c === c && map.gate.r === r) return false;
  if (map.pads.some((p) => p.c === c && p.r === r)) return false;
  return true;
}

function bfs(map: MapJson, sc: number, sr: number, gc: number, gr: number): { c: number; r: number }[] | null {
  if (!walkable(map, gc, gr)) return null;
  const start = walkable(map, sc, sr) ? { c: sc, r: sr } : nearestWalkable(map, sc, sr);
  if (!start) return null;
  const key = (c: number, r: number) => `${c},${r}`;
  const q = [start];
  const prev = new Map<string, string | null>();
  prev.set(key(start.c, start.r), null);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (q.length) {
    const cur = q.shift()!;
    if (cur.c === gc && cur.r === gr) break;
    for (const [dc, dr] of dirs) {
      const nc = cur.c + dc!, nr = cur.r + dr!;
      const k = key(nc, nr);
      if (prev.has(k) || !walkable(map, nc, nr)) continue;
      prev.set(k, key(cur.c, cur.r));
      q.push({ c: nc, r: nr });
    }
  }
  if (!prev.has(key(gc, gr))) return null;
  const path: { c: number; r: number }[] = [];
  let k: string | null = key(gc, gr);
  while (k) {
    const [c, r] = k.split(',').map(Number);
    path.push({ c: c!, r: r! });
    k = prev.get(k) ?? null;
  }
  path.reverse();
  return path;
}

function nearestWalkable(map: MapJson, c: number, r: number): { c: number; r: number } | null {
  for (let rad = 0; rad < 6; rad++) {
    for (let y = r - rad; y <= r + rad; y++) {
      for (let x = c - rad; x <= c + rad; x++) {
        if (walkable(map, x, y)) return { c: x, r: y };
      }
    }
  }
  return null;
}

function progressNear(map: MapJson, x: number, y: number): number {
  let best = 0;
  let bestD = 1e9;
  let walked = 0;
  for (let i = 1; i < map.path.length; i++) {
    const a = map.path[i - 1]!;
    const b = map.path[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const steps = Math.max(1, Math.ceil(seg / 0.25));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = a.x + (b.x - a.x) * t;
      const py = a.y + (b.y - a.y) * t;
      const d = Math.hypot(px - x, py - y);
      if (d < bestD) { bestD = d; best = walked + seg * t; }
    }
    walked += seg;
  }
  return best;
}

export function dispatch(sim: Sim, cmd: Command): CmdResult {
  const s = sim.state;
  switch (cmd.type) {
    case 'hold': s.countdownHold = cmd.on; return { ok: true };
    case 'pact': {
      if (s.phase !== 'prep') return { ok: false, reason: '这波已经开始' };
      if (cmd.id && !PACTS.some((p) => p.id === cmd.id)) return { ok: false, reason: '没有这道军约' };
      s.pendingPact = cmd.id;
      return { ok: true };
    }
    case 'start': {
      if (s.phase !== 'prep') return { ok: false, reason: '现在不能开波' };
      beginWave(sim);
      return { ok: true };
    }
    case 'decree': return pickDecree(sim, cmd.id);
    case 'build': return buildTower(sim, cmd.padId, cmd.towerId);
    case 'upgrade': return upgradeTower(sim, cmd.id);
    case 'branch': return chooseBranch(sim, cmd.id, cmd.branch);
    case 'sell': return sellTower(sim, cmd.id);
    case 'priority': return setPriority(sim, cmd.id, cmd.priority);
    case 'repair': return repairTower(sim, cmd.id);
    case 'gate': return upgradeGate(sim);
    case 'card': return castCard(sim, cmd.index, cmd.x, cmd.y);
    case 'skill': return castSkill(sim, cmd.hero);
    case 'move': return moveHero(sim, cmd.hero, cmd.x, cmd.y);
    default: return { ok: false, reason: '未知命令' };
  }
}

function fail(reason: string): CmdResult { return { ok: false, reason }; }

function buildTower(sim: Sim, padId: string, towerId: string): CmdResult {
  const s = sim.state;
  if (s.phase === 'victory' || s.phase === 'defeat' || s.phase === 'decree') return fail('现在不能建造');
  const def = TOWERS.find((t) => t.id === towerId);
  if (!def || def.v01Hidden || !sim.allowedTowers.includes(towerId)) return fail('这塔还没解锁');
  const pad = sim.map.pads.find((p) => p.id === padId);
  if (!pad) return fail('没有这个塔基');
  if (s.towers.some((t) => t.padId === padId)) return fail('塔基已经有塔');
  if (s.munition < def.cost) return fail('军资不足');
  s.munition -= def.cost;
  if (s.towers.length === 0) s.countdownHold = false;
  const stat = towerStat(towerId, 1, '');
  const tower: TowerState = {
    id: nid(s), defId: towerId, padId, x: pad.x, y: pad.y, level: 1, branch: '',
    cd: 0, skillCd: 0, priority: 'front', invested: stat.invested, spent: def.cost, nextMul: 1, pili: false,
    aspdUntil: 0, wavesSeen: 0, damagedUntil: 0, shots: [], rooted: false,
  };
  s.towers.push(tower);
  s.stats.builds += 1;
  if (towerId === 'qiangbing') syncSoldiers(sim, tower);
  sim.events.push({ type: 'build', id: tower.id, defId: towerId, x: pad.x, y: pad.y });
  pushLog(s, `建造 ${def.name}（第 ${s.stats.builds} 座）`);
  return { ok: true };
}

function upgradeCostOf(sim: Sim, tower: TowerState): number {
  const info = nextCost(tower);
  if (!info) return 0;
  let cost = info;
  if (hasDecree(sim.state, 'gongjiang')) cost = Math.round(cost * 0.9);
  return cost;
}

function nextCost(tower: TowerState): number | null {
  if (tower.level >= 6) return null;
  if (tower.level === 3) {
    return towerById(tower.defId).stats.find((st) => st.level === 4)?.upgradeCost ?? null;
  }
  const branch = tower.level >= 4 ? tower.branch : '';
  return towerStat(tower.defId, tower.level + 1, branch).upgradeCost;
}

function upgradeTower(sim: Sim, id: number): CmdResult {
  const s = sim.state;
  const tower = s.towers.find((t) => t.id === id);
  if (!tower) return fail('没有这座塔');
  if (tower.level >= sim.cap) return fail(sim.cap === 3 ? '本关最高 Lv3' : '已满级');
  if (tower.level === 3 && sim.cap >= 4) return fail('请选择分支');
  const cost = upgradeCostOf(sim, tower);
  if (s.munition < cost) return fail('军资不足');
  s.munition -= cost;
  tower.level += 1;
  tower.invested += cost;
  tower.spent += cost;
  if (tower.defId === 'qiangbing') syncSoldiers(sim, tower);
  pushLog(s, `${towerById(tower.defId).name} 升到 Lv${tower.level}`);
  return { ok: true };
}

function chooseBranch(sim: Sim, id: number, branch: string): CmdResult {
  const s = sim.state;
  const tower = s.towers.find((t) => t.id === id);
  if (!tower) return fail('没有这座塔');
  if (sim.cap < 4) return fail('本关尚未开放分支');
  if (tower.level !== 3) return fail('升到 Lv4 时才选分支');
  const def = towerById(tower.defId);
  if (!def.branches.some((b) => b.id === branch)) return fail('没有这个分支');
  const cost = upgradeCostOf(sim, tower);
  if (s.munition < cost) return fail('军资不足');
  s.munition -= cost;
  tower.level = 4;
  tower.branch = branch;
  tower.invested += cost;
  tower.spent += cost;
  tower.skillCd = 0;
  if (branch === 'shenshe') tower.priority = 'boss';
  if (tower.defId === 'qiangbing') syncSoldiers(sim, tower);
  const bname = def.branches.find((b) => b.id === branch)?.name ?? branch;
  pushLog(s, `${def.name} 进阶 ${bname}`);
  return { ok: true };
}

function sellTower(sim: Sim, id: number): CmdResult {
  const s = sim.state;
  const tower = s.towers.find((t) => t.id === id);
  if (!tower) return fail('没有这座塔');
  const table = towerStat(tower.defId, tower.level, tower.branch);
  const refund = tower.spent === table.invested ? table.sell : Math.round(tower.spent * 0.7);
  s.munition += refund;
  s.towers = s.towers.filter((t) => t.id !== id);
  s.soldiers = s.soldiers.filter((sol) => sol.towerId !== id);
  for (const e of s.enemies) if (s.soldiers.every((sol) => sol.id !== e.blockedBy)) e.blockedBy = 0;
  pushLog(s, `卖出 ${towerById(tower.defId).name}，返还 ${refund}`);
  return { ok: true };
}

function setPriority(sim: Sim, id: number, priority: Priority): CmdResult {
  const tower = sim.state.towers.find((t) => t.id === id);
  if (!tower) return fail('没有这座塔');
  tower.priority = priority;
  return { ok: true };
}

/** Reserved for battering rams. Nothing in V0.1 calls this during a level. */
export function damageTower(sim: Sim, id: number): void {
  const tower = sim.state.towers.find((t) => t.id === id);
  if (!tower) return;
  tower.damagedUntil = sim.state.time + 8;
}

function repairTower(sim: Sim, id: number): CmdResult {
  const s = sim.state;
  const tower = s.towers.find((t) => t.id === id);
  if (!tower) return fail('没有这座塔');
  if (tower.damagedUntil <= s.time) return fail('没有受损');
  if (s.munition < 20) return fail('军资不足');
  s.munition -= 20;
  tower.damagedUntil = 0;
  return { ok: true };
}

function upgradeGate(sim: Sim): CmdResult {
  const g = sim.state.gate;
  if (g.level >= 8) return fail('城门已满级');
  const cost = gateUpgradeCost(g.level);
  if (sim.state.munition < cost) return fail('军资不足');
  sim.state.munition -= cost;
  g.level += 1;
  g.maxHp = gateMaxHp(g.level);
  g.hp = g.maxHp;
  pushLog(sim.state, `城门升到 Lv${g.level}`);
  return { ok: true };
}

function cardCdMul(sim: Sim): number {
  let red = sim.bond.cardCd;
  if (sim.state.heroes.some((h) => h.defId === 'zhugeliang')) red += 0.15;
  if (hasDecree(sim.state, 'bingshu')) red += 0.15;
  return 1 - Math.min(0.4, red);
}

function castCard(sim: Sim, index: number, x: number, y: number): CmdResult {
  const s = sim.state;
  const card = s.cards[index];
  if (!card) return fail('没有这张卡');
  if (s.phase === 'decree' || s.paused) return fail('现在不能施放');
  if (s.pact === 'fengmou' && s.phase === 'combat') return fail('封谋：这波不能用谋略卡');
  if (s.time < card.cdUntil || s.time < card.channelUntil) return fail('冷却中');
  const def = CARDS.find((c) => c.id === card.id);
  if (!def) return fail('未知谋略');
  const hits = s.enemies.filter((e) => e.alive && dist(e, { x, y }) <= def.radius + 1e-6);
  if (!hits.length) return fail('未命中敌人');
  if (def.id === 'huogong') {
    for (const e of hits) {
      deal(sim, e, { amount: 120, type: 'fire', source: '火攻', vuln: vulnOf(sim, e) });
      addBurn(sim, e, 2);
    }
  } else if (def.id === 'wanjian') {
    for (const e of hits) deal(sim, e, { amount: 15, type: 'pierce', source: '万箭齐发', vuln: vulnOf(sim, e) });
    s.zones.push(makeZone(s, {
      kind: 'pulse', x, y, radius: def.radius, until: s.time + 2.6, amount: 15,
      damageType: 'pierce', flying: true, acc: 0.5, interval: 0.5, pulsesLeft: 5,
    }));
  } else return fail('这张卡 V0.1 不能带入');
  card.cdUntil = s.time + def.cd * cardCdMul(sim);
  card.hit = true;
  s.stats.cardCasts += 1;
  sim.events.push({ type: 'card', text: def.name, x, y });
  pushLog(s, `${def.name} 命中 ${hits.length}`);
  return { ok: true };
}

function makeZone(s: RunState, part: Partial<ZoneState> & Pick<ZoneState, 'kind' | 'x' | 'y'>): ZoneState {
  return {
    id: nid(s), radius: 0.8, until: s.time + 3, dps: 0, slow: 0, damageType: 'none',
    flying: false, acc: 0, interval: 0.5, pulsesLeft: 0, amount: 0, sourceHero: '',
    ...part,
  };
}

function addBurn(sim: Sim, e: EnemyState, n: number) {
  const cap = 5 + (sim.state.time < sim.state.burnCapUntil ? 2 : 0);
  e.burnStacks = Math.min(cap, e.burnStacks + n);
  e.burnUntil = sim.state.time + 3;
}

function moveHero(sim: Sim, id: number, x: number, y: number): CmdResult {
  const hero = sim.state.heroes.find((h) => h.id === id);
  if (!hero) return fail('没有这位武将');
  if (hero.downUntil > sim.state.time) return fail('武将倒地');
  const c = Math.floor(x);
  const r = Math.floor(y);
  if (!walkable(sim.map, c, r)) return fail('无法驻守');
  const path = bfs(sim.map, Math.floor(hero.x), Math.floor(hero.y), c, r);
  if (!path) return fail('无法驻守');
  hero.move = path.map((p) => ({ x: p.c + 0.5, y: p.r + 0.5 }));
  hero.special = null;
  return { ok: true };
}

function castSkill(sim: Sim, id: number): CmdResult {
  const s = sim.state;
  const hero = s.heroes.find((h) => h.id === id);
  if (!hero) return fail('没有这位武将');
  if (hero.downUntil > s.time) return fail('武将倒地');
  if (s.time < hero.skillReadyAt) return fail('技能还没好');
  if (s.phase === 'decree') return fail('现在不能施放');
  const def = heroById(hero.defId);
  const ok = fireSkill(sim, hero);
  if (!ok.ok) return ok;
  hero.skillReadyAt = s.time + def.skillCd;
  sim.events.push({ type: 'skill', text: def.skill, x: hero.x, y: hero.y, defId: hero.defId });
  pushLog(s, `${def.name} · ${def.skill}`);
  return { ok: true };
}

function facing(sim: Sim, hero: HeroState): { x: number; y: number } {
  const dx = sim.map.entrance.x - hero.x;
  const dy = sim.map.entrance.y - hero.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
}

function fireSkill(sim: Sim, hero: HeroState): CmdResult {
  const s = sim.state;
  const def = heroById(hero.defId);
  const dir = facing(sim, hero);
  if (def.id === 'guanyu') {
    let n = 0;
    for (const e of s.enemies) {
      if (!e.alive) continue;
      const vx = e.x - hero.x;
      const vy = e.y - hero.y;
      const along = vx * dir.x + vy * dir.y;
      const cross = Math.abs(vx * dir.y - vy * dir.x);
      if (along >= 0 && along <= 3 && cross <= 0.4) {
        deal(sim, e, { amount: def.atk * 5, type: def.damageType, source: def.name, heroId: def.id });
        n++;
      }
    }
    return { ok: true };
  }
  if (def.id === 'zhaoyun') {
    hero.special = { kind: 'zhaoyun', start: s.time, origin: progressNear(sim.map, hero.x, hero.y), nextHit: s.time, hits: 7 };
    hero.invulnUntil = s.time + 3.5;
    hero.move = [];
    return { ok: true };
  }
  if (def.id === 'lvbu') {
    hero.special = { kind: 'lvbu', next: s.time, left: 6 };
    return { ok: true };
  }
  if (def.id === 'zhugeliang') {
    s.fireUntil = s.time + 10;
    s.burnCapUntil = s.time + 10;
    banner(s, '借东风');
    return { ok: true };
  }
  if (def.id === 'zhangfei') {
    for (const e of s.enemies) if (e.alive && dist(e, hero) <= 1.67) control(sim, e, 'stun', 2);
    return { ok: true };
  }
  if (def.id === 'zhouyu') {
    const cells = pathCellsInRange(sim, hero.x, hero.y, def.range);
    const run = longestRun(cells).slice(0, 6);
    if (!run.length) return fail('射程内没有路线');
    for (const p of run) {
      s.zones.push(makeZone(s, {
        kind: 'fireline', x: p.x, y: p.y, radius: 0.55, until: s.time + 5, dps: 25,
        damageType: 'fire', flying: false,
      }));
    }
    return { ok: true };
  }
  if (def.id === 'dianwei') {
    hero.guardUntil = s.time + 6;
    return { ok: true };
  }
  if (def.id === 'sunshangxiang') {
    hero.aspdMul = 3;
    hero.aspdUntil = s.time + 4;
    hero.special = { kind: 'ssx', until: s.time + 4 };
    return { ok: true };
  }
  if (def.id === 'huangzhong') {
    const target = s.enemies.filter((e) => e.alive).sort((a, b) => b.hp - a.hp)[0];
    if (!target) return fail('场上没有敌人');
    deal(sim, target, { amount: def.atk * 6, type: def.damageType, ignoreDodge: true, source: def.name, heroId: def.id });
    return { ok: true };
  }
  if (def.id === 'machao') {
    hero.special = {
      kind: 'machao', sx: hero.x, sy: hero.y,
      ex: Math.max(0.4, Math.min(8.6, hero.x + dir.x * 3)),
      ey: Math.max(0.4, Math.min(15.6, hero.y + dir.y * 3)),
      until: s.time + 0.35, hit: [],
    };
    hero.move = [];
    return { ok: true };
  }
  if (def.id === 'ganning') {
    const back = 2 + sim.bond.ganningExtra;
    for (const e of s.enemies) {
      if (!e.alive || e.flying || dist(e, hero) > 2) continue;
      knock(sim, e, back);
    }
    return { ok: true };
  }
  if (def.id === 'diaochan') {
    const dur = 3 + sim.bond.diaochanExtra;
    for (const e of s.enemies) if (e.alive && dist(e, hero) <= 1.67) control(sim, e, 'diaochan', dur);
    return { ok: true };
  }
  return fail('技能未实现');
}

function control(sim: Sim, e: EnemyState, kind: 'stun' | 'root' | 'diaochan', dur: number) {
  if (e.boss) {
    applySlow(sim, e, kind === 'diaochan' ? 0.5 : 0.7, dur);
    return;
  }
  e.haltUntil = Math.max(e.haltUntil, sim.state.time + dur);
}

function knock(sim: Sim, e: EnemyState, cells: number) {
  if (e.boss) { applySlow(sim, e, 0.7, 1); return; }
  e.progress = Math.max(0, e.progress - cells);
  e.blockedBy = 0;
  placeEnemy(sim.map, e);
}

function pathCellsInRange(sim: Sim, x: number, y: number, range: number): { x: number; y: number; i: number }[] {
  const out: { x: number; y: number; i: number }[] = [];
  sim.map.path.forEach((p, i) => {
    if (p.gate) return;
    if (Math.hypot(p.x - x, p.y - y) <= range) out.push({ x: p.x, y: p.y, i });
  });
  return out;
}

function longestRun(cells: { x: number; y: number; i: number }[]): { x: number; y: number }[] {
  if (!cells.length) return [];
  const sorted = cells.slice().sort((a, b) => a.i - b.i);
  let best: typeof sorted = [];
  let cur: typeof sorted = [];
  for (const c of sorted) {
    if (!cur.length || c.i === cur[cur.length - 1]!.i + 1) cur.push(c);
    else { if (cur.length > best.length) best = cur; cur = [c]; }
  }
  if (cur.length > best.length) best = cur;
  return best;
}

function pickDecree(sim: Sim, id: string | null): CmdResult {
  const s = sim.state;
  if (s.phase !== 'decree' || !s.decreeOffer) return fail('现在没有军令');
  if (id) {
    if (!s.decreeOffer.includes(id)) return fail('不在这三道军令里');
    s.decrees.push(id);
    const def = DECREES.find((d) => d.id === id);
    pushLog(s, def?.inert ? `军令 ${def.name}：${def.hint}` : `军令 ${def?.name ?? id}`);
  } else pushLog(s, '跳过军令');
  s.decreeOffer = null;
  enterPrep(sim);
  return { ok: true };
}

function enterPrep(sim: Sim) {
  const s = sim.state;
  s.phase = 'prep';
  s.countdown = prepSeconds(sim.level, s.waveIndex);
  s.countdownHold = false;
  s.pact = null;
  s.pendingPact = null;
  sim.events.push({ type: 'prep', wave: s.waveIndex + 1 });
}

function beginWave(sim: Sim) {
  const s = sim.state;
  const waveNo = s.waveIndex + 1;
  const wave = sim.level.waves[s.waveIndex];
  if (!wave) return;
  if (s.countdown > 0) {
    const per = LEVEL_FILE.rules.pacing?.early_bonus_per_sec ?? 2;
    const cap = LEVEL_FILE.rules.pacing?.early_bonus_cap ?? 14;
    const bonus = Math.min(cap, Math.max(0, Math.floor(s.countdown + 1e-6)) * per);
    if (bonus) {
      s.munition += bonus;
      pushLog(s, `提前开波 +${bonus}`);
    }
  }
  s.countdown = 0;
  const order = Object.keys(wave.enemies);
  const left: Record<string, number> = { ...wave.enemies };
  const types = order.filter((id) => (left[id] ?? 0) > 0);
  const total = types.reduce((n, id) => n + (left[id] ?? 0), 0);
  const queue: string[] = [];
  while (queue.length < total) {
    for (const id of types) {
      if ((left[id] ?? 0) > 0) { queue.push(id); left[id] = (left[id] ?? 0) - 1; }
    }
  }
  const baseElite = queue.filter((_, i) => sim.level.elite_affixes.length > 0 && (i + 1) % 4 === 0).length;
  if (baseElite !== wave.elite_count) pushLog(s, `精英数 ${baseElite} / 表 ${wave.elite_count}`);
  if (s.pendingPact === 'zengyuan' && queue.length) {
    const extra = waveNo >= 7 ? 3 : 2;
    for (let i = 0; i < extra; i++) queue.push(queue[0]!);
  }
  const spawns: SpawnSpec[] = queue.map((id, i) => {
    const elite = sim.level.elite_affixes.length > 0 && (i + 1) % 4 === 0;
    let affix: SpawnSpec['affix'] = '';
    if (elite) {
      const name = sim.level.elite_affixes[s.eliteCursor % sim.level.elite_affixes.length] ?? '';
      affix = name === '迅捷' ? '迅捷' : '坚韧';
      s.eliteCursor += 1;
    }
    return { id, elite, affix, boss: false, hpMul: 1 };
  });
  if (wave.boss) spawns.push({ id: wave.boss[0], elite: false, affix: '', boss: true, hpMul: wave.boss[1] });
  s.spawns = spawns;
  s.spawnIndex = 0;
  s.spawnCd = 0;
  s.groupPos = 0;
  s.phase = 'combat';
  s.pact = s.pendingPact;
  s.pendingPact = null;
  s.firstLeakHalved = false;
  const pactName = PACTS.find((p) => p.id === s.pact)?.name;
  pushLog(s, `第 ${waveNo} 波 ${spawns.length} 个${pactName ? ` · 军约 ${pactName}` : ''}${wave.boss ? ' · 含头目' : ''}`);
  sim.events.push({ type: 'wave', wave: waveNo, boss: Boolean(wave.boss) });
  if (wave.boss) banner(s, wave.boss[1] < 1 ? '乱军都尉 · 预告' : '乱军都尉');
}

export function step(sim: Sim) {
  const s = sim.state;
  if (s.phase === 'victory' || s.phase === 'defeat' || s.phase === 'decree') return;
  s.time += DT;
  s.tick += 1;
  for (const e of s.enemies) { e.px = e.x; e.py = e.y; }
  for (const h of s.heroes) { h.px = h.x; h.py = h.y; }
  for (const sol of s.soldiers) { sol.px = sol.x; sol.py = sol.y; }
  s.banners = s.banners.filter((b) => b.until > s.time);
  if (s.phase === 'prep') {
    if (!s.countdownHold) s.countdown = Math.max(0, s.countdown - DT);
    if (!s.countdownHold && s.countdown <= 0) beginWave(sim);
    return;
  }
  tickDots(sim);
  tickSpawn(sim);
  tickMove(sim);
  if (s.phase !== 'combat') return;
  tickBlocks(sim);
  tickTowers(sim);
  tickSoldiers(sim);
  tickHeroes(sim);
  tickGate(sim);
  tickZones(sim);
  resolveDead(sim);
  if (s.phase === 'combat') maybeClear(sim);
}

function tickDots(sim: Sim) {
  const s = sim.state;
  const fire = fireBonus(sim);
  for (const e of s.enemies) {
    if (!e.alive) continue;
    if (e.burnUntil > s.time && e.burnStacks > 0) {
      const amount = e.burnStacks * 6 * (1 + fire) * DT;
      applyHp(sim, e, amount, true, '燃烧');
    } else e.burnStacks = 0;
    if (e.jiliUntil > s.time) deal(sim, e, { amount: 8 * DT, type: 'blunt', source: '铁蒺藜' });
  }
}

function fireBonus(sim: Sim): number {
  return sim.bond.fire + (sim.state.time < sim.state.fireUntil ? 0.4 : 0);
}

function tickSpawn(sim: Sim) {
  const s = sim.state;
  if (s.spawnIndex >= s.spawns.length) return;
  s.spawnCd -= DT;
  if (s.spawnCd > 0) return;
  spawnOne(sim, s.spawns[s.spawnIndex]!);
  s.spawnIndex += 1;
  const wave = sim.level.waves[s.waveIndex];
  const gap = spawnGap(sim.level, wave);
  const next = s.spawns[s.spawnIndex];
  s.groupPos += 1;
  if (!next) {
    s.spawnCd = 0;
    return;
  }
  if (next.boss || s.groupPos >= gap.group) {
    s.groupPos = 0;
    s.spawnCd = gap.gap;
  } else s.spawnCd = gap.intra;
}

function spawnOne(sim: Sim, spec: SpawnSpec) {
  const s = sim.state;
  const wave = s.waveIndex + 1;
  const scale = waveHpScale(wave, sim.level.hp_growth ?? 1.15, sim.level.hp_mul ?? 1);
  const boss = spec.boss ? BOSSES.find((b) => b.id === spec.id) : undefined;
  const def = spec.boss ? undefined : enemyById(spec.id);
  if (!boss && !def) return;
  let hpMul = scale;
  let shMul = scale;
  if (spec.elite) {
    hpMul *= 2;
    shMul *= 2;
    if (spec.affix === '坚韧') hpMul *= 1.5;
  }
  if (spec.boss) {
    hpMul *= 0.82 * spec.hpMul;
    shMul *= 0.82 * spec.hpMul;
  }
  const baseHp = boss ? boss.hp : def!.hp;
  const baseSh = boss ? boss.shield : def!.shield;
  const flying = Boolean(def?.flying);
  const e: EnemyState = {
    id: nid(s),
    defId: spec.boss ? spec.id : def!.id,
    name: boss ? boss.name : def!.name,
    species: spec.boss ? 'boss' : def!.species,
    flying,
    boss: spec.boss,
    bossId: spec.boss ? spec.id : '',
    allowPhases: spec.boss && spec.hpMul >= 0.99,
    phase: 1,
    hp: baseHp * hpMul,
    maxHp: baseHp * hpMul,
    shield: baseSh * shMul,
    maxShield: baseSh * shMul,
    armor: Math.min(0.6, boss ? boss.armor : def!.armor),
    baseSpeed: boss ? boss.speed : (LEVEL_FILE.rules.enemy_speed?.[def!.id] ?? def!.speed),
    bounty: (boss ? boss.bounty : def!.bounty) * (spec.elite ? 2 : 1),
    leak: (boss ? boss.leak : def!.leak) + (spec.elite ? 1 : 0),
    contactDps: def?.contactDps ?? 20,
    dodgeFirst: def?.dodgeFirst ?? 0,
    dodgeUsed: false,
    sprintEvery: def?.sprintEvery ?? 0,
    sprintDur: def?.sprintDur ?? 0,
    sprintMul: def?.sprintMul ?? 1,
    sprintCd: def?.sprintEvery ?? 0,
    sprintLeft: 0,
    elite: spec.elite,
    affix: spec.affix,
    progress: 0,
    pathLength: flying ? flyLength(sim.map) : sim.map.length,
    x: sim.map.entrance.x,
    y: sim.map.entrance.y,
    px: sim.map.entrance.x,
    py: sim.map.entrance.y,
    slowAmt: 0,
    slowUntil: 0,
    haltUntil: 0,
    hasteUntil: 0,
    burnStacks: 0,
    burnUntil: 0,
    blockedBy: 0,
    tauntId: 0,
    nextDrum: s.time + 8,
    summonCd: 0,
    phase3Used: false,
    jiliUntil: 0,
    slowImmuneUntil: 0,
    alive: true,
    wave,
  };
  placeEnemy(sim.map, e);
  s.enemies.push(e);
  if (!s.codex.includes(e.defId)) s.codex.push(e.defId);
  sim.events.push({ type: 'spawn', id: e.id, defId: e.defId, x: e.x, y: e.y, text: e.elite ? e.affix : e.boss ? '预告' : '' });
}

function tickMove(sim: Sim) {
  const s = sim.state;
  for (const e of s.enemies) {
    if (!e.alive) continue;
    if (e.sprintEvery > 0) {
      if (e.sprintLeft > 0) e.sprintLeft -= DT;
      else {
        e.sprintCd -= DT;
        if (e.sprintCd <= 0) { e.sprintLeft = e.sprintDur; e.sprintCd = e.sprintEvery; }
      }
    }
    considerPhase(sim, e);
    if (e.boss && e.bossId === 'duwei' && e.phase === 1 && s.time >= e.nextDrum) {
      e.nextDrum += 8;
      let n = 0;
      for (const o of s.enemies) {
        if (!o.alive || o.id === e.id) continue;
        if (dist(o, e) <= 2) { o.hasteUntil = s.time + 3; n++; }
      }
      banner(s, '擂鼓进军');
      pushLog(s, `擂鼓进军，加速 ${n} 个敌人`);
    }
    if (e.haltUntil > s.time) continue;
    if (e.blockedBy) {
      const sol = s.soldiers.find((x) => x.id === e.blockedBy);
      if (!sol || sol.downUntil > s.time) e.blockedBy = 0;
      else continue;
    }
    e.progress += speedOf(s, e) * DT;
    if (e.progress >= e.pathLength) leak(sim, e);
    else placeEnemy(sim.map, e);
  }
}

function speedOf(s: RunState, e: EnemyState): number {
  let sp = e.baseSpeed;
  if (e.sprintLeft > 0) sp *= e.sprintMul;
  if (e.affix === '迅捷') sp *= 1.25;
  if (s.pact === 'jixing') sp *= 1.2;
  if (e.hasteUntil > s.time) sp *= 1.2;
  if (e.phase === 3) sp *= 1.3;
  if (e.slowUntil > s.time) sp *= 1 - Math.min(0.8, e.slowAmt);
  return sp;
}

function considerPhase(sim: Sim, e: EnemyState) {
  if (!e.boss || !e.allowPhases || !e.alive) return;
  const pct = e.maxHp > 0 ? e.hp / e.maxHp : 1;
  if (e.phase === 1 && pct <= 0.6) {
    e.phase = 2;
    e.summonCd = sim.state.time + 10;
    summonRebel(sim, e, 4);
    banner(sim.state, '阶段 2');
    pushLog(sim.state, '乱军都尉进入阶段 2');
  } else if (e.phase === 2 && pct <= 0.25 && !e.phase3Used) {
    e.phase = 3;
    e.phase3Used = true;
    e.slowUntil = 0;
    e.slowAmt = 0;
    e.slowImmuneUntil = sim.state.time + 5;
    banner(sim.state, '困兽');
  }
  if (e.phase >= 2 && e.summonCd > 0 && sim.state.time >= e.summonCd) {
    summonRebel(sim, e, 2);
    e.summonCd += 10;
  }
}

function summonRebel(sim: Sim, boss: EnemyState, count: number) {
  for (let i = 0; i < count; i++) {
    spawnOne(sim, { id: 'luanbing', elite: false, affix: '', boss: false, hpMul: 1 });
    const spawned = sim.state.enemies[sim.state.enemies.length - 1];
    if (!spawned) continue;
    spawned.progress = Math.max(0, boss.progress - 0.4 - i * 0.3);
    placeEnemy(sim.map, spawned);
  }
}

function leak(sim: Sim, e: EnemyState) {
  const s = sim.state;
  let dmg = e.leak;
  if (hasDecree(s, 'wengcheng') && !s.firstLeakHalved) {
    dmg *= 0.5;
    s.firstLeakHalved = true;
  }
  s.gate.hp -= dmg;
  s.stats.leaks += 1;
  s.stats.leakDamage += dmg;
  e.alive = false;
  sim.events.push({ type: 'leak', id: e.id, x: e.x, y: e.y, amount: dmg, text: e.name });
  pushLog(s, `${e.name} 突入城门 −${trim(dmg)}`);
  if (s.gate.hp <= 0) {
    s.gate.hp = 0;
    s.phase = 'defeat';
    sim.events.push({ type: 'defeat' });
  }
}

function tickBlocks(sim: Sim) {
  const s = sim.state;
  for (const e of s.enemies) {
    if (!e.alive || !e.blockedBy) continue;
    const sol = s.soldiers.find((x) => x.id === e.blockedBy);
    if (!sol || sol.downUntil > s.time || e.flying) e.blockedBy = 0;
  }
  const ordered = s.enemies.filter((e) => e.alive && !e.flying && !e.blockedBy).sort((a, b) => b.progress - a.progress);
  for (const e of ordered) {
    for (const sol of s.soldiers) {
      if (sol.downUntil > s.time) continue;
      if (dist(sol, e) > 0.48) continue;
      const tower = s.towers.find((t) => t.id === sol.towerId);
      if (!tower || tower.damagedUntil > s.time) continue;
      const cap = tower.branch === 'tengjia' ? 2 : 1;
      const used = s.enemies.filter((o) => o.alive && o.blockedBy === sol.id).length;
      if (used >= cap) continue;
      e.blockedBy = sol.id;
      break;
    }
  }
}

function tickTowers(sim: Sim) {
  const s = sim.state;
  for (const tower of s.towers) {
    if (tower.damagedUntil > s.time) continue;
    for (const shot of tower.shots) {
      shot.t -= DT;
      if (shot.t <= 0) fireSplash(sim, tower, shot.x, shot.y, shot.mul, shot.splash, '乱石阵');
    }
    tower.shots = tower.shots.filter((sh) => sh.t > 0);
    const stat = towerStat(tower.defId, tower.level, tower.branch);
    if (stat.aps > 0 && tower.defId !== 'qiangbing') {
      tower.cd -= DT;
      if (tower.cd <= 0) {
        const fired = fireTower(sim, tower);
        if (fired) {
          let aps = stat.aps;
          if (tower.defId === 'jianlou' && hasDecree(s, 'jingnu')) aps *= 1.15;
          if (tower.aspdUntil > s.time) aps *= 2;
          if (tower.defId === 'huoyou') aps *= huoyouAspd(sim, tower);
          tower.cd = 1 / aps;
        }
      }
    }
    triggerSkill(sim, tower);
  }
}

function huoyouAspd(sim: Sim, tower: TowerState): number {
  let mul = 1;
  for (const h of sim.state.heroes) {
    if (h.defId === 'zhouyu' && h.downUntil <= sim.state.time && dist(h, tower) <= 2.5) mul *= 1.15;
  }
  return mul;
}

function fireTower(sim: Sim, tower: TowerState): boolean {
  const def = towerById(tower.defId);
  if (def.damageType === 'none') return false;
  const stat = towerStat(tower.defId, tower.level, tower.branch);
  const n = tower.branch === 'liannu' ? 3 : 1;
  const targets = pickTargets(sim, tower, n);
  if (!targets.length) return false;
  const extra = tower.nextMul;
  tower.nextMul = 1;
  if (def.id === 'chuangnu') {
    pierceShot(sim, tower, targets[0]!, stat.damage * extra, tower.branch === 'sangong' ? 6 : 3);
    return true;
  }
  for (const target of targets) {
    let mul = extra;
    let splash = def.splash;
    if (tower.branch === 'pili') splash = 1.56;
    if (def.id === 'toushi' && hasDecree(sim.state, 'jushi')) splash *= 1.2;
    if (tower.pili) splash *= 1.5;
    if (tower.pili && (target.boss || target.species === 'siege')) mul *= 3;
    const amount = stat.damage * mul * (def.id === 'huoyou' && sim.bond.huoyouDmg ? (1) : 1);
    deal(sim, target, {
      amount,
      type: def.damageType as DamageType,
      ignoreArmor: tower.branch === 'pojia',
      shieldMul: tower.branch === 'pojia' ? 2 : 1,
      source: def.name,
      bonus: towerBonus(sim, tower) + (def.id === 'huoyou' ? sim.bond.huoyouDmg : 0),
      vuln: vulnOf(sim, target),
    });
    if (def.id === 'huoyou') addBurn(sim, target, 1);
    if (def.id === 'juma') slowFromJuma(sim, tower, target);
    if (splash > 0) fireSplash(sim, tower, target.x, target.y, mul, splash, def.name, target.id);
    if (tower.branch === 'suishi') {
      sim.state.zones.push(makeZone(sim.state, {
        kind: 'slow', x: target.x, y: target.y, radius: 0.8, until: sim.state.time + 3, slow: 0.3, flying: false,
      }));
    }
    if (tower.branch === 'huochuan') {
      sim.state.zones.push(makeZone(sim.state, {
        kind: 'fireline', x: target.x, y: target.y, radius: 0.8, until: sim.state.time + 3, dps: 12,
        damageType: 'fire', flying: false,
      }));
    }
  }
  if (tower.pili) tower.pili = false;
  const aim = targets[0];
  sim.events.push({
    type: 'shot', id: tower.id, x: tower.x, y: tower.y, defId: def.id,
    tx: aim?.x, ty: aim?.y,
  });
  return true;
}

function pierceShot(sim: Sim, tower: TowerState, primary: EnemyState, amount: number, max: number) {
  const dx = primary.x - tower.x;
  const dy = primary.y - tower.y;
  const l = Math.hypot(dx, dy) || 1;
  const dir = { x: dx / l, y: dy / l };
  const stat = towerStat(tower.defId, tower.level, tower.branch);
  const list = sim.state.enemies.filter((e) => {
    if (!e.alive || !canHit(tower, e)) return false;
    if (dist(tower, e) > stat.range) return false;
    const vx = e.x - tower.x;
    const vy = e.y - tower.y;
    const along = vx * dir.x + vy * dir.y;
    const cross = Math.abs(vx * dir.y - vy * dir.x);
    return along >= -0.2 && cross <= 0.45;
  }).sort((a, b) => dist(tower, a) - dist(tower, b)).slice(0, max);
  for (const e of list) {
    deal(sim, e, {
      amount, type: 'pierce', source: '床弩',
      ignoreArmor: tower.branch === 'pojia',
      shieldMul: tower.branch === 'pojia' ? 2 : 1,
      bonus: towerBonus(sim, tower),
      vuln: vulnOf(sim, e),
    });
  }
}

function fireSplash(sim: Sim, tower: TowerState, x: number, y: number, mul: number, radius: number, source: string, skip = 0) {
  if (radius <= 0) return;
  const def = towerById(tower.defId);
  const stat = towerStat(tower.defId, tower.level, tower.branch);
  for (const e of sim.state.enemies) {
    if (!e.alive || e.id === skip || dist(e, { x, y }) > radius) continue;
    if (!canHit(tower, e)) continue;
    let m = mul;
    if (tower.pili && (e.boss || e.species === 'siege')) m *= 3;
    deal(sim, e, {
      amount: stat.damage * m,
      type: (def.damageType === 'none' ? 'blunt' : def.damageType) as DamageType,
      source, bonus: towerBonus(sim, tower), vuln: vulnOf(sim, e),
    });
  }
}

function slowFromJuma(sim: Sim, tower: TowerState, e: EnemyState) {
  let amt = 0.5;
  if (tower.branch === 'lujiao' && e.species === 'cavalry') amt = 0.8;
  let dur = 1.5;
  if (hasDecree(sim.state, 'jiagu')) dur *= 1.3;
  applySlow(sim, e, amt, dur);
  if (tower.branch === 'jili') e.jiliUntil = sim.state.time + dur;
}

function triggerSkill(sim: Sim, tower: TowerState) {
  const s = sim.state;
  if (tower.level < 4 || tower.skillCd > 0) {
    if (tower.skillCd > 0) tower.skillCd -= DT;
    if (tower.level < 4) return;
  }
  const def = towerById(tower.defId);
  const branch = def.branches.find((b) => b.id === tower.branch);
  if (!branch || def.v01Hidden) return;
  const stat = towerStat(tower.defId, tower.level, tower.branch);
  const inRange = () => pickTargets(sim, tower, 99);
  const ready = tower.skillCd <= 0;
  if (!ready) return;
  const scale = skillScale(tower.level);
  if (tower.branch === 'shenshe') {
    const list = inRange();
    if (!list.length) return;
    const target = list.slice().sort((a, b) => b.hp - a.hp)[0]!;
    deal(sim, target, {
      amount: stat.damage * 3 * scale, type: 'pierce', ignoreDodge: true, source: '穿杨箭',
      bonus: towerBonus(sim, tower), vuln: vulnOf(sim, target),
    });
    tower.skillCd = branch.skillCd;
    sim.events.push({ type: 'skill', text: '穿杨箭', x: target.x, y: target.y });
    return;
  }
  if (tower.branch === 'liannu') {
    if (!inRange().length) return;
    tower.aspdUntil = s.time + 4;
    tower.skillCd = branch.skillCd;
    return;
  }
  if (tower.branch === 'pili') {
    if (!inRange().some((e) => e.boss || e.species === 'siege')) return;
    tower.pili = true;
    tower.skillCd = branch.skillCd;
    return;
  }
  if (tower.branch === 'suishi') {
    const list = inRange();
    if (list.length < 3) return;
    let best = list[0]!;
    let bestN = -1;
    for (const e of list) {
      const n = list.filter((o) => dist(o, e) <= 1).length;
      if (n > bestN) { bestN = n; best = e; }
    }
    for (let i = 0; i < 5; i++) tower.shots.push({ t: 0.3 * i, x: best.x, y: best.y, mul: 0.6 * scale, splash: 1.04 });
    tower.skillCd = branch.skillCd;
    return;
  }
  if (tower.branch === 'jili') {
    const ground = inRange().filter((e) => !e.flying);
    if (!ground.length) return;
    const cells = pathCellsInRange(sim, tower.x, tower.y, stat.range).sort((a, b) => a.i - b.i);
    const spot = cells[0];
    const next = cells[1] ?? spot;
    if (!spot) return;
    for (const p of [spot, next]) {
      if (!p) continue;
      s.zones.push(makeZone(s, {
        kind: 'slow', x: p.x, y: p.y, radius: 0.55, until: s.time + 5, slow: 0.4, dps: 10 * scale,
        damageType: 'blunt', flying: false,
      }));
    }
    tower.skillCd = branch.skillCd;
    return;
  }
  if (tower.branch === 'lujiao') {
    const cav = inRange().filter((e) => e.species === 'cavalry' || (e.boss && e.species === 'boss'));
    const target = cav.sort((a, b) => b.progress - a.progress)[0];
    if (!target) return;
    if (target.boss) applySlow(sim, target, 0.7, 1.5);
    else target.haltUntil = Math.max(target.haltUntil, s.time + 1.5);
    tower.skillCd = branch.skillCd;
    return;
  }
  if (tower.branch === 'shuaiqi') {
    const friends = s.towers.filter((t) => t.id !== tower.id && dist(t, tower) <= stat.range && t.damagedUntil <= s.time);
    if (!friends.some((t) => pickTargets(sim, t, 1).length)) return;
    for (const t of friends) t.nextMul = Math.max(t.nextMul, 2);
    tower.skillCd = branch.skillCd;
    return;
  }
  if (tower.branch === 'changqiang') {
    const mine = s.soldiers.filter((sol) => sol.towerId === tower.id && sol.downUntil <= s.time);
    if (!mine.some((sol) => s.enemies.some((e) => e.alive && e.blockedBy === sol.id))) return;
    for (const sol of mine) {
      const spot = pointOnPath(sim.map, Math.max(0, sol.progress - 1));
      for (const e of s.enemies) {
        if (!e.alive || e.flying || dist(e, spot) > 0.6) continue;
        const bonus = (e.species === 'cavalry' ? 1 : 0);
        deal(sim, e, {
          amount: stat.damage * 4 * scale * (1 + bonus), type: 'pierce', source: '枪林',
          bonus: towerBonus(sim, tower), vuln: vulnOf(sim, e),
        });
      }
    }
    tower.skillCd = branch.skillCd;
    return;
  }
  if (tower.branch === 'tengjia') {
    const mine = s.soldiers.filter((sol) => sol.towerId === tower.id && sol.downUntil <= s.time);
    if (!mine.some((sol) => sol.maxHp > 0 && sol.hp / sol.maxHp < 0.3)) return;
    for (const sol of mine) {
      sol.hp = sol.maxHp;
      sol.invulnUntil = s.time + 3;
    }
    tower.skillCd = branch.skillCd;
  }
}

function pickTargets(sim: Sim, tower: TowerState, n: number): EnemyState[] {
  const stat = towerStat(tower.defId, tower.level, tower.branch);
  const minR = tower.branch === 'pili' ? 1.46 : 0;
  const list = sim.state.enemies.filter((e) => e.alive && canHit(tower, e) && dist(tower, e) <= stat.range + 1e-6 && dist(tower, e) >= minR);
  const score = (e: EnemyState) => {
    if (tower.priority === 'near') return -dist(tower, e);
    if (tower.priority === 'strong') return e.hp;
    if (tower.priority === 'boss') return (e.boss ? 1e6 : 0) + e.progress;
    return e.progress;
  };
  return list.sort((a, b) => score(b) - score(a)).slice(0, n);
}

function canHit(tower: TowerState, e: EnemyState): boolean {
  const def = towerById(tower.defId);
  if (e.flying && !def.canHitFlying) return false;
  if (def.damageType === 'blunt' && e.flying) return false;
  return true;
}

function towerBonus(sim: Sim, tower: TowerState): number {
  let add = 0;
  for (const flag of sim.state.towers) {
    if (flag.defId !== 'junqi' || flag.damagedUntil > sim.state.time) continue;
    const st = towerStat(flag.defId, flag.level, flag.branch);
    if (dist(flag, tower) <= st.range + 1e-6) add += flagAura(flag.level, flag.branch);
  }
  return add;
}

function vulnOf(sim: Sim, e: EnemyState): number {
  let v = 0;
  for (const tower of sim.state.towers) {
    if (tower.defId !== 'fenghuo' || tower.damagedUntil > sim.state.time) continue;
    const st = towerStat(tower.defId, tower.level, tower.branch);
    if (dist(tower, e) <= st.range) v += tower.branch === 'langyan' ? 0.25 : 0.15;
  }
  return v;
}

interface HitOpt {
  amount: number;
  type: DamageType;
  source: string;
  ignoreArmor?: boolean;
  ignoreShield?: boolean;
  ignoreDodge?: boolean;
  shieldMul?: number;
  bonus?: number;
  vuln?: number;
  heroId?: string;
  extra?: number;
}

function deal(sim: Sim, e: EnemyState, hit: HitOpt): number {
  if (!e.alive) return 0;
  const counter = COUNTER[hit.type][e.species] ?? 1;
  if (counter <= 0) return 0;
  if (!hit.ignoreDodge && e.dodgeFirst > 0 && !e.dodgeUsed) {
    e.dodgeUsed = true;
    if (sim.rng.next() < e.dodgeFirst) {
      sim.events.push({ type: 'dodge', id: e.id, x: e.x, y: e.y });
      sim.state.lastFormula = `${e.name} 闪避了第一次伤害`;
      return 0;
    }
  }
  const bonus = hit.bonus ?? 0;
  const vuln = hit.vuln ?? 0;
  const fire = hit.type === 'fire' ? fireBonus(sim) : 0;
  let armorMul = 1;
  if (!hit.ignoreArmor && hit.type !== 'fire') armorMul = 1 - Math.min(0.6, e.armor);
  const extra = hit.extra ?? 1;
  const raw = hit.amount * counter * (1 + bonus + fire) * (1 + vuln) * armorMul * extra;
  sim.state.lastFormula = `${hit.source} ${typeName(hit.type)} ${trim(hit.amount)} × 克制${counter.toFixed(2)} × 增伤${(1 + bonus + fire).toFixed(2)} × 易伤${(1 + vuln).toFixed(2)} × 护甲${armorMul.toFixed(2)} = ${trim(raw)}`;
  applyHp(sim, e, raw, Boolean(hit.ignoreShield), hit.source, hit.shieldMul ?? 1, hit.heroId);
  return raw;
}

function applyHp(sim: Sim, e: EnemyState, amount: number, ignoreShield: boolean, source: string, shieldMul = 1, heroId?: string) {
  if (!e.alive || amount <= 0) return;
  if (!ignoreShield && e.dodgeFirst > 0 && !e.dodgeUsed && source === '燃烧') {
    e.dodgeUsed = true;
    if (sim.rng.next() < e.dodgeFirst) return;
  }
  let rest = amount;
  if (!ignoreShield && e.shield > 0) {
    const shieldHit = rest * shieldMul;
    if (shieldHit <= e.shield) { e.shield -= shieldHit; rest = 0; }
    else {
      rest -= e.shield / shieldMul;
      e.shield = 0;
    }
  }
  e.hp -= rest;
  if (e.hp <= 0) kill(sim, e, heroId);
}

function kill(sim: Sim, e: EnemyState, heroId?: string) {
  if (!e.alive) return;
  e.alive = false;
  e.hp = 0;
  const s = sim.state;
  let gold = e.bounty;
  if (hasDecree(s, 'shanggong')) gold += 1;
  s.munition += gold;
  s.stats.kills += 1;
  if (heroId === 'lvbu') {
    const hero = s.heroes.find((h) => h.defId === 'lvbu');
    if (hero) {
      hero.lvbUntil = hero.lvbUntil.filter((t) => t > s.time);
      if (hero.lvbUntil.length >= 5) hero.lvbUntil.shift();
      hero.lvbUntil.push(s.time + 5);
    }
  }
  sim.events.push({ type: 'rout', id: e.id, x: e.x, y: e.y, defId: e.defId, text: e.name, amount: e.bounty });
}

function tickSoldiers(sim: Sim) {
  const s = sim.state;
  for (const sol of s.soldiers) {
    const tower = s.towers.find((t) => t.id === sol.towerId);
    if (!tower) continue;
    if (sol.downUntil > s.time) {
      if (s.time >= sol.downUntil) {
        sol.downUntil = 0;
        sol.hp = sol.maxHp;
        placeSoldier(sim, tower, sol);
      }
      continue;
    }
    const stat = towerStat(tower.defId, tower.level, tower.branch);
    const target = s.enemies.find((e) => e.alive && e.blockedBy === sol.id)
      ?? s.enemies.find((e) => e.alive && !e.flying && dist(e, sol) <= 0.55);
    if (target && tower.damagedUntil <= s.time) {
      sol.cd -= DT;
      if (sol.cd <= 0) {
        const cav = tower.branch === 'changqiang' && target.species === 'cavalry' ? 2 : 1;
        deal(sim, target, {
          amount: stat.damage * cav * tower.nextMul, type: 'pierce', source: '枪兵',
          bonus: towerBonus(sim, tower), vuln: vulnOf(sim, target),
        });
        if (tower.nextMul !== 1) tower.nextMul = 1;
        sol.cd = 1 / (stat.aps || 1);
      }
      if (target.blockedBy === sol.id && target.alive) {
        hurtSoldier(sim, sol, tower, target.contactDps * DT);
      }
    }
  }
}

function hurtSoldier(sim: Sim, sol: SoldierState, tower: TowerState, amount: number) {
  if (sol.invulnUntil > sim.state.time) return;
  let dmg = amount;
  if (tower.branch === 'tengjia') dmg *= 0.8;
  sol.hp -= dmg;
  if (sol.hp <= 0) {
    sol.hp = 0;
    const respawn = hasDecree(sim.state, 'qiangzhen') ? 7 : 10;
    sol.downUntil = sim.state.time + respawn;
    for (const e of sim.state.enemies) if (e.blockedBy === sol.id) e.blockedBy = 0;
  }
}

function syncSoldiers(sim: Sim, tower: TowerState) {
  const want = tower.branch === 'changqiang' ? 3 : 2;
  const mine = sim.state.soldiers.filter((sol) => sol.towerId === tower.id);
  while (mine.length < want) {
    const sol: SoldierState = {
      id: nid(sim.state), towerId: tower.id, x: tower.x, y: tower.y, px: tower.x, py: tower.y,
      hp: 1, maxHp: 1, cd: 0, downUntil: 0, invulnUntil: 0, progress: 0,
    };
    sim.state.soldiers.push(sol);
    mine.push(sol);
  }
  const hp = soldierMax(sim, tower);
  mine.forEach((sol, i) => {
    sol.maxHp = hp;
    if (sol.hp > hp) sol.hp = hp;
    if (sol.hp <= 0 && sol.downUntil <= 0) sol.hp = hp;
    if (sol.downUntil <= sim.state.time) sol.hp = Math.max(sol.hp, hp);
    placeSoldier(sim, tower, sol, i, mine.length);
  });
}

function soldierMax(sim: Sim, tower: TowerState): number {
  let hp = 80;
  if (tower.branch === 'tengjia') hp *= 2.5;
  if (hasDecree(sim.state, 'qiangzhen')) hp *= 1.3;
  return hp;
}

function placeSoldier(sim: Sim, tower: TowerState, sol: SoldierState, index?: number, total?: number) {
  const spots = rally(sim, tower, total ?? sim.state.soldiers.filter((s) => s.towerId === tower.id).length);
  const i = index ?? sim.state.soldiers.filter((s) => s.towerId === tower.id).indexOf(sol);
  const spot = spots[Math.max(0, i)] ?? spots[0];
  if (!spot) return;
  sol.progress = spot.progress;
  sol.x = spot.x;
  sol.y = spot.y;
  sol.px = spot.x;
  sol.py = spot.y;
}

function rally(sim: Sim, tower: TowerState, count: number): { x: number; y: number; progress: number }[] {
  const stat = towerStat(tower.defId, tower.level, tower.branch);
  let best = 0;
  let bestD = 1e9;
  const step = 0.25;
  for (let p = 0; p <= sim.map.length; p += step) {
    const pos = pointOnPath(sim.map, p);
    const d = Math.hypot(pos.x - tower.x, pos.y - tower.y);
    if (d <= stat.range && p > best) { best = p; bestD = d; }
  }
  if (bestD > stat.range + 1) best = progressNear(sim.map, tower.x, tower.y);
  const spots = [];
  for (let i = 0; i < count; i++) {
    const progress = Math.max(0, best - i * 0.8);
    const pos = pointOnPath(sim.map, progress);
    spots.push({ ...pos, progress });
  }
  return spots;
}

function tickHeroes(sim: Sim) {
  const s = sim.state;
  for (const hero of s.heroes) {
    if (hero.downUntil > 0 && s.time >= hero.downUntil) {
      hero.hp = hero.maxHp;
      hero.downUntil = 0;
    }
    if (hero.hp <= 0 && hero.downUntil <= s.time) {
      hero.downUntil = s.time + 20;
      hero.hp = 0;
      hero.move = [];
      hero.special = null;
      const spot = hero.id % 2 ? { x: 3.5, y: 15.5 } : { x: 5.5, y: 15.5 };
      hero.x = spot.x; hero.y = spot.y;
      sim.events.push({ type: 'down', id: hero.id, defId: hero.defId });
    }
    if (hero.downUntil > s.time) continue;
    tickSpecial(sim, hero);
    if (hero.special?.kind === 'zhaoyun' || hero.special?.kind === 'machao') continue;
    if (hero.move.length) {
      const goal = hero.move[0]!;
      const dx = goal.x - hero.x;
      const dy = goal.y - hero.y;
      const len = Math.hypot(dx, dy);
      const spd = hero.defId === 'machao' ? 4 : 2;
      if (len <= spd * DT) { hero.x = goal.x; hero.y = goal.y; hero.move.shift(); }
      else { hero.x += (dx / len) * spd * DT; hero.y += (dy / len) * spd * DT; }
      hero.still = 0;
    } else hero.still += DT;
    heroBasic(sim, hero);
    if (hero.defId === 'dianwei' && hero.guardUntil > s.time) {
      for (const e of s.enemies) {
        if (!e.alive || e.flying || e.boss || dist(e, hero) > 1.67) continue;
        e.haltUntil = hero.guardUntil;
        e.tauntId = hero.id;
        damageHero(sim, hero, e.contactDps * DT);
      }
    }
  }
}

function tickSpecial(sim: Sim, hero: HeroState) {
  const sp = hero.special;
  if (!sp) return;
  const s = sim.state;
  const def = heroById(hero.defId);
  if (sp.kind === 'zhaoyun') {
    const elapsed = s.time - sp.start;
    const leg = Math.min(6.999, elapsed / 0.5);
    const i = Math.floor(leg);
    const frac = leg - i;
    const offset = (i % 2 === 0 ? frac : 1 - frac) * 3;
    const progress = Math.max(0, Math.min(sim.map.length, sp.origin - offset));
    const pos = pointOnPath(sim.map, progress);
    hero.x = pos.x; hero.y = pos.y; hero.still = 0;
    if (s.time >= sp.nextHit && sp.hits > 0) {
      for (const e of s.enemies) {
        if (e.alive && dist(e, hero) <= 0.8) {
          deal(sim, e, { amount: def.atk, type: def.damageType, source: def.name, heroId: def.id, bonus: heroBonus(sim, hero, e), vuln: vulnOf(sim, e) });
        }
      }
      sp.hits -= 1;
      sp.nextHit += 0.5;
    }
    if (elapsed >= 3.5) hero.special = null;
  } else if (sp.kind === 'lvbu') {
    if (s.time >= sp.next && sp.left > 0) {
      for (const e of s.enemies) {
        if (e.alive && dist(e, hero) <= 2) {
          deal(sim, e, { amount: def.atk * 1.5, type: def.damageType, source: def.name, heroId: def.id, bonus: heroBonus(sim, hero, e), vuln: vulnOf(sim, e) });
        }
      }
      sp.left -= 1;
      sp.next += 0.5;
    }
    if (sp.left <= 0) hero.special = null;
  } else if (sp.kind === 'machao') {
    const t = Math.min(1, 1 - (sp.until - s.time) / 0.35);
    const x = sp.sx + (sp.ex - sp.sx) * t;
    const y = sp.sy + (sp.ey - sp.sy) * t;
    hero.x = x; hero.y = y; hero.still = 0;
    for (const e of s.enemies) {
      if (!e.alive || sp.hit.includes(e.id)) continue;
      if (distPointSeg(e.x, e.y, sp.sx, sp.sy, x, y) <= 0.5) {
        sp.hit.push(e.id);
        deal(sim, e, { amount: def.atk * 1.5, type: def.damageType, source: def.name, heroId: def.id, bonus: heroBonus(sim, hero, e), vuln: vulnOf(sim, e) });
        knock(sim, e, 1);
      }
    }
    if (s.time >= sp.until) hero.special = null;
  } else if (sp.kind === 'ssx' && s.time >= sp.until) hero.special = null;
}

function distPointSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax, aby = by - ay;
  const len2 = abx * abx + aby * aby || 1;
  let t = ((px - ax) * abx + (py - ay) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

function heroBasic(sim: Sim, hero: HeroState) {
  const def = heroById(hero.defId);
  const list = sim.state.enemies.filter((e) => e.alive && dist(e, hero) <= def.range + 1e-6 && !(def.damageType === 'blunt' && e.flying));
  if (!list.length) return;
  const target = list.sort((a, b) => b.progress - a.progress)[0]!;
  hero.cd -= DT;
  if (hero.cd > 0) return;
  hero.attacks += 1;
  const double = def.id === 'dianwei' && hero.attacks % 3 === 0;
  const aspd = def.aps * heroAspd(sim, hero);
  hero.cd = 1 / aspd;
  const amount = def.atk * (double ? 2 : 1);
  const victims = attackShape(def, hero, target, sim.state.enemies);
  for (const e of victims) {
    deal(sim, e, {
      amount, type: def.damageType, source: def.name, heroId: def.id,
      bonus: heroBonus(sim, hero, e), vuln: vulnOf(sim, e),
    });
  }
  if (def.id === 'diaochan') {
    sim.state.gate.hp = Math.min(sim.state.gate.maxHp, sim.state.gate.hp + 2);
  }
}

function heroAspd(sim: Sim, hero: HeroState): number {
  let mul = 1;
  if (hero.aspdUntil > sim.state.time) mul *= hero.aspdMul;
  const stacks = hero.lvbUntil.filter((t) => t > sim.state.time).length;
  mul *= 1 + 0.1 * stacks;
  mul *= 1 + (sim.bond.aspd[hero.defId] ?? 0);
  return mul;
}

function heroBonus(sim: Sim, hero: HeroState, e: EnemyState): number {
  let add = sim.bond.atk;
  if (hasDecree(sim.state, 'jiangling')) add += 0.12;
  if (hero.defId === 'guanyu' && e.boss) add += 0.25;
  if (hero.defId === 'huangzhong' && hero.still >= 5) add += 0.2;
  if (hero.defId === 'sunshangxiang' && e.flying) add += 0.5;
  if (hero.defId === 'ganning' && e.species === 'siege') add += 0.3;
  return add;
}

function attackShape(def: ReturnType<typeof heroById>, hero: HeroState, primary: EnemyState, enemies: EnemyState[]): EnemyState[] {
  if (def.attack === 'splash') {
    return enemies.filter((e) => e.alive && dist(e, primary) <= def.attackN && !(def.damageType === 'blunt' && e.flying));
  }
  if (def.attack === 'pierce') {
    const dx = primary.x - hero.x;
    const dy = primary.y - hero.y;
    const l = Math.hypot(dx, dy) || 1;
    const dir = { x: dx / l, y: dy / l };
    return enemies.filter((e) => {
      if (!e.alive || dist(e, hero) > def.range + 0.2) return false;
      const vx = e.x - hero.x;
      const vy = e.y - hero.y;
      const along = vx * dir.x + vy * dir.y;
      const cross = Math.abs(vx * dir.y - vy * dir.x);
      return along >= -0.1 && cross <= 0.35;
    }).sort((a, b) => dist(hero, a) - dist(hero, b)).slice(0, def.attackN);
  }
  return [primary];
}

function damageHero(sim: Sim, hero: HeroState, amount: number) {
  if (hero.downUntil > sim.state.time) return;
  if (hero.invulnUntil > sim.state.time) return;
  if (hero.special?.kind === 'zhaoyun') return;
  if (hero.defId === 'zhaoyun' && hero.maxHp > 0 && hero.hp / hero.maxHp < 0.3 && sim.rng.next() < 0.5) return;
  let dmg = amount;
  if (hero.defId === 'zhangfei' && hero.hp / hero.maxHp > 0.5) dmg *= 0.85;
  if (hero.guardUntil > sim.state.time) dmg *= 0.4;
  hero.hp -= dmg;
}

function tickGate(sim: Sim) {
  const g = sim.state.gate;
  if (g.level < 2) return;
  g.cd -= DT;
  if (g.cd > 0) return;
  const list = sim.state.enemies.filter((e) => e.alive && dist(e, sim.map.gate) <= 2.71);
  if (!list.length) { g.cd = 0; return; }
  const target = list.sort((a, b) => b.progress - a.progress)[0]!;
  deal(sim, target, { amount: 25, type: 'pierce', source: '城楼弓手', vuln: vulnOf(sim, target) });
  g.cd = 1.2;
}

function tickZones(sim: Sim) {
  const s = sim.state;
  for (const z of s.zones) {
    if (z.kind === 'pulse') {
      z.acc -= DT;
      while (z.pulsesLeft > 0 && z.acc <= 0) {
        for (const e of s.enemies) {
          if (!e.alive || dist(e, z) > z.radius) continue;
          if (!z.flying && e.flying) continue;
          deal(sim, e, { amount: z.amount, type: z.damageType === 'none' ? 'pierce' : z.damageType, source: '万箭齐发', vuln: vulnOf(sim, e) });
        }
        z.pulsesLeft -= 1;
        z.acc += z.interval;
      }
    } else {
      for (const e of s.enemies) {
        if (!e.alive || dist(e, z) > z.radius) continue;
        if (e.flying && !z.flying) continue;
        if (z.slow > 0) applySlow(sim, e, z.slow, 0.2);
        if (z.dps > 0 && z.damageType !== 'none') {
          deal(sim, e, { amount: z.dps * DT, type: z.damageType, source: z.kind === 'fireline' ? '火墙' : '蒺藜', vuln: vulnOf(sim, e) });
        }
      }
    }
  }
  s.zones = s.zones.filter((z) => z.until > s.time && (z.kind !== 'pulse' || z.pulsesLeft > 0 || z.acc > 0));
}

function applySlow(sim: Sim, e: EnemyState, amt: number, dur: number) {
  if (e.phase === 3 && e.slowImmuneUntil > sim.state.time) return;
  amt = Math.min(0.8, amt);
  if (e.slowUntil < sim.state.time || amt >= e.slowAmt) {
    e.slowAmt = amt;
    e.slowUntil = sim.state.time + dur;
  }
}

function resolveDead(sim: Sim) {
  sim.state.enemies = sim.state.enemies.filter((e) => e.alive);
}

function maybeClear(sim: Sim) {
  const s = sim.state;
  if (s.phase !== 'combat') return;
  if (s.spawnIndex < s.spawns.length) return;
  if (s.enemies.some((e) => e.alive)) return;
  const waveNo = s.waveIndex + 1;
  const gold = waveClearGold(waveNo);
  s.munition += gold;
  if (hasDecree(s, 'xiucheng')) s.gate.hp = Math.min(s.gate.maxHp, s.gate.hp + 5);
  for (const tower of s.towers) {
    if (tower.defId !== 'junqi' || tower.branch !== 'liangcang') continue;
    s.munition += liangcangGold(tower.level);
    tower.wavesSeen += 1;
    if (tower.wavesSeen % 3 === 0) s.munition += 60;
  }
  if (s.pact) {
    const pact = PACTS.find((p) => p.id === s.pact);
    if (pact && s.gate.hp > 0) s.munition += pact.gold;
  }
  s.stats.wavesCleared += 1;
  pushLog(s, `第 ${waveNo} 波守住 +${gold}`);
  s.waveIndex += 1;
  if (s.waveIndex >= sim.level.waves.length) {
    s.phase = 'victory';
    sim.events.push({ type: 'victory' });
    return;
  }
  if (waveNo === 3 || waveNo === 6 || waveNo === 9) {
    offerDecrees(sim);
    return;
  }
  enterPrep(sim);
}

function offerDecrees(sim: Sim) {
  const s = sim.state;
  const pool = DECREES.map((d) => d.id).filter((id) => !s.decrees.includes(id));
  const offer: string[] = [];
  const bag = pool.slice();
  while (offer.length < 3 && bag.length) {
    const i = sim.rng.int(bag.length);
    offer.push(bag.splice(i, 1)[0]!);
  }
  s.decreeOffer = offer;
  s.phase = 'decree';
  sim.events.push({ type: 'decree', text: offer.join(',') });
}

function typeName(t: DamageType): string {
  return t === 'pierce' ? '穿刺' : t === 'blunt' ? '钝击' : '火攻';
}
function trim(n: number): string { return (Math.round(n * 10) / 10).toFixed(1); }

export function previewWave(sim: Sim): { id: string; name: string; count: number; boss: boolean }[] {
  const wave = sim.level.waves[sim.state.waveIndex];
  if (!wave || sim.state.phase === 'victory' || sim.state.phase === 'defeat') return [];
  const rows = Object.entries(wave.enemies).map(([id, count]) => ({
    id, name: ENEMIES.find((e) => e.id === id)?.name ?? id, count, boss: false,
  }));
  if (sim.state.pendingPact === 'zengyuan' && rows[0]) {
    rows[0] = { ...rows[0], count: rows[0].count + ((wave.wave >= 7) ? 3 : 2) };
  }
  if (wave.boss) {
    const boss = BOSSES.find((b) => b.id === wave.boss![0]);
    rows.push({ id: wave.boss[0], name: boss?.name ?? '头目', count: 1, boss: true });
  }
  return rows;
}

/** Readout for the debug panel. */
export function towerReadout(tower: TowerState): { damage: number; aps: number; range: number; skill: string } {
  const stat = towerStat(tower.defId, tower.level, tower.branch);
  const def = towerById(tower.defId);
  const skill = def.branches.find((b) => b.id === tower.branch)?.skill ?? '—';
  return { damage: stat.damage, aps: stat.aps, range: stat.range, skill };
}

export { ENEMIES };
