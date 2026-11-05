"use client";

/**
 * «Поставка с ИИ»: накладная / скрины заказа → ИИ переписывает строки → админка сопоставляет с каталогом (память
 * поставщика, поиск, при нужде шаг 2 с ИИ) → новые товары создаются черновиками → открывается обычная форма поставки
 * с позициями, количеством и закупочными ценами. Ни остатки, ни очередь здесь не трогаются.
 */
import { Button } from "@shop/ui/admin-button";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { useMemo, useRef, useState } from "react";
import { useCategoriesQuery } from "@/features/catalog";
import { useFinanceAccess, type BatchPreset, type SeedLine } from "@/features/procurement";
import { PICK_PRODUCTS_STALE_MS, ProductPickModal, useProductsQuery } from "@/features/product";
import { pickVariant } from "../../model/ai/match";
import type { LeafCategory } from "../../model/ai/match-prompt";
import { variantSetProblems, type Created, type MergedLine } from "../../model/ai/plan";
import type { CatalogItem } from "../../model/ai/types";
import { useApplySupplyAi, useNbuRate } from "../../queries";
import { DocSummary } from "./DocSummary";
import { HelpPanel } from "./HelpPanel";
import { LineRow } from "./LineRow";
import { NewProductsPanel } from "./NewProductsPanel";
import { Messages, ReadStep } from "./ReadStep";
import { useSupplyAi, type SupplyAi } from "./use-supply-ai";

export interface SupplyAiResult {
  seed: SeedLine[];
  preset: BatchPreset;
}

function useCatalog() {
  const productsQ = useProductsQuery({ staleTime: PICK_PRODUCTS_STALE_MS });
  const categoriesQ = useCategoriesQuery();
  const catalog = useMemo<CatalogItem[]>(
    () =>
      (productsQ.data ?? []).map((p) => ({
        id: p.id,
        title: p.title,
        brand: p.brandRef?.name ?? null,
        categoryId: p.categoryId ?? null,
        variants: (p.variants ?? []).filter((v) => v.id).map((v) => ({ id: v.id as string, name: v.name })),
        imageUrl: p.images?.[0]?.url ?? null,
      })),
    [productsQ.data],
  );
  const categories = useMemo<LeafCategory[]>(
    () => (categoriesQ.data ?? []).filter((c) => !(categoriesQ.data ?? []).some((x) => x.parentId === c.id)).map((c) => ({ id: c.id, slug: c.slug, name: c.name })),
    [categoriesQ.data],
  );
  return { catalog, categories, loading: productsQ.isLoading || categoriesQ.isLoading };
}

function seedOf(lines: MergedLine[], catalog: Map<string, CatalogItem>, plans: SupplyAi["plans"], created: Map<string, Created>): SeedLine[] {
  const createdTitle = new Map([...created].map(([key, c]) => [c.productId, { c, title: plans.find((p) => p.key === key)?.title ?? "" }]));
  return lines.map((l) => {
    const p = catalog.get(l.productId);
    const fresh = createdTitle.get(l.productId);
    const variants = p?.variants ?? fresh?.c.variants ?? [];
    return {
      productId: l.productId,
      variantId: l.variantId,
      title: p?.title ?? fresh?.title ?? "",
      variantName: variants.find((v) => v.id === l.variantId)?.name ?? null,
      imageUrl: p?.imageUrl ?? null,
      qty: l.qty,
      price: l.unitPrice,
    };
  });
}

export function SupplyAiModal({ open, onClose, onReady }: { open: boolean; onClose: () => void; onReady: (r: SupplyAiResult) => void }) {
  const { catalog, categories, loading } = useCatalog();
  const finance = useFinanceAccess();
  const [fxRate, setFxRate] = useState("");
  const ai = useSupplyAi(catalog, categories, Number(fxRate.replace(",", ".")) || null);
  const nbu = useNbuRate(setFxRate, false);
  const [pickFor, setPickFor] = useState<string | null>(null);
  const created = useRef(new Map<string, Created>());
  // Поставщик, заведённый на упавшей попытке: повтор берёт его, а не заводит второго такого же.
  const createdSupplier = useRef<number | null>(null);
  const apply = useApplySupplyAi();
  const byId = useMemo(() => new Map(catalog.map((p) => [p.id, p])), [catalog]);
  // Валюта: из документа или выбранная админом; курс всегда принадлежит текущей валюте.
  const [pickedCurrency, setPickedCurrency] = useState<string | null>(null);
  const rateFor = useRef<string | null>(null);
  const currency = pickedCurrency ?? ai.doc?.currency ?? null;

  function takeRateOf(cur: string | null) {
    if (cur === rateFor.current) return;
    rateFor.current = cur;
    setFxRate(cur === "UAH" ? "1" : "");
    if (finance && cur && cur !== "UAH") nbu.mutate({ currency: cur });
  }

  function check(text?: string) {
    const parsed = ai.check(text);
    setPickedCurrency(null);
    if (parsed.doc) takeRateOf(parsed.doc.currency);
    return parsed;
  }

  function pickCurrency(cur: string) {
    setPickedCurrency(cur);
    takeRateOf(cur);
  }

  function resetAll() {
    created.current = new Map();
    createdSupplier.current = null;
    rateFor.current = null;
    setFxRate("");
    setPickedCurrency(null);
    ai.reset();
  }

  function finish() {
    const doc = ai.doc;
    if (!doc || !currency) return;
    const supplierId = ai.supplierId || (createdSupplier.current != null ? String(createdSupplier.current) : "");
    apply.mutate(
      {
        supplierId,
        supplierName: supplierId ? null : doc.supplier,
        onSupplier: (id) => (createdSupplier.current = id),
        plans: ai.plans,
        rows: ai.rows,
        created: created.current,
        onCreated: (key, c) => created.current.set(key, c),
      },
      {
        onSuccess: (r) => {
          const note = [doc.docNo && `Документ ${doc.docNo}`, doc.docDate, "создано «Поставкой с ИИ»"].filter(Boolean).join(" · ");
          onReady({
            seed: seedOf(r.lines, byId, ai.plans, r.created),
            preset: {
              title: [doc.supplier, doc.docNo].filter(Boolean).join(" · ").slice(0, 255),
              supplierId: r.supplierId != null ? String(r.supplierId) : "",
              privateNote: note,
              currency,
              ...(fxRate ? { fxRate } : {}),
            },
          });
          resetAll();
        },
      },
    );
  }

  const problems = [
    ...(ai.doc && !currency ? ["Выберите валюту документа — ИИ её не понял"] : []),
    ...ai.problems,
    ...variantSetProblems(ai.plans, created.current),
  ];
  const ready = ai.rows.length > 0 && problems.length === 0;
  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="lg"
        closeOnBackdrop={false}
        dirty={!!ai.answer}
        title="Поставка с ИИ"
        footer={
          <>
            {ai.rows.length > 0 && problems.length > 0 && <p className="mr-auto min-w-0 text-[13px] text-[var(--danger-ink)]">{problems[0]}</p>}
            <ModalCancel />
            <Button variant="accent" disabled={!ready} loading={apply.isPending} onClick={finish}>
              Дальше — форма поставки
            </Button>
          </>
        }
      >
        {loading ? (
          <p className="text-[13px] text-[var(--text-muted)]">Загружаю каталог…</p>
        ) : (
          <div className="flex min-w-0 flex-col gap-5">
            <ReadStep ai={{ ...ai, check }} />
            {ai.doc && (
              <>
                <DocSummary ai={ai} currency={currency} onCurrency={pickCurrency} fxRate={fxRate} setFxRate={setFxRate} finance={finance} />
                <HelpPanel ai={ai} catalog={catalog} categories={categories} />
                <div>
                  <div className="field-label mb-1">Строки документа: {ai.rows.length}</div>
                  {ai.rows.map((r) => (
                    <LineRow key={r.line.id} r={r} ai={ai} byId={byId} currency={currency ?? ""} onPick={() => setPickFor(r.line.id)} />
                  ))}
                </div>
                <NewProductsPanel ai={ai} categories={categories} />
                {problems.length > 1 && <Messages errors={problems} />}
              </>
            )}
          </div>
        )}
      </Modal>
      <ProductPickModal
        open={pickFor != null}
        title="Какой это товар"
        onClose={() => setPickFor(null)}
        onPick={(p) => {
          const row = ai.rows.find((r) => r.line.id === pickFor);
          const item = byId.get(p.id);
          if (row && item) ai.decide(row.line.id, { kind: "match", productId: p.id, variantId: pickVariant(row.line, item), by: "admin" });
          setPickFor(null);
        }}
      />
    </>
  );
}
