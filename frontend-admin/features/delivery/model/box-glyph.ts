/**
 * Геометрия значка коробки без React: косоугольная проекция (кабинетная — глубина под 30° в половину длины),
 * пропорционально Д×Ш×В и вписано в квадрат `size`. Коробку, подрезанную по линии сгиба, рисуем сплошной до
 * выбранной высоты, а часть выше — бледным контуром; остальные линии сгиба — пунктиром. Пакет — плоский
 * силуэт Д×Ш с клапаном. Своих картинок НП не копируем: только эти линии.
 */

export interface GlyphBox {
  kind?: string | null;
  lengthMm: number;
  widthMm: number;
  /** Линии сгиба, первая — полная высота; пусто — у пакета. */
  heightsMm: number[];
}

export interface FoldLine {
  d: string;
  /** Линия выше выбранной высоты — на отрезанной (бледной) части. */
  above: boolean;
}

export interface BoxGeometry {
  kind: "box";
  /** Видимые грани коробки до выбранной высоты. */
  front: string;
  top: string;
  side: string;
  /** Контур отрезанной части (null — коробка во всю высоту). */
  ghost: string | null;
  folds: FoldLine[];
  /** Верхний край выбранной высоты — подсвечивается. */
  cut: string;
}

export interface BagGeometry {
  kind: "bag";
  body: string;
  flap: string;
}

export type Glyph = BoxGeometry | BagGeometry;

/** Глубина в проекции: доля и угол. */
const DEPTH = 0.5;
const COS = Math.cos(Math.PI / 6);
const SIN = Math.sin(Math.PI / 6);

const r = (n: number) => Math.round(n * 10) / 10;
const pt = (x: number, y: number) => `${r(x)} ${r(y)}`;
const poly = (pts: [number, number][]) => `M${pts.map(([x, y]) => pt(x, y)).join("L")}Z`;
const line = (a: [number, number], b: [number, number], c?: [number, number]) =>
  `M${pt(...a)}L${pt(...b)}${c ? `L${pt(...c)}` : ""}`;

export function isBag(b: Pick<GlyphBox, "kind" | "heightsMm">): boolean {
  return b.kind === "BAG" || b.heightsMm.length === 0;
}

/** Пакет: прямоугольник Д×Ш (вписан с полями) и клапан-полоса сверху. */
export function bagGlyph(lengthMm: number, widthMm: number, size: number, pad = 2): BagGeometry {
  const s = (size - 2 * pad) / Math.max(lengthMm, widthMm, 1);
  const w = lengthMm * s;
  const h = widthMm * s;
  const x0 = (size - w) / 2;
  const y0 = (size - h) / 2;
  const flap = Math.min(h * 0.18, 6);
  return {
    kind: "bag",
    body: poly([[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]]),
    flap: line([x0, y0 + flap], [x0 + w, y0 + flap]),
  };
}

/**
 * Коробка Д×Ш с высотами `heightsMm` (первая — полная), подрезанная до `cutMm` (по умолчанию — полная),
 * вписанная в квадрат `size` с полями `pad`.
 */
export function boxGlyph(b: GlyphBox, cutMm: number | null | undefined, size: number, pad = 2): Glyph {
  if (isBag(b)) return bagGlyph(b.lengthMm, b.widthMm, size, pad);
  const full = Math.max(...b.heightsMm);
  const cutH = cutMm && cutMm > 0 && cutMm <= full ? cutMm : full;
  const dx = b.widthMm * DEPTH * COS;
  const dy = b.widthMm * DEPTH * SIN;
  const s = (size - 2 * pad) / Math.max(b.lengthMm + dx, full + dy, 1);
  const L = b.lengthMm * s;
  const ox = (size - (b.lengthMm + dx) * s) / 2;
  const base = size - (size - (full + dy) * s) / 2; // низ передней грани
  const X = (x: number, z: number): number => ox + x * L + z * dx * s;
  const Y = (h: number, z: number): number => base - h * s - z * dy * s;
  const P = (x: number, h: number, z: number): [number, number] => [X(x, z), Y(h, z)];

  const faces = (h: number) => ({
    front: poly([P(0, 0, 0), P(1, 0, 0), P(1, h, 0), P(0, h, 0)]),
    top: poly([P(0, h, 0), P(1, h, 0), P(1, h, 1), P(0, h, 1)]),
    side: poly([P(1, 0, 0), P(1, 0, 1), P(1, h, 1), P(1, h, 0)]),
  });
  const solid = faces(cutH);
  const ghost =
    cutH < full
      ? [
          poly([P(0, cutH, 0), P(1, cutH, 0), P(1, full, 0), P(0, full, 0)]),
          poly([P(0, full, 0), P(1, full, 0), P(1, full, 1), P(0, full, 1)]),
          poly([P(1, cutH, 0), P(1, cutH, 1), P(1, full, 1), P(1, full, 0)]),
        ].join("")
      : null;
  const folds = b.heightsMm
    .filter((h) => h !== full && h !== cutH && h > 0)
    .map((h) => ({ d: line(P(0, h, 0), P(1, h, 0), P(1, h, 1)), above: h > cutH }));
  return { kind: "box", ...solid, ghost, folds, cut: line(P(0, cutH, 0), P(1, cutH, 0), P(1, cutH, 1)) };
}
