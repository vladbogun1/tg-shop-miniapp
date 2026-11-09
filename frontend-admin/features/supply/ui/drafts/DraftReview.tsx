"use client";

/**
 * Проверка готового черновика одним потоком: сверка суммы → что осталось → поставка → карточки позиций накладной
 * (в каждой: что в документе, что это у нас, статус; новый товар — тут же с категорией, ценой и карточкой ИИ) →
 * липкая «Принять». Правки сохраняются сами; «Принять» создаёт поставщика, товары и поставку одним действием.
 */
import { Button } from "@shop/ui/admin-button";
import { hasErrorCode } from "@shop/core/errors";
import { useConfirm } from "@shop/ui/confirm";
import { toast } from "@shop/ui/toast";
import { Check, Plus, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ProductPickModal } from "@/features/product";
import type { SupplyDraft } from "../../api-drafts";
import { pickVariant } from "../../model/ai/match";
import { draftProblems, draftSum, parseAmount } from "../../model/drafts/draft";
import { useAcceptDraft, useRereadDraft, useRetryDraft } from "../../queries-drafts";
import { BatchSection } from "../BatchSection";
import { useCatalog } from "../ai/use-catalog";
import type { ReviewEnv } from "./CardParts";
import { DraftHeadForm } from "./DraftHeadForm";
import { DraftHeader } from "./DraftHeader";
import { DraftNotes, DraftProgress } from "./DraftProgress";
import { MatchCard } from "./MatchCard";
import { NewProductCard } from "./NewProductCard";
import type { LeafCategory } from "../../model/ai/match-prompt";
import { draftTodos, fmtDoc, groupRows, jumpTo, readyCount, reviewCtx, type Group, type Todo } from "./review";
import { ManualLineForm, SumCheck } from "./SumCheck";
import { AcceptBar, TodoPanel } from "./TodoPanel";
import { useDraftEdit, type DraftEdit } from "./use-draft-edit";

/** Можно ли что-то отдать ИИ ещё раз: нерешённые строки или новые товары без карточки. */
const unfinished = (draft: SupplyDraft, edit: DraftEdit) => edit.rows.some((r) => r.decision.kind === "open") || edit.products.some((p) => !(p.id in draft.cards));

export function DraftReview({ draft, finance, onConflict }: { draft: SupplyDraft; finance: boolean; onConflict: () => void }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { catalog, categories, loading } = useCatalog();
  const edit = useDraftEdit(draft, onConflict);
  const accept = useAcceptDraft(draft.id);
  const retry = useRetryDraft(draft.id);
  const reread = useRereadDraft(draft.id);
  const [pickFor, setPickFor] = useState<string | null>(null);
  const leafIds = useMemo(() => new Set(categories.map((c) => c.id)), [categories]);
  const ctx = useMemo(() => reviewCtx(catalog, leafIds), [catalog, leafIds]);
  const currency = edit.head.currency || draft.doc?.currency || "";
  const fxRate = parseAmount(edit.head.fxRate);
  const sum = draftSum(edit.rows, draft.doc?.total ?? null);
  const problems = loading ? [] : draftProblems({ rows: edit.rows, products: edit.products, catalog, leafIds, currency: edit.head.currency || null, fxRate });
  const structured = loading ? [] : draftTodos(edit.rows, edit.products, ctx, { currency: edit.head.currency, fxRate });
  // Сервер/модель может знать про проблему, которой нет в разборе по смыслу, — не прячем её.
  const todos: Todo[] = structured.length === 0 && problems.length > 0 ? problems.map((p, i) => ({ key: `p${i}`, anchor: "lines", label: p })) : structured;
  const groups = useMemo(() => groupRows(edit.rows, edit.products), [edit.rows, edit.products]);
  const env: ReviewEnv = { draft, edit, ctx, currency, pick: setPickFor };

  async function acceptNow() {
    if (todos.length > 0) {
      toast.info(`Сначала решите: ${todos[0].label}`);
      jumpTo(todos[0].anchor);
      return;
    }
    if (sum.status === "MISMATCH" && sum.diff != null) {
      const go = await confirm({
        title: "Сумма не сходится",
        message: `Сумма не сходится с заказом на ${fmtDoc(sum.diff, currency)} — всё равно принять?`,
        confirmLabel: "Всё равно принять",
        danger: true,
      });
      if (!go) return;
    }
    const n = edit.products.length;
    const ok = await confirm({
      title: "Создать поставку?",
      message: n ? `Заведём поставку и ${n} ${n === 1 ? "новый товар" : "новых товаров"} — скрытыми, с остатком 0. Фото подтянутся сами.` : "Заведём поставку из этих строк.",
      confirmLabel: "Создать",
    });
    if (!ok || !(await edit.flush())) return;
    accept.mutate(edit.version(), {
      // Есть новые товары — остаёмся на экране черновика: он покажет следующий шаг (карточки и публикация).
      onSuccess: (r) => !r.newProducts && router.push(`/preorders/${r.batchId}`),
      onError: (e) => hasErrorCode(e, "DRAFT_CHANGED") && onConflict(),
    });
  }

  async function finishWithAi() {
    if (await edit.flush()) retry.mutate();
  }

  async function rereadNow() {
    const ok = await confirm({ title: "Перечитать накладную?", message: "ИИ внимательнее прочитает документ и допишет пропущенные строки. Уже решённые строки останутся.", confirmLabel: "Перечитать" });
    if (ok && (await edit.flush())) reread.mutate();
  }

  const more = unfinished(draft, edit) ? [{ key: "retry", label: "Доделать с ИИ", icon: <Sparkles className="h-4 w-4" />, onSelect: () => void finishWithAi() }] : [];
  const done = loading ? 0 : readyCount(edit.rows, edit.products, ctx);
  return (
    <>
      <DraftHeader
        draft={draft}
        extra={more}
        main={
          <Button variant="accent" icon={<Check className="h-4 w-4" />} loading={accept.isPending} onClick={() => void acceptNow()}>
            Принять
          </Button>
        }
      />
      <DraftNotes draft={draft} />
      <SumCheck sum={sum} currency={currency} info={draft.sum} rereading={reread.isPending} onReread={() => void rereadNow()} onAdd={edit.addLine} />
      <TodoPanel done={done} total={edit.rows.length} todos={todos} />
      <BatchSection id="head" title="Поставка">
        <DraftHeadForm edit={edit} docSupplier={draft.doc?.supplier ?? null} />
      </BatchSection>
      <LinesSection loading={loading} groups={groups} env={env} categories={categories} count={edit.rows.length} />
      <AcceptBar todos={todos} saving={edit.saving} pending={accept.isPending} onAccept={() => void acceptNow()} />
      <details className="mb-6">
        <summary className="cursor-pointer text-[13px] font-semibold text-[var(--text-muted)]">Как работал ИИ</summary>
        <div className="mt-3">
          <DraftProgress draft={draft} finance={finance} />
        </div>
      </details>
      <ProductPickModal
        open={pickFor != null}
        title="Какой это товар"
        onClose={() => setPickFor(null)}
        onPick={(p) => {
          const row = edit.rows.find((r) => r.line.id === pickFor);
          const item = ctx.byId.get(p.id);
          if (row && item) edit.review.decide(row.line.id, { kind: "match", productId: p.id, variantId: pickVariant(row.line, item), by: "admin" });
          setPickFor(null);
        }}
      />
    </>
  );
}

function LinesSection({ loading, groups, env, categories, count }: { loading: boolean; groups: Group[]; env: ReviewEnv; categories: LeafCategory[]; count: number }) {
  return (
    <BatchSection id="lines" title={`Позиции накладной · ${count}`} hint="В каждой: что написано в документе → что это у нас → готово или нужно решить. Новые товары создадутся скрытыми, с остатком 0.">
      {loading ? (
        <p className="text-[13px] text-[var(--text-muted)]">Загружаю каталог…</p>
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          {groups.map((g) =>
            g.kind === "single" ? <MatchCard key={g.row.line.id} r={g.row} env={env} /> : <NewProductCard key={g.product.id} p={g.product} rows={g.rows} env={env} categories={categories} />,
          )}
        </div>
      )}
      <AddLineButton onAdd={env.edit.addLine} />
    </BatchSection>
  );
}

function AddLineButton({ onAdd }: { onAdd: DraftEdit["addLine"] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <Button variant="ghost" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>
        Добавить строку вручную
      </Button>
      {open && <ManualLineForm onAdd={onAdd} onClose={() => setOpen(false)} />}
    </div>
  );
}
