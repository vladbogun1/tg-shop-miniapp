/**
 * Чтение DOM под пальцем для телеметрии: что реально получило тап и какой fixed-слой его накрыл. Вызывается
 * только на pointerdown (без MutationObserver), поднимается по предкам до body — это десятки getComputedStyle,
 * не больше. Значения полей ввода и тексты не читаются: только тег, id, классы, data-* и стили.
 */
import { MIN_COVERAGE, type LayerInfo, type TapSnapshot } from "../model/blocked-tap";
import { scrubAttr } from "../model/sanitize";

const BACKDROP_NAME = /backdrop|overlay|scrim|mask|dimmer/i;
const DIALOGS = "[role=dialog],[aria-modal=true]";
const INTERACTIVE = "a,button,input,select,textarea,label,summary,[role=button],[role=link],[role=tab],[contenteditable=true]";

export interface ElementDescriptor {
  tag: string;
  id?: string;
  cls?: string;
  data?: Record<string, string>;
  z?: string;
  op?: string;
  pos?: string;
}

/** Компактное описание элемента: тег, id, первые 3 класса, data-* (без значений длиннее 30), z-index, opacity. */
export function describe(el: Element | null | undefined): ElementDescriptor | null {
  if (!el) return null;
  const cs = window.getComputedStyle(el);
  const out: ElementDescriptor = { tag: el.tagName.toLowerCase() };
  if (el.id) out.id = scrubAttr(el.id, 40);
  const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 3).join(" ") : "";
  if (cls) out.cls = cls.slice(0, 120);
  const data: Record<string, string> = {};
  let n = 0;
  for (const a of Array.from(el.attributes)) {
    if (!a.name.startsWith("data-") || n >= 5) continue;
    data[a.name.slice(5, 35)] = scrubAttr(a.value);
    n += 1;
  }
  if (n > 0) out.data = data;
  if (cs.zIndex !== "auto") out.z = cs.zIndex;
  if (cs.opacity !== "1") out.op = cs.opacity;
  if (cs.position === "fixed" || cs.position === "absolute") out.pos = cs.position;
  return out;
}

function coverageOf(el: Element, vw: number, vh: number): number {
  const r = el.getBoundingClientRect();
  const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
  const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
  return vw > 0 && vh > 0 ? (w * h) / (vw * vh) : 0;
}

/** Полупрозрачный фон (rgba с альфой между 0 и 1) — типичное затемнение под окном. */
function translucentBackground(cs: CSSStyleDeclaration): boolean {
  const m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor);
  if (!m || !m[1]) return false;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 4) return false;
  const alpha = parseFloat(parts[3] ?? "1");
  return alpha > 0 && alpha < 1;
}

function layerInfo(el: Element, vw: number, vh: number): LayerInfo {
  const cs = window.getComputedStyle(el);
  const name = `${typeof el.className === "string" ? el.className : ""} ${el.id}`;
  return {
    position: cs.position,
    opacity: parseFloat(cs.opacity) || 0,
    visibility: cs.visibility,
    coverage: cs.position === "fixed" ? coverageOf(el, vw, vh) : 0,
    ariaHidden: el.getAttribute("aria-hidden") === "true",
    inert: el.hasAttribute("inert"),
    backdropLike: BACKDROP_NAME.test(name) || translucentBackground(cs),
  };
}

/** Окно видно: есть размер, не скрыто и не прозрачно с учётом предков. */
function dialogVisible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  let opacity = 1;
  for (let cur: Element | null = el; cur && cur !== document.body; cur = cur.parentElement) {
    const cs = window.getComputedStyle(cur);
    if (cs.display === "none") return false;
    opacity *= parseFloat(cs.opacity) || 0;
  }
  return opacity >= 0.05 && window.getComputedStyle(el).visibility !== "hidden";
}

export interface DialogCounts {
  dialogs: number;
  modals: number;
  visible: number;
}

export function countDialogs(): DialogCounts {
  const all = Array.from(document.querySelectorAll(DIALOGS));
  return {
    dialogs: document.querySelectorAll("[role=dialog]").length,
    modals: document.querySelectorAll("[aria-modal=true]").length,
    visible: all.filter(dialogVisible).length,
  };
}

export interface TapProbe {
  snapshot: TapSnapshot;
  hit: Element | null;
  chain: Element[];
  dialogs: DialogCounts;
}

/** Что под точкой (x, y): цепочка от попавшего элемента вверх до body и окна в DOM. */
export function probeTap(x: number, y: number): TapProbe {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const hit = document.elementFromPoint(x, y);
  const chain: Element[] = [];
  for (let cur: Element | null = hit; cur && cur !== document.body && cur !== document.documentElement; cur = cur.parentElement) {
    chain.push(cur);
  }
  const dialogs = countDialogs();
  return { hit, chain, dialogs, snapshot: { chain: chain.map((el) => layerInfo(el, vw, vh)), visibleDialogs: dialogs.visible } };
}

/** Индекс первого полноэкранного fixed-слоя в цепочке (или -1). */
export function fixedLayerIndex(probe: TapProbe): number {
  return probe.snapshot.chain.findIndex((l) => l.position === "fixed" && l.coverage >= MIN_COVERAGE);
}

/** meta для blocked_tap и dead_taps: попавший элемент, его fixed-слой, блокировка прокрутки, окна в DOM. */
export function tapMeta(probe: TapProbe, layerIndex = fixedLayerIndex(probe)): Record<string, unknown> {
  const layer = layerIndex >= 0 ? probe.chain[layerIndex] : null;
  return {
    hit: describe(probe.hit),
    layer: layer && layer !== probe.hit ? describe(layer) : layer ? "hit" : null,
    interactive: !!probe.hit?.closest(INTERACTIVE),
    // итоговая непрозрачность под пальцем: прозрачная обёртка без fixed (страница на входе анимации) видна только так
    effOpacity: Math.round(probe.snapshot.chain.reduce((acc, l) => acc * l.opacity, 1) * 1000) / 1000,
    bodyOverflow: document.body.style.overflow || "",
    dialogs: probe.dialogs.dialogs,
    modals: probe.dialogs.modals,
    visibleDialogs: probe.dialogs.visible,
    vw: window.innerWidth,
    vh: window.innerHeight,
  };
}
