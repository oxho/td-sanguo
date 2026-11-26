export type DamageType = 'pierce' | 'blunt' | 'fire';
export type Species = 'infantry' | 'cavalry' | 'archer' | 'siege' | 'flying' | 'boss';
export type Phase = 'prep' | 'combat' | 'decree' | 'victory' | 'defeat';
export type Priority = 'front' | 'strong' | 'boss' | 'near';

export interface GateState {
  level: number;
  hp: number;
  maxHp: number;
  cd: number;
}

export interface TowerState {
  id: number;
  defId: string;
  padId: string;
  x: number;
  y: number;
  level: number;
  branch: string;
  cd: number;
  skillCd: number;
  priority: Priority;
  invested: number;
  spent: number;
  nextMul: number;
  pili: boolean;
  aspdUntil: number;
  wavesSeen: number;
  damagedUntil: number;
  shots: { t: number; x: number; y: number; mul: number; splash: number }[];
  rooted: boolean;
}

export interface SoldierState {
  id: number;
  towerId: number;
  x: number;
  y: number;
  px: number;
  py: number;
  hp: number;
  maxHp: number;
  cd: number;
  downUntil: number;
  invulnUntil: number;
  progress: number;
}

export interface EnemyState {
  id: number;
  defId: string;
  name: string;
  species: Species;
  flying: boolean;
  boss: boolean;
  bossId: string;
  /** Preview bosses stay in phase 1. */
  allowPhases: boolean;
  phase: 1 | 2 | 3;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  armor: number;
  baseSpeed: number;
  bounty: number;
  leak: number;
  contactDps: number;
  dodgeFirst: number;
  dodgeUsed: boolean;
  sprintEvery: number;
  sprintDur: number;
  sprintMul: number;
  sprintCd: number;
  sprintLeft: number;
  elite: boolean;
  affix: '' | '坚韧' | '迅捷';
  progress: number;
  pathLength: number;
  x: number;
  y: number;
  px: number;
  py: number;
  slowAmt: number;
  slowUntil: number;
  haltUntil: number;
  hasteUntil: number;
  burnStacks: number;
  burnUntil: number;
  blockedBy: number;
  tauntId: number;
  nextDrum: number;
  summonCd: number;
  phase3Used: boolean;
  jiliUntil: number;
  slowImmuneUntil: number;
  alive: boolean;
  wave: number;
}

export interface HeroState {
  id: number;
  defId: string;
  x: number;
  y: number;
  px: number;
  py: number;
  hp: number;
  maxHp: number;
  cd: number;
  skillReadyAt: number;
  downUntil: number;
  move: { x: number; y: number }[];
  still: number;
  attacks: number;
  lvbUntil: number[];
  aspdMul: number;
  aspdUntil: number;
  guardUntil: number;
  invulnUntil: number;
  special: HeroSpecial | null;
  selected: boolean;
}

export type HeroSpecial =
  | { kind: 'zhaoyun'; start: number; origin: number; nextHit: number; hits: number }
  | { kind: 'lvbu'; next: number; left: number }
  | { kind: 'machao'; sx: number; sy: number; ex: number; ey: number; until: number; hit: number[] }
  | { kind: 'ssx'; until: number };

export interface CardState {
  id: string;
  cdUntil: number;
  channelUntil: number;
  hit: boolean;
}

export interface ZoneState {
  id: number;
  kind: 'burnground' | 'slow' | 'pulse' | 'fireline';
  x: number;
  y: number;
  radius: number;
  until: number;
  dps: number;
  slow: number;
  damageType: DamageType | 'none';
  flying: boolean;
  acc: number;
  interval: number;
  pulsesLeft: number;
  amount: number;
  sourceHero: string;
}

export interface RunStats {
  leaks: number;
  leakDamage: number;
  builds: number;
  kills: number;
  cardCasts: number;
  wavesCleared: number;
}

export interface RunState {
  version: 1;
  levelId: string;
  seed: number;
  time: number;
  tick: number;
  phase: Phase;
  paused: boolean;
  munition: number;
  gate: GateState;
  towers: TowerState[];
  soldiers: SoldierState[];
  enemies: EnemyState[];
  heroes: HeroState[];
  cards: CardState[];
  zones: ZoneState[];
  decrees: string[];
  decreeOffer: string[] | null;
  pendingPact: string | null;
  pact: string | null;
  countdown: number;
  countdownHold: boolean;
  waveIndex: number;
  spawns: SpawnSpec[];
  spawnIndex: number;
  spawnCd: number;
  eliteCursor: number;
  firstLeakHalved: boolean;
  fireUntil: number;
  burnCapUntil: number;
  nextId: number;
  stats: RunStats;
  log: string[];
  lastFormula: string;
  banners: { text: string; until: number }[];
  codex: string[];
  heroIds: string[];
  cardIds: string[];
}

export interface SpawnSpec {
  id: string;
  elite: boolean;
  affix: '' | '坚韧' | '迅捷';
  boss: boolean;
  hpMul: number;
}

export interface SimEvent {
  type: string;
  text?: string;
  x?: number;
  y?: number;
  id?: number;
  defId?: string;
  amount?: number;
  [key: string]: unknown;
}

export interface MetaLevel {
  stars: number;
  clears: number;
}

export interface MetaSave {
  version: 1;
  dataHash: string;
  checksum: string;
  talisman: number;
  heroes: string[];
  pity: number;
  firstSingleFree: boolean;
  rng: number;
  levels: Record<string, MetaLevel>;
  tutorial: { skipped: boolean; done11: boolean; tip13: boolean; tip14: boolean; tipHero: boolean };
  codex: string[];
  settings: { muted: boolean };
  dailyChallengeUnlocked: boolean;
  endlessBest: number;
}

export interface RunEnvelope {
  version: 1;
  dataHash: string;
  checksum: string;
  state: RunState;
  prewave: RunState | null;
  rng: number;
}
