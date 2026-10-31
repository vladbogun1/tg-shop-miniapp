/** Small presentational pieces shared by the checkout sections: numbered card, summary row. */

export function Section({ id, n, title, children }: { id?: string; n: number; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="nb p-5 sm:p-6" aria-labelledby={id ? `${id}-h` : undefined}>
      <h2 id={id ? `${id}-h` : undefined} className="mb-4 flex items-center gap-3 text-[18px] font-display font-bold uppercase tracking-[.06em] text-[var(--ink)]">
        <span className="chamfer grid h-8 w-8 shrink-0 place-items-center bg-[var(--accent-soft)] text-[14px] text-[var(--accent-hi)] [--chamfer:6px]">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Row({
  label,
  value,
  tone,
  muted,
  strong,
}: {
  label: string;
  value: string;
  tone?: "ok";
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`font-medium ${muted ? "text-[var(--muted)]" : "text-[var(--ink)]"}`}>{label}</span>
      <span
        className={`text-right font-display font-semibold tabular-nums ${tone === "ok" ? "text-[var(--ok)]" : muted ? "text-[var(--muted)]" : "text-[var(--ink)]"} ${strong ? "text-[16px] font-bold" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
