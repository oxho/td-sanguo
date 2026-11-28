import type { DamageType, Species } from '../core/types';
import levelsFile from './levels.json';

export type Rarity = 'rare' | 'epic' | 'legendary';
export type Star3 = 'noLeak' | 'noLeakDmg' | 'builds10';

export interface TowerStat {
  level: number;
  branch: string;
  damage: number;
  aps: number;
  range: number;
  upgradeCost: number;
  invested: number;
  sell: number;
}

export interface TowerDef {
  id: string;
  name: string;
  role: string;
  damageType: DamageType | 'none';
  cost: number;
  canHitFlying: boolean;
  /** Hidden and unbuildable in V0.1. Data stays so the framework exists. */
  v01Hidden: boolean;
  unlockLevel: string;
  splash: number;
  minRange: number;
  stats: TowerStat[];
  branches: { id: string; name: string; blurb: string; skill: string; skillCd: number; skillText: string }[];
}

export interface EnemyDef {
  id: string;
  name: string;
  species: Species;
  hp: number;
  shield: number;
  armor: number;
  speed: number;
  bounty: number;
  leak: number;
  flying: boolean;
  dodgeFirst: number;
  sprintEvery: number;
  sprintDur: number;
  sprintMul: number;
  /** 【临时默认，非已定】PRD 未写阻挡接触伤害。用于让枪兵会倒下。 */
  contactDps: number;
  tip: string;
  first: string;
}

export interface BossDef {
  id: string;
  name: string;
  hp: number;
  shield: number;
  armor: number;
  speed: number;
  bounty: number;
  leak: number;
  tip: string;
}

export interface HeroDef {
  id: string;
  name: string;
  rarity: Rarity;
  faction: '蜀' | '吴' | '魏' | '群';
  damageType: DamageType;
  ranged: boolean;
  hp: number;
  atk: number;
  aps: number;
  range: number;
  attack: 'single' | 'pierce' | 'splash';
  attackN: number;
  skill: string;
  skillCd: number;
  skillText: string;
  passive: string;
  passiveText: string;
  color: string;
  portrait?: string;
  full?: string;
}

export interface CardDef {
  id: string;
  name: string;
  unlock: string;
  cd: number;
  first: number;
  radius: number;
  text: string;
  v01: boolean;
}

export interface DecreeDef {
  id: string;
  name: string;
  text: string;
  /** Related tower is not available in V0.1, so the decree does nothing. */
  inert: boolean;
  hint?: string;
}

export interface PactDef {
  id: string;
  name: string;
  text: string;
  gold: number;
}

export interface LevelMeta {
  id: string;
  name: string;
  chapter: number;
  map: 'M1' | 'M1b';
  kind: '普通' | '精英' | 'Boss';
  munition: number;
  star3: Star3;
  star3Text: string;
  blurb: string;
  /** Playable in this build. */
  playable: boolean;
}

const row = (
  level: number,
  branch: string,
  damage: number,
  aps: number,
  range: number,
  upgradeCost: number,
  invested: number,
  sell: number,
): TowerStat => ({ level, branch, damage, aps, range, upgradeCost, invested, sell });

export const TOWERS: TowerDef[] = [
  {
    id: 'jianlou', name: '箭楼', role: '便宜单体', damageType: 'pierce', cost: 50,
    canHitFlying: true, v01Hidden: false, unlockLevel: '1-1', splash: 0, minRange: 0,
    branches: [
      { id: 'shenshe', name: '神射楼', blurb: '伤害×4 · 攻速×0.3 · 射程+0.83 · 默认 Boss 优先', skill: '穿杨箭', skillCd: 10, skillText: '对射程内生命最高的敌人造成 3 倍伤害，必中' },
      { id: 'liannu', name: '连弩台', blurb: '同时 3 个目标 · 每支伤害×0.8', skill: '连弩齐发', skillCd: 12, skillText: '4 秒内攻速×2' },
    ],
    stats: [
      row(1, '', 10, 2, 2.71, 0, 50, 35),
      row(2, '', 13.5, 2, 2.82, 35, 85, 59),
      row(3, '', 18.2, 2, 2.93, 50, 135, 94),
      row(4, 'shenshe', 98.4, 0.6, 3.88, 75, 210, 147),
      row(4, 'liannu', 19.7, 2, 3.05, 75, 210, 147),
      row(5, 'shenshe', 132.9, 0.6, 4, 100, 310, 217),
      row(5, 'liannu', 26.6, 2, 3.17, 100, 310, 217),
      row(6, 'shenshe', 179.4, 0.6, 4.13, 140, 450, 315),
      row(6, 'liannu', 35.9, 2, 3.3, 140, 450, 315),
    ],
  },
  {
    id: 'toushi', name: '投石车', role: '范围', damageType: 'blunt', cost: 100,
    canHitFlying: false, v01Hidden: false, unlockLevel: '1-1', splash: 1.04, minRange: 0,
    branches: [
      { id: 'pili', name: '霹雳车', blurb: '伤害×2.2 · 溅射 1.56 · 攻速×0.45 · 最短射程 1.46', skill: '霹雳石', skillCd: 14, skillText: '下一发对 Boss 伤害×3，溅射半径×1.5' },
      { id: 'suishi', name: '碎石车', blurb: '命中处碎石地，半径 0.8，减速 30%，持续 3 秒', skill: '乱石阵', skillCd: 16, skillText: '向最密处连抛 5 发，每发伤害×0.6' },
    ],
    stats: [
      row(1, '', 26, 0.75, 2.5, 0, 100, 70),
      row(2, '', 35.1, 0.75, 2.6, 70, 170, 119),
      row(3, '', 47.4, 0.75, 2.7, 100, 270, 189),
      row(4, 'pili', 140.7, 0.34, 3.85, 150, 420, 294),
      row(4, 'suishi', 64, 0.75, 2.81, 150, 420, 294),
      row(5, 'pili', 190, 0.34, 3.96, 200, 620, 434),
      row(5, 'suishi', 86.4, 0.75, 2.92, 200, 620, 434),
      row(6, 'pili', 256.5, 0.34, 4.08, 280, 900, 630),
      row(6, 'suishi', 116.6, 0.75, 3.04, 280, 900, 630),
    ],
  },
  {
    id: 'huoyou', name: '火油台', role: '持续火伤', damageType: 'fire', cost: 90,
    canHitFlying: true, v01Hidden: true, unlockLevel: '1-6', splash: 0, minRange: 0,
    branches: [
      { id: 'huoniu', name: '火牛阵', blurb: '燃烧层数上限 7', skill: '火牛冲阵', skillCd: 15, skillText: 'V0.1 未开放' },
      { id: 'huochuan', name: '赤壁火船', blurb: '地面火', skill: '连环火', skillCd: 18, skillText: 'V0.1 未开放' },
    ],
    stats: [
      row(1, '', 7, 1.15, 2.5, 0, 90, 63),
      row(2, '', 9.5, 1.15, 2.6, 63, 153, 107),
      row(3, '', 12.8, 1.15, 2.7, 90, 243, 170),
      row(4, 'huoniu', 17.2, 1.15, 2.81, 135, 378, 265),
      row(4, 'huochuan', 17.2, 1.15, 2.81, 135, 378, 265),
      row(5, 'huoniu', 23.3, 1.15, 2.92, 180, 558, 391),
      row(5, 'huochuan', 23.3, 1.15, 2.92, 180, 558, 391),
      row(6, 'huoniu', 31.4, 1.15, 3.04, 252, 810, 567),
      row(6, 'huochuan', 31.4, 1.15, 3.04, 252, 810, 567),
    ],
  },
  {
    id: 'juma', name: '拒马阵', role: '减速', damageType: 'blunt', cost: 70,
    canHitFlying: false, v01Hidden: false, unlockLevel: '1-3', splash: 0, minRange: 0,
    branches: [
      { id: 'jili', name: '铁蒺藜', blurb: '被减速的敌人每秒受 8 钝击', skill: '撒蒺藜', skillCd: 16, skillText: '铺 2 格蒺藜，减速 40%，每秒 10 钝击，持续 5 秒' },
      { id: 'lujiao', name: '鹿角', blurb: '对骑兵减速 80%', skill: '拒骑', skillCd: 20, skillText: '射程内骑兵定身 1.5 秒（Boss 改为减速）' },
    ],
    stats: [
      row(1, '', 11, 1.45, 2.6, 0, 70, 49),
      row(2, '', 14.9, 1.45, 2.7, 49, 119, 83),
      row(3, '', 20, 1.45, 2.81, 70, 189, 132),
      row(4, 'jili', 27.1, 1.45, 2.92, 105, 294, 206),
      row(4, 'lujiao', 27.1, 1.45, 2.92, 105, 294, 206),
      row(5, 'jili', 36.5, 1.45, 3.04, 140, 434, 304),
      row(5, 'lujiao', 36.5, 1.45, 3.04, 140, 434, 304),
      row(6, 'jili', 49.3, 1.45, 3.16, 196, 630, 441),
      row(6, 'lujiao', 49.3, 1.45, 3.16, 196, 630, 441),
    ],
  },
  {
    id: 'qiangbing', name: '枪兵营', role: '阻挡', damageType: 'pierce', cost: 90,
    canHitFlying: false, v01Hidden: false, unlockLevel: '1-4', splash: 0, minRange: 0,
    branches: [
      { id: 'changqiang', name: '长枪阵', blurb: '3 名枪兵，对骑兵伤害×2', skill: '枪林', skillCd: 15, skillText: '枪兵向前突刺，伤害×4' },
      { id: 'tengjia', name: '藤甲兵', blurb: '生命×2.5，受伤−20%，每人阻挡 2', skill: '坚守', skillCd: 20, skillText: '生命低于 30% 时全体无敌 3 秒并回满' },
    ],
    stats: [
      row(1, '', 6, 1, 2.08, 0, 90, 63),
      row(2, '', 8.1, 1, 2.16, 63, 153, 107),
      row(3, '', 10.9, 1, 2.25, 90, 243, 170),
      row(4, 'changqiang', 14.8, 1, 2.34, 135, 378, 265),
      row(4, 'tengjia', 14.8, 1, 2.34, 135, 378, 265),
      row(5, 'changqiang', 19.9, 1, 2.43, 180, 558, 391),
      row(5, 'tengjia', 19.9, 1, 2.43, 180, 558, 391),
      row(6, 'changqiang', 26.9, 1, 2.53, 252, 810, 567),
      row(6, 'tengjia', 26.9, 1, 2.53, 252, 810, 567),
    ],
  },
  {
    id: 'fenghuo', name: '烽火台', role: '易伤', damageType: 'none', cost: 105,
    canHitFlying: false, v01Hidden: true, unlockLevel: '2-2', splash: 0, minRange: 0,
    branches: [
      { id: 'langyan', name: '狼烟', blurb: '易伤 +25%', skill: '狼烟示警', skillCd: 25, skillText: 'V0.1 未开放' },
      { id: 'leigu', name: '擂鼓', blurb: '范围内减速 20%', skill: '擂鼓助威', skillCd: 20, skillText: 'V0.1 未开放' },
    ],
    stats: [
      row(1, '', 0, 0, 2.92, 0, 105, 74),
      row(2, '', 0, 0, 3.04, 74, 179, 125),
      row(3, '', 0, 0, 3.16, 105, 284, 199),
      row(4, 'langyan', 0, 0, 3.28, 158, 442, 309),
      row(4, 'leigu', 0, 0, 3.28, 158, 442, 309),
      row(5, 'langyan', 0, 0, 3.42, 210, 652, 456),
      row(5, 'leigu', 0, 0, 3.42, 210, 652, 456),
      row(6, 'langyan', 0, 0, 3.55, 294, 946, 662),
      row(6, 'leigu', 0, 0, 3.55, 294, 946, 662),
    ],
  },
  {
    id: 'junqi', name: '军旗台', role: '增益', damageType: 'none', cost: 110,
    canHitFlying: false, v01Hidden: false, unlockLevel: '1-2', splash: 0, minRange: 0,
    branches: [
      { id: 'shuaiqi', name: '帅旗', blurb: '增伤提到 +35% / +39% / +43%', skill: '帅旗令', skillCd: 30, skillText: '范围内塔的下一次攻击伤害×2' },
      { id: 'liangcang', name: '粮仓', blurb: '增伤保持 +28%，每波结束额外军资', skill: '屯田', skillCd: 0, skillText: '每 3 波结束额外 +60 军资' },
    ],
    stats: [
      row(1, '', 0, 0, 2.92, 0, 110, 77),
      row(2, '', 0, 0, 3.04, 77, 187, 131),
      row(3, '', 0, 0, 3.16, 110, 297, 208),
      row(4, 'shuaiqi', 0, 0, 3.28, 165, 462, 323),
      row(4, 'liangcang', 0, 0, 3.28, 165, 462, 323),
      row(5, 'shuaiqi', 0, 0, 3.42, 220, 682, 477),
      row(5, 'liangcang', 0, 0, 3.42, 220, 682, 477),
      row(6, 'shuaiqi', 0, 0, 3.55, 308, 990, 693),
      row(6, 'liangcang', 0, 0, 3.55, 308, 990, 693),
    ],
  },
  {
    id: 'chuangnu', name: '床弩', role: '穿透', damageType: 'pierce', cost: 130,
    canHitFlying: true, v01Hidden: true, unlockLevel: '2-1', splash: 0, minRange: 0,
    branches: [
      { id: 'pojia', name: '破甲弩', blurb: '无视护甲，对护盾伤害×2', skill: '破城弩', skillCd: 15, skillText: 'V0.1 未开放' },
      { id: 'sangong', name: '三弓弩', blurb: '穿透 6 个，伤害×1.2', skill: '三弓齐发', skillCd: 12, skillText: 'V0.1 未开放' },
    ],
    stats: [
      row(1, '', 14, 1.4, 2.5, 0, 130, 91),
      row(2, '', 18.9, 1.4, 2.6, 91, 221, 155),
      row(3, '', 25.5, 1.4, 2.7, 130, 351, 246),
      row(4, 'pojia', 34.4, 1.4, 2.81, 195, 546, 382),
      row(4, 'sangong', 41.3, 1.4, 2.81, 195, 546, 382),
      row(5, 'pojia', 46.5, 1.4, 2.92, 260, 806, 564),
      row(5, 'sangong', 55.8, 1.4, 2.92, 260, 806, 564),
      row(6, 'pojia', 62.8, 1.4, 3.04, 364, 1170, 819),
      row(6, 'sangong', 75.3, 1.4, 3.04, 364, 1170, 819),
    ],
  },
];

export const ENEMIES: EnemyDef[] = [
  { id: 'luanbing', name: '乱兵', species: 'infantry', hp: 40, shield: 0, armor: 0, speed: 1.25, bounty: 8, leak: 1, flying: false, dodgeFirst: 0, sprintEvery: 0, sprintDur: 0, sprintMul: 1, contactDps: 8, tip: '没有特性，任何塔都能打。', first: '1-1' },
  { id: 'shanzei', name: '山贼', species: 'infantry', hp: 28, shield: 0, armor: 0, speed: 1.92, bounty: 10, leak: 1, flying: false, dodgeFirst: 0.35, sprintEvery: 0, sprintDur: 0, sprintMul: 1, contactDps: 10, tip: '有 35% 几率闪避第一次受到的伤害。', first: '1-1' },
  { id: 'ying', name: '斥候鹰', species: 'flying', hp: 22, shield: 0, armor: 0, speed: 1.98, bounty: 7, leak: 1, flying: true, dodgeFirst: 0, sprintEvery: 0, sprintDur: 0, sprintMul: 1, contactDps: 0, tip: '直线飞向城门。投石车、拒马阵、枪兵打不到，不受地面效果。', first: '1-2' },
  { id: 'daodun', name: '刀盾兵', species: 'infantry', hp: 85, shield: 65, armor: 0, speed: 1.15, bounty: 16, leak: 2, flying: false, dodgeFirst: 0, sprintEvery: 0, sprintDur: 0, sprintMul: 1, contactDps: 12, tip: '有护盾。燃烧无视护盾。', first: '1-3' },
  { id: 'qingqi', name: '轻骑', species: 'cavalry', hp: 60, shield: 0, armor: 0, speed: 1.5, bounty: 12, leak: 1, flying: false, dodgeFirst: 0, sprintEvery: 6, sprintDur: 1.5, sprintMul: 1.5, contactDps: 14, tip: '每 6 秒冲刺 1.5 秒，速度 +50%。', first: '1-4' },
];

export const BOSSES: BossDef[] = [
  { id: 'duwei', name: '乱军都尉', hp: 270, shield: 0, armor: 0, speed: 0.54, bounty: 132, leak: 8, tip: '阶段 1：每 8 秒擂鼓进军。预告形态不进阶段 2。' },
];

export const HEROES: HeroDef[] = [
  { id: 'guanyu', name: '关羽', rarity: 'legendary', faction: '蜀', damageType: 'blunt', ranged: false, hp: 420, atk: 44, aps: 0.85, range: 0.94, attack: 'single', attackN: 1, skill: '青龙斩', skillCd: 30, skillText: '前方直线 3 格、宽 0.8 格，造成 5 倍攻击。', passive: '武圣', passiveText: '对 Boss 伤害 +25%。', color: '#2f6b45', portrait: 'b_guanyu.png', full: 'guanyu_full.png' },
  { id: 'zhaoyun', name: '赵云', rarity: 'legendary', faction: '蜀', damageType: 'pierce', ranged: false, hp: 240, atk: 22, aps: 2, range: 0.88, attack: 'pierce', attackN: 3, skill: '七进七出', skillCd: 35, skillText: '沿路线来回冲杀 7 次，每次 1 倍攻击，期间无敌。', passive: '龙胆', passiveText: '生命低于 30% 时闪避 50% 的攻击。', color: '#d5dbe6' },
  { id: 'lvbu', name: '吕布', rarity: 'legendary', faction: '群', damageType: 'pierce', ranged: false, hp: 300, atk: 34, aps: 1.3, range: 1.08, attack: 'pierce', attackN: 2, skill: '天下无双', skillCd: 30, skillText: '3 秒内每 0.5 秒对 2 格内敌人造成 1.5 倍攻击。', passive: '飞将', passiveText: '每击败 1 个敌人攻速 +10%，最多 5 层，每层 5 秒。', color: '#8b1e2d' },
  { id: 'zhugeliang', name: '诸葛亮', rarity: 'legendary', faction: '蜀', damageType: 'fire', ranged: true, hp: 125, atk: 42, aps: 0.75, range: 2.19, attack: 'splash', attackN: 1.15, skill: '借东风', skillCd: 45, skillText: '10 秒内全场火攻伤害 +40%，燃烧层数上限 +2。', passive: '卧龙', passiveText: '谋略卡冷却 −15%。', color: '#3a5f8a' },
  { id: 'zhangfei', name: '张飞', rarity: 'epic', faction: '蜀', damageType: 'pierce', ranged: false, hp: 320, atk: 24, aps: 1, range: 0.96, attack: 'splash', attackN: 0.62, skill: '当阳怒吼', skillCd: 30, skillText: '1.67 格内敌人眩晕 2 秒。Boss 改为减速。', passive: '燕人', passiveText: '生命高于 50% 时受到伤害 −15%。', color: '#2a241c' },
  { id: 'zhouyu', name: '周瑜', rarity: 'epic', faction: '吴', damageType: 'fire', ranged: true, hp: 145, atk: 20, aps: 1.3, range: 2.08, attack: 'splash', attackN: 0.42, skill: '火烧连营', skillCd: 35, skillText: '在射程内最长路线铺 6 格火墙，5 秒，每秒 25 火攻。', passive: '美周郎', passiveText: '2.5 格内火油台攻速 +15%。', color: '#a33b32' },
  { id: 'dianwei', name: '典韦', rarity: 'epic', faction: '魏', damageType: 'blunt', ranged: false, hp: 360, atk: 26, aps: 0.9, range: 0.94, attack: 'single', attackN: 1, skill: '古之恶来', skillCd: 30, skillText: '6 秒内受伤 −60%，并让 1.67 格内地面敌人攻击典韦。', passive: '双戟', passiveText: '每第 3 次攻击伤害×2。', color: '#6b4a32' },
  { id: 'sunshangxiang', name: '孙尚香', rarity: 'epic', faction: '吴', damageType: 'pierce', ranged: true, hp: 175, atk: 24, aps: 1, range: 2.19, attack: 'splash', attackN: 0.71, skill: '枭姬连射', skillCd: 25, skillText: '4 秒内攻速×3。', passive: '弓腰姬', passiveText: '对飞行敌人伤害 +50%。', color: '#c45a4a', portrait: 'b_sunshangxiang.png', full: 'ssx_full.png' },
  { id: 'huangzhong', name: '黄忠', rarity: 'rare', faction: '蜀', damageType: 'pierce', ranged: true, hp: 125, atk: 17, aps: 1.25, range: 2.4, attack: 'pierce', attackN: 2, skill: '百步穿杨', skillCd: 18, skillText: '对全场生命最高的敌人造成 6 倍攻击，必中。', passive: '老当益壮', passiveText: '驻守不动 5 秒后攻击 +20%。', color: '#c9a24a' },
  { id: 'machao', name: '马超', rarity: 'rare', faction: '蜀', damageType: 'pierce', ranged: false, hp: 200, atk: 16, aps: 1.2, range: 0.92, attack: 'single', attackN: 1, skill: '银枪突击', skillCd: 15, skillText: '向入口冲 3 格，途经敌人 1.5 倍攻击并击退 1 格。', passive: '西凉锦马', passiveText: '移速×2。', color: '#e6d7a8' },
  { id: 'ganning', name: '甘宁', rarity: 'rare', faction: '吴', damageType: 'pierce', ranged: true, hp: 130, atk: 15, aps: 1.1, range: 2.29, attack: 'single', attackN: 1, skill: '百骑劫营', skillCd: 30, skillText: '2 格内地面敌人沿路线后退 2 格。', passive: '锦帆', passiveText: '对器械伤害 +30%。', color: '#2f6f6a' },
  { id: 'diaochan', name: '貂蝉', rarity: 'rare', faction: '群', damageType: 'blunt', ranged: true, hp: 110, atk: 8, aps: 1, range: 1.88, attack: 'single', attackN: 1, skill: '闭月', skillCd: 30, skillText: '1.67 格内敌人停住 3 秒。Boss 改为减速 50%。', passive: '倾城', passiveText: '每次攻击给城门回 2 生命。', color: '#d48aa6' },
];

export const CARDS: CardDef[] = [
  { id: 'huogong', name: '火攻', unlock: '1-1', cd: 18, first: 0, radius: 1.67, text: '半径 1.67 格内 120 火攻，并叠 2 层燃烧。', v01: true },
  { id: 'wanjian', name: '万箭齐发', unlock: '1-3', cd: 22, first: 0, radius: 2, text: '半径 2 格内，3 秒每 0.5 秒 15 穿刺，共 6 次。', v01: true },
];

export const DECREES: DecreeDef[] = [
  { id: 'jingnu', name: '劲弩', text: '箭楼攻速 +15%。', inert: false },
  { id: 'jushi', name: '巨石', text: '投石车溅射范围 +20%。', inert: false },
  { id: 'menghuoyou', name: '猛火油', text: '燃烧每层伤害 +20%。', inert: true, hint: '火油台未解锁，本局不生效' },
  { id: 'jiagu', name: '加固拒马', text: '拒马阵减速时长 +30%。', inert: false },
  { id: 'pojia', name: '破甲锋镝', text: '床弩对有护甲或护盾的敌人伤害 +20%。', inert: true, hint: '床弩未解锁，本局不生效' },
  { id: 'bingshu', name: '兵书', text: '谋略卡冷却 −15%。', inert: false },
  { id: 'gongjiang', name: '工匠营', text: '塔升级费用 −10%（不含建造和城门）。', inert: false },
  { id: 'shanggong', name: '赏功令', text: '每次击败额外 +1 军资。', inert: false },
  { id: 'xiucheng', name: '修城', text: '每清一波城门回 5 生命。', inert: false },
  { id: 'wengcheng', name: '瓮城', text: '每波第一次漏怪伤害减半。', inert: false },
  { id: 'jiangling', name: '将令', text: '英雄伤害 +12%。', inert: false },
  { id: 'qiangzhen', name: '枪阵操练', text: '枪兵生命 +30%，重生时间 −3 秒。', inert: false },
];

export const PACTS: PactDef[] = [
  { id: 'jixing', name: '急行', text: '这波敌人速度 +20%。', gold: 25 },
  { id: 'zengyuan', name: '增援', text: '这波多 2 个敌人（第 7 波起多 3 个）。', gold: 30 },
  { id: 'fengmou', name: '封谋', text: '这波不能用谋略卡。', gold: 35 },
];

export const LEVELS: LevelMeta[] = [
  { id: '1-1', name: '关前试锋', chapter: 1, map: 'M1', kind: '普通', munition: 200, star3: 'noLeak', star3Text: '不漏怪', blurb: '建箭楼、开波、升级、放火攻。乱兵与山贼。', playable: true },
  { id: '1-2', name: '鹰啸山口', chapter: 1, map: 'M1', kind: '普通', munition: 120, star3: 'noLeak', star3Text: '不漏怪', blurb: '斥候鹰从第 3 波飞来。投石车打不到。解锁军旗台。', playable: true },
  { id: '1-3', name: '盾阵叩关', chapter: 1, map: 'M1b', kind: '普通', munition: 130, star3: 'noLeakDmg', star3Text: '城门没有被漏怪扣血', blurb: '刀盾兵带护盾。解锁拒马阵、万箭齐发、第 2 个卡槽。', playable: true },
  { id: '1-4', name: '轻骑突袭', chapter: 1, map: 'M1b', kind: '普通', munition: 140, star3: 'noLeak', star3Text: '不漏怪', blurb: '轻骑会冲刺。解锁枪兵营，开放 Lv4 分支。', playable: true },
  { id: '1-5', name: '精英·锐卒夜袭', chapter: 1, map: 'M1', kind: '精英', munition: 150, star3: 'builds10', star3Text: '建塔不超过 10 座', blurb: '精英词缀只有坚韧、迅捷。第 10 波乱军都尉预告（×0.6）。', playable: true },
  { id: '1-6', name: '箭雨压城', chapter: 1, map: 'M1', kind: '普通', munition: 220, star3: 'noLeak', star3Text: '英雄没有倒下', blurb: '后续版本开放。', playable: false },
  { id: '1-7', name: '军医随营', chapter: 1, map: 'M1b', kind: '普通', munition: 220, star3: 'noLeak', star3Text: '不使用谋略卡', blurb: '后续版本开放。', playable: false },
  { id: '1-8', name: '精英·铁甲连营', chapter: 1, map: 'M1b', kind: '精英', munition: 220, star3: 'noLeak', star3Text: '不漏怪', blurb: '后续版本开放。', playable: false },
  { id: '1-9', name: '汜水夜火', chapter: 1, map: 'M1', kind: '普通', munition: 220, star3: 'noLeak', star3Text: '至少 1 座塔升到 Lv6', blurb: '后续版本开放。', playable: false },
  { id: '1-10', name: 'Boss·乱军都尉', chapter: 1, map: 'M1', kind: 'Boss', munition: 220, star3: 'noLeak', star3Text: '城门生命 ≥80%', blurb: '后续版本开放。', playable: false },
];

export const CHAPTERS = [
  { id: 1, name: '汜水关', numeral: '壹' },
  { id: 2, name: '长坂坡', numeral: '贰' },
  { id: 3, name: '赤壁水寨', numeral: '叁' },
];

export const GACHA = {
  singleCost: 20,
  tenCost: 200,
  pity: 30,
  dupRefund: 12,
  base: { rare: 0.75, epic: 0.21, legendary: 0.04 },
  /** 全部十连综合概率，来自 sanguo-gen/gacha_rates.py。 */
  tenCombined: { rare: 0.7328, epic: 0.2102, legendary: 0.057 },
};

export const DATA_HASH = 'sanguo-v0.2-2026-11-28';
export const DATA_HASH_V1 = 'sanguo-v0.1-2026-11-26';

export const STARTING_HEROES = ['huangzhong', 'machao'] as const;

export function towerById(id: string): TowerDef {
  const t = TOWERS.find((x) => x.id === id);
  if (!t) throw new Error(`unknown tower ${id}`);
  return t;
}

export function towerStat(id: string, level: number, branch: string): TowerStat {
  const t = towerById(id);
  const rowHit = t.stats.find((s) => s.level === level && s.branch === (branch || ''));
  if (!rowHit) throw new Error(`no stat ${id} L${level} ${branch}`);
  return rowHit;
}

export function nextUpgradeCost(id: string, level: number, branch: string): { cost: number; needsBranch: boolean } {
  if (level >= 6) return { cost: 0, needsBranch: false };
  if (level === 3) {
    const sample = towerById(id).stats.find((s) => s.level === 4);
    return { cost: sample?.upgradeCost ?? 0, needsBranch: true };
  }
  const nextBranch = level >= 4 ? branch : '';
  const next = towerStat(id, level + 1, nextBranch);
  return { cost: next.upgradeCost, needsBranch: false };
}

export function heroById(id: string): HeroDef {
  const h = HEROES.find((x) => x.id === id);
  if (!h) throw new Error(`unknown hero ${id}`);
  return h;
}

export function enemyById(id: string): EnemyDef {
  const e = ENEMIES.find((x) => x.id === id);
  if (!e) throw new Error(`unknown enemy ${id}`);
  return e;
}

export function levelMeta(id: string): LevelMeta {
  const m = LEVELS.find((x) => x.id === id);
  if (!m) throw new Error(`unknown level ${id}`);
  const raw = (levelsFile as { levels: { id: string; start_gold?: number }[] }).levels.find((l) => l.id === id);
  if (typeof raw?.start_gold === 'number') return { ...m, munition: raw.start_gold };
  return m;
}

export function flagAura(level: number, branch: string): number {
  if (branch === 'shuaiqi') return level === 6 ? 0.43 : level === 5 ? 0.39 : 0.35;
  if (branch === 'liangcang') return 0.28;
  return level === 1 ? 0.2 : level === 2 ? 0.24 : 0.28;
}

export function liangcangGold(level: number): number {
  if (level >= 6) return 40;
  if (level >= 5) return 30;
  return 20;
}

export const PRIORITIES = ['front', 'strong', 'boss', 'near'] as const;
export const PRIORITY_NAME: Record<(typeof PRIORITIES)[number], string> = {
  front: '最前',
  strong: '最强',
  boss: 'Boss 优先',
  near: '最近',
};
