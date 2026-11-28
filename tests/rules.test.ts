import { describe, expect, it } from 'vitest';
import { bondBetween } from '../src/core/bonds';
import { waveClearGold, waveHpScale } from '../src/core/formula';
import { pull } from '../src/core/gacha';
import { newMeta, starsOf, towerCap, unlocks } from '../src/core/progress';
import { createRun, dispatch, loadLevel, previewWave, step, type Sim } from '../src/core/sim';

function run(levelId: string, seed = 1, towers = ['jianlou', 'toushi', 'junqi', 'juma', 'qiangbing']): Sim {
  return createRun({
    seed,
    levelId,
    heroes: ['huangzhong', 'machao'],
    cards: levelId === '1-1' || levelId === '1-2' ? ['huogong'] : ['huogong', 'wanjian'],
    allowedTowers: towers,
  });
}

function until(sim: Sim, pred: () => boolean, max = 8000) {
  for (let i = 0; i < max && !pred(); i++) {
    if (sim.state.phase === 'decree' && sim.state.decreeOffer) {
      dispatch(sim, { type: 'decree', id: sim.state.decreeOffer[0] ?? null });
    }
    if (sim.state.phase === 'victory' || sim.state.phase === 'defeat') break;
    step(sim);
  }
}

describe('formula and content', () => {
  it('loads 1-1 through 1-5 from the level JSON', () => {
    for (const id of ['1-1', '1-2', '1-3', '1-4', '1-5']) {
      const level = loadLevel(id);
      expect(level.waves.length).toBeGreaterThan(0);
      expect(['M1', 'M1b']).toContain(level.map);
      expect(level.dongfeng).toBe(false);
    }
    const last = loadLevel('1-5').waves[9]!;
    expect(last.boss).toEqual(['duwei', 0.6]);
    expect(() => loadLevel('1-6')).toThrow();
  });

  it('wave 1 HP scale is 1 and clear gold follows 1.12^wave', () => {
    expect(waveHpScale(1)).toBe(1);
    expect(waveHpScale(2)).toBeCloseTo(1.15);
    expect(waveHpScale(10)).toBeCloseTo(Math.pow(1.15, 9));
    expect(waveHpScale(11)).toBeCloseTo(Math.pow(1.15, 9) * 1.085);
    expect(waveClearGold(1)).toBe(Math.round(30 * 1.12));
  });

  it('tower cap is 3 before 1-4 and 6 after', () => {
    expect(towerCap('1-1')).toBe(3);
    expect(towerCap('1-3')).toBe(3);
    expect(towerCap('1-4')).toBe(6);
    expect(towerCap('1-5')).toBe(6);
  });
});

describe('gacha', () => {
  it('first single pull is free and pity forces the 30th pull', () => {
    const meta = newMeta(3);
    expect(meta.heroes).toEqual(['huangzhong', 'machao']);
    const free = pull(meta, 'single');
    expect(free.ok).toBe(true);
    expect(free.cost).toBe(0);
    expect(meta.firstSingleFree).toBe(false);
    meta.talisman = 0;
    expect(pull(meta, 'single').ok).toBe(false);
    meta.talisman = 20;
    meta.pity = 29;
    const forced = pull(meta, 'single');
    expect(forced.cards[0]?.rarity).toBe('legendary');
    expect(meta.pity).toBe(0);
  });

  it('ten-pull costs 200 and the 10th card is not rare when the first nine are', () => {
    let found = false;
    for (let seed = 1; seed < 4000 && !found; seed++) {
      const meta = newMeta(seed);
      meta.rng = seed;
      meta.talisman = 200;
      meta.firstSingleFree = false;
      const res = pull(meta, 'ten');
      expect(res.cost).toBe(200);
      if (res.cards.slice(0, 9).every((c) => c.rarity === 'rare')) {
        expect(res.cards[9]?.rarity === 'rare').toBe(false);
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it('duplicates refund 12 talismans', () => {
    const meta = newMeta(8);
    meta.firstSingleFree = false;
    meta.talisman = 20;
    meta.heroes = ['guanyu', 'zhaoyun', 'lvbu', 'zhugeliang', 'zhangfei', 'zhouyu', 'dianwei', 'sunshangxiang', 'huangzhong', 'machao', 'ganning', 'diaochan'];
    const res = pull(meta, 'single');
    expect(res.cards[0]?.duplicate).toBe(true);
    expect(meta.talisman).toBe(12);
  });
});

describe('bonds and unlocks', () => {
  it('黄忠 and 马超 make 五虎上将, and 典韦 cannot make a Wei bond', () => {
    expect(bondBetween('huangzhong', 'machao').name).toBe('五虎上将');
    expect(bondBetween('guanyu', 'zhangfei').name).toBe('桃园结义');
    expect(bondBetween('zhaoyun', 'huangzhong').id).toBe('wuhu');
    expect(bondBetween('dianwei', 'guanyu').id).toBe('');
    expect(bondBetween('dianwei', 'lvbu').id).toBe('');
    expect(bondBetween('zhouyu', 'ganning').name).toBe('江东锦帆');
  });

  it('unlocks follow reaching the level, not clearing it', () => {
    const meta = newMeta(1);
    expect(unlocks(meta).towers).toEqual(['jianlou', 'toushi']);
    expect(unlocks(meta).slots).toBe(1);
    meta.levels['1-1'] = { stars: 1, clears: 1 };
    meta.levels['1-2'] = { stars: 1, clears: 1 };
    expect(unlocks(meta).towers).toContain('junqi');
    expect(unlocks(meta).cards).toContain('wanjian');
    expect(unlocks(meta).slots).toBe(2);
    expect(unlocks(meta).branch).toBe(false);
    meta.levels['1-3'] = { stars: 1, clears: 1 };
    expect(unlocks(meta).branch).toBe(true);
    expect(unlocks(meta).towers).toEqual(['jianlou', 'toushi', 'junqi', 'juma', 'qiangbing']);
  });
});

describe('battle rules', () => {
  it('early start pays 2 munition per remaining second', () => {
    const sim = run('1-1');
    dispatch(sim, { type: 'start' });
    expect(sim.state.munition).toBe(250);
    expect(sim.state.phase).toBe('combat');
  });

  it('1-1 wave 1 alternates 乱兵 and 山贼', () => {
    const sim = run('1-1');
    dispatch(sim, { type: 'start' });
    until(sim, () => sim.state.enemies.length >= 5 || sim.state.spawnIndex >= 5, 400);
    expect(sim.state.enemies.map((e) => e.name)).toEqual(['乱兵', '山贼', '乱兵', '山贼', '乱兵']);
  });

  it('1-5 marks every 4th enemy and keeps the preview boss in phase 1', () => {
    const sim = run('1-5');
    dispatch(sim, { type: 'start' });
    until(sim, () => sim.state.spawnIndex >= 4, 300);
    expect(sim.state.enemies[3]?.elite).toBe(true);
    expect(sim.state.enemies[3]?.affix).toBe('坚韧');
    expect(sim.state.enemies[0]?.elite).toBe(false);
    sim.state.waveIndex = 9;
    sim.state.phase = 'prep';
    sim.state.enemies = [];
    sim.state.spawns = [];
    sim.state.spawnIndex = 0;
    dispatch(sim, { type: 'start' });
    until(sim, () => sim.state.enemies.some((e) => e.boss), 2000);
    const boss = sim.state.enemies.find((e) => e.boss)!;
    expect(boss.name).toBe('乱军都尉');
    expect(boss.allowPhases).toBe(false);
    const expectHp = 270 * waveHpScale(10) * 0.82 * 0.6;
    expect(boss.maxHp).toBeCloseTo(expectHp, 4);
    boss.hp = boss.maxHp * 0.1;
    for (let i = 0; i < 40; i++) step(sim);
    expect(boss.phase).toBe(1);
    const ally = sim.state.enemies.find((e) => e.alive && !e.boss);
    expect(ally).toBeTruthy();
    ally!.x = boss.x;
    ally!.y = boss.y + 0.2;
    ally!.haltUntil = sim.state.time + 5;
    boss.nextDrum = sim.state.time;
    step(sim);
    expect(ally!.hasteUntil).toBeGreaterThan(sim.state.time);
    expect(sim.state.banners.some((b) => b.text === '擂鼓进军')).toBe(true);
    boss.allowPhases = true;
    boss.hp = boss.maxHp * 0.5;
    step(sim);
    expect(boss.phase).toBe(2);
  });

  it('a missed card does not start cooldown, and a hit does', () => {
    const sim = run('1-1');
    const miss = dispatch(sim, { type: 'card', index: 0, x: 0.2, y: 0.2 });
    expect(miss.ok).toBe(false);
    expect(sim.state.cards[0]?.cdUntil).toBe(0);
    expect(sim.state.stats.cardCasts).toBe(0);
    dispatch(sim, { type: 'start' });
    until(sim, () => sim.state.enemies.length > 0, 30);
    const e = sim.state.enemies[0]!;
    const hit = dispatch(sim, { type: 'card', index: 0, x: e.x, y: e.y });
    expect(hit.ok).toBe(true);
    expect(sim.state.cards[0]!.cdUntil).toBeGreaterThan(sim.state.time);
    expect(sim.state.stats.cardCasts).toBe(1);
  });

  it('sell refund matches the appendix and every build counts', () => {
    const sim = run('1-1');
    const pad = sim.map.pads[0]!.id;
    dispatch(sim, { type: 'build', padId: pad, towerId: 'jianlou' });
    expect(sim.state.munition).toBe(170);
    dispatch(sim, { type: 'sell', id: sim.state.towers[0]!.id });
    expect(sim.state.munition).toBe(205);
    expect(sim.state.stats.builds).toBe(1);
    dispatch(sim, { type: 'build', padId: pad, towerId: 'jianlou' });
    const id = sim.state.towers[0]!.id;
    dispatch(sim, { type: 'upgrade', id });
    dispatch(sim, { type: 'sell', id });
    expect(sim.state.stats.builds).toBe(2);
    expect(sim.state.munition).toBe(205 - 50 - 35 + 59);
  });

  it('刀盾兵 loses shield before life, and burn ticks life through a full shield', () => {
    const sim = run('1-3', 1, ['jianlou']);
    sim.state.waveIndex = 2;
    dispatch(sim, { type: 'start' });
    until(sim, () => sim.state.enemies.some((e) => e.defId === 'daodun'), 800);
    const e = sim.state.enemies.find((x) => x.defId === 'daodun')!;
    const pad = sim.map.pads.find((p) => Math.hypot(p.x - e.x, p.y - e.y) < 2.2) ?? sim.map.pads[0]!;
    e.x = pad.x + 0.4;
    e.y = pad.y;
    dispatch(sim, { type: 'build', padId: pad.id, towerId: 'jianlou' });
    const shield = e.shield;
    const hp = e.hp;
    until(sim, () => e.shield < shield || !e.alive, 200);
    expect(e.shield).toBeLessThan(shield);
    expect(e.hp).toBeCloseTo(hp, 4);
    e.shield = 5000;
    e.burnStacks = 2;
    e.burnUntil = sim.state.time + 1;
    const hp2 = e.hp;
    step(sim);
    expect(e.shield).toBe(5000);
    expect(e.hp).toBeLessThan(hp2);
  });

  it('投石车 does not damage a hawk', () => {
    const sim = run('1-2', 1, ['toushi']);
    sim.state.waveIndex = 2;
    dispatch(sim, { type: 'start' });
    until(sim, () => sim.state.enemies.some((e) => e.flying), 800);
    const hawk = sim.state.enemies.find((e) => e.flying)!;
    const pad = sim.map.pads[0]!;
    hawk.x = pad.x + 0.3;
    hawk.y = pad.y;
    hawk.progress = 1;
    const hp = hawk.hp;
    dispatch(sim, { type: 'build', padId: pad.id, towerId: 'toushi' });
    for (let i = 0; i < 90; i++) step(sim);
    expect(hawk.hp).toBeCloseTo(hp, 4);
  });

  it('hidden towers and inert decrees do not change burn', () => {
    const sim = run('1-1');
    expect(dispatch(sim, { type: 'build', padId: sim.map.pads[0]!.id, towerId: 'huoyou' }).ok).toBe(false);
    sim.state.phase = 'decree';
    sim.state.decreeOffer = ['menghuoyou', 'jingnu', 'bingshu'];
    dispatch(sim, { type: 'decree', id: 'menghuoyou' });
    expect(sim.state.decrees).toContain('menghuoyou');
    dispatch(sim, { type: 'start' });
    until(sim, () => sim.state.enemies.length > 0, 20);
    const e = sim.state.enemies[0]!;
    e.burnStacks = 1;
    e.burnUntil = sim.state.time + 1;
    const hp = e.hp;
    step(sim);
    expect(hp - e.hp).toBeCloseTo(6 / 30, 5);
  });

  it('stars and the 1-5 build rule', () => {
    const sim = run('1-5');
    sim.state.phase = 'victory';
    sim.state.stats.leaks = 0;
    sim.state.stats.builds = 11;
    sim.state.gate.hp = 100;
    const report = starsOf(sim.state);
    expect(report.stars).toBe(2);
    expect(report.c3).toBe(false);
    sim.state.stats.builds = 10;
    expect(starsOf(sim.state).stars).toBe(3);
    const easy = run('1-1');
    easy.state.phase = 'victory';
    easy.state.gate.hp = 40;
    expect(starsOf(easy.state).stars).toBe(1);
    easy.state.gate.hp = 80;
    easy.state.stats.leaks = 1;
    expect(starsOf(easy.state).stars).toBe(2);
  });

  it('can clear 1-1 with arrow towers', () => {
    const sim = run('1-1', 2);
    const ranked = sim.map.pads
      .map((p) => ({
        id: p.id,
        score: sim.map.path.filter((pt) => Math.hypot(pt.x - p.x, pt.y - p.y) <= 2.71).length,
      }))
      .sort((a, b) => b.score - a.score);
    let built = false;
    for (let i = 0; i < 12000; i++) {
      if (sim.state.phase === 'victory' || sim.state.phase === 'defeat') break;
      if (sim.state.phase === 'decree' && sim.state.decreeOffer) {
        dispatch(sim, { type: 'decree', id: sim.state.decreeOffer[0] ?? null });
        continue;
      }
      if (sim.state.towers.length < 4 && sim.state.munition >= 50) {
        const pad = ranked.find((p) => sim.state.towers.every((t) => t.padId !== p.id));
        if (pad) dispatch(sim, { type: 'build', padId: pad.id, towerId: 'jianlou' });
      } else if (!built) {
        built = sim.state.towers.length >= 3;
      }
      for (const t of sim.state.towers) {
        if (t.level < 2 && sim.state.munition >= 35) dispatch(sim, { type: 'upgrade', id: t.id });
      }
      const foe = sim.state.enemies.filter((e) => e.alive).sort((a, b) => b.progress - a.progress)[0];
      if (foe && sim.state.cards[0] && sim.state.time >= sim.state.cards[0].cdUntil) {
        dispatch(sim, { type: 'card', index: 0, x: foe.x, y: foe.y });
      }
      if (sim.state.phase === 'prep' && sim.state.towers.length >= 3) dispatch(sim, { type: 'start' });
      const phase: string = sim.state.phase;
      if (phase !== 'victory' && phase !== 'defeat') step(sim);
    }
    expect(sim.state.phase).toBe('victory');
    expect(sim.state.stats.wavesCleared).toBe(6);
    expect(previewWave(sim)).toEqual([]);
  });
});

describe('save checksum', () => {
  it('round-trips a meta stamp', async () => {
    const { stampChecksum, checksumValid } = await import('../src/core/hash');
    const meta = newMeta(4);
    const stamped = stampChecksum({ ...meta, checksum: '' });
    expect(checksumValid(stamped)).toBe(true);
    stamped.talisman = 3;
    expect(checksumValid(stamped)).toBe(false);
  });
});
