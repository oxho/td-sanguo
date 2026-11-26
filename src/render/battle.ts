import Phaser from 'phaser';
import { heroById } from '../data/catalog';
import { step, type Sim } from '../core/sim';
import type { EnemyState, SimEvent } from '../core/types';

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

const OX = 90;
const CELL = 60;

function px(x: number): number { return OX + x * CELL; }
function py(y: number): number { return y * CELL; }

const TOWER_KEY: Record<string, string> = {
  jianlou: 't_jianlou', toushi: 't_toushi', junqi: 't_junqi', juma: 't_juma', qiangbing: 't_qiangbing',
  huoyou: 't_huoyou', fenghuo: 't_fenghuo', chuangnu: 't_chuangnu',
};
const ENEMY_KEY: Record<string, string> = {
  shanzei: 'e_shanzei', ying: 'e_ying', daodun: 'e_daodun', qingqi: 'e_qingqi', duwei: 'e_boss',
};

class Field extends Phaser.Scene {
  sim: Sim;
  view: BattleView;
  private pathG!: Phaser.GameObjects.Graphics;
  private fx!: Phaser.GameObjects.Graphics;
  private sprites = new Map<string, Phaser.GameObjects.Image>();
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private fades: { img: Phaser.GameObjects.Image; weapon: Phaser.GameObjects.Rectangle; life: number }[] = [];
  private ready = false;

  constructor(sim: Sim, view: BattleView) {
    super('field');
    this.sim = sim;
    this.view = view;
  }

  preload() {
    const add = (key: string, file: string) => this.load.image(key, `assets/sprites/${file}`);
    this.load.image('map', 'assets/map/map_full.jpg');
    add('gate', 'gate.png');
    add('pad', 'pad_earth.png');
    add('soldier', 'u_qiangbing.png');
    add('t_jianlou', 't_jianlou.png');
    add('t_toushi', 't_toushi.png');
    add('t_junqi', 't_junqi.png');
    add('t_juma', 't_juma.png');
    add('t_qiangbing', 't_qiangbing.png');
    add('t_huoyou', 't_huoyou.png');
    add('t_fenghuo', 't_fenghuo.png');
    add('t_chuangnu', 't_chuangnu.png');
    add('e_shanzei', 'e_shanzei.png');
    add('e_ying', 'e_chihouying.png');
    add('e_daodun', 'e_daodun.png');
    add('e_qingqi', 'e_qingqi.png');
    add('e_boss', 'e_dijiang.png');
    add('p_guanyu', 'b_guanyu.png');
    add('p_ssx', 'b_sunshangxiang.png');
  }

  create() {
    if (!this.textures.exists('luanbing')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0x8a5a3a, 1);
      g.fillCircle(32, 18, 12);
      g.fillRoundedRect(18, 28, 28, 30, 6);
      g.fillRect(22, 56, 8, 14);
      g.fillRect(34, 56, 8, 14);
      g.generateTexture('luanbing', 64, 74);
      g.destroy();
    }
    const bg = this.add.image(360, 480, 'map');
    bg.setDisplaySize(720, 960);
    if (this.sim.map.id === 'M1b') bg.setFlipX(true);
    this.pathG = this.add.graphics();
    this.drawPath();
    this.fx = this.add.graphics();
    for (const pad of this.sim.map.pads) {
      const img = this.add.image(px(pad.x), py(pad.y), 'pad').setDisplaySize(54, 54);
      img.setAlpha(0.92);
      this.add.text(px(pad.x), py(pad.y) - 2, '+', {
        fontFamily: 'serif', fontSize: '28px', color: '#fff6d8',
      }).setOrigin(0.5);
    }
    const gate = this.add.image(px(this.sim.map.gate.x), py(this.sim.map.gate.y) + 8, 'gate');
    gate.setDisplaySize(150, 150);
    gate.setOrigin(0.5, 0.78);
    this.ready = true;
  }

  private drawPath() {
    const g = this.pathG;
    g.clear();
    const pts = this.sim.map.path;
    g.lineStyle(50, 0x8b6438, 0.35);
    g.beginPath();
    g.moveTo(px(pts[0]!.x), py(pts[0]!.y));
    for (const p of pts) g.lineTo(px(p.x), py(p.y));
    g.strokePath();
    g.lineStyle(26, 0xd7b98a, 0.28);
    g.beginPath();
    g.moveTo(px(pts[0]!.x), py(pts[0]!.y));
    for (const p of pts) g.lineTo(px(p.x), py(p.y));
    g.strokePath();
  }

  update(_time: number, _delta: number) {
    if (!this.ready) return;
    const alpha = (this.game as Phaser.Game & { __alpha?: number }).__alpha ?? 1;
    this.fx.clear();
    this.drawZones();
    this.drawRange();
    this.syncTowers();
    this.syncSoldiers(alpha);
    this.syncEnemies(alpha);
    this.syncHeroes(alpha);
    this.tickFades();
  }

  playEvents(events: SimEvent[]) {
    for (const ev of events) {
      if (ev.type === 'rout' && typeof ev.x === 'number' && typeof ev.y === 'number') {
        const key = ENEMY_KEY[String(ev.defId)] ?? 'luanbing';
        if (!this.textures.exists(key)) continue;
        const img = this.add.image(px(ev.x), py(ev.y), key).setDisplaySize(52, 64);
        const weapon = this.add.rectangle(px(ev.x) + 8, py(ev.y) + 10, 16, 4, 0x6b4a2a);
        this.fades.push({ img, weapon, life: 1 });
      }
      if (ev.type === 'shot' && typeof ev.x === 'number' && typeof ev.y === 'number') {
        const bolt = this.add.circle(px(ev.x), py(ev.y) - 20, 4, 0xf2d48a).setDepth(5);
        this.tweens.add({ targets: bolt, alpha: 0, y: bolt.y - 16, duration: 180, onComplete: () => bolt.destroy() });
      }
    }
  }

  private drawZones() {
    for (const z of this.sim.state.zones) {
      const color = z.damageType === 'fire' || z.kind === 'fireline' ? 0xe25a2a : z.kind === 'pulse' ? 0xf0d080 : 0x8d8a78;
      this.fx.fillStyle(color, 0.28);
      this.fx.fillCircle(px(z.x), py(z.y), z.radius * CELL);
    }
  }

  private drawRange() {
    const rings = [this.view.range, this.view.aim].filter((r): r is { x: number; y: number; r: number } => !!r);
    rings.forEach((ring, i) => {
      this.fx.lineStyle(2, i === 0 ? 0xf0d48a : 0xfff6d2, 0.9);
      this.fx.strokeCircle(px(ring.x), py(ring.y), ring.r * CELL);
      this.fx.fillStyle(i === 0 ? 0xf0d48a : 0xfff6d2, 0.08);
      this.fx.fillCircle(px(ring.x), py(ring.y), ring.r * CELL);
    });
  }

  private syncTowers() {
    const live = new Set<string>();
    for (const tower of this.sim.state.towers) {
      const key = `tw-${tower.id}`;
      live.add(key);
      const tex = TOWER_KEY[tower.defId] ?? 't_jianlou';
      let img = this.sprites.get(key);
      if (!img) {
        img = this.add.image(px(tower.x), py(tower.y), this.textures.exists(tex) ? tex : 'pad');
        img.setDepth(3);
        this.sprites.set(key, img);
      }
      img.setPosition(px(tower.x), py(tower.y) - 6);
      img.setDisplaySize(78, 78);
      if (tower.damagedUntil > this.sim.state.time) img.setTint(0x888888);
      else img.clearTint();
      if (this.view.selectedTower === tower.id) {
        this.fx.lineStyle(3, 0xffe7a3, 1);
        this.fx.strokeCircle(px(tower.x), py(tower.y), 36);
      }
      this.tag(key, `${tower.level}`, px(tower.x), py(tower.y) + 28);
    }
    this.dropMissing('tw-', live);
  }

  private syncSoldiers(alpha: number) {
    const live = new Set<string>();
    for (const sol of this.sim.state.soldiers) {
      if (sol.downUntil > this.sim.state.time) continue;
      const key = `sol-${sol.id}`;
      live.add(key);
      let img = this.sprites.get(key);
      if (!img) {
        img = this.add.image(0, 0, 'soldier').setDepth(4);
        this.sprites.set(key, img);
      }
      const x = sol.px + (sol.x - sol.px) * alpha;
      const y = sol.py + (sol.y - sol.py) * alpha;
      img.setPosition(px(x), py(y));
      img.setDisplaySize(40, 48);
    }
    this.dropMissing('sol-', live);
  }

  private syncEnemies(alpha: number) {
    const live = new Set<string>();
    for (const e of this.sim.state.enemies) {
      if (!e.alive) continue;
      const key = `en-${e.id}`;
      live.add(key);
      const tex = ENEMY_KEY[e.defId] ?? 'luanbing';
      let img = this.sprites.get(key);
      if (!img) {
        img = this.add.image(0, 0, this.textures.exists(tex) ? tex : 'luanbing').setDepth(6);
        this.sprites.set(key, img);
      }
      const x = e.px + (e.x - e.px) * alpha;
      const y = e.py + (e.y - e.py) * alpha;
      const bob = Math.sin(this.sim.state.time * 8 + e.id) * 2;
      img.setPosition(px(x), py(y) + bob);
      const size = (e.boss ? 84 : 52) * (e.elite ? 1.15 : 1);
      img.setDisplaySize(size, size * 1.15);
      if (e.elite) img.setTint(0xffe08a);
      else img.clearTint();
      this.bar(px(x), py(y) - size * 0.62, e);
    }
    this.dropMissing('en-', live);
  }

  private bar(x: number, y: number, e: EnemyState) {
    const w = e.boss ? 70 : 36;
    this.fx.fillStyle(0x1a120c, 0.8);
    this.fx.fillRect(x - w / 2, y, w, 5);
    const pct = Math.max(0, e.hp / e.maxHp);
    this.fx.fillStyle(e.boss ? 0xc8281e : 0xd24a3a, 1);
    this.fx.fillRect(x - w / 2, y, w * pct, 5);
    if (e.maxShield > 0) {
      this.fx.fillStyle(0x87b4d6, 1);
      this.fx.fillRect(x - w / 2, y - 3, w * Math.max(0, e.shield / e.maxShield), 3);
    }
  }

  private syncHeroes(alpha: number) {
    const live = new Set<string>();
    for (const hero of this.sim.state.heroes) {
      const key = `he-${hero.id}`;
      live.add(key);
      const def = heroById(hero.defId);
      const tex = def.id === 'guanyu' ? 'p_guanyu' : def.id === 'sunshangxiang' ? 'p_ssx' : '';
      let img = this.sprites.get(key);
      if (!img) {
        if (tex && this.textures.exists(tex)) img = this.add.image(0, 0, tex);
        else {
          if (!this.textures.exists(`blob-${def.id}`)) {
            const g = this.make.graphics({}, false);
            g.fillStyle(Number.parseInt(def.color.slice(1), 16), 1);
            g.fillCircle(24, 24, 22);
            g.generateTexture(`blob-${def.id}`, 48, 48);
            g.destroy();
          }
          img = this.add.image(0, 0, `blob-${def.id}`);
        }
        img.setDepth(7);
        this.sprites.set(key, img);
      }
      const x = hero.px + (hero.x - hero.px) * alpha;
      const y = hero.py + (hero.y - hero.py) * alpha;
      img.setPosition(px(x), py(y));
      img.setDisplaySize(46, 46);
      img.setAlpha(hero.downUntil > this.sim.state.time ? 0.35 : 1);
      if (this.view.selectedHero === hero.id) {
        this.fx.lineStyle(3, 0xffe7a3, 1);
        this.fx.strokeCircle(px(x), py(y), 28);
      }
      this.tag(key, def.name, px(x), py(y) + 30);
    }
    this.dropMissing('he-', live);
  }

  private tag(key: string, text: string, x: number, y: number) {
    let label = this.labels.get(key);
    if (!label) {
      label = this.add.text(x, y, text, {
        fontFamily: '"Noto Serif SC", serif', fontSize: '14px', color: '#fff6df',
        stroke: '#1a120c', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(8);
      this.labels.set(key, label);
    }
    label.setText(text);
    label.setPosition(x, y);
  }

  private dropMissing(prefix: string, live: Set<string>) {
    for (const [key, img] of this.sprites) {
      if (!key.startsWith(prefix) || live.has(key)) continue;
      img.destroy();
      this.sprites.delete(key);
      this.labels.get(key)?.destroy();
      this.labels.delete(key);
    }
    if (prefix === 'tw-' || prefix === 'sol-' || prefix === 'en-') {
      for (const [key, label] of this.labels) {
        if (key.startsWith(prefix) && !live.has(key)) {
          label.destroy();
          this.labels.delete(key);
        }
      }
    }
  }

  private tickFades() {
    for (const fade of this.fades) {
      fade.life -= 0.04;
      fade.img.setAlpha(Math.max(0, fade.life));
      fade.img.y -= 0.6;
      fade.weapon.y += 0.8;
      fade.weapon.setAlpha(Math.max(0, fade.life));
    }
    this.fades = this.fades.filter((f) => {
      if (f.life > 0) return true;
      f.img.destroy();
      f.weapon.destroy();
      return false;
    });
  }
}

export interface BattleSession {
  destroy: () => void;
}

export function mountBattle(parent: HTMLElement, sim: Sim, view: BattleView, hooks: BattleHooks): BattleSession {
  const scene = new Field(sim, view);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 720,
    height: 960,
    backgroundColor: '#1a140f',
    banner: false,
    scale: {
      mode: Phaser.Scale.EXPAND,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 720,
      height: 960,
    },
    scene,
  });
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
    const frozen = document.hidden || sim.state.paused || sim.state.phase === 'decree' || sim.state.phase === 'victory' || sim.state.phase === 'defeat';
    if (frozen) acc = 0;
    else {
      acc += dt;
      let steps = 0;
      const events: SimEvent[] = [];
      while (acc >= 1000 / 30 && steps < 5) {
        step(sim);
        events.push(...sim.events);
        sim.events = [];
        acc -= 1000 / 30;
        steps += 1;
        saveTick += 1;
      }
      if (steps >= 5) acc = 0;
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
    destroy() {
      dead = true;
      cancelAnimationFrame(raf);
      game.destroy(true);
    },
  };
}
