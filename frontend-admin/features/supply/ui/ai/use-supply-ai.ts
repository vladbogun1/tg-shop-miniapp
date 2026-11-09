"use client";

/**
 * Состояние «Поставки с ИИ»: ответ шага 1 → строки с решениями → (шаг 2 для нерешённых) → новые товары и цены.
 * Решения, принятые вручную или ИИ, при смене поставщика не перетираются; пересчитываются только автоматические.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSupplierAliases, useSuppliers } from "@/features/procurement";
import { lineProblem, likelyRepeats, totalProblem } from "../../model/ai/checks";
import { autoMatch, shortList } from "../../model/ai/match";
import { parseMatch, type LeafCategory } from "../../model/ai/match-prompt";
import { parseExtract, type ParsedExtract } from "../../model/ai/parse";
import { draftKey, draftPriceUah, newProducts, planProblems } from "../../model/ai/plan";
import { supplierByName } from "../../model/ai/supplier";
import type { CatalogItem, LineDecision, NewProductDraft, ReviewRow } from "../../model/ai/types";

const isAuto = (d: LineDecision) => d.kind === "open" || (d.kind === "match" && (d.by === "search" || d.by === "memory"));

/**
 * Пустой черновик нового товара из строки. Есть бренд или модель — «бренд модель цвет»; иначе (ИИ их не выделил)
 * название строки по-английски или как в документе — иначе из одного цвета вышло бы название «black».
 */
export function blankDraft(r: ReviewRow): NewProductDraft {
  const l = r.line;
  const named = l.brand || l.model;
  const title = (named ? [l.brand, l.model, l.color].filter(Boolean).join(" ") : l.en || l.text) || l.text;
  return { title, brand: l.brand, categoryId: null, variant: null, source: null };
}

export function useSupplyAi(catalog: CatalogItem[], categories: LeafCategory[], fxRate: number | null) {
  const [answer, setAnswer] = useState("");
  const [parsed, setParsed] = useState<ParsedExtract | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [supplierId, setSupplierIdRaw] = useState("");
  // Выбран админом — держим; найден по названию — для следующего документа ищем заново.
  const [supplierManual, setSupplierManual] = useState(false);
  const setSupplierId = (id: string) => {
    setSupplierIdRaw(id);
    setSupplierManual(true);
  };
  const [helpErrors, setHelpErrors] = useState<string[]>([]);
  const [helpNotes, setHelpNotes] = useState<string[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  // Задачи ИИ, чьи ответы взяты в разбор: при «Дальше — форма поставки» они получают «применено».
  const usedJobs = useRef(new Set<number>());
  const suppliersQ = useSuppliers();
  const aliasesQ = useSupplierAliases(supplierId ? Number(supplierId) : null);
  const memory = useMemo(() => aliasesQ.data ?? [], [aliasesQ.data]);
  // С какой памятью поставщика посчитаны текущие строки: пока не с той, что пришла, решения ещё не окончательные.
  const [rowsMemory, setRowsMemory] = useState<unknown>(null);
  const settled = rowsMemory === memory && !aliasesQ.isFetching;

  // Память поставщика пришла или поменялась — пересчитать автоматические решения.
  useEffect(() => {
    setRows((prev) =>
      prev.map((r) => {
        if (!isAuto(r.decision)) return r;
        const m = autoMatch(r.line, catalog, memory);
        return { ...r, decision: m.decision, candidates: m.candidates };
      }),
    );
    setRowsMemory(memory);
  }, [memory, catalog]);

  function check(text = answer) {
    const p = parseExtract(text);
    setParsed(p);
    if (!p.doc) {
      setRows([]);
      return p;
    }
    const sid = supplierManual ? supplierId : supplierByName(suppliersQ.data, p.doc.supplier);
    setSupplierIdRaw(sid);
    const mem = sid === supplierId ? memory : [];
    setRowsMemory(mem);
    setRows(p.doc.lines.map((line) => ({ line, ...autoMatch(line, catalog, mem) })));
    return p;
  }

  function decide(lineId: string, decision: LineDecision) {
    setRows((prev) => prev.map((r) => (r.line.id === lineId ? { ...r, decision } : r)));
  }

  /** Правка нового товара (название, категория…) — во всех строках с тем же товаром. */
  function editDraft(key: string, patch: Partial<NewProductDraft>) {
    setRows((prev) =>
      prev.map((r) => (r.decision.kind === "new" && draftKey(r.decision.draft) === key ? { ...r, decision: { kind: "new", draft: { ...r.decision.draft, ...patch } } } : r)),
    );
    if (patch.title != null) {
      const next = patch.title.trim().toLowerCase();
      setPrices((p) => (key in p ? { ...p, [next]: p[key] } : p));
    }
  }

  /**
   * Ответ шага 2 → решения по строкам. `onlyOpen` — для встроенного ИИ: пока он думал, админ мог решить строку сам,
   * его решение важнее. Возвращает, сколько строк решено этим ответом.
   */
  function applyHelp(text: string, onlyOpen = false) {
    const a = parseMatch(text, catalog, categories);
    const asked = new Set(rows.filter((r) => !onlyOpen || r.decision.kind === "open").map((r) => r.line.id));
    const usable = (r: ReviewRow) => a.decisions.has(r.line.id) && asked.has(r.line.id);
    setHelpErrors(a.errors);
    setHelpNotes([...a.notes].filter(([id]) => asked.has(id)).map(([id, note]) => `${id}: ${note}`));
    // «Одно из этих»: строка остаётся нерешённой, кандидаты — короткий список ИИ.
    const listed = (r: ReviewRow) => !a.decisions.has(r.line.id) && a.choices.has(r.line.id) && asked.has(r.line.id) && r.decision.kind === "open";
    setRows((prev) =>
      prev.map((r) => {
        if (usable(r)) return { ...r, decision: a.decisions.get(r.line.id)! };
        return listed(r) ? { ...r, candidates: shortList(r.line, a.choices.get(r.line.id)!, catalog) } : r;
      }),
    );
    return rows.filter(usable).length;
  }

  const doc = parsed?.doc ?? null;
  const repeats = useMemo(() => likelyRepeats(rows.map((r) => r.line)), [rows]);
  const taken = rows.filter((r) => r.decision.kind !== "skip").map((r) => r.line);
  const sumIssue = doc ? totalProblem(doc, taken) : null;

  const priceOf = (key: string, lineIds: string[]) => {
    if (prices[key] != null) return Number(prices[key].replace(",", ".")) || null;
    const first = rows.find((r) => r.line.id === lineIds[0]);
    return draftPriceUah(first?.line.unitPrice ?? null, fxRate);
  };
  const plansRaw = newProducts(rows);
  const plans = plansRaw.map((p) => ({ ...p, priceUah: priceOf(p.key, p.lineIds) }));
  const variantMissing = rows.filter((r) => {
    if (r.decision.kind !== "match" || r.decision.variantId) return false;
    const pid = r.decision.productId;
    return (catalog.find((c) => c.id === pid)?.variants.length ?? 0) > 0;
  });
  const problems = [
    ...planProblems(rows, plans),
    ...variantMissing.map((r) => `${r.line.id}: выберите вариант товара`),
  ];

  return {
    answer, setAnswer, parsed, check, doc, rows, settled, decide, editDraft, applyHelp, helpErrors, helpNotes,
    supplierId, setSupplierId, suppliers: suppliersQ.data ?? [], memoryCount: memory.length,
    repeats, sumIssue, lineIssue: lineProblem, plans, prices, setPrices, problems,
    noteJob: (id: number) => usedJobs.current.add(id),
    usedJobs: () => [...usedJobs.current],
    reset: () => {
      usedJobs.current = new Set();
      setAnswer("");
      setParsed(null);
      setRows([]);
      setHelpErrors([]);
      setHelpNotes([]);
      setRowsMemory(null);
      setPrices({});
      setSupplierIdRaw("");
      setSupplierManual(false);
    },
  };
}

export type SupplyAi = ReturnType<typeof useSupplyAi>;
