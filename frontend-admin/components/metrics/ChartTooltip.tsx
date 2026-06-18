"use client";

/**
 * GlassTooltip — themed recharts tooltip content. Rows are pre-formatted by the
 * caller via `formatter`, so this stays generic for money / counts / hours.
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

export function GlassTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
}: Props) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="glass glass--strong rounded-[var(--r-md)] px-3 py-2 text-[12px] shadow-[var(--shadow-2)]">
      {label != null && (
        <div className="mb-1 font-semibold text-[var(--text)]">
          {labelFormatter ? labelFormatter(String(label)) : String(label)}
        </div>
      )}
      {payload.map((p, i) => {
        const value = p.value ?? 0;
        const name = p.name ?? "";
        return (
          <div key={i} className="flex items-center gap-2 text-[var(--text-muted)]">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: p.color ?? "var(--accent)" }}
            />
            <span>{valueFormatter ? valueFormatter(value, name) : value}</span>
          </div>
        );
      })}
    </div>
  );
}
