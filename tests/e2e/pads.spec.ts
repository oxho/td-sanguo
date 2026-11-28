import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const mapM1 = JSON.parse(readFileSync(new URL('../../src/data/maps/M1.json', import.meta.url), 'utf8')) as {
  pads: { id: string; x: number; y: number; r: number }[];
};
const view = JSON.parse(readFileSync(new URL('../../src/data/view.json', import.meta.url), 'utf8')) as {
  S0: number; k: number; CX: number; Y0: number; sFar: number; sNear: number; span: number;
};
const b = (view.sNear - view.sFar) / view.span;
const ap = view.sFar - 0.5 * b;
const scaleAt = (y: number) => view.sFar + b * (y - 0.5);
const groundY = (y: number) => view.Y0 + view.S0 * view.k * (ap * y + (b * y * y) / 2);
const worldToDesign = (x: number, y: number) => ({ x: view.CX + (x - 4.5) * view.S0 * scaleAt(y), y: groundY(y) });
const towerAtlas = JSON.parse(readFileSync(new URL('../../public/assets/atlas/atlas_tower_0.json', import.meta.url), 'utf8')) as {
  frames: Record<string, { spriteSourceSize: { y: number }; sourceSize: { h: number }; pivot: { y: number } }>;
  meta: { td?: { pxPerCell?: number; groundCenterFromBottomPx?: number } };
};
const idle = towerAtlas.frames.t_jianlou_lv1_idle_01!;
const groundFromBottom = towerAtlas.meta.td?.groundCenterFromBottomPx ?? (1 - idle.pivot.y) * idle.sourceSize.h;
const towerCells = Math.max(0.9, (idle.sourceSize.h - groundFromBottom - idle.spriteSourceSize.y) / (towerAtlas.meta.td?.pxPerCell || 1));
const towerTop = (pad: { x: number; y: number }) => {
  const foot = worldToDesign(pad.x, pad.y);
  return { x: foot.x, y: foot.y - towerCells * view.S0 * scaleAt(pad.y) + 2 };
};

const viewports = [
  { w: 360, h: 800, name: '360x800' },
  { w: 390, h: 844, name: '390x844' },
  { w: 412, h: 915, name: '412x915' },
  { w: 1280, h: 800, name: '1280x800' },
  { w: 768, h: 1024, name: '768x1024' },
];

async function openBattle(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.click('button[data-go="levels"]');
  await page.click('#go-prep');
  await page.click('#start-battle');
  await page.click('#skip-guide');
}

test('canvas matches the hit layer and every pad spot opens the ring', async ({ page }) => {
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await openBattle(page);
    const align = await page.evaluate(() => {
      const canvas = document.querySelector('#phaser canvas')!.getBoundingClientRect();
      const hit = document.querySelector('#hit')!.getBoundingClientRect();
      const slot = document.querySelector('.map-slot')!.getBoundingClientRect();
      const d = (a: number, b: number) => Math.abs(a - b);
      return {
        ok: d(canvas.x, hit.x) <= 0.5 && d(canvas.y, hit.y) <= 0.5 && d(canvas.width, hit.width) <= 0.5 && d(canvas.height, hit.height) <= 0.5
          && d(canvas.x, slot.x) <= 0.5 && d(canvas.y, slot.y) <= 0.5 && d(canvas.width, slot.width) <= 0.5 && d(canvas.height, slot.height) <= 0.5,
        canvas: [canvas.x, canvas.y, canvas.width, canvas.height],
        hit: [hit.x, hit.y, hit.width, hit.height],
      };
    });
    expect(align.ok, JSON.stringify(align)).toBe(true);
    const rowGap = await page.evaluate((rowBottom) => {
      const frame = document.querySelector('#frame')!.getBoundingClientRect();
      const wave = document.querySelector('.wavebar')!.getBoundingClientRect();
      const scale = frame.width / 720;
      return Math.round((wave.top - (frame.y + rowBottom * scale)) * 10) / 10;
    }, groundY(16));
    expect(rowGap, `${vp.name} row 15 gap`).toBeGreaterThanOrEqual(8);
    await page.screenshot({ path: `docs/self-test/v02m2-${vp.name}-battle.png` });
    console.log(`ROW15 ${vp.name} ${rowGap}`);

    for (const pad of mapM1.pads) {
      const spots = [
        worldToDesign(pad.x, pad.y),
        worldToDesign(pad.x, pad.r),
        worldToDesign(pad.x, pad.r + 1),
        towerTop(pad),
      ];
      for (const spot of spots) {
        const client = await page.evaluate((p) => {
          const frame = document.querySelector('#frame')!.getBoundingClientRect();
          const scale = frame.width / 720;
          return { x: frame.x + p.x * scale, y: frame.y + p.y * scale };
        }, spot);
        const hitName = await page.evaluate((p) => {
          const el = document.elementFromPoint(p.x, p.y);
          return el ? `${el.id || el.className}` : 'none';
        }, client);
        await page.mouse.click(client.x, client.y);
        await expect.poll(async () => page.locator('#overlay').getAttribute('data-pad'), { message: `${pad.id} via ${hitName} @ ${client.x},${client.y}` }).toBe(pad.id);
        await page.click('#close-build');
        await expect.poll(async () => page.locator('.ring-btn').count()).toBe(0);
      }
    }

    const taps = await page.evaluate(() => [...document.querySelectorAll('#btn-pause, #btn-start, .wavebar .btn, .actionbar .skill, #btn-speed')].map((el) => {
      const r = el.getBoundingClientRect();
      return { t: (el.id || el.textContent || '').replace(/\s+/g, ' ').slice(0, 16), w: r.width, h: r.height };
    }));
    for (const tap of taps) {
      expect(tap.w, tap.t).toBeGreaterThanOrEqual(44);
      expect(tap.h, tap.t).toBeGreaterThanOrEqual(44);
    }
  }
});
