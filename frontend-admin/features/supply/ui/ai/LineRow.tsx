"use client";

import { Button } from "@shop/ui/admin-button";
import { AlertTriangle, Plus, RotateCcw, Search, SkipForward } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { round2 } from "../../model/ai/checks";
import type { CatalogItem, LineDecision, ReviewRow } from "../../model/ai/types";
import { blankDraft, type SupplyAi } from "./use-supply-ai";

const BY_LABEL = { memory: "Из памяти поставщика", search: "Найден в каталоге", ai: "ИИ", admin: "Выбрано вручную" } as const;

function Source({ r, ai, currency }: { r: ReviewRow; ai: SupplyAi; currency: string }) {
  const l = r.line;
  const issue = ai.lineIssue(l);
  const sum = l.unitPrice != null ? round2(l.unitPrice * l.qty) : null;
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 font-mono text-[11px] text-[var(--text-faint)]">{l.id}</span>
        <span className="min-w-0 break-words text-[13.5px] font-semibold text-[var(--text)]">{l.text}</span>
      </div>
      {(l.variant || l.en) && (
        <div className="mt-0.5 break-words text-[12.5px] text-[var(--text-muted)]">{[l.variant, l.en].filter(Boolean).join(" · ")}</div>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] tabular-nums text-[var(--text-muted)]">
        <span>
          {l.qty} шт. × {l.unitPrice ?? "—"} {currency}
          {sum != null && ` = ${sum}`}
        </span>
        {issue && <span className="min-w-0 text-[var(--warn)]">⚠ {issue}</span>}
        {ai.repeats.has(l.id) && r.decision.kind !== "skip" && <Badge tone="warn">похоже на повтор</Badge>}
        {l.notes && <span className="text-[var(--warn)]">{l.notes}</span>}
      </div>
    </div>
  );
}

function Matched({ r, d, ai, byId }: { r: ReviewRow; d: Extract<LineDecision, { kind: "match" }>; ai: SupplyAi; byId: Map<string, CatalogItem> }) {
  const p = byId.get(d.productId);
  const variants = p?.variants ?? [];
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Badge tone={d.by === "search" ? "info" : "ok"}>{BY_LABEL[d.by]}</Badge>
        <span className="min-w-0 break-words text-[13px] font-semibold">{p?.title ?? "товар не найден"}</span>
      </div>
      {variants.length > 0 && (
        <Select
          value={d.variantId ?? ""}
          placeholder="Вариант…"
          options={variants.map((v) => ({ value: v.id, label: v.name }))}
          onChange={(v) => ai.decide(r.line.id, { ...d, variantId: v, by: "admin" })}
        />
      )}
    </div>
  );
}

function Candidates({ r, ai, byId }: { r: ReviewRow; ai: SupplyAi; byId: Map<string, CatalogItem> }) {
  const top = r.candidates.slice(0, 3).filter((c) => byId.has(c.productId));
  if (top.length === 0) return <span className="text-[12.5px] text-[var(--text-faint)]">Похожих в каталоге нет</span>;
  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {top.map((c) => (
        <button
          key={c.productId}
          type="button"
          onClick={() => ai.decide(r.line.id, { kind: "match", productId: c.productId, variantId: c.variantId, by: "admin" })}
          className="min-w-0 max-w-full truncate rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1 text-left text-[12.5px] hover:border-[var(--accent)]"
          title="Это он"
        >
          {byId.get(c.productId)!.title}
        </button>
      ))}
    </div>
  );
}

function Actions({ r, ai, onPick }: { r: ReviewRow; ai: SupplyAi; onPick: () => void }) {
  const d = r.decision;
  if (d.kind === "skip") {
    return (
      <Button variant="ghost" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={() => ai.decide(r.line.id, { kind: "open" })}>
        Вернуть
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      <Button variant="ghost" size="sm" icon={<Search className="h-4 w-4" />} onClick={onPick}>
        {d.kind === "match" ? "Другой товар" : "Выбрать товар"}
      </Button>
      {d.kind !== "new" && (
        <Button variant="ghost" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => ai.decide(r.line.id, { kind: "new", draft: blankDraft(r) })}>
          Создать новый
        </Button>
      )}
      <Button variant="ghost" size="sm" icon={<SkipForward className="h-4 w-4" />} onClick={() => ai.decide(r.line.id, { kind: "skip" })}>
        Пропустить
      </Button>
    </div>
  );
}

function Decision({ r, ai, byId }: { r: ReviewRow; ai: SupplyAi; byId: Map<string, CatalogItem> }) {
  const d = r.decision;
  if (d.kind === "match") return <Matched r={r} d={d} ai={ai} byId={byId} />;
  if (d.kind === "skip") return <span className="text-[12.5px] text-[var(--text-faint)]">Пропущена — в поставку не войдёт</span>;
  if (d.kind === "new") {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Badge tone="accent">новый товар</Badge>
        <span className="min-w-0 break-words text-[13px] font-semibold">
          {d.draft.title}
          {d.draft.variant && ` · ${d.draft.variant}`}
        </span>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[var(--warn)]">
        <AlertTriangle className="h-3.5 w-3.5" /> {r.candidates.length > 0 ? "Новый товар?" : "Нет в каталоге"}
      </span>
      <Candidates r={r} ai={ai} byId={byId} />
    </div>
  );
}

/** Строка проверки: что в документе · что это у нас · действия. */
export function LineRow({ r, ai, byId, currency, onPick }: { r: ReviewRow; ai: SupplyAi; byId: Map<string, CatalogItem>; currency: string; onPick: () => void }) {
  return (
    <div className={`grid gap-2 border-b border-[var(--line)] py-3 last:border-b-0 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-4 ${r.decision.kind === "skip" ? "opacity-60" : ""}`}>
      <Source r={r} ai={ai} currency={currency} />
      <div className="flex min-w-0 flex-col gap-1.5">
        <Decision r={r} ai={ai} byId={byId} />
        <Actions r={r} ai={ai} onPick={onPick} />
      </div>
    </div>
  );
}
