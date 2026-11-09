"use client";

/**
 * Новый товар одним блоком: название, категория, цена; под ними строки накладной, из которых он сложился (варианты),
 * и карточка ИИ. Всё правится тут же — никуда уходить не надо.
 */
import { Button } from "@shop/ui/admin-button";
import { Scissors, Search, SkipForward, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { LeafCategory } from "../../model/ai/match-prompt";
import { pickVariant } from "../../model/ai/match";
import type { ReviewRow } from "../../model/ai/types";
import { lineVariants } from "../../model/ai/variants";
import type { DraftProduct } from "../../model/drafts/draft";
import { CardShell, DocLine, StateChip, type CardState, type ReviewEnv } from "./CardParts";
import { ProductAiCard } from "./DraftProducts";
import { hasProductIssue, plural, productIssues, rowIssue } from "./review";

/** Отдельный товар из строки: название «товар + вариант» (или текст строки), без варианта. */
function splitTitle(p: DraftProduct, r: ReviewRow, auto: string | undefined): string {
  return `${p.title} ${auto || r.line.en || r.line.text}`.trim();
}

/** `auto` — вариант, который получит строка (свой или подставленный: чем она отличается от других строк товара). */
function LineBlock({ r, p, env, auto }: { r: ReviewRow; p: DraftProduct; env: ReviewEnv; auto: string | undefined }) {
  const d = r.decision;
  const issue = rowIssue(r, env.ctx);
  const id = r.line.id;
  return (
    <div id={`line-${id}`} className="scroll-mt-24 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3 transition-shadow">
      <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,220px)] md:gap-5">
        <DocLine r={r} env={env} issue={issue && !issue.includes("вариант") ? issue : null} />
        {d.kind === "new" && (
          <Input
            id={`variant-${id}`}
            label="Вариант"
            value={d.draft.variant ?? ""}
            placeholder={auto ? `авто: ${auto}` : "без варианта"}
            hint={d.draft.variant || !auto ? "основа, упаковка, размер; цвет — отдельный товар" : "пусто — подставится как в подсказке"}
            error={issue?.includes("вариант") ? issue : undefined}
            onChange={(e) => env.edit.editLine(id, { variant: e.target.value || null })}
          />
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {p.lineIds.length > 1 && (
          <Button variant="ghost" size="sm" icon={<Scissors className="h-4 w-4" />} title="Эта строка станет отдельным товаром, не вариантом" onClick={() => env.edit.editLine(id, { title: splitTitle(p, r, auto), variant: null })}>
            Отделить в свой товар
          </Button>
        )}
        <Button variant="ghost" size="sm" icon={<Search className="h-4 w-4" />} onClick={() => env.pick(id)}>
          Это наш товар
        </Button>
        <Button variant="ghost" size="sm" icon={<SkipForward className="h-4 w-4" />} title="В поставку не войдёт, но в сумму документа строка считается" onClick={() => env.edit.review.decide(id, { kind: "skip" })}>
          Пропустить
        </Button>
        <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} title="Строки нет в документе — из суммы тоже уходит" onClick={() => env.edit.removeLine(id)}>
          Убрать из документа
        </Button>
      </div>
    </div>
  );
}

export function NewProductCard({ p, rows, env, categories }: { p: DraftProduct; rows: ReviewRow[]; env: ReviewEnv; categories: LeafCategory[] }) {
  const { edit, ctx } = env;
  const issues = productIssues(p, ctx);
  const lineIssue = rows.some((r) => rowIssue(r, ctx));
  const state: CardState = hasProductIssue(issues) || lineIssue ? "todo" : "ok";
  const taken = issues.taken;
  const auto = lineVariants(rows);

  function useExisting() {
    if (!taken) return;
    for (const r of rows) edit.review.decide(r.line.id, { kind: "match", productId: taken.id, variantId: pickVariant(r.line, taken), by: "admin" });
  }

  return (
    <CardShell id={`prod-${p.id}`} state={state}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">Новый товар</Badge>
          {rows.length > 1 && <span className="text-[12.5px] text-[var(--text-muted)]">{plural(rows.length, ["строка", "строки", "строк"])} — варианты одного товара</span>}
        </div>
        <StateChip state={state} />
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_130px] sm:items-start">
        <Input id={`title-${p.id}`} label="Название" value={p.title} onChange={(e) => edit.editProduct(p, { title: e.target.value })} />
        <div className={issues.category ? "rounded-[var(--r-md)] ring-1 ring-[var(--warn)]" : ""}>
          <Select label="Категория" value={p.categoryId ?? ""} options={categories.map((c) => ({ value: c.id, label: c.name }))} onChange={(v) => edit.editProduct(p, { categoryId: v })} />
        </div>
        <Input
          id={`price-${p.id}`}
          label="Цена, ₴"
          inputMode="decimal"
          value={edit.prices[p.id] ?? ""}
          hint="закупка × курс × 2"
          error={issues.price ? "нужна цена" : undefined}
          onChange={(e) => edit.setPrice(p.id, e.target.value)}
        />
      </div>
      {taken && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[var(--r-md)] border border-[var(--warn)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] p-2.5 text-[13px]">
          <span className="min-w-0 flex-1">«{taken.title}» уже есть в каталоге — это тот же товар?</span>
          <Button variant="outline" size="sm" onClick={useExisting}>
            Это он — сопоставить
          </Button>
        </div>
      )}
      <div className="mt-3 flex flex-col gap-2">
        {rows.map((r) => (
          <LineBlock key={r.line.id} r={r} p={p} env={env} auto={auto.get(r.line.id)} />
        ))}
      </div>
      <div className="mt-3">
        <ProductAiCard p={p} draft={env.draft} edit={edit} />
      </div>
    </CardShell>
  );
}
