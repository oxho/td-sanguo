import { describe, expect, it } from 'vitest';
import { stampChecksum } from '../src/core/hash';
import { newMeta } from '../src/core/progress';
import { createRun, dispatch, step } from '../src/core/sim';
import { heroById } from '../src/data/catalog';
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
    expect(sim.state.countdownHold).toBe(true);
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
