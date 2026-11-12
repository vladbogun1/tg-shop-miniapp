/**
 * Значок коробки: пропорциональная Д×Ш×В коробка в косоугольной проекции (геометрия — model/box-glyph),
 * подрезанная по выбранной линии сгиба; пакет — плоский силуэт. Цвета — токены темы, без картинок.
 */
import { boxGlyph, type GlyphBox } from "../../model/box-glyph";

export function BoxGlyph({
  box,
  heightMm,
  size = 40,
  className,
}: {
  box: GlyphBox;
  /** Выбранная высота (линия сгиба); пусто — полная. */
  heightMm?: number | null;
  size?: number;
  className?: string;
}) {
  const g = boxGlyph(box, heightMm, size);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      className={className}
      fill="none"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {g.kind === "bag" ? (
        <>
          <path d={g.body} style={{ fill: "color-mix(in srgb, var(--accent) 14%, var(--surface-2))", stroke: "var(--text-muted)" }} strokeWidth={1.2} />
          <path d={g.flap} style={{ stroke: "var(--text-faint)" }} strokeWidth={1} strokeDasharray="2 2" />
        </>
      ) : (
        <>
          {g.ghost && <path d={g.ghost} style={{ stroke: "var(--text-faint)" }} strokeWidth={0.8} strokeDasharray="2 2" opacity={0.6} />}
          <path d={g.side} style={{ fill: "color-mix(in srgb, var(--accent) 22%, var(--surface-3))", stroke: "var(--text-muted)" }} strokeWidth={1.1} />
          <path d={g.front} style={{ fill: "color-mix(in srgb, var(--accent) 12%, var(--surface-2))", stroke: "var(--text-muted)" }} strokeWidth={1.1} />
          <path d={g.top} style={{ fill: "color-mix(in srgb, var(--accent) 30%, var(--surface-2))", stroke: "var(--text-muted)" }} strokeWidth={1.1} />
          {g.folds.map((f) => (
            <path key={f.d} d={f.d} style={{ stroke: "var(--text-faint)" }} strokeWidth={0.8} strokeDasharray="2 1.5" opacity={f.above ? 0.5 : 0.9} />
          ))}
          <path d={g.cut} style={{ stroke: "var(--accent-hi)" }} strokeWidth={1.6} />
        </>
      )}
    </svg>
  );
}
