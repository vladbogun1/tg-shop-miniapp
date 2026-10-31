"use client";

/** «Перевод через ИИ», шаг 3: одна строка проверки — оригинал, uk/en с правкой на месте, предложенная правка оригинала. */
import { Sparkles } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { wordDiff } from "../../model/diff";
import { langState } from "../../model/queue";
import type { ReviewRow } from "../../model/review";
import { Diff, InlineText, IssueList, KindBadge, ProductLink, SourceText, StateChip } from "../shared";
import { replacesManual } from "./use-ai-session";

function RowHeader({
  row,
  selected,
  disabled,
  onSelect,
}: {
  row: ReviewRow;
  selected: boolean;
  disabled: boolean;
  onSelect: (on: boolean) => void;
}) {
  const s = row.str;
  const products = Array.from(new Map(s.fields.filter((f) => f.productId).map((f) => [f.productId!, f.productTitle])).entries());
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <label className={cn("flex items-center gap-2", disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer")}>
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--accent)]"
          checked={selected && !disabled}
          disabled={disabled}
          onChange={(e) => onSelect(e.target.checked)}
        />
        <span className="font-mono text-[12px] font-semibold text-[var(--text-muted)]">{row.id}</span>
      </label>
      <KindBadge kindKey={s.kindKey} />
      {s.fields.length > 1 && <Badge tone="info">в {s.fields.length} местах</Badge>}
      {row.done && <Badge tone="neutral">уже переведено — пропуск</Badge>}
      {(["uk", "en"] as const).map((l) => (s.needs[l] ? <StateChip key={l} lang={l} state={langState(s, l)} /> : null))}
      {replacesManual(row) && !row.done && <Badge tone="warn">заменит ваш ручной перевод</Badge>}
      <div className="ml-auto flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        {products.slice(0, 3).map(([id, title]) => (
          <ProductLink key={id} productId={id} title={title} />
        ))}
        {products.length > 3 && <span className="text-[12px] text-[var(--text-faint)]">и ещё {products.length - 3}</span>}
      </div>
    </div>
  );
}

function FixBlock({ row, fix, onFix }: { row: ReviewRow; fix: boolean; onFix: (on: boolean) => void }) {
  const s = row.str;
  const diff = useMemo(() => (row.ruChanged ? wordDiff(s.source, row.ru) : null), [row.ruChanged, row.ru, s.source]);
  return (
    <div className="mt-3 rounded-[var(--r-md)] border border-[rgba(255,102,0,.28)] bg-[var(--accent-soft)] p-2.5">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 text-[var(--accent-hi)]" />
        <span className="font-display text-[12px] font-bold uppercase tracking-[0.06em] text-[var(--accent-hi)]">
          Предложенная правка оригинала
        </span>
        <label
          className={cn(
            "ml-auto flex items-center gap-2 text-[12px] font-semibold",
            row.ruIssues.length ? "cursor-not-allowed opacity-50" : "cursor-pointer"
          )}
          title={
            row.ruIssues.length
              ? "Правка небезопасна — исправьте оригинал вручную в товаре"
              : `Русский текст заменится во всех полях с этим текстом (${s.fields.length}); uk/en сохранятся уже для нового текста`
          }
        >
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--accent)]"
            checked={fix && row.ruIssues.length === 0}
            disabled={row.ruIssues.length > 0}
            onChange={(e) => onFix(e.target.checked)}
          />
          Применить правку к оригиналу{s.fields.length > 1 ? ` (${s.fields.length} полей)` : ""}
        </label>
      </div>
      {diff ? <Diff parts={diff} /> : <SourceText text={row.ru} />}
      <IssueList issues={row.ruIssues} />
    </div>
  );
}

export function AiReviewRow({
  row,
  selected,
  onSelect,
  fix,
  onFix,
  onEdit,
}: {
  row: ReviewRow;
  selected: boolean;
  onSelect: (on: boolean) => void;
  fix: boolean;
  onFix: (on: boolean) => void;
  onEdit: (patch: Partial<Pick<ReviewRow, "uk" | "en">>) => void;
}) {
  const s = row.str;
  const stripe = row.level === "error" ? "var(--danger)" : row.level === "warn" ? "var(--warn)" : "var(--ok)";
  const disabled = row.level === "error" || row.done;
  const byLang = (l: string) => row.issues.filter((i) => i.lang === l);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[var(--r-md)] border bg-[var(--surface-2)] pl-[2px] transition-colors",
        selected && !disabled ? "border-[rgba(255,102,0,.45)]" : "border-[var(--line)]"
      )}
    >
      <span className="absolute inset-y-0 left-0 w-[2px]" style={{ backgroundColor: stripe }} aria-hidden />
      <div className="p-3">
        <RowHeader row={row} selected={selected} disabled={disabled} onSelect={onSelect} />
        <div className="grid gap-3 lg:grid-cols-3">
          <div>
            <div className="field-label mb-1 !text-[11px] !text-[var(--text-faint)]">RU · оригинал</div>
            <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-2)] px-2.5 py-2">
              <SourceText text={s.source} />
            </div>
            <IssueList issues={byLang("ru")} />
          </div>
          {(["uk", "en"] as const).map((l) => (
            <div key={l}>
              <div className="field-label mb-1 !text-[11px] !text-[var(--text-faint)]">
                {l === "uk" ? "UK · українська" : "EN · english"}
              </div>
              <InlineText
                ariaLabel={`${row.id} ${l}`}
                value={row[l]}
                invalid={byLang(l).some((i) => i.level === "error")}
                onChange={(v) => onEdit({ [l]: v })}
              />
              <IssueList issues={byLang(l)} />
            </div>
          ))}
        </div>
        {row.ruChanged && <FixBlock row={row} fix={fix} onFix={onFix} />}
      </div>
    </div>
  );
}
