import { heroById } from '../data/catalog';

export interface Bond {
  id: string;
  name: string;
  atk: number;
  hp: number;
  aspd: Partial<Record<string, number>>;
  cardCd: number;
  fire: number;
  diaochanExtra: number;
  ganningExtra: number;
  huoyouDmg: number;
}

const NONE: Bond = {
  id: '', name: '', atk: 0, hp: 0, aspd: {}, cardCd: 0, fire: 0,
  diaochanExtra: 0, ganningExtra: 0, huoyouDmg: 0,
};

const FIVE = new Set(['guanyu', 'zhangfei', 'zhaoyun', 'machao', 'huangzhong']);

/** One bond only. Named bonds beat 同阵营. 典韦 is the only 魏将, so 同阵营·魏 cannot trigger. */
export function bondBetween(a: string, b: string): Bond {
  if (!a || !b || a === b) return NONE;
  const ids = new Set([a, b]);
  const has = (...xs: string[]) => xs.every((x) => ids.has(x));
  if (has('guanyu', 'zhangfei')) {
    return { ...NONE, id: 'taoyuan', name: '桃园结义', atk: 0.2, hp: 0.2 };
  }
  if (FIVE.has(a) && FIVE.has(b)) {
    return { ...NONE, id: 'wuhu', name: '五虎上将', atk: 0.15 };
  }
  if (has('zhugeliang', 'zhouyu')) {
    return { ...NONE, id: 'yuliang', name: '既生瑜亮', cardCd: 0.2, fire: 0.15 };
  }
  if (has('lvbu', 'diaochan')) {
    return { ...NONE, id: 'fengyi', name: '凤仪亭', aspd: { lvbu: 0.2 }, diaochanExtra: 1 };
  }
  if (has('zhouyu', 'ganning')) {
    return { ...NONE, id: 'jinfan', name: '江东锦帆', ganningExtra: 1, huoyouDmg: 0.2 };
  }
  const fa = heroById(a).faction;
  const fb = heroById(b).faction;
  if (fa === fb) {
    return { ...NONE, id: 'faction', name: `同阵营·${fa}`, atk: 0.1 };
  }
  return NONE;
}

export function bondsFor(heroId: string): string[] {
  const names: string[] = [];
  if (heroId === 'guanyu' || heroId === 'zhangfei') names.push('桃园结义');
  if (FIVE.has(heroId)) names.push('五虎上将');
  if (heroId === 'zhugeliang' || heroId === 'zhouyu') names.push('既生瑜亮');
  if (heroId === 'lvbu' || heroId === 'diaochan') names.push('凤仪亭');
  if (heroId === 'zhouyu' || heroId === 'ganning') names.push('江东锦帆');
  names.push(`同阵营·${heroById(heroId).faction}`);
  return names;
}
