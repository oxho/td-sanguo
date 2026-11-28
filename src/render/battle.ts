import Phaser from 'phaser';
import { heroById } from '../data/catalog';
import { step, type Sim } from '../core/sim';
import type { EnemyState, SimEvent } from '../core/types';
import { anchorDropPx, animBook, pxPerCell, strideRefSpeed } from './spriteMeta';
import bgMeta from '../../public/assets/map/bg_M1.json';
import { LAYER, depthKey, flyingDepth, infoDepth } from '../view/depth';
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
  soldier: 0x6a8a4a,
  gate: 0x8d3a2a,
};

const OUTLINE = 0xb5e05a;

function at(x: number, y: number, z = 0): { x: number; y: number } {
  return worldToCanvas(x, y, z);
}

function shownScale(kind: 'enemy' | 'tower', y: number): number {
  return scaleAt(y) * VIEW.S0 / pxPerCell(kind);
}

class Field extends Phaser.Scene {
  private sim: Sim;
  private view: BattleView;
  private markers!: Phaser.GameObjects.Graphics;
  private bars!: Phaser.GameObjects.Graphics;
  private actors = new Map<string, Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle>();
  private shadows = new Map<string, Phaser.GameObjects.Image>();
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private ready = false;
  private floatTimes: number[] = [];
  private killTimes: number[] = [];

  constructor(sim: Sim, view: BattleView) {
    super('field');
    this.sim = sim;
    this.view = view;
  }

  preload() {
    this.load.atlas('atlas_enemy_0', 'assets/atlas/atlas_enemy_0.webp', 'assets/atlas/atlas_enemy_0.json');
    this.load.atlas('atlas_tower_0', 'assets/atlas/atlas_tower_0.webp', 'assets/atlas/atlas_tower_0.json');
    this.load.image('bg_M1', 'assets/map/bg_M1.webp');
    this.load.image('fx_shadow', 'assets/atlas/fx_shadow.webp');
  }

  create() {
    this.cameras.main.centerOn(VIEW.mapW / 2, VIEW.mapH / 2);
    this.registerAnims('enemy', 'atlas_enemy_0');
    this.registerAnims('tower', 'atlas_tower_0');
    const bg = bgMeta as { placeAtCanvas: number[]; scaleToDesign: number; size: number[] };
    const [bx, by] = bg.placeAtCanvas;
    const [bw, bh] = bg.size;
    const mirror = this.sim.map.id === 'M1b';
    const img = this.add.image(0, by, 'bg_M1').setOrigin(mirror ? 1 : 0, 0);
    img.setDisplaySize(bw * bg.scaleToDesign, bh * bg.scaleToDesign);
    img.setPosition(mirror ? bx + bw * bg.scaleToDesign : bx, by);
    img.setFlipX(mirror);
    img.setDepth(LAYER.ground);
    this.markers = this.add.graphics().setDepth(LAYER.marker);
    this.bars = this.add.graphics().setDepth(infoDepth(0));
    this.ready = true;
  }

  private registerAnims(kind: 'enemy' | 'tower', atlas: string) {
    for (const [key, anim] of Object.entries(animBook(kind))) {
      if (this.anims.exists(key)) continue;
      this.anims.create({
        key,
        frames: anim.frames.map((frame) => ({ key: atlas, frame })),
        frameRate: anim.frameRate,
        repeat: anim.repeat,
      });
    }
  }

  update() {
    if (!this.ready) return;
    const speed = (this.game as Phaser.Game & { __speed?: number }).__speed ?? 1;
    this.anims.globalTimeScale = speed;
    if (this.sim.state.paused) this.anims.pauseAll();
    else this.anims.resumeAll();
    const alpha = (this.game as Phaser.Game & { __alpha?: number }).__alpha ?? 1;
    this.markers.clear();
    this.bars.clear();
    this.drawMarkers();
    this.syncTowers();
    this.syncSoldiers(alpha);
    this.syncEnemies(alpha);
    this.syncHeroes(alpha);
  }

  playEvents(events: SimEvent[]) {
    const now = this.sim.state.time;
    for (const ev of events) {
      if (ev.type === 'shot' && ev.defId === 'jianlou') {
        const sprite = this.actors.get(`tw-${ev.id}`);
        if (sprite instanceof Phaser.GameObjects.Sprite && this.anims.exists('t_jianlou_lv1_attack')) {
          sprite.play('t_jianlou_lv1_attack');
          sprite.once('animationcomplete', () => {
            if (sprite.active && this.anims.exists('t_jianlou_lv1_idle')) sprite.play('t_jianlou_lv1_idle');
          });
        }
      }
      if (ev.type !== 'rout' || typeof ev.x !== 'number' || typeof ev.y !== 'number') continue;
      this.killTimes = this.killTimes.filter((t) => now - t <= 3);
      this.killTimes.push(now);
      this.floatTimes = this.floatTimes.filter((t) => now - t <= 1);
      if (this.floatTimes.length >= 12) continue;
      this.floatTimes.push(now);
      const p = at(ev.x, ev.y);
      const text = this.add.text(p.x, p.y - 20, `+${ev.amount ?? 0}`, {
        fontFamily: '"Noto Serif SC", serif', fontSize: '16px', color: '#ffe08a',
      }).setOrigin(0.5).setDepth(infoDepth(2));
      const coin = this.add.circle(p.x, p.y, 5, 0xe2b866).setDepth(infoDepth(2));
      this.tweens.add({ targets: text, y: p.y - 48, alpha: 0, duration: 400, onComplete: () => text.destroy() });
      this.tweens.add({ targets: coin, y: 8, x: VIEW.mapW / 2, alpha: 0, duration: 400, onComplete: () => coin.destroy() });
      if (this.killTimes.length >= 5) {
        const banner = this.add.text(VIEW.mapW / 2, 28, `连斩 ×${this.killTimes.length}`, {
          fontFamily: '"Noto Serif SC", serif', fontSize: '22px', color: '#fff6df',
        }).setOrigin(0.5).setDepth(infoDepth(3));
        this.tweens.add({ targets: banner, alpha: 0, duration: 700, onComplete: () => banner.destroy() });
        this.killTimes = [];
      }
    }
  }

  private strokePoly(points: { x: number; y: number }[], color: number) {
    if (points.length < 2) return;
    this.markers.lineStyle(2, color, 0.95);
    this.markers.beginPath();
    this.markers.moveTo(points[0]!.x, points[0]!.y);
    for (const p of points) this.markers.lineTo(p.x, p.y);
    this.markers.closePath();
    this.markers.strokePath();
  }

  private drawMarkers() {
    for (const z of this.sim.state.zones) {
      const color = z.damageType === 'fire' || z.kind === 'fireline' ? 0xe25a2a : 0xf0d080;
      this.strokePoly(rangePolygon(z.x, z.y, z.radius), color);
    }
    const rings = [this.view.range, this.view.aim].filter((r): r is { x: number; y: number; r: number } => !!r);
    rings.forEach((ring, i) => this.strokePoly(rangePolygon(ring.x, ring.y, ring.r), i === 0 ? 0xf0d48a : 0xfff6d2));
  }

  private block(key: string, color: number, w: number, h: number, x: number, y: number, depth: number, outline = false) {
    let obj = this.actors.get(key);
    if (!(obj instanceof Phaser.GameObjects.Rectangle)) {
      obj?.destroy();
      obj = this.add.rectangle(x, y, w, h, color).setOrigin(0.5, 1);
      this.actors.set(key, obj);
      if (outline) {
        const host = obj.enableFilters();
        host.filters?.internal.addGlow(OUTLINE, 3, 0, 1, false, 4, 4);
      }
    }
    obj.setPosition(x, y);
    obj.setDisplaySize(Math.max(2, w), Math.max(2, h));
    obj.setFillStyle(color);
    obj.setDepth(depth);
    return obj;
  }

  private shadow(key: string, x: number, y: number, worldY: number, wide: number) {
    let img = this.shadows.get(key);
    if (!img) {
      img = this.add.image(x, y, 'fx_shadow').setDepth(LAYER.shadow);
      this.shadows.set(key, img);
    }
    const s = scaleAt(worldY);
    const w = 0.4 * VIEW.S0 * s * wide;
    img.setPosition(x + 1.3 * s, y + 0.7 * s);
    img.setDisplaySize(w, w * 0.45);
    img.setAlpha(0.43);
  }

  private syncTowers() {
    const live = new Set<string>();
    for (const tower of this.sim.state.towers) {
      const key = `tw-${tower.id}`;
      live.add(key);
      const p = at(tower.x, tower.y);
      const useArt = tower.defId === 'jianlou' && tower.level === 1 && this.textures.exists('atlas_tower_0');
      if (useArt) {
        const scale = shownScale('tower', tower.y);
        let obj = this.actors.get(key);
        if (!(obj instanceof Phaser.GameObjects.Sprite)) {
          obj?.destroy();
          obj = this.add.sprite(p.x, p.y, 'atlas_tower_0', 't_jianlou_lv1_idle_01');
          this.actors.set(key, obj);
          if (this.anims.exists('t_jianlou_lv1_idle')) obj.play('t_jianlou_lv1_idle');
        }
        obj.setPosition(p.x, p.y + anchorDropPx('tower', 't_jianlou_lv1_idle_01') * scale);
        obj.setScale(scale);
        obj.setDepth(depthKey(tower.y, 'building', tower.x, tower.id));
      } else {
        const size = unitPixels(tower.y, 0.9, 1);
        this.block(key, COLOR[tower.defId] ?? COLOR.jianlou, size.w, size.h, p.x, p.y, depthKey(tower.y, 'building', tower.x, tower.id));
      }
      const top = p.y - unitPixels(tower.y, 0.9, 1).h;
      this.tag(key, `${tower.level}`, p.x, top - 8);
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
      this.block(key, COLOR.soldier, size.w, size.h, p.x, p.y, depthKey(y, 'soldier', x, sol.id));
      this.shadow(key, p.x, p.y, y, 0.7);
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
      const feet = at(x, y, 0);
      if (e.defId === 'luanbing' && this.textures.exists('atlas_enemy_0')) {
        const scale = shownScale('enemy', y);
        let obj = this.actors.get(key);
        if (!(obj instanceof Phaser.GameObjects.Sprite)) {
          obj?.destroy();
          obj = this.add.sprite(feet.x, feet.y, 'atlas_enemy_0', 'e_luanbing_walk_f_01');
          this.actors.set(key, obj);
        }
        const dx = x - (Number(obj.getData('wx')) || x);
        const dy = y - (Number(obj.getData('wy')) || y);
        obj.setData('wx', x);
        obj.setData('wy', y);
        const side = Math.abs(dx) > Math.abs(dy);
        const anim = side ? 'e_luanbing_walk_s' : 'e_luanbing_walk_f';
        if (obj.anims.currentAnim?.key !== anim && this.anims.exists(anim)) obj.play(anim);
        if (side) obj.setFlipX(dx < 0);
        const local = Math.min(Math.max(e.baseSpeed / strideRefSpeed(), 0.5), 1.6);
        obj.anims.timeScale = local;
        obj.setPosition(feet.x, feet.y);
        obj.setScale(scale);
        obj.setDepth(depthKey(y, 'enemy', x, e.id));
        this.shadow(key, feet.x, feet.y, y, 1);
      } else {
        const wide = e.boss ? 1.1 : 0.5;
        const tall = e.boss ? 1.4 : 0.8;
        const size = unitPixels(y, wide, tall);
        const p = e.flying ? at(x, y, 1) : feet;
        const depth = e.flying ? flyingDepth(y) : depthKey(y, 'enemy', x, e.id);
        this.block(key, COLOR[e.defId] ?? COLOR.luanbing, size.w, size.h, p.x, p.y, depth, e.defId === 'shanzei');
        if (!e.flying) this.shadow(key, feet.x, feet.y, y, wide / 0.5);
      }
      const head = e.flying ? at(x, y, 1) : feet;
      const size = unitPixels(y, e.boss ? 1.1 : 0.5, e.boss ? 1.4 : 0.8);
      this.bar(head.x, head.y - size.h - 6, e);
    }
    this.dropMissing('en-', live);
  }

  private bar(x: number, y: number, e: EnemyState) {
    const w = e.boss ? 48 : 28;
    this.bars.fillStyle(0x1a120c, 0.8);
    this.bars.fillRect(x - w / 2, y, w, 4);
    this.bars.fillStyle(e.boss ? 0xc8281e : 0xd24a3a, 1);
    this.bars.fillRect(x - w / 2, y, w * Math.max(0, e.hp / e.maxHp), 4);
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
      const obj = this.block(key, color, size.w, size.h, p.x, p.y, depthKey(y, 'hero', x, hero.id));
      obj.setAlpha(hero.downUntil > this.sim.state.time ? 0.35 : 1);
      this.shadow(key, p.x, p.y, y, 1);
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
      }).setOrigin(0.5).setDepth(infoDepth(1));
      this.labels.set(key, label);
    }
    label.setText(text);
    label.setPosition(x, y);
  }

  private dropMissing(prefix: string, live: Set<string>) {
    for (const [key, img] of this.actors) {
      if (!key.startsWith(prefix) || live.has(key)) continue;
      img.destroy();
      this.actors.delete(key);
      this.labels.get(key)?.destroy();
      this.labels.delete(key);
      this.shadows.get(key)?.destroy();
      this.shadows.delete(key);
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
    render: { mipmapFilter: 'LINEAR_MIPMAP_LINEAR' },
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
  const loop = (now: number) => {
    if (dead) return;
    const dt = Math.min(100, now - last);
    last = now;
    const speed = getSpeed();
    (game as Phaser.Game & { __speed?: number }).__speed = speed;
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
    setSpeed() { /* speed is read from getSpeed every frame */ },
    destroy() {
      dead = true;
      cancelAnimationFrame(raf);
      game.destroy(true);
    },
  };
}
