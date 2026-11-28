import { VIEW } from './projection';

export interface ViewportSnap {
  designW: number;
  designH: number;
  cssScale: number;
  renderScale: number;
  insetTop: number;
  insetRight: number;
  insetBottom: number;
  insetLeft: number;
}

let frameEl: HTMLElement | null = null;
let fitEl: HTMLElement | null = null;
let snap: ViewportSnap = {
  designW: VIEW.frameW,
  designH: VIEW.frameH,
  cssScale: 1,
  renderScale: 1,
  insetTop: 0,
  insetRight: 0,
  insetBottom: 0,
  insetLeft: 0,
};

function probeInsets() {
  let probe = document.getElementById('safe-probe');
  if (!probe) {
    probe = document.createElement('div');
    probe.id = 'safe-probe';
    probe.style.cssText = 'position:fixed;left:0;top:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
  }
  const style = getComputedStyle(probe);
  return {
    insetTop: parseFloat(style.paddingTop) || 0,
    insetRight: parseFloat(style.paddingRight) || 0,
    insetBottom: parseFloat(style.paddingBottom) || 0,
    insetLeft: parseFloat(style.paddingLeft) || 0,
  };
}

function roundQuarter(n: number): number {
  return Math.max(0.25, Math.round(n / 0.25) * 0.25);
}

export function measureViewport(): ViewportSnap {
  const vw = Math.min(window.innerWidth, window.visualViewport?.width ?? window.innerWidth);
  const vh = Math.min(window.innerHeight, window.visualViewport?.height ?? window.innerHeight);
  const designW = VIEW.frameW;
  const designH = VIEW.frameH;
  const cssScale = Math.min(vw / designW, vh / designH);
  const dpr = window.devicePixelRatio || 1;
  const renderScale = Math.min(2, roundQuarter(cssScale * dpr));
  return { designW, designH, cssScale, renderScale, ...probeInsets() };
}

export function currentViewport(): ViewportSnap {
  return snap;
}

function paint() {
  if (!frameEl || !fitEl) return;
  snap = measureViewport();
  fitEl.style.width = `${snap.designW * snap.cssScale}px`;
  fitEl.style.height = `${snap.designH * snap.cssScale}px`;
  frameEl.style.width = `${snap.designW}px`;
  frameEl.style.height = `${snap.designH}px`;
  frameEl.style.transformOrigin = '0 0';
  frameEl.style.transform = `scale(${snap.cssScale})`;
}

/** The only place that scales the frame or reads client rectangles. */
export function mountViewport(app: HTMLElement): HTMLElement {
  const fit = document.createElement('div');
  fit.id = 'fit';
  const frame = document.createElement('div');
  frame.id = 'frame';
  fit.appendChild(frame);
  app.appendChild(fit);
  fitEl = fit;
  frameEl = frame;
  const onResize = () => paint();
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  paint();
  return frame;
}

export function clientToDesign(clientX: number, clientY: number): { x: number; y: number } {
  const rect = frameEl?.getBoundingClientRect();
  const scale = snap.cssScale || 1;
  if (!rect) return { x: clientX, y: clientY };
  return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
}

export function designToClient(x: number, y: number): { x: number; y: number } {
  const rect = frameEl?.getBoundingClientRect();
  const scale = snap.cssScale || 1;
  if (!rect) return { x, y };
  return { x: rect.left + x * scale, y: rect.top + y * scale };
}

export function attachCanvas(canvas: HTMLCanvasElement) {
  canvas.style.width = `${VIEW.mapW}px`;
  canvas.style.height = `${VIEW.mapH}px`;
  canvas.style.margin = '0';
}
