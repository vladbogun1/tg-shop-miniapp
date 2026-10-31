"use client";

/**
 * The board's state: a draft per tier (absent = the published case) and the edits on it. Chances always sum
 * to 100 % over the prizes that can drop (see model/case-draft). The draft reaches customers only on «Опубликовать».
 */
import { useMemo, useState } from "react";
import { CASE_TIER_ORDER, type CaseRarity, type CaseTier } from "@shop/core/giftcase";
import type { AdminProduct } from "@/features/product";
import { toast } from "@shop/ui/toast";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import {
  addRow,
  changes,
  fromDraftItem,
  fromServer,
  newKey,
  normalize,
  removeRow,
  setChance,
  setLaneShare,
  summarize,
  type Row,
} from "../../model/case-draft";
import { discountRow, mergeAutofill, productRow, publishedOf } from "../../model/case-rows";
import type { AutofillResult, CaseItemAdmin, DraftItem, GiftTierAdmin } from "../../model/types";

export function useCaseBoard(tier: CaseTier, items: CaseItemAdmin[] | undefined, current: GiftTierAdmin | null) {
  const published = useMemo(() => publishedOf(items, tier), [items, tier]);
  /** Drafts by tier; absent = the published case. */
  const [drafts, setDrafts] = useState<Partial<Record<CaseTier, Row[]>>>({});
  const [warnings, setWarnings] = useState<Partial<Record<CaseTier, string[]>>>({});
  const draft = drafts[tier];
  const rows = useMemo(() => draft ?? published.map(fromServer), [draft, published]);
  const changed = draft ? changes(draft, published) : 0;
  const dirtyTiers = CASE_TIER_ORDER.filter((t) => drafts[t] && changes(drafts[t]!, publishedOf(items, t)) > 0);
  useUnsavedGuard(dirtyTiers.length > 0);
  const sum = useMemo(() => summarize(rows, current), [rows, current]);

  const edit = (fn: (rows: Row[]) => Row[]) => setDrafts((d) => ({ ...d, [tier]: fn(d[tier] ?? published.map(fromServer)) }));
  const clearDraft = () => setDrafts((d) => ({ ...d, [tier]: undefined }));
  const discard = () => {
    clearDraft();
    setWarnings((w) => ({ ...w, [tier]: undefined }));
  };

  function addProduct(rarity: CaseRarity, p: AdminProduct) {
    if (rows.some((r) => r.productId === p.id)) {
      toast.error("Этот товар уже есть в этом кейсе");
      return;
    }
    edit((rs) => addRow(rs, productRow(rarity, p)));
  }

  /** Returns the new row's key (its editor opens right away). */
  function addDiscount(rarity: CaseRarity): string {
    const row = discountRow(rarity, current?.thresholdUah ?? 1000);
    edit((rs) => addRow(rs, row));
    return row.key;
  }

  function applyAutofill(res: AutofillResult) {
    setDrafts((d) => ({ ...d, [tier]: mergeAutofill(rows, published, res) }));
    setWarnings((w) => ({ ...w, [tier]: res.warnings }));
    toast.success(`Собрано: ${res.items.length} призов — проверьте и опубликуйте`);
  }

  function patchRow(key: string, patch: Partial<Row>) {
    edit((rs) => {
      const next = rs.map((r) => (r.key === key ? { ...r, ...patch } : r));
      // Switching a prize on/off moves its chance to / from the others.
      return "active" in patch ? normalize(next) : next;
    });
  }

  /** A product swapped for another one: a fresh row (keeps the id of a published prize of that product). Returns its key. */
  function replaceRow(key: string, x: DraftItem): string {
    const fresh = newKey();
    const old = published.find((it) => it.productId === x.productId);
    edit((rs) => normalize(rs.map((r) => (r.key === key ? { ...fromDraftItem({ ...x, id: old?.id ?? null }), key: fresh } : r))));
    return fresh;
  }

  return {
    published,
    rows,
    sum,
    hasDraft: !!draft,
    draft,
    changed,
    dirtyTiers,
    warnings: warnings[tier] ?? [],
    clearDraft,
    discard,
    addProduct,
    addDiscount,
    applyAutofill,
    patchRow,
    replaceRow,
    dropRow: (key: string) => edit((rs) => removeRow(rs, key)),
    setRowChance: (key: string, percent: number) => edit((rs) => setChance(rs, key, percent)),
    setShare: (rarity: CaseRarity, percent: number) => edit((rs) => setLaneShare(rs, rarity, percent)),
  };
}
