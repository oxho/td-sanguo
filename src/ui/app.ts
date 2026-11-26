import {
  BOSSES, CARDS, CHAPTERS, DECREES, ENEMIES, GACHA, HEROES, LEVELS, PACTS, PRIORITY_NAME,
  heroById, levelMeta, towerById, towerStat,
} from '../data/catalog';
import { zh } from '../data/i18n/zh-CN';
import { bondBetween, bondsFor } from '../core/bonds';
import { pull } from '../core/gacha';
import { grantRewards, levelUnlocked, starsOf, unlocks } from '../core/progress';
import { createRun, dispatch, previewWave, towerReadout, type Command, type Sim } from '../core/sim';
import { gateUpgradeCost } from '../core/formula';
import type { RunState } from '../core/types';
import { mountBattle, type BattleSession, type BattleView } from '../render/battle';
import { clearAll, clearRun, exportMeta, importMeta, loadMeta, loadRun, saveMeta, saveRun } from '../platform/web/storage';

type Route =
  | { name: 'menu' }
  | { name: 'levels' }
  | { name: 'prepare'; levelId: string }
  | { name: 'gacha' }
  | { name: 'heroes' }
  | { name: 'hero'; id: string }
  | { name: 'codex' }
  | { name: 'settings' }
  | { name: 'result'; levelId: string; victory: boolean; state: RunState };

export function boot() {
  const app = document.querySelector('#app');
  if (!app) return;
  const fitHost = document.createElement('div');
  fitHost.id = 'fit';
  const frame = document.createElement('div');
  frame.id = 'frame';
  fitHost.appendChild(frame);
  app.appendChild(fitHost);
  const fit = () => {
    const vw = Math.min(window.innerWidth, window.visualViewport?.width ?? window.innerWidth);
    const vh = Math.min(window.innerHeight, window.visualViewport?.height ?? window.innerHeight);
    const s = Math.min(vw / 720, vh / 1280);
    fitHost.style.width = `${720 * s}px`;
    fitHost.style.height = `${1280 * s}px`;
    frame.style.setProperty('zoom', String(s));
  };
  window.addEventListener('resize', fit);
  window.visualViewport?.addEventListener('resize', fit);
  fit();

  let meta = loadMeta();
  let route: Route = { name: 'menu' };
  let lastReward: ReturnType<typeof grantRewards> | null = null;
  let session: BattleSession | null = null;
  let toastTimer = 0;

  const go = (next: Route) => {
    session?.destroy();
    session = null;
    route = next;
    draw();
  };
  const toast = (text: string) => {
    let el = frame.querySelector<HTMLElement>('#toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      frame.appendChild(el);
    }
    el.textContent = text;
    el.style.display = 'block';
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { el!.style.display = 'none'; }, 1600);
  };
  const persist = () => saveMeta(meta);

  const nav = (active: string) => `
    <nav class="nav">
      ${navBtn('menu', '舆', '舆图', active)}
      ${navBtn('heroes', '将', '武将', active)}
      ${navBtn('gacha', '点', '点将台', active)}
      ${navBtn('settings', '设', '设置', active)}
    </nav>`;

  function draw() {
    if (route.name === 'menu') drawMenu();
    else if (route.name === 'levels') drawLevels();
    else if (route.name === 'prepare') drawPrepare(route.levelId);
    else if (route.name === 'gacha') drawGacha();
    else if (route.name === 'heroes') drawHeroes();
    else if (route.name === 'hero') drawHero(route.id);
    else if (route.name === 'codex') drawCodex();
    else if (route.name === 'settings') drawSettings();
    else if (route.name === 'result' && lastReward) drawResult(lastReward);
  }

  function drawMenu() {
    const stars = LEVELS.filter((l) => l.playable).reduce((n, l) => n + (meta.levels[l.id]?.stars ?? 0), 0);
    const next = LEVELS.find((l) => l.playable && levelUnlocked(meta, l.id) && (meta.levels[l.id]?.clears ?? 0) === 0);
    const pending = loadRun();
    frame.innerHTML = `
      <div class="screen">
        <header class="topbar">
          <div class="pill">守将</div>
          <div class="grow"></div>
          <div class="pill">${zh.talisman} ${meta.talisman}</div>
        </header>
        <div class="grow center">
          <h1 class="msz" style="font-size:64px;margin-top:18px">三国<span class="dot">·</span>烽火城关</h1>
          <div class="panel" style="display:inline-block;margin-top:12px;padding:8px 22px">${zh.chapter1}</div>
          <p class="muted">边关守将招募名将，守住城门。敌人只是乱军、山贼和斥候鹰。</p>
          <div class="grid2" style="margin-top:28px">
            <button class="btn ink" data-go="heroes" style="min-height:120px">武将<br><span class="small">已有 ${meta.heroes.length} 人</span></button>
            <button class="btn ink" data-go="gacha" style="min-height:120px">点将台<br><span class="small">${meta.firstSingleFree ? '首次单抽免费' : `虎符 ${meta.talisman}`}</span></button>
          </div>
          <button class="btn" data-go="levels" style="width:100%;min-height:92px;margin-top:22px;font-size:32px">${zh.march}</button>
          <p>${next ? `下一关 ${next.id} ${next.name}` : '第一章可玩关卡都已打过'}</p>
          <p class="muted">本章星数 ${stars}/15 · 只开放 1-1 至 1-5</p>
          ${meta.dailyChallengeUnlocked ? '<p class="note">每日挑战已在存档中标记，入口后续版本开放。</p>' : ''}
        </div>
        ${nav('menu')}
        ${pending ? `<div class="modal"><div class="panel">
          <h2>继续上局</h2>
          <p>有一局打到 ${pending.sim.state.levelId} 的本地快照。${pending.recovered ? '快照已回到波前检查点。' : '会停在中断时刻，点继续再开战。'}</p>
          <p class="note">【临时默认，非已定】恢复到中断时刻并暂停。</p>
          <div class="row" style="margin-top:12px">
            <button class="btn" id="resume-run">继续上局</button>
            <button class="btn ink" id="drop-run">放弃</button>
          </div>
        </div></div>` : ''}
      </div>`;
    bindNav();
    frame.querySelector('#resume-run')?.addEventListener('click', () => {
      const loaded = loadRun();
      if (!loaded) return;
      openBattle(loaded.sim, true, loaded.prewave);
    });
    frame.querySelector('#drop-run')?.addEventListener('click', () => { clearRun(); draw(); });
  }

  function drawLevels() {
    const playable = LEVELS.filter((l) => l.chapter === 1);
    let selected = playable.find((l) => levelUnlocked(meta, l.id) && l.playable)?.id ?? '1-1';
    const spots = [[12, 82], [32, 82], [52, 74], [70, 62], [52, 52], [32, 44], [16, 34], [36, 26], [58, 18], [76, 8]];
    const paint = () => {
      const row = levelMeta(selected);
      const rec = meta.levels[selected];
      const open = levelUnlocked(meta, selected);
      frame.innerHTML = `
        <div class="screen">
          <header class="topbar">
            <button class="btn ink" data-go="menu">返回</button>
            <div class="grow center"><strong>选择关卡</strong></div>
            <div class="pill">${zh.talisman} ${meta.talisman}</div>
          </header>
          <div class="tabs" style="padding:8px 12px">
            ${CHAPTERS.map((c) => `<button class="btn ${c.id === 1 ? '' : 'ink dis'}" ${c.id === 1 ? '' : 'disabled'}>${c.numeral} · ${c.name}${c.id === 1 ? '' : ' 未开放'}</button>`).join('')}
          </div>
          <div class="grow">
            <h2 class="msz" style="font-size:36px">${zh.chapter1}</h2>
            <div class="nodes panel">
              ${playable.map((l, i) => {
                const spot = spots[i] ?? [50, 50];
                const unlocked = levelUnlocked(meta, l.id);
                const kind = l.kind === '精英' ? 'elite' : l.kind === 'Boss' ? 'boss' : '';
                const stars = '★'.repeat(meta.levels[l.id]?.stars ?? 0);
                return `<button class="node btn ${kind} ${unlocked ? '' : 'lock'} ${l.id === selected ? 'sel' : ''}" data-level="${l.id}" style="left:${spot[0]}%;top:${spot[1]}%"><span>${l.id.split('-')[1]}${unlocked ? '' : ' 锁'}</span></button><div class="stars" style="position:absolute;left:${spot[0]}%;top:calc(${spot[1]}% + 96px)">${stars}</div>`;
              }).join('')}
            </div>
            <div class="panel" style="margin-top:10px">
              <div class="row">
                <strong style="font-size:28px">${row.id} ${row.name}</strong>
                <span class="muted">${row.kind} · ${loadWaveCount(row.id)} 波 · 初始军资 ${row.munition}</span>
              </div>
              <p class="small">${row.blurb}</p>
              <p class="small">三星：通关，且城门生命 ≥ 50%，且${row.star3Text}</p>
              ${row.id === '1-5' ? '<p class="note">【临时默认，非已定】“建塔不超过 10 座”按本关曾经建造的座次数计，卖掉也算。</p>' : ''}
              <button class="btn" id="go-prep" ${open ? '' : 'disabled'}>${open ? '出征' : '未解锁'}</button>
            </div>
          </div>
          ${nav('menu')}
        </div>`;
      bindNav();
      frame.querySelectorAll<HTMLButtonElement>('[data-level]').forEach((btn) => {
        btn.addEventListener('click', () => { selected = btn.dataset.level ?? selected; paint(); });
      });
      frame.querySelector('#go-prep')?.addEventListener('click', () => {
        if (!levelUnlocked(meta, selected)) return;
        go({ name: 'prepare', levelId: selected });
      });
    };
    paint();
  }

  function drawPrepare(levelId: string) {
    const row = levelMeta(levelId);
    const u = unlocks(meta);
    const pickedH: string[] = meta.heroes.filter((id) => id === 'huangzhong' || id === 'machao').slice(0, 2);
    if (pickedH.length < 2) {
      for (const id of meta.heroes) if (!pickedH.includes(id) && pickedH.length < 2) pickedH.push(id);
    }
    const pickedC = u.cards.slice(0, u.slots);
    const paint = () => {
      const bond = pickedH.length === 2 ? bondBetween(pickedH[0]!, pickedH[1]!) : null;
      frame.innerHTML = `
        <div class="screen">
          <header class="topbar"><button class="btn ink" data-go="levels">返回</button><div class="grow center">${row.id} ${row.name}</div></header>
          <div class="grow">
            <h2>出战准备</h2>
            <p class="small">最多 2 位武将，谋略卡 ${u.slots} 张。本关塔最高 Lv${levelId === '1-4' || levelId === '1-5' ? 6 : 3}。</p>
            ${!meta.tutorial.tip13 && levelId === '1-3' ? '<div class="panel"><strong>第二张谋略卡</strong><p class="small">从这一关起可以带 2 张谋略卡。万箭齐发已经解锁。点空白取消预览，不算使用，也不进冷却。</p><button class="btn" id="tip13">知道了</button></div>' : ''}
            <h3>武将 ${bond?.name ? `· 羁绊 ${bond.name}` : ''}</h3>
            <div class="wrap" id="hero-picks">
              ${HEROES.map((h) => {
                const owned = meta.heroes.includes(h.id);
                const on = pickedH.includes(h.id);
                return `<button class="card ${on ? 'sel' : ''}" data-hero="${h.id}" ${owned ? '' : 'disabled'} style="width:150px">
                  <div class="hero-face" style="background:${h.portrait ? `url(assets/sprites/${h.portrait}) center/cover` : h.color}">${h.portrait ? '' : h.name.slice(0, 1)}</div>
                  <div>${h.name}</div><div class="small">${h.rarity === 'legendary' ? '传说' : h.rarity === 'epic' ? '史诗' : '稀有'} · ${h.faction}</div>
                  ${owned ? '' : '<div class="small">未招募</div>'}
                </button>`;
              }).join('')}
            </div>
            <h3>谋略卡</h3>
            <div class="wrap">
              ${CARDS.map((c) => {
                const on = pickedC.includes(c.id);
                const open = u.cards.includes(c.id);
                return `<button class="card ${on ? 'sel' : ''}" data-card="${c.id}" ${open ? '' : 'disabled'} style="width:200px"><strong>${c.name}</strong><div class="small">${open ? c.text : `${c.unlock} 解锁`}</div></button>`;
              }).join('')}
            </div>
            <p class="note">【临时默认，非已定】新档赠送黄忠、马超，首次单抽免费。点头像放主动技，点英雄本人再点格子派遣。</p>
            <button class="btn" id="start-battle" style="width:100%;min-height:72px;margin-top:12px">出征</button>
          </div>
        </div>`;
      frame.querySelector('[data-go]')?.addEventListener('click', () => go({ name: 'levels' }));
      frame.querySelector('#tip13')?.addEventListener('click', () => { meta.tutorial.tip13 = true; persist(); paint(); });
      frame.querySelectorAll<HTMLButtonElement>('[data-hero]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.hero!;
          const i = pickedH.indexOf(id);
          if (i >= 0) pickedH.splice(i, 1);
          else if (pickedH.length < 2) pickedH.push(id);
          else toast('最多上阵 2 位');
          paint();
        });
      });
      frame.querySelectorAll<HTMLButtonElement>('[data-card]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.card!;
          const i = pickedC.indexOf(id);
          if (i >= 0) pickedC.splice(i, 1);
          else if (pickedC.length < u.slots) pickedC.push(id);
          else toast(`最多带 ${u.slots} 张`);
          paint();
        });
      });
      frame.querySelector('#start-battle')?.addEventListener('click', () => {
        clearRun();
        const sim = createRun({
          seed: meta.rng,
          levelId,
          heroes: pickedH.slice(),
          cards: pickedC.slice(),
          allowedTowers: u.towers,
        });
        meta.rng = (Math.imul(meta.rng, 1664525) + 1013904223) >>> 0;
        persist();
        openBattle(sim, false, structuredClone(sim.state));
      });
    };
    paint();
  }

  function openBattle(sim: Sim, resumed: boolean, prewave: RunState | null) {
    session?.destroy();
    const view: BattleView = { range: null, aim: null, selectedTower: null, selectedHero: null };
    let stepName: 'build' | 'start' | 'upgrade' | 'card' | 'done' = 'done';
    if (sim.state.levelId === '1-1' && !meta.tutorial.done11 && !meta.tutorial.skipped && !resumed) {
      stepName = 'build';
      dispatch(sim, { type: 'hold', on: true });
    }
    let builtId = 0;
    let aiming = false;
    let aim = { x: 4, y: 8 };
    let sig = '';
    let ended = false;
    frame.innerHTML = `
      <div class="battle">
        <div class="map-slot"><div id="phaser" style="width:720px;height:960px"></div><div class="map-hit" id="hit"></div></div>
        <div class="hud">
          <div class="battle-top" id="top"></div>
          <div id="banners"></div>
          <div class="wavebar" id="wave"></div>
          <div class="actionbar" id="bar"></div>
          <div id="overlay"></div>
          <div id="toast" class="toast" style="display:none"></div>
        </div>
      </div>`;
    const top = frame.querySelector<HTMLElement>('#top')!;
    const wave = frame.querySelector<HTMLElement>('#wave')!;
    const bar = frame.querySelector<HTMLElement>('#bar')!;
    const overlay = frame.querySelector<HTMLElement>('#overlay')!;
    const hit = frame.querySelector<HTMLElement>('#hit')!;
    const phaserEl = frame.querySelector<HTMLElement>('#phaser')!;

    const cellOf = (ev: PointerEvent) => {
      const rect = hit.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 720;
      const y = ((ev.clientY - rect.top) / rect.height) * 960;
      return { x: (x - 90) / 60, y: y / 60 };
    };
    const say = (text: string) => {
      const el = frame.querySelector<HTMLElement>('#toast')!;
      el.textContent = text;
      el.style.display = 'block';
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => { el.style.display = 'none'; }, 1400);
    };
    const act = (cmd: Command) => {
      const res = dispatch(sim, cmd);
      if (!res.ok && res.reason) say(res.reason);
      return res;
    };

    const finish = () => {
      if (ended) return;
      ended = true;
      const victory = sim.state.phase === 'victory';
      if (sim.state.levelId === '1-1') meta.tutorial.done11 = true;
      lastReward = grantRewards(meta, sim.state);
      persist();
      clearRun();
      const snapshot = sim.state;
      session?.destroy();
      session = null;
      route = { name: 'result', levelId: snapshot.levelId, victory, state: snapshot };
      drawResult(lastReward);
    };

    let lastPrewave = prewave;
    session = mountBattle(phaserEl, sim, view, {
      onEvents: (events) => {
        if (events.some((e) => e.type === 'prep')) lastPrewave = structuredClone(sim.state);
        if (events.some((e) => e.type === 'prep' || e.type === 'autosave' || e.type === 'wave')) {
          if (sim.state.phase !== 'victory' && sim.state.phase !== 'defeat') saveRun(sim, lastPrewave);
        }
        for (const ev of events) if (ev.type === 'toast' && ev.text) say(String(ev.text));
      },
      onFrame: () => paint(),
      onEnd: () => finish(),
    });
    saveRun(sim, lastPrewave);

    document.onvisibilitychange = () => {
      if (document.hidden && session && !ended) {
        sim.state.paused = true;
        saveRun(sim, lastPrewave);
        paint();
      }
    };

    hit.addEventListener('pointermove', (ev) => {
      if (!aiming) return;
      const c = cellOf(ev);
      aim = { x: c.x, y: c.y - 1 };
      view.aim = { ...aim, r: CARDS.find((c0) => c0.id === sim.state.cards[aimIndex]?.id)?.radius ?? 1.67 };
    });
    hit.addEventListener('pointerup', (ev) => {
      const c = cellOf(ev);
      if (aiming) {
        aim = { x: c.x, y: c.y - 1 };
        view.aim = { ...aim, r: view.aim?.r ?? 1.67 };
        return;
      }
      pickMap(c.x, c.y);
    });

    let aimIndex = 0;
    function pickMap(x: number, y: number) {
      if (stepName === 'start') return;
      if (view.selectedHero) {
        const hero = sim.state.heroes.find((h) => h.id === view.selectedHero);
        if (hero && Math.hypot(hero.x - x, hero.y - y) > 0.75) {
          const res = act({ type: 'move', hero: hero.id, x, y });
          if (res.ok) view.selectedHero = null;
          return;
        }
      }
      const hero = sim.state.heroes.find((h) => Math.hypot(h.x - x, h.y - y) <= 0.75);
      if (hero) {
        view.selectedHero = hero.id;
        view.selectedTower = null;
        view.range = null;
        if (!meta.tutorial.tipHero) { meta.tutorial.tipHero = true; persist(); say('点头像放主动技。再点格子派遣。临时默认'); }
        return;
      }
      const tower = sim.state.towers.find((t) => Math.hypot(t.x - x, t.y - y) <= 0.7);
      if (tower) {
        view.selectedTower = tower.id;
        view.selectedHero = null;
        const st = towerStat(tower.defId, tower.level, tower.branch);
        view.range = { x: tower.x, y: tower.y, r: st.range };
        return;
      }
      const pad = nearestPad(x, y);
      if (pad && !sim.state.towers.some((t) => t.padId === pad.id)) {
        view.selectedTower = null;
        view.selectedHero = null;
        if (overlay.dataset.pad !== pad.id) {
          delete overlay.dataset.choice;
          view.range = null;
        }
        overlay.dataset.pad = pad.id;
        sig = '';
        return;
      }
      view.selectedTower = null;
      view.selectedHero = null;
      view.range = null;
      delete overlay.dataset.pad;
      delete overlay.dataset.choice;
    }

    function nearestPad(x: number, y: number) {
      return sim.map.pads.find((p) => Math.hypot(p.x - x, p.y - y) <= 0.75) ?? null;
    }

    let chromeKey = '';
    function paint() {
      const s = sim.state;
      const total = sim.level.waves.length;
      const waveNo = Math.min(total, s.waveIndex + 1);
      const key = [s.phase, stepName, s.pendingPact ?? '', s.pact ?? '', s.gate.level, s.waveIndex, s.cards.length, s.heroes.length].join('|');
      if (key !== chromeKey) {
        chromeKey = key;
        buildChrome();
      }
      const hpPct = Math.max(0, s.gate.hp / s.gate.maxHp);
      const hp = frame.querySelector<HTMLElement>('#hp-text');
      const fill = frame.querySelector<HTMLElement>('#hp-fill');
      const gold = frame.querySelector<HTMLElement>('#gold-text');
      const waveLabel = frame.querySelector<HTMLElement>('#wave-label');
      const preview = frame.querySelector<HTMLElement>('#preview');
      const startBtn = frame.querySelector<HTMLButtonElement>('#btn-start');
      if (hp) hp.textContent = `${Math.ceil(s.gate.hp)}/${s.gate.maxHp}`;
      if (fill) fill.style.width = `${hpPct * 100}%`;
      if (gold) gold.textContent = String(Math.floor(s.munition));
      if (waveLabel) waveLabel.textContent = `第 ${waveNo}/${total} 波 ${levelMeta(s.levelId).name}`;
      if (preview) {
        const icons = previewWave(sim).map((n) => `${n.name}${n.boss ? '!' : ''}×${n.count}`).join(' ');
        preview.textContent = icons || '—';
      }
      if (startBtn) {
        const secondsLeft = s.phase === 'prep' ? Math.max(0, Math.floor(s.countdown + 1e-6)) : 0;
        const bonus = secondsLeft * 2;
        startBtn.disabled = s.phase !== 'prep' || stepName === 'build';
        const main = startBtn.querySelector<HTMLElement>('#start-main');
        const extra = startBtn.querySelector<HTMLElement>('#start-bonus');
        if (main) main.textContent = s.phase === 'prep' ? '开始下一波' : '交战中';
        if (extra) extra.textContent = bonus > 0 ? `提前 +${bonus}` : '';
      }
      s.cards.forEach((card, i) => {
        const btn = bar.querySelector<HTMLButtonElement>(`[data-card="${i}"]`);
        if (!btn) return;
        const left = Math.max(0, card.cdUntil - s.time);
        const blocked = s.pact === 'fengmou' && s.phase === 'combat';
        const locked = stepName === 'build' || stepName === 'start' || stepName === 'upgrade';
        btn.disabled = left > 0 || blocked || locked;
        let cd = btn.querySelector<HTMLElement>('.cd');
        if (left > 0 || blocked) {
          if (!cd) { cd = document.createElement('div'); cd.className = 'cd'; btn.appendChild(cd); }
          cd.textContent = blocked ? '封谋' : String(Math.ceil(left));
        } else cd?.remove();
      });
      s.heroes.forEach((hero) => {
        const btn = bar.querySelector<HTMLButtonElement>(`[data-skill="${hero.id}"]`);
        if (!btn) return;
        const left = Math.max(0, hero.skillReadyAt - s.time);
        const down = hero.downUntil > s.time;
        btn.disabled = left > 0 || down;
        let cd = btn.querySelector<HTMLElement>('.cd');
        if (left > 0 || down) {
          if (!cd) { cd = document.createElement('div'); cd.className = 'cd'; btn.appendChild(cd); }
          cd.textContent = down ? '倒地' : String(Math.ceil(left));
        } else cd?.remove();
      });
      const gateBtn = frame.querySelector<HTMLElement>('#gate-cost');
      if (gateBtn) gateBtn.textContent = s.gate.level >= 8 ? '满级' : `升级 ${gateUpgradeCost(s.gate.level)}`;
      const host = frame.querySelector<HTMLElement>('#banners')!;
      const banner = s.banners[s.banners.length - 1];
      const bannerText = banner?.text ?? '';
      if (host.dataset.text !== bannerText) {
        host.dataset.text = bannerText;
        host.innerHTML = bannerText ? `<div class="banner">${bannerText}</div>` : '';
      }
      const nextSig = [
        s.phase, s.paused, stepName, view.selectedTower, overlay.dataset.pad ?? '', overlay.dataset.choice ?? '', aiming ? 'aim' : '',
        s.decreeOffer?.join(',') ?? '', s.towers.map((t) => `${t.id}:${t.level}:${t.branch}:${t.priority}`).join('|'),
        overlay.dataset.debug ?? '',
      ].join('#');
      if (nextSig === sig) return;
      sig = nextSig;
      renderOverlay();
    }

    function buildChrome() {
      const s = sim.state;
      top.innerHTML = `
        <div class="pill">城门 <span id="hp-text"></span><span style="display:inline-block;width:70px;height:8px;background:#333;border-radius:4px;margin-left:6px"><i id="hp-fill" style="display:block;height:100%;width:0;background:#7dce6a"></i></span></div>
        <div class="pill">军资 <span id="gold-text"></span></div>
        <div class="grow center"><strong id="wave-label"></strong></div>
        <button class="btn ink" id="btn-pause">暂停</button>`;
      top.querySelector('#btn-pause')?.addEventListener('click', () => { s.paused = true; saveRun(sim, lastPrewave); sig = ''; });
      wave.innerHTML = `
        <div style="flex:1" class="small"><div>下一波</div><div id="preview"></div></div>
        <div class="wrap" id="pacts"></div>
        <button class="btn" id="btn-start"><span id="start-main">开始下一波</span><span id="start-bonus" class="small"></span></button>`;
      wave.querySelector('#btn-start')?.addEventListener('click', () => {
        if (stepName === 'build') return;
        const res = act({ type: 'start' });
        if (res.ok && stepName === 'start') {
          stepName = 'upgrade';
          dispatch(sim, { type: 'hold', on: false });
        }
      });
      const pactHost = wave.querySelector('#pacts')!;
      if (s.phase === 'prep' && stepName !== 'build') {
        for (const pact of PACTS) {
          const b = document.createElement('button');
          b.className = 'btn ink';
          b.textContent = s.pendingPact === pact.id ? `${pact.name} ✓` : pact.name;
          b.addEventListener('click', () => { act({ type: 'pact', id: s.pendingPact === pact.id ? null : pact.id }); chromeKey = ''; });
          pactHost.appendChild(b);
        }
      }
      bar.innerHTML = s.cards.map((card, i) => {
        const def = CARDS.find((c) => c.id === card.id)!;
        return `<button class="skill" data-card="${i}"><div class="small">${def.name}</div><div class="muted">${def.cd}秒</div></button>`;
      }).join('') + s.heroes.map((hero) => {
        const def = heroById(hero.defId);
        const face = def.portrait ? `background-image:url(assets/sprites/${def.portrait})` : `background:${def.color}`;
        return `<button class="skill" data-skill="${hero.id}" style="width:92px"><div class="hero-face" style="${face};margin:0 auto">${def.portrait ? '' : def.name.slice(0, 1)}</div><div class="small">${def.name}</div></button>`;
      }).join('') + `<button class="skill" id="btn-gate" style="margin-left:auto;width:120px"><div>城门 Lv${s.gate.level}</div><div class="small" id="gate-cost"></div></button>`;
      bar.querySelectorAll<HTMLButtonElement>('[data-card]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (stepName === 'build' || stepName === 'start' || stepName === 'upgrade') return;
          aiming = true;
          aimIndex = Number(btn.dataset.card);
          const def = CARDS.find((c) => c.id === s.cards[aimIndex]?.id);
          view.aim = { x: aim.x, y: aim.y, r: def?.radius ?? 1.67 };
          sig = '';
        });
      });
      bar.querySelectorAll<HTMLButtonElement>('[data-skill]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = Number(btn.dataset.skill);
          const res = act({ type: 'skill', hero: id });
          if (res.ok) {
            const who = s.heroes.find((h) => h.id === id);
            if (who) say(heroById(who.defId).skill);
          }
        });
      });
      bar.querySelector('#btn-gate')?.addEventListener('click', () => { act({ type: 'gate' }); chromeKey = ''; });
    }

    function renderOverlay() {
      const s = sim.state;
      overlay.innerHTML = '';
      if (s.phase === 'decree' && s.decreeOffer) {
        overlay.innerHTML = `<div class="modal"><div class="panel"><h2>军令</h2><p class="small">选一道，只在本局有效。可以跳过。</p>
          <div class="wrap">${s.decreeOffer.map((id) => {
            const def = DECREES.find((d) => d.id === id)!;
            return `<button class="card choice ${def.inert ? 'dis' : ''}" data-dec="${id}"><strong>${def.name}</strong><div class="small">${def.text}</div>${def.inert ? `<div class="note">${def.hint}</div>` : ''}</button>`;
          }).join('')}</div>
          <button class="btn ink" id="skip-dec">跳过</button></div></div>`;
        overlay.querySelectorAll<HTMLButtonElement>('[data-dec]').forEach((btn) => {
          btn.addEventListener('click', () => act({ type: 'decree', id: btn.dataset.dec ?? null }));
        });
        overlay.querySelector('#skip-dec')?.addEventListener('click', () => act({ type: 'decree', id: null }));
        return;
      }
      if (s.paused) {
        overlay.innerHTML = `<div class="modal"><div class="panel"><h2>暂停</h2>
          <div class="row"><button class="btn" id="resume">继续</button><button class="btn ink" id="giveup">放弃本局</button></div>
          <p class="small">放弃不发放本局虎符。</p></div></div>`;
        overlay.querySelector('#resume')?.addEventListener('click', () => { s.paused = false; sig = ''; });
        overlay.querySelector('#giveup')?.addEventListener('click', () => { clearRun(); go({ name: 'menu' }); });
        return;
      }
      if (aiming) {
        const def = CARDS.find((c) => c.id === s.cards[aimIndex]?.id);
        overlay.innerHTML = `<div class="float-panel panel"><strong>${def?.name ?? ''}</strong>
          <p class="small">圈在手指上方 1 格。点空白或取消不算使用，不进冷却。</p>
          <div class="row"><button class="btn" id="cast">施放</button><button class="btn ink" id="unaim">取消</button></div></div>`;
        overlay.querySelector('#cast')?.addEventListener('click', () => {
          const res = act({ type: 'card', index: aimIndex, x: aim.x, y: aim.y });
          if (res.ok && stepName === 'card') { stepName = 'done'; meta.tutorial.done11 = true; persist(); }
          if (res.ok || res.reason === '未命中敌人') { /* miss keeps the card ready */ }
          aiming = false;
          view.aim = null;
          sig = '';
        });
        overlay.querySelector('#unaim')?.addEventListener('click', () => { aiming = false; view.aim = null; sig = ''; });
        return;
      }
      if (stepName !== 'done') {
        const text = stepName === 'build' ? '点塔基，在环形菜单里选箭楼，看射程后再确认。'
          : stepName === 'start' ? '点「开始下一波」。提前开波每剩 1 秒 +2 军资。'
          : stepName === 'upgrade' ? '点刚才的箭楼，再点升级。'
          : '等敌人走进圈里，放火攻。取消或打空不进冷却。';
        overlay.insertAdjacentHTML('beforeend', '');
        const tip = document.createElement('div');
        tip.className = 'guide-tip panel';
        tip.innerHTML = `<strong>引导</strong><p class="small">${text}</p><button class="btn ink" id="skip-guide">跳过引导</button>`;
        overlay.appendChild(tip);
        tip.querySelector('#skip-guide')?.addEventListener('click', () => {
          stepName = 'done';
          meta.tutorial.skipped = true;
          meta.tutorial.done11 = true;
          dispatch(sim, { type: 'hold', on: false });
          persist();
          sig = '';
        });
      }
      const padId = overlay.dataset.pad;
      if (padId) {
        const u = unlocks(meta);
        const pad = sim.map.pads.find((p) => p.id === padId);
        if (pad) {
          const choice = overlay.dataset.choice ?? '';
          const origin = { x: 90 + pad.x * 60, y: 96 + pad.y * 60 };
          const laid = layoutRing(origin.x, origin.y, u.towers.length + 1, Boolean(choice));
          const slots = laid.icons;
          u.towers.forEach((id, i) => {
            const def = towerById(id);
            const poor = s.munition < def.cost;
            const btn = document.createElement('button');
            btn.className = `btn ring-btn${choice === id ? ' sel' : ''}${poor ? ' dis' : ''}`;
            btn.dataset.build = id;
            btn.disabled = poor;
            btn.style.left = `${slots[i]!.x - 45}px`;
            btn.style.top = `${slots[i]!.y - 45}px`;
            btn.innerHTML = `${def.name}<br>${def.cost}`;
            btn.addEventListener('click', () => {
              overlay.dataset.choice = id;
              view.range = { x: pad.x, y: pad.y, r: towerStat(id, 1, '').range };
              sig = '';
            });
            overlay.appendChild(btn);
          });
          const cancel = document.createElement('button');
          cancel.className = 'btn ink ring-btn';
          cancel.id = 'close-build';
          cancel.textContent = '取消';
          const cancelSlot = slots[u.towers.length]!;
          cancel.style.left = `${cancelSlot.x - 45}px`;
          cancel.style.top = `${cancelSlot.y - 45}px`;
          cancel.addEventListener('click', () => {
            delete overlay.dataset.pad;
            delete overlay.dataset.choice;
            view.range = null;
            sig = '';
          });
          overlay.appendChild(cancel);
          if (choice && u.towers.includes(choice)) {
            const ok = document.createElement('button');
            ok.className = 'btn ring-btn';
            ok.id = 'do-build';
            ok.textContent = '确认';
            ok.style.left = `${laid.center.x - 45}px`;
            ok.style.top = `${laid.center.y - 45}px`;
            ok.addEventListener('click', () => {
              const res = act({ type: 'build', padId, towerId: choice });
              if (!res.ok) return;
              if (stepName === 'build' && choice === 'jianlou') {
                builtId = s.towers[s.towers.length - 1]?.id ?? 0;
                stepName = 'start';
                dispatch(sim, { type: 'hold', on: true });
              }
              delete overlay.dataset.pad;
              delete overlay.dataset.choice;
              view.range = null;
              sig = '';
            });
            overlay.appendChild(ok);
          }
        }
      }
      const tower = s.towers.find((t) => t.id === view.selectedTower);
      if (tower) {
        const def = towerById(tower.defId);
        const read = towerReadout(tower);
        const cap = sim.cap;
        let cost = tower.level >= cap ? 0 : tower.level === 3 && cap >= 4 ? towerStat(tower.defId, 4, def.branches[0]?.id ?? '').upgradeCost : towerStat(tower.defId, tower.level + 1, tower.level >= 4 ? tower.branch : '').upgradeCost;
        if (s.decrees.includes('gongjiang') && cost) cost = Math.round(cost * 0.9);
        const showBranch = tower.level === 3 && cap >= 4;
        if (showBranch && !meta.tutorial.tip14 && s.levelId === '1-4') {
          meta.tutorial.tip14 = true; persist();
        }
        const box = document.createElement('div');
        box.className = 'float-panel panel';
        box.innerHTML = `<strong>${def.name} Lv${tower.level} ${def.branches.find((b) => b.id === tower.branch)?.name ?? ''}</strong>
          <p class="small">伤害 ${read.damage} · 攻速 ${read.aps}/秒 · 射程 ${read.range} 格 · 技能 ${read.skill}</p>
          <p class="small">目标 ${PRIORITY_NAME[tower.priority]} · 卖出 +${towerStat(tower.defId, tower.level, tower.branch).sell}</p>
          ${showBranch ? `<p class="note">${s.levelId === '1-4' ? '1-4 起要选分支，选完不能改，只能卖掉重造。' : ''}</p><div class="wrap">${def.branches.map((b) => `<button class="card choice" data-branch="${b.id}"><strong>${b.name}</strong><div class="small">${b.blurb}</div><div class="small">${b.skill} · ${b.skillText}</div><div>${cost} 军资</div></button>`).join('')}</div>` : ''}
          <div class="row">
            ${tower.level < cap && !showBranch ? `<button class="btn" id="do-up" ${s.munition < cost ? 'disabled' : ''}>升级 ${cost}</button>` : ''}
            <button class="btn ink" id="do-sell">卖出</button>
            <button class="btn ink" id="do-pri">攻击目标</button>
            <button class="btn ink" id="close-tw">关闭</button>
          </div>`;
        overlay.appendChild(box);
        box.querySelector('#do-up')?.addEventListener('click', () => {
          const res = act({ type: 'upgrade', id: tower.id });
          if (res.ok && stepName === 'upgrade' && tower.id === builtId) stepName = 'card';
          sig = '';
        });
        box.querySelector('#do-sell')?.addEventListener('click', () => { act({ type: 'sell', id: tower.id }); view.selectedTower = null; view.range = null; sig = ''; });
        box.querySelector('#do-pri')?.addEventListener('click', () => {
          const order = ['front', 'strong', 'boss', 'near'] as const;
          const next = order[(order.indexOf(tower.priority) + 1) % order.length]!;
          act({ type: 'priority', id: tower.id, priority: next });
          sig = '';
        });
        box.querySelector('#close-tw')?.addEventListener('click', () => { view.selectedTower = null; view.range = null; sig = ''; });
        box.querySelectorAll<HTMLButtonElement>('[data-branch]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const res = act({ type: 'branch', id: tower.id, branch: btn.dataset.branch! });
            if (res.ok) sig = '';
          });
        });
      }
      if (frame.querySelector('#debug-on')?.getAttribute('data-open') === '1' || overlay.dataset.debug === '1') {
        const tw = s.towers.find((t) => t.id === view.selectedTower);
        const read = tw ? towerReadout(tw) : null;
        const bug = document.createElement('div');
        bug.className = 'debug';
        bug.innerHTML = `<div>${s.lastFormula}</div><div>${read ? `塔伤 ${read.damage} 射程 ${read.range} 攻速 ${read.aps}` : '未选塔'}</div><div>${s.log.slice(-6).join('<br>')}</div>`;
        overlay.appendChild(bug);
      }
    }

    top.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      if (t.id === 'btn-debug' || t.dataset.debug === '1') overlay.dataset.debug = overlay.dataset.debug === '1' ? '0' : '1';
    });
    // debug button lives in the top bar, which is rewritten every frame; add it in paint via a fixed control
    const dbg = document.createElement('button');
    dbg.className = 'btn ink';
    dbg.textContent = '调试';
    dbg.style.cssText = 'position:absolute;top:210px;left:8px;z-index:4;pointer-events:auto;min-width:90px;min-height:90px';
    frame.querySelector('.hud')?.appendChild(dbg);
    dbg.addEventListener('click', () => { overlay.dataset.debug = overlay.dataset.debug === '1' ? '0' : '1'; sig = ''; });
  }

  function drawResult(reward: ReturnType<typeof grantRewards>) {
    if (route.name !== 'result') return;
    const current = route;
    const report = starsOf(current.state);
    const row = levelMeta(current.levelId);
    const win = current.victory;
    const checks = [
      ['一星 · 通关', report.c1],
      ['二星 · 城门生命 ≥ 50%', report.c2],
      [`三星 · ${row.star3Text}`, report.c3],
    ];
    const tips = loseTips(current.levelId);
    frame.innerHTML = `
      <div class="screen" style="${win ? '' : 'filter:saturate(.4)'}">
        <div class="grow center">
          <img src="assets/sprites/${win ? 'emb_win' : 'emb_lose'}.png" alt="" style="width:160px;height:160px;object-fit:contain">
          <h1 class="msz" style="font-size:72px">${win ? zh.victory : zh.defeat}</h1>
          <p>${row.id} ${row.name}</p>
          <div class="stars" style="font-size:28px">${'★'.repeat(report.stars)}${'☆'.repeat(3 - report.stars)}</div>
          <div class="panel" style="text-align:left;margin-top:12px">
            ${checks.map(([label, ok]) => `<div>${ok ? '✓' : '·'} ${label}</div>`).join('')}
            <p class="small">城门 ${Math.ceil(current.state.gate.hp)}/${current.state.gate.maxHp} · 漏怪 ${report.leaks} · 建造 ${report.builds} 座</p>
            ${current.levelId === '1-5' ? '<p class="note">【临时默认，非已定】三星“建塔不超过 10 座”按本关曾经建造的座次数计，卖掉也算。</p>' : ''}
          </div>
          <div class="panel" style="margin-top:10px">${reward.lines.map((l) => `<div>${l.text}</div>`).join('') || '<div>没有虎符</div>'}<strong>虎符 +${reward.total}</strong></div>
          ${win ? '' : `<div class="panel" style="text-align:left;margin-top:10px"><strong>破局</strong>${tips.map((t) => `<p class="small">${t}</p>`).join('')}</div>`}
          <div class="row" style="margin-top:16px;justify-content:center">
            ${win ? '' : '<button class="btn ink" id="adjust">调整布阵</button>'}
            <button class="btn" id="retry">${win ? '再战' : '重新挑战'}</button>
            ${win && nextPlayable(current.levelId) ? `<button class="btn" id="next">下一关</button>` : ''}
            <button class="btn ink" id="back-levels">返回关卡</button>
          </div>
        </div>
      </div>`;
    frame.querySelector('#retry')?.addEventListener('click', () => go({ name: 'prepare', levelId: current.levelId }));
    frame.querySelector('#adjust')?.addEventListener('click', () => go({ name: 'prepare', levelId: current.levelId }));
    frame.querySelector('#next')?.addEventListener('click', () => {
      const id = nextPlayable(current.levelId);
      if (id) go({ name: 'prepare', levelId: id });
    });
    frame.querySelector('#back-levels')?.addEventListener('click', () => go({ name: 'levels' }));
  }

  function drawGacha() {
    const u = unlocks(meta);
    frame.innerHTML = `
      <div class="screen">
        <header class="topbar"><button class="btn ink" data-go="menu">返回</button><div class="grow center msz" style="font-size:32px">点将台</div><div class="pill">虎符 ${meta.talisman}</div></header>
        <div class="grow">
          <div class="panel center">
            <p>基础概率　稀有 75% · 史诗 21% · 传说 4%</p>
            <p>十连综合　稀有 73.28% · 史诗 21.02% · 传说 5.70%</p>
            <p>十连至少 1 个史诗（传说也算）</p>
            <p>传说保底 ${meta.pity}/30 · 重复返还 ${GACHA.dupRefund} 虎符</p>
            <p class="note">虎符只能在关卡中获得 · 无任何付费入口</p>
            <p class="note">【临时默认，非已定】十连 200 虎符不打折。新档首次单抽免费。</p>
          </div>
          <div class="row" style="margin-top:16px">
            <button class="btn" id="pull1" ${(meta.firstSingleFree || meta.talisman >= 20) ? '' : 'disabled'}>单抽<br>${meta.firstSingleFree ? '本次免费' : '20'}</button>
            <button class="btn" id="pull10" ${meta.talisman >= 200 ? '' : 'disabled'}>十连<br>200</button>
          </div>
          <div id="pull-result"></div>
          <p class="muted">已开放塔：${u.towers.map((id) => towerById(id).name).join('、')}</p>
        </div>
        ${nav('gacha')}
      </div>`;
    bindNav();
    const show = (cards: ReturnType<typeof pull>['cards']) => {
      const host = frame.querySelector('#pull-result')!;
      host.innerHTML = `<div class="wrap" style="margin-top:12px">${cards.map((c) => `<div class="card ${c.rarity}" style="width:120px"><strong>${c.name}</strong><div class="small">${c.rarity === 'legendary' ? '传说' : c.rarity === 'epic' ? '史诗' : '稀有'}${c.duplicate ? ` · 重复 +${c.refund}` : ''}${c.pity ? ' · 保底' : ''}</div></div>`).join('')}</div>`;
    };
    frame.querySelector('#pull1')?.addEventListener('click', () => {
      const res = pull(meta, 'single');
      if (!res.ok) { toast(res.reason ?? '不能抽'); return; }
      persist();
      drawGacha();
      show(res.cards);
    });
    frame.querySelector('#pull10')?.addEventListener('click', () => {
      const res = pull(meta, 'ten');
      if (!res.ok) { toast(res.reason ?? '不能抽'); return; }
      persist();
      drawGacha();
      show(res.cards);
    });
  }

  function drawHeroes() {
    frame.innerHTML = `
      <div class="screen">
        <header class="topbar"><div class="msz" style="font-size:32px">武将</div><div class="grow"></div><div class="pill">虎符 ${meta.talisman}</div></header>
        <div class="grow"><div class="wrap">
          ${HEROES.map((h) => {
            const owned = meta.heroes.includes(h.id);
            const face = h.portrait ? `background-image:url(assets/sprites/${h.portrait})` : `background:${h.color}`;
            return `<button class="card" data-hero="${h.id}" style="width:160px;${owned ? '' : 'opacity:.45'}"><div class="hero-face" style="${face}">${h.portrait ? '' : h.name.slice(0, 1)}</div><div>${h.name}</div><div class="small">${owned ? h.faction : '未招募'}</div></button>`;
          }).join('')}
        </div>
        <p class="note">【临时默认，非已定】新档赠送黄忠、马超。</p></div>
        ${nav('heroes')}
      </div>`;
    bindNav();
    frame.querySelectorAll<HTMLButtonElement>('[data-hero]').forEach((btn) => {
      btn.addEventListener('click', () => go({ name: 'hero', id: btn.dataset.hero! }));
    });
  }

  function drawHero(id: string) {
    const h = heroById(id);
    const owned = meta.heroes.includes(h.id);
    const face = h.full ? `<img class="full" src="assets/sprites/${h.full}" alt="">` : `<div class="hero-face" style="width:180px;height:180px;margin:0 auto;background:${h.color};font-size:72px">${h.name.slice(0, 1)}</div>`;
    frame.innerHTML = `
      <div class="screen">
        <header class="topbar"><button class="btn ink" data-go="heroes">返回</button><div class="grow center msz" style="font-size:36px">${h.name}</div></header>
        <div class="grow">
          ${face}
          <p>${owned ? '已招募' : '未招募'} · ${h.rarity === 'legendary' ? '传说' : h.rarity === 'epic' ? '史诗' : '稀有'} · ${h.faction} · ${h.damageType === 'pierce' ? '穿刺' : h.damageType === 'blunt' ? '钝击' : '火攻'} · ${h.ranged ? '远程' : '近战'}</p>
          <div class="panel"><div>生命 ${h.hp}</div><div>攻击 ${h.atk}</div><div>攻速 ${h.aps}/秒</div><div>射程 ${h.range} 格</div></div>
          <div class="panel" style="margin-top:8px"><strong>${h.skill}</strong> · 冷却 ${h.skillCd} 秒<p class="small">${h.skillText}</p><strong>${h.passive}</strong><p class="small">${h.passiveText}</p></div>
          <p>可组成：${bondsFor(h.id).join('、')}</p>
          <p class="note">【临时默认，非已定】点头像放主动技，点英雄本人再点格子派遣。典韦的同阵营·魏目前凑不齐。</p>
        </div>
      </div>`;
    frame.querySelector('[data-go]')?.addEventListener('click', () => go({ name: 'heroes' }));
  }

  function drawCodex() {
    const rows = [
      ...ENEMIES.map((e) => ({ id: e.id, name: e.name, tip: e.tip, kind: e.flying ? '飞行' : e.species === 'cavalry' ? '骑兵' : '步兵' })),
      ...BOSSES.map((b) => ({ id: b.id, name: b.name, tip: b.tip, kind: '头目' })),
    ];
    frame.innerHTML = `
      <div class="screen">
        <header class="topbar"><button class="btn ink" data-go="menu">返回</button><div class="grow center">图鉴</div></header>
        <div class="grow">${rows.map((r) => {
          const seen = meta.codex.includes(r.id);
          return `<div class="panel" style="margin-bottom:8px"><strong>${seen ? r.name : '？？？'}</strong><div class="small">${seen ? `${r.kind} · ${r.tip}` : '战场上见过才会记下。'}</div></div>`;
        }).join('')}<p class="small">击败表现为溃散淡出，没有血和尸体。旗帜不写势力名。</p></div>
      </div>`;
    frame.querySelector('[data-go]')?.addEventListener('click', () => go({ name: 'menu' }));
  }

  function drawSettings() {
    frame.innerHTML = `
      <div class="screen">
        <header class="topbar"><div class="msz" style="font-size:32px">设置</div></header>
        <div class="grow">
          <button class="btn ink" id="mute">${meta.settings.muted ? '音效：关' : '音效：开'}</button>
          <button class="btn ink" id="replay">重看 1-1 引导</button>
          <h3>导出 / 导入</h3>
          <p class="small">文本存档。导入会覆盖这台浏览器里的进度。格式不对就保持原档。</p>
          <textarea id="dump" style="width:100%;height:120px"></textarea>
          <div class="row"><button class="btn" id="export">导出</button><button class="btn ink" id="import">导入</button></div>
          <button class="btn ink" id="reset" style="margin-top:18px">清除本地存档</button>
          <div class="panel" style="margin-top:18px">
            <h2 class="msz">关于</h2>
            <p>三国<span class="dot">·</span>烽火城关 V0.1.1 网页竖屏试玩。没有账号、没有服务器、没有广告、没有付费。</p>
            <p class="small">战斗循环参考并改写了阿軒（mars-tw）的 tower-defense-skill，MIT License。版权声明见仓库 THIRD_PARTY_NOTICES.md。</p>
            <p class="small">正文字体 Noto Serif SC，标题字体 Ma Shan Zheng，均为 SIL Open Font License 1.1 的子集。</p>
          </div>
        </div>
        ${nav('settings')}
      </div>`;
    bindNav();
    frame.querySelector('#mute')?.addEventListener('click', () => { meta.settings.muted = !meta.settings.muted; persist(); draw(); });
    frame.querySelector('#replay')?.addEventListener('click', () => { meta.tutorial.done11 = false; meta.tutorial.skipped = false; persist(); toast('下一局 1-1 会再引导'); });
    frame.querySelector('#export')?.addEventListener('click', () => {
      const box = frame.querySelector<HTMLTextAreaElement>('#dump')!;
      box.value = exportMeta(meta);
      toast('已写到文本框');
    });
    frame.querySelector('#import')?.addEventListener('click', () => {
      const text = frame.querySelector<HTMLTextAreaElement>('#dump')!.value;
      const next = importMeta(text);
      if (!next) { toast('格式不对，原档还在'); return; }
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = `<div class="panel"><h2>覆盖当前存档？</h2>
        <p>确认后，这台浏览器里的进度会被文本框里的存档替换。取消则保持现在的进度。</p>
        <div class="row"><button class="btn ink" id="import-cancel">取消</button><button class="btn" id="import-ok">确认覆盖</button></div></div>`;
      frame.appendChild(modal);
      modal.querySelector('#import-cancel')?.addEventListener('click', () => modal.remove());
      modal.querySelector('#import-ok')?.addEventListener('click', () => {
        meta = next;
        persist();
        toast('已导入');
        draw();
      });
    });
    frame.querySelector('#reset')?.addEventListener('click', () => {
      if (!confirm('清除这台浏览器上的存档？')) return;
      clearAll();
      meta = loadMeta();
      go({ name: 'menu' });
    });
  }

  function bindNav() {
    frame.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.go as Route['name'];
        if (name === 'menu' || name === 'levels' || name === 'gacha' || name === 'heroes' || name === 'settings' || name === 'codex') go({ name });
      });
    });
  }

  draw();
}

/** Ring stays inside the frame and above the wave bar (y = 1056). */
function layoutRing(padX: number, padY: number, count: number, includeCenter: boolean): { icons: { x: number; y: number }[]; center: { x: number; y: number } } {
  const radius = 104;
  const half = 45;
  const safe = { left: 4, top: 100, right: 716, bottom: 1052 };
  const rel = Array.from({ length: count }, (_, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    return { x: Math.cos(ang) * radius, y: Math.sin(ang) * radius };
  });
  const box = includeCenter ? [...rel, { x: 0, y: 0 }] : rel;
  const minX = Math.min(...box.map((p) => p.x - half));
  const maxX = Math.max(...box.map((p) => p.x + half));
  const minY = Math.min(...box.map((p) => p.y - half));
  const maxY = Math.max(...box.map((p) => p.y + half));
  let cx = padX;
  let cy = padY;
  if (cx + minX < safe.left) cx += safe.left - (cx + minX);
  if (cx + maxX > safe.right) cx -= cx + maxX - safe.right;
  if (cy + minY < safe.top) cy += safe.top - (cy + minY);
  if (cy + maxY > safe.bottom) cy -= cy + maxY - safe.bottom;
  return {
    icons: rel.map((p) => ({ x: cx + p.x, y: cy + p.y })),
    center: { x: cx, y: cy },
  };
}

function navBtn(name: string, mark: string, label: string, active: string) {
  return `<button data-go="${name}" class="${active === name ? '' : 'ink'}"><div class="msz" style="font-size:28px">${mark}</div><div class="small">${label}</div></button>`;
}

function loadWaveCount(id: string): number {
  const table: Record<string, number> = { '1-1': 6, '1-2': 8, '1-3': 8, '1-4': 10, '1-5': 10 };
  return table[id] ?? 10;
}

function nextPlayable(id: string): string | null {
  const order = ['1-1', '1-2', '1-3', '1-4', '1-5'];
  const i = order.indexOf(id);
  return i >= 0 && i < order.length - 1 ? order[i + 1]! : null;
}

function loseTips(id: string): string[] {
  if (id === '1-2') return ['斥候鹰会飞，投石车打不到，把箭楼盖在弯道上。', '山贼跑得快，先打靠近城门的。', '城门升一级能多撑一阵。'];
  if (id === '1-3') return ['刀盾兵的盾要先磨掉，燃烧也能直接烧血。', '军旗台让旁边的塔更疼。', '万箭齐发能同时打一圈。'];
  if (id === '1-4') return ['轻骑会冲刺，拒马阵减速，枪兵营能拦住。', 'Lv4 要选分支，神射楼打得远。', '别让第一只骑兵直接摸到城门。'];
  if (id === '1-5') return ['精英只有坚韧和迅捷。', '第 10 波乱军都尉是预告，能打死，不会进第二阶段。', '建造次数含卖掉的塔，三星别超 10 座。'];
  return ['箭楼便宜，先封住弯道。', '军资够就升级，比再盖一座更值。', '火攻留给挤在一起的敌人。'];
}
