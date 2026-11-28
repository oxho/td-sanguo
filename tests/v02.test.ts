import { describe, expect, it } from 'vitest';
import { stampChecksum } from '../src/core/hash';
import { newMeta } from '../src/core/progress';
import { waveHpScale } from '../src/core/formula';
import { createRun, dispatch, step } from '../src/core/sim';
import { heroById } from '../src/data/catalog';
import { animBook, anchorDropPx, frameOf, pxPerCell, refSpeed, strideRefSpeed, walkCycleCells } from '../src/render/spriteMeta';
import mapM1 from '../src/data/maps/M1.json';
import { migrateMeta } from '../src/platform/web/storage';
import { pickPad, towerTop } from '../src/view/hit';
import { designToGround, worldToDesign } from '../src/view/projection';

describe('projection', () => {
  it('round-trips random ground points', () => {
    let n = 0;
    for (let i = 0; i < 100; i++) {
      for (let j = 0; j < 100; j++) {
        const x = (i + 0.5) * 0.09;
        const y = (j + 0.5) * 0.16;
        const p = worldToDesign(x, y, 0);
        const back = designToGround(p.x, p.y);
        expect(back).toBeTruthy();
        expect(back!.x).toBeCloseTo(x, 3);
        expect(back!.y).toBeCloseTo(y, 3);
        n += 1;
      }
    }
    expect(n).toBe(10000);
  });

  it('lands every pad center back on that pad', () => {
    for (const pad of mapM1.pads) {
      const p = worldToDesign(pad.x, pad.y, 0);
      const back = designToGround(p.x, p.y)!;
      expect(Math.hypot(back.x - pad.x, back.y - pad.y)).toBeLessThan(0.001);
      const hit = pickPad(p.x, p.y, 0.5, mapM1.pads);
      expect(hit?.padId).toBe(pad.id);
      const top = worldToDesign(pad.x, pad.r, 0);
      const bottom = worldToDesign(pad.x, pad.r + 1, 0);
      expect(pickPad(top.x, top.y, 0.5, mapM1.pads)?.padId).toBe(pad.id);
      expect(pickPad(bottom.x, bottom.y, 0.5, mapM1.pads)?.padId).toBe(pad.id);
      const crown = towerTop(pad);
      expect(pickPad(crown.x, crown.y, 0.5, mapM1.pads)?.padId).toBe(pad.id);
    }
  });
});

describe('pacing data', () => {
  it('uses 5s then 8s, the new gold, and the new speeds', () => {
    const sim = createRun({ seed: 1, levelId: '1-1', heroes: [], cards: [], allowedTowers: ['jianlou', 'toushi'] });
    expect(sim.state.munition).toBe(200);
    expect(sim.state.countdown).toBe(5);
    expect(sim.state.countdownHold).toBe(false);
    dispatch(sim, { type: 'hold', on: true });
    for (let i = 0; i < 30; i++) step(sim);
    expect(sim.state.countdown).toBe(5);
    dispatch(sim, { type: 'build', padId: sim.map.pads[0]!.id, towerId: 'jianlou' });
    expect(sim.state.countdownHold).toBe(false);
    dispatch(sim, { type: 'start' });
    step(sim);
    const first = sim.state.enemies[0];
    expect(first?.baseSpeed).toBeCloseTo(1.25, 2);
    const later = createRun({ seed: 1, levelId: '1-2', heroes: [], cards: [], allowedTowers: ['jianlou'] });
    expect(later.state.munition).toBe(120);
    expect(later.state.countdown).toBe(5);
    later.state.waveIndex = 1;
    later.state.phase = 'prep';
    dispatch(later, { type: 'start' });
    expect(later.state.phase).toBe('combat');
  });

  it('groups spawns at 0.5s inside and 2.5s between', () => {
    const sim = createRun({ seed: 1, levelId: '1-1', heroes: [], cards: [], allowedTowers: ['jianlou'] });
    dispatch(sim, { type: 'build', padId: sim.map.pads[0]!.id, towerId: 'jianlou' });
    dispatch(sim, { type: 'start' });
    const times: number[] = [sim.state.time];
    while (sim.state.spawnIndex < 5 && sim.state.time < 20) step(sim);
    // spawn times are when spawnIndex increases; sample enemy count changes
    const born: number[] = [];
    const again = createRun({ seed: 3, levelId: '1-1', heroes: [], cards: [], allowedTowers: ['jianlou'] });
    dispatch(again, { type: 'start' });
    let seen = again.state.enemies.length;
    for (let i = 0; i < 600 && born.length < 4; i++) {
      step(again);
      if (again.state.enemies.length > seen) {
        born.push(again.state.time);
        seen = again.state.enemies.length;
      }
    }
    expect(born[1]! - born[0]!).toBeCloseTo(0.5, 1);
    expect(born[2]! - born[1]!).toBeCloseTo(0.5, 1);
    expect(born[3]! - born[2]!).toBeCloseTo(2.5, 1);
    expect(times.length).toBeGreaterThan(0);
  });

  it('reads the enemy atlas scale instead of a fixed cell size', () => {
    expect(pxPerCell('enemy')).toBe(145);
    expect(refSpeed()).toBe(1.25);
    expect(walkCycleCells()).toBeCloseTo(0.524, 3);
    expect(strideRefSpeed()).toBeCloseTo(0.524 * (12 / 6), 3);
    const frame = frameOf('enemy', 'e_luanbing_walk_f_01');
    expect(frame?.sourceSize).toEqual({ w: 128, h: 128 });
    expect(animBook('enemy').e_luanbing_walk_f?.frameRate).toBe(12);
    expect(animBook('enemy').e_luanbing_walk_s?.frameRate).toBe(12);
    const tower = frameOf('tower', 't_jianlou_lv1_idle_01');
    expect(tower?.pivot.y).toBeCloseTo(0.73645, 5);
    expect(Math.abs(anchorDropPx('tower', 't_jianlou_lv1_idle_01'))).toBeLessThan(0.05);
  });

  it('shortens the two starter hero cooldowns and they start ready', () => {
    expect(heroById('huangzhong').skillCd).toBe(18);
    expect(heroById('machao').skillCd).toBe(15);
    const sim = createRun({ seed: 1, levelId: '1-1', heroes: ['huangzhong', 'machao'], cards: [], allowedTowers: ['jianlou'] });
    expect(sim.state.heroes.every((h) => h.skillReadyAt === 0)).toBe(true);
  });
});

describe('save migration', () => {
  it('keeps a v1 meta and drops the idea of a v1 battle', () => {
    const v1 = stampChecksum({
      version: 1,
      dataHash: 'sanguo-v0.1-2026-11-26',
      checksum: '',
      talisman: 66,
      heroes: ['huangzhong', 'machao'],
      pity: 2,
      firstSingleFree: false,
      rng: 9,
      levels: { '1-1': { stars: 3, clears: 1 } },
      tutorial: { skipped: true, done11: true, tip13: false, tip14: false, tipHero: false },
      codex: ['luanbing'],
      settings: { muted: true },
      dailyChallengeUnlocked: false,
      endlessBest: 0,
    });
    const next = migrateMeta(v1);
    expect(next?.version).toBe(2);
    expect(next?.dataHash).toBe('sanguo-v0.2-2026-11-28');
    expect(next?.talisman).toBe(66);
    expect(next?.heroes).toEqual(['huangzhong', 'machao']);
    expect(next?.levels['1-1']?.stars).toBe(3);
    expect(next?.settings.muted).toBe(true);
    expect((next?.settings as { speed?: number }).speed).toBeUndefined();
    const fresh = newMeta(1);
    expect(fresh.version).toBe(2);
  });
});

describe('V0.2.2 level pressure', () => {
  function open(levelId: string) {
    return createRun({ seed: 1, levelId, heroes: [], cards: [], allowedTowers: ['jianlou'] });
  }

  it('raises hp_mul and keeps the wave counts on 1-2, 1-3 and 1-4', () => {
    const untouched = [
      ['1-1', 1, 6],
      ['1-5', 1.15, 10],
    ] as const;
    for (const [id, mul, waves] of untouched) {
      const sim = open(id);
      expect(sim.level.hp_mul).toBe(mul);
      expect(sim.level.waves).toHaveLength(waves);
    }
    const tuned = [
      ['1-2', 1.1, 8, 1.18],
      ['1-3', 1.25, 8, 1.18],
      ['1-4', 1.25, 10, 1.2],
    ] as const;
    for (const [id, mul, waves, growth] of tuned) {
      const sim = open(id);
      expect(sim.level.hp_mul).toBe(mul);
      expect(sim.level.waves).toHaveLength(waves);
      expect(sim.level.hp_growth).toBe(growth);
      dispatch(sim, { type: 'start' });
      step(sim);
      const first = sim.state.enemies[0]!;
      expect(first.defId).toBe('luanbing');
      expect(first.maxHp).toBeCloseTo(40 * waveHpScale(1, growth, mul), 4);
    }
    const mid = open('1-2');
    mid.state.waveIndex = 2;
    dispatch(mid, { type: 'start' });
    expect(mid.state.spawns).toHaveLength(8);
    expect(mid.state.spawns.filter((s) => s.id === 'luanbing')).toHaveLength(4);
    expect(mid.state.spawns.filter((s) => s.id === 'ying')).toHaveLength(2);
    const late = open('1-3');
    late.state.waveIndex = 5;
    dispatch(late, { type: 'start' });
    expect(late.state.spawns.filter((s) => s.id === 'daodun')).toHaveLength(5);
    expect(late.state.spawns.filter((s) => s.id === 'luanbing')).toHaveLength(4);
    const last = open('1-4');
    last.state.waveIndex = 9;
    dispatch(last, { type: 'start' });
    expect(last.state.spawns).toHaveLength(15);
    expect(last.state.spawns.filter((s) => s.id === 'luanbing')).toHaveLength(5);
    expect(last.state.spawns.filter((s) => s.id === 'qingqi')).toHaveLength(5);
  });
});

describe('architecture', () => {
  it('keeps scaling and grid constants in one place', () => {
    const files = import.meta.glob('../src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const badScale: string[] = [];
    const badGrid: string[] = [];
    for (const [path, text] of Object.entries(files)) {
      const rel = path.replace('../src/', '');
      if (rel !== 'view/viewport.ts' && /zoom|Scale\.FIT|Scale\.EXPAND|getBoundingClientRect/.test(text)) badScale.push(rel);
      const coordFile = rel.startsWith('ui/') || rel.startsWith('render/') || rel.startsWith('view/');
      if (coordFile && rel !== 'view/projection.ts' && /[^.\d](60|72|90|96)(?![\d.])/.test(text)) badGrid.push(rel);
    }
    expect(badScale).toEqual([]);
    expect(badGrid).toEqual([]);
  });
});
