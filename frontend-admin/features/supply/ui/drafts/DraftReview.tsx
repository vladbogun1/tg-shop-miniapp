"use client";

/**
 * Проверка готового черновика: шапка поставки, строки накладной с решениями ИИ, новые товары с карточками. Правки
 * сохраняются сами; «Принять» дописывает несохранённое и создаёт поставщика, товары и поставку одним действием.
 */
import { Button } from "@shop/ui/admin-button";
import { useConfirm } from "@shop/ui/confirm";
import { hasErrorCode } from "@shop/core/errors";
import { Check, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ProductPickModal } from "@/features/product";
import type { SupplyDraft } from "../../api-drafts";
import { pickVariant } from "../../model/ai/match";
import { draftProblems, parseAmount } from "../../model/drafts/draft";
import { useAcceptDraft, useRetryDraft } from "../../queries-drafts";
import { BatchSection } from "../BatchSection";
import { LineRow } from "../ai/LineRow";
import { useCatalog } from "../ai/use-catalog";
import { DraftHeadForm } from "./DraftHeadForm";
import { DraftHeader } from "./DraftHeader";
import { DraftNotes, DraftProgress } from "./DraftProgress";
import { DraftProducts } from "./DraftProducts";
import { useDraftEdit, type DraftEdit } from "./use-draft-edit";

function AcceptPanel({ problems, saving, pending, onAccept }: { problems: string[]; saving: boolean; pending: boolean; onAccept: () => void }) {
  return (
    <div className="card mb-6 flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        {problems.length === 0 ? (
          <p className="text-[13.5px] text-[var(--text)]">Всё решено. «Принять» создаст поставку, новых поставщика и товары (скрытыми, с остатком 0).</p>
        ) : (
          <>
            <div className="mb-1 text-[13px] font-semibold text-[var(--danger-ink)]">Чтобы принять:</div>
            <ul className="flex list-disc flex-col gap-0.5 pl-5 text-[13px] text-[var(--text)]">
              {problems.map((p) => (
                <li key={p} className="break-words">
                  {p}
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="mt-1 text-[12px] text-[var(--text-faint)]">{saving ? "Сохраняю правки…" : "Правки сохранены"}</div>
      </div>
      <Button variant="accent" size="lg" icon={<Check className="h-4 w-4" />} disabled={problems.length > 0} loading={pending} onClick={onAccept} className="w-full sm:w-auto">
        Принять
      </Button>
    </div>
  );
}

/** Можно ли что-то отдать ИИ ещё раз: нерешённые строки или новые товары без карточки. */
const unfinished = (draft: SupplyDraft, edit: DraftEdit) => edit.rows.some((r) => r.decision.kind === "open") || edit.products.some((p) => !(p.id in draft.cards));

export function DraftReview({ draft, finance, onConflict }: { draft: SupplyDraft; finance: boolean; onConflict: () => void }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { catalog, categories, loading } = useCatalog();
  const edit = useDraftEdit(draft, onConflict);
  const accept = useAcceptDraft(draft.id);
  const retry = useRetryDraft(draft.id);
  const [pickFor, setPickFor] = useState<string | null>(null);
  const byId = useMemo(() => new Map(catalog.map((p) => [p.id, p])), [catalog]);
  const leafIds = useMemo(() => new Set(categories.map((c) => c.id)), [categories]);
  const problems = loading
    ? []
    : draftProblems({ rows: edit.rows, products: edit.products, catalog, leafIds, currency: edit.head.currency || null, fxRate: parseAmount(edit.head.fxRate) });

  async function acceptNow() {
    const n = edit.products.length;
    const ok = await confirm({
      title: "Создать поставку?",
      message: n ? `Заведём поставку и ${n} ${n === 1 ? "новый товар" : "новых товаров"} — скрытыми, с остатком 0. Фото подтянутся сами.` : "Заведём поставку из этих строк.",
      confirmLabel: "Создать",
    });
    if (!ok || !(await edit.flush())) return;
    accept.mutate(edit.version(), {
      onSuccess: (r) => router.push(`/preorders/${r.batchId}`),
      onError: (e) => hasErrorCode(e, "DRAFT_CHANGED") && onConflict(),
    });
  }

  async function finishWithAi() {
    if (await edit.flush()) retry.mutate();
  }

  const more = unfinished(draft, edit)
    ? [{ key: "retry", label: "Доделать с ИИ", icon: <Sparkles className="h-4 w-4" />, onSelect: () => void finishWithAi() }]
    : [];
  return (
    <>
      <DraftHeader draft={draft} extra={more} main={
        <Button variant="accent" icon={<Check className="h-4 w-4" />} disabled={problems.length > 0} loading={accept.isPending} onClick={() => void acceptNow()}>
          Принять
        </Button>
      } />
      <DraftNotes draft={draft} />
      <BatchSection id="head" title="Поставка">
        <DraftHeadForm edit={edit} docSupplier={draft.doc?.supplier ?? null} />
      </BatchSection>
      <BatchSection id="lines" title={`Строки накладной · ${edit.rows.length}`} hint="Что в документе — и что это у нас. Решения ИИ можно поменять.">
        {loading ? (
          <p className="text-[13px] text-[var(--text-muted)]">Загружаю каталог…</p>
        ) : (
          <div className="card min-w-0 px-3.5">
            {edit.rows.map((r) => (
              <div key={r.line.id}>
                <LineRow r={r} ai={edit.review} byId={byId} currency={edit.head.currency} onPick={() => setPickFor(r.line.id)} />
                {draft.lineNotes[r.line.id] && <p className="-mt-1 mb-2 break-words text-[12.5px] text-[var(--text-muted)]">ИИ: {draft.lineNotes[r.line.id]}</p>}
              </div>
            ))}
          </div>
        )}
      </BatchSection>
      {edit.products.length > 0 && (
        <BatchSection id="new" title={`Новые товары · ${edit.products.length}`} hint="Создадутся скрытыми черновиками с остатком 0 — покупатели их не увидят, пока вы не опубликуете.">
          <DraftProducts draft={draft} edit={edit} categories={categories} />
        </BatchSection>
      )}
      <AcceptPanel problems={problems} saving={edit.saving} pending={accept.isPending} onAccept={() => void acceptNow()} />
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
          const item = byId.get(p.id);
          if (row && item) edit.review.decide(row.line.id, { kind: "match", productId: p.id, variantId: pickVariant(row.line, item), by: "admin" });
          setPickFor(null);
        }}
      />
    </>
  );
}
