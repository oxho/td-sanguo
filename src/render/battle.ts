import Phaser from 'phaser';
import { heroById } from '../data/catalog';
import { step, type Sim } from '../core/sim';
import type { EnemyState, SimEvent } from '../core/types';
import { depthKey } from '../view/depth';
import { rangePolygon, scaleAt, unitPixels, worldToCanvas } from '../view/projection';
import { VIEW } from '../view/projection';
import { attachCanvas } from '../view/viewport';

export interface BattleView {
  range: { x: number; y: number; r: number } | null;
  aim: { x: number; y: number; r: number } | null;
  selectedTower: number | null;
  selectedHero: number | null;
}

export interface BattleHooks {
  onFrame: () => void;
  onEvents: (events: SimEvent[]) => void;
  onEnd: () => void;
}

const COLOR: Record<string, number> = {
  jianlou: 0xc45a3a,
  toushi: 0x8a6a3a,
  junqi: 0x3a6a8a,
  juma: 0x6a5a3a,
  qiangbing: 0x4a6a3a,
  luanbing: 0xc4a06a,
  shanzei: 0x3a2a22,
  ying: 0x88a0b0,
  daodun: 0x6a6a70,
  qingqi: 0x8a4a3a,
  duwei: 0x8a1e1e,
  hero: 0xe6d7a8,
  soldier: 0x6a8a4a,
  gate: 0x8d3a2a,
  pad: 0xd7b98a,
};

function at(x: number, y: number, z = 0): { x: number; y: number } {
  return worldToCanvas(x, y, z);
}

class Field extends Phaser.Scene {
  private sim: Sim;
  private view: BattleView;
  private ground!: Phaser.GameObjects.Graphics;
  private fx!: Phaser.GameObjects.Graphics;
  private boxes = new Map<string, Phaser.GameObjects.Rectangle>();
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private ready = false;
  private floatTimes: number[] = [];
  private killTimes: number[] = [];

  constructor(sim: Sim, view: BattleView) {
    super('field');
    this.sim = sim;
    this.view = view;
  }

  create() {
    this.cameras.main.centerOn(VIEW.mapW / 2, VIEW.mapH / 2);
    this.ground = this.add.graphics().setDepth(0);
    this.fx = this.add.graphics().setDepth(2);
    this.drawGround();
    this.ready = true;
  }

  private drawGround() {
    const g = this.ground;
    g.clear();
    g.fillStyle(0x6d8a45, 1);
    g.fillRect(0, 0, VIEW.mapW, VIEW.mapH);
    const pts = this.sim.map.path;
    g.lineStyle(18, 0xc4a36a, 0.9);
    g.beginPath();
    const first = at(pts[0]!.x, pts[0]!.y);
    g.moveTo(first.x, first.y);
    for (const p of pts) {
      const q = at(p.x, p.y);
      g.lineTo(q.x, q.y);
    }
    g.strokePath();
    for (const pad of this.sim.map.pads) {
      const c = at(pad.x, pad.y);
      const s = scaleAt(pad.y);
      g.fillStyle(COLOR.pad, 0.95);
      g.fillEllipse(c.x, c.y, VIEW.S0 * s * 0.9, VIEW.S0 * s * 0.9 * VIEW.k);
      g.lineStyle(2, 0x5a3a18, 0.8);
      g.strokeEllipse(c.x, c.y, VIEW.S0 * s * 0.9, VIEW.S0 * s * 0.9 * VIEW.k);
    }
    const gate = at(this.sim.map.gate.x, this.sim.map.gate.y);
    const gh = unitPixels(this.sim.map.gate.y, 1.3, 1.6);
    g.fillStyle(COLOR.gate, 1);
    g.fillRect(gate.x - gh.w / 2, gate.y - gh.h, gh.w, gh.h);
  }

  update() {
    if (!this.ready) return;
    const alpha = (this.game as Phaser.Game & { __alpha?: number }).__alpha ?? 1;
    this.fx.clear();
    this.drawZones();
    this.drawRange();
    this.syncTowers();
    this.syncSoldiers(alpha);
    this.syncEnemies(alpha);
    this.syncHeroes(alpha);
  }

  playEvents(events: SimEvent[]) {
    const now = this.sim.state.time;
    for (const ev of events) {
      if (ev.type !== 'rout' || typeof ev.x !== 'number' || typeof ev.y !== 'number') continue;
      this.killTimes = this.killTimes.filter((t) => now - t <= 3);
      this.killTimes.push(now);
      this.floatTimes = this.floatTimes.filter((t) => now - t <= 1);
      if (this.floatTimes.length >= 12) continue;
      this.floatTimes.push(now);
      const p = at(ev.x, ev.y);
      const text = this.add.text(p.x, p.y - 20, `+${ev.amount ?? 0}`, {
        fontFamily: '"Noto Serif SC", serif', fontSize: '16px', color: '#ffe08a',
      }).setOrigin(0.5).setDepth(9000);
      const coin = this.add.circle(p.x, p.y, 5, 0xe2b866).setDepth(9000);
      this.tweens.add({
        targets: text, y: p.y - 48, alpha: 0, duration: 400,
        onComplete: () => text.destroy(),
      });
      this.tweens.add({
        targets: coin, y: 8, x: VIEW.mapW / 2, alpha: 0, duration: 400,
        onComplete: () => coin.destroy(),
      });
      if (this.killTimes.length >= 5) {
        const banner = this.add.text(VIEW.mapW / 2, 40, `连斩 ×${this.killTimes.length}`, {
          fontFamily: '"Noto Serif SC", serif', fontSize: '22px', color: '#fff6df',
        }).setOrigin(0.5).setDepth(9001);
        this.tweens.add({ targets: banner, alpha: 0, duration: 700, onComplete: () => banner.destroy() });
        this.killTimes = [];
      }
    }
  }

  private strokePoly(points: { x: number; y: number }[], color: number, alpha: number) {
    if (points.length < 2) return;
    this.fx.lineStyle(2, color, alpha);
    this.fx.beginPath();
    this.fx.moveTo(points[0]!.x, points[0]!.y);
    for (const p of points) this.fx.lineTo(p.x, p.y);
    this.fx.closePath();
    this.fx.strokePath();
    this.fx.fillStyle(color, 0.12);
    this.fx.fillPath();
  }

  private drawZones() {
    for (const z of this.sim.state.zones) {
      const color = z.damageType === 'fire' || z.kind === 'fireline' ? 0xe25a2a : 0xf0d080;
      this.strokePoly(rangePolygon(z.x, z.y, z.radius), color, 0.8);
    }
  }

  private drawRange() {
    const rings = [this.view.range, this.view.aim].filter((r): r is { x: number; y: number; r: number } => !!r);
    rings.forEach((ring, i) => this.strokePoly(rangePolygon(ring.x, ring.y, ring.r), i === 0 ? 0xf0d48a : 0xfff6d2, 0.95));
  }

  private box(key: string, color: number, w: number, h: number, x: number, y: number, depth: number) {
    let obj = this.boxes.get(key);
    if (!obj) {
      obj = this.add.rectangle(x, y, w, h, color).setOrigin(0.5, 1);
      this.boxes.set(key, obj);
    }
    obj.setPosition(x, y);
    obj.setSize(Math.max(2, w), Math.max(2, h));
    obj.setDisplaySize(Math.max(2, w), Math.max(2, h));
    obj.setFillStyle(color);
    obj.setDepth(depth);
    return obj;
  }

  private syncTowers() {
    const live = new Set<string>();
    for (const tower of this.sim.state.towers) {
      const key = `tw-${tower.id}`;
      live.add(key);
      const p = at(tower.x, tower.y);
      const size = unitPixels(tower.y, 0.9, 1.4);
      const color = COLOR[tower.defId] ?? COLOR.jianlou;
      this.box(key, color, size.w, size.h, p.x, p.y, depthKey(tower.y, 'building', tower.x, tower.id));
      this.tag(key, `${tower.level}`, p.x, p.y - size.h - 8);
    }
    this.dropMissing('tw-', live);
  }

  private syncSoldiers(alpha: number) {
    const live = new Set<string>();
    for (const sol of this.sim.state.soldiers) {
      if (sol.downUntil > this.sim.state.time) continue;
      const key = `sol-${sol.id}`;
      live.add(key);
      const x = sol.px + (sol.x - sol.px) * alpha;
      const y = sol.py + (sol.y - sol.py) * alpha;
      const p = at(x, y);
      const size = unitPixels(y, 0.35, 0.7);
      this.box(key, COLOR.soldier, size.w, size.h, p.x, p.y, depthKey(y, 'soldier', x, sol.id));
    }
    this.dropMissing('sol-', live);
  }

  private syncEnemies(alpha: number) {
    const live = new Set<string>();
    for (const e of this.sim.state.enemies) {
      if (!e.alive) continue;
      const key = `en-${e.id}`;
      live.add(key);
      const x = e.px + (e.x - e.px) * alpha;
      const y = e.py + (e.y - e.py) * alpha;
      const wide = e.boss ? 1.1 : e.defId === 'daodun' ? 0.75 : 0.6;
      const size = unitPixels(y, wide, wide * 1.3);
      const p = at(x, y, e.flying ? 1 : 0);
      const color = COLOR[e.defId] ?? (e.boss ? COLOR.duwei : COLOR.luanbing);
      const depth = e.flying ? 8000 + y : depthKey(y, 'enemy', x, e.id);
      const obj = this.box(key, color, size.w, size.h, p.x, p.y, depth);
      obj.setAlpha(1);
      this.bar(p.x, p.y - size.h - 6, e);
    }
    this.dropMissing('en-', live);
  }

  private bar(x: number, y: number, e: EnemyState) {
    const w = e.boss ? 48 : 28;
    this.fx.fillStyle(0x1a120c, 0.8);
    this.fx.fillRect(x - w / 2, y, w, 4);
    this.fx.fillStyle(e.boss ? 0xc8281e : 0xd24a3a, 1);
    this.fx.fillRect(x - w / 2, y, w * Math.max(0, e.hp / e.maxHp), 4);
  }

  private syncHeroes(alpha: number) {
    const live = new Set<string>();
    for (const hero of this.sim.state.heroes) {
      const key = `he-${hero.id}`;
      live.add(key);
      const x = hero.px + (hero.x - hero.px) * alpha;
      const y = hero.py + (hero.y - hero.py) * alpha;
      const p = at(x, y);
      const size = unitPixels(y, 0.55, 1.1);
      const def = heroById(hero.defId);
      const color = Number.parseInt(def.color.slice(1), 16);
      const obj = this.box(key, color, size.w, size.h, p.x, p.y, depthKey(y, 'hero', x, hero.id));
      obj.setAlpha(hero.downUntil > this.sim.state.time ? 0.35 : 1);
      this.tag(key, def.name.slice(0, 1), p.x, p.y - size.h - 6);
    }
    this.dropMissing('he-', live);
  }

  private tag(key: string, text: string, x: number, y: number) {
    let label = this.labels.get(key);
    if (!label) {
      label = this.add.text(x, y, text, {
        fontFamily: '"Noto Serif SC", serif', fontSize: '14px', color: '#fff6df',
        stroke: '#1a120c', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(8500);
      this.labels.set(key, label);
    }
    label.setText(text);
    label.setPosition(x, y);
  }

  private dropMissing(prefix: string, live: Set<string>) {
    for (const [key, img] of this.boxes) {
      if (!key.startsWith(prefix) || live.has(key)) continue;
      img.destroy();
      this.boxes.delete(key);
      this.labels.get(key)?.destroy();
      this.labels.delete(key);
    }
  }
}

export interface BattleSession {
  destroy: () => void;
  setSpeed: (speed: number) => void;
}

export function mountBattle(
  parent: HTMLElement,
  sim: Sim,
  view: BattleView,
  hooks: BattleHooks,
  getSpeed: () => number = () => 1,
): BattleSession {
  const scene = new Field(sim, view);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: VIEW.mapW,
    height: VIEW.mapH,
    backgroundColor: '#6d8a45',
    banner: false,
    scale: {
      mode: Phaser.Scale.NONE,
      autoCenter: Phaser.Scale.NO_CENTER,
      width: VIEW.mapW,
      height: VIEW.mapH,
    },
    scene,
  });
  const fitCanvas = () => {
    const canvas = parent.querySelector('canvas');
    if (canvas) attachCanvas(canvas);
  };
  fitCanvas();
  requestAnimationFrame(fitCanvas);
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  let ended = false;
  let dead = false;
  let saveTick = 0;
  let speed = 1;
  const loop = (now: number) => {
    if (dead) return;
    const dt = Math.min(100, now - last);
    last = now;
    speed = getSpeed();
    const frozen = document.hidden || sim.state.paused || sim.state.phase === 'decree' || sim.state.phase === 'victory' || sim.state.phase === 'defeat';
    if (frozen) acc = 0;
    else {
      acc += dt * speed;
      let steps = 0;
      const events: SimEvent[] = [];
      while (acc >= 1000 / 30 && steps < 10) {
        step(sim);
        events.push(...sim.events);
        sim.events = [];
        acc -= 1000 / 30;
        steps += 1;
        saveTick += 1;
      }
      if (steps >= 10) acc = 0;
      if (events.length) {
        scene.playEvents(events);
        hooks.onEvents(events);
      }
    }
    (game as Phaser.Game & { __alpha?: number }).__alpha = frozen ? 1 : acc / (1000 / 30);
    if (!ended && (sim.state.phase === 'victory' || sim.state.phase === 'defeat')) {
      ended = true;
      hooks.onEnd();
    }
    if (dead) return;
    hooks.onFrame();
    if (saveTick >= 150) {
      saveTick = 0;
      hooks.onEvents([{ type: 'autosave' }]);
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return {
    setSpeed(next: number) { speed = next; },
    destroy() {
      dead = true;
      cancelAnimationFrame(raf);
      game.destroy(true);
    },
  };
}
