"use client";

/**
 * Правки экрана проверки черновика: решения по строкам, новые товары (название, категория, цена, описание) и шапка
 * будущей поставки. Всё правится на месте и само сохраняется на сервер через ~0,7 с после последней правки, по
 * одной записи за раз (у каждой — версия черновика: правка поверх чужой даёт 409, экран перечитывает черновик).
 */
import { errorMessage, hasErrorCode } from "@shop/core/errors";
import { toast } from "@shop/ui/toast";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DraftSave, SupplyDraft } from "../../api-drafts";
import { likelyRepeats, lineProblem } from "../../model/ai/checks";
import type { LineDecision, NewProductDraft, ReviewRow } from "../../model/ai/types";
import { draftProducts, parseAmount, proposePrices, type DraftProduct } from "../../model/drafts/draft";
import { draftKeys, useSaveDraft } from "../../queries-drafts";

const SAVE_DELAY_MS = 700;

/** Поставщик будущей поставки: id из списка, «новый» (по названию) или без поставщика. */
export type SupplierPick = "none" | "new" | `${number}`;

export interface DraftHead {
  title: string;
  supplier: SupplierPick;
  supplierName: string;
  currency: string;
  fxRate: string;
  etaWeeks: string;
  preorderOpen: boolean;
}

interface Edits {
  rows: ReviewRow[];
  prices: Record<string, string>;
  descriptions: Record<string, string>;
  head: DraftHead;
  /** Цены, которые предложил экран по введённому курсу (не админ): меняется курс — пересчитываются. */
  proposed: string[];
}

function initial(d: SupplyDraft): Edits {
  return {
    rows: d.rows,
    prices: Object.fromEntries(Object.entries(d.prices).map(([k, v]) => [k, String(v)])),
    descriptions: {},
    proposed: [],
    head: {
      title: d.title ?? "",
      supplier: d.supplierId != null ? (String(d.supplierId) as SupplierPick) : d.supplierName ? "new" : "none",
      supplierName: d.supplierName ?? "",
      currency: d.currency ?? "",
      fxRate: d.fxRate != null ? String(d.fxRate) : "",
      etaWeeks: String(d.etaWeeks),
      preorderOpen: d.preorderOpen,
    },
  };
}

function bodyOf(e: Edits, version: number): DraftSave {
  const h = e.head;
  const fx = parseAmount(h.fxRate);
  const weeks = parseAmount(h.etaWeeks);
  return {
    version,
    decisions: Object.fromEntries(e.rows.map((r) => [r.line.id, r.decision])),
    prices: Object.fromEntries(Object.entries(e.prices).map(([k, v]) => [k, Math.max(0, Math.round(parseAmount(v) ?? 0))])),
    descriptions: e.descriptions,
    supplierId: h.supplier === "none" || h.supplier === "new" ? 0 : Number(h.supplier),
    supplierName: h.supplier === "new" ? h.supplierName : "",
    title: h.title,
    preorderOpen: h.preorderOpen,
    ...(h.currency ? { currency: h.currency } : {}),
    ...(fx != null && fx > 0 ? { fxRate: fx } : {}),
    ...(weeks != null && Number.isInteger(weeks) && weeks >= 0 && weeks <= 52 ? { etaWeeks: weeks } : {}),
  };
}

/**
 * Курс ввели (НБУ не ответил) — пустые цены новых товаров предлагаем по тому же правилу, что и сервер; предложенные
 * раньше пересчитываем (курс набирают по символу), цены, введённые админом, не трогаем.
 */
function withRate(e: Edits, patch: Partial<DraftHead>, draft: SupplyDraft): Edits {
  const head = { ...e.head, ...patch };
  const kept = Object.fromEntries(Object.entries(e.prices).filter(([k]) => !e.proposed.includes(k)));
  const products = draftProducts(e.rows, draft.cards, draft.jobs, kept);
  const prices = proposePrices(products, e.rows, parseAmount(head.fxRate), kept);
  const proposed = Object.keys(prices).filter((k) => !(k in kept));
  // Пересчитать нечем (курс стёрли) — пусто, а не старые цифры по прежнему курсу.
  return { ...e, head, prices, proposed };
}

export function useDraftEdit(draft: SupplyDraft, onConflict: () => void) {
  const qc = useQueryClient();
  const { mutateAsync: saveAsync } = useSaveDraft(draft.id);
  const [edits, setEdits] = useState(() => initial(draft));
  const latest = useRef(edits);
  latest.current = edits;
  const version = useRef(draft.version);
  const dirty = useRef(false);
  const chain = useRef<Promise<boolean>>(Promise.resolve(true));
  const [saving, setSaving] = useState(false);

  /** Записывает несохранённое; правки во время записи уйдут следующей записью. false — не сохранилось. */
  const flush = useCallback((): Promise<boolean> => {
    chain.current = chain.current.then(async () => {
      if (!dirty.current) return true;
      dirty.current = false;
      setSaving(true);
      try {
        const d = await saveAsync(bodyOf(latest.current, version.current));
        version.current = d.version;
        qc.setQueryData(draftKeys.one(d.id), d);
        return true;
      } catch (e) {
        if (hasErrorCode(e, "DRAFT_CHANGED") || hasErrorCode(e, "DRAFT_BAD_STATE")) {
          toast.error("Черновик изменился в другом окне — показываю свежий");
          onConflict();
        } else {
          dirty.current = true;
          toast.error(errorMessage(e, undefined, "Не удалось сохранить правки"));
        }
        return false;
      } finally {
        setSaving(false);
      }
    });
    return chain.current;
  }, [qc, saveAsync, onConflict]);

  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => void flush(), SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [edits, flush]);

  // Ушли со страницы раньше, чем сработало автосохранение, — дописываем.
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => void flushRef.current(), []);

  const change = useCallback((fn: (e: Edits) => Edits) => {
    dirty.current = true;
    setEdits(fn);
  }, []);

  const decide = useCallback(
    (lineId: string, decision: LineDecision) => change((e) => ({ ...e, rows: e.rows.map((r) => (r.line.id === lineId ? { ...r, decision } : r)) })),
    [change],
  );

  /** Правка нового товара — во всех его строках (название, категория). */
  const editProduct = (p: DraftProduct, patch: Partial<NewProductDraft>) =>
    change((e) => ({
      ...e,
      rows: e.rows.map((r) => (r.decision.kind === "new" && p.lineIds.includes(r.line.id) ? { ...r, decision: { kind: "new", draft: { ...r.decision.draft, ...patch } } } : r)),
    }));

  const products = useMemo(() => draftProducts(edits.rows, draft.cards, draft.jobs, edits.prices), [edits.rows, edits.prices, draft.cards, draft.jobs]);
  const repeats = useMemo(() => likelyRepeats(edits.rows.map((r) => r.line)), [edits.rows]);

  return {
    ...edits,
    products,
    saving: saving || dirty.current,
    flush,
    version: () => version.current,
    review: { decide, repeats, lineIssue: lineProblem },
    editProduct,
    setPrice: (id: string, text: string) => change((e) => ({ ...e, prices: { ...e.prices, [id]: text }, proposed: e.proposed.filter((k) => k !== id) })),
    setDescription: (id: string, text: string) => change((e) => ({ ...e, descriptions: { ...e.descriptions, [id]: text } })),
    setHead: (patch: Partial<DraftHead>) => change((e) => (patch.fxRate == null ? { ...e, head: { ...e.head, ...patch } } : withRate(e, patch, draft))),
  };
}

export type DraftEdit = ReturnType<typeof useDraftEdit>;
