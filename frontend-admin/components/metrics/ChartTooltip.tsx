"use client";

/**
 * ChartTooltip — recharts tooltip styled as a neo-brutalist bordered card
 * (thick ink border + hard offset shadow, --surface bg). Rows are pre-formatted
 * by the caller via `valueFormatter`, so this stays generic for money / counts /
 * hours. It renders normal DOM (not SVG), so it can use CSS vars + utilities.
 */
type Formatter = (value: number, name: string) => string;

interface TooltipPayloadItem {
  value?: number;
  name?: string;
  color?: string;
}

interface Props {
  // injected by recharts when used as <Tooltip content={...} />
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  /** Optional label transform (e.g. yyyy-MM-dd -> dd.MM). */
  labelFormatter?: (label: string) => string;
  /** Value transform per row. */
  valueFormatter?: Formatter;
}

export function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
}: Props) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="min-w-[120px] rounded-[var(--r-md)] border-[3px] border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[12px] shadow-[var(--shadow-3)]">
      {label != null && (
        <div className="mb-1.5 font-extrabold uppercase tracking-wide text-[var(--text)]">
          {labelFormatter ? labelFormatter(String(label)) : String(label)}
        </div>
      )}
      <div className="flex flex-col gap-1">
        {payload.map((p, i) => {
          const value = p.value ?? 0;
          const name = p.name ?? "";
          return (
            <div
              key={i}
              className="flex items-center gap-2 text-[var(--text-muted)]"
            >
              <span
                className="inline-block h-3 w-3 shrink-0 border-2 border-[var(--line)]"
                style={{ background: p.color ?? "var(--accent)" }}
              />
              <span className="font-bold text-[var(--text)]">
                {valueFormatter ? valueFormatter(value, name) : value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
