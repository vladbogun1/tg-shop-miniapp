"use client";

/**
 * One prize of the case builder's draft: chance, rarity, discount value, on/off, «закрепить» (kept by
 * «Автособрать»), replacing the product by one of the same price band (GET …/alternatives) or from the
 * whole catalog, removing. Every change goes into the draft — nothing is saved until «Опубликовать».
 */
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { CASE_RARITY_ORDER, type CaseRarity, type CaseTier } from "@shop/core/giftcase";
import { Button } from "@shop/ui/admin-button";
import { Modal } from "@shop/ui/overlay";
import { Select } from "@/components/ui/Select";
import { ProductPickModal } from "@/components/ProductPickModal";
import type { Row } from "../../model/case-draft";
import { catalogItem } from "../../model/case-rows";
import { CASE_RARITY_LABEL } from "../../model/labels";
import type { DraftItem } from "../../model/types";
import { ChanceField, DiscountField, PrizeHeader, PrizeSwitches, ReplacePanel } from "./PrizeParts";

const RARITY_OPTIONS = CASE_RARITY_ORDER.map((r) => ({ value: r, label: CASE_RARITY_LABEL[r] }));

export function CasePrizeModal({
  open,
  onClose,
  tier,
  row,
  chance,
  perMonth,
  usedProducts,
  onChance,
  onPatch,
  onReplace,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  tier: CaseTier;
  row: Row | null;
  /** Real chance, %. */
  chance: number;
  perMonth: number;
  /** Products already in this tier's draft (not offered as a replacement). */
  usedProducts: string[];
  onChance: (percent: number) => void;
  onPatch: (patch: Partial<Row>) => void;
  onReplace: (item: DraftItem) => void;
  onRemove: () => void;
}) {
  const [picking, setPicking] = useState(false);
  if (!row) return null;
  const isProduct = row.kind === "PRODUCT";
  const cantDrop = isProduct && (row.stock <= 0 || !row.productActive);

  return (
    <>
      <Modal open={open} onClose={onClose} size="md" title="Приз кейса">
        <PrizeHeader row={row} perMonth={perMonth} />

        <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          <ChanceField rowKey={row.key} chance={chance} disabled={!row.active || cantDrop} onChance={onChance} />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="field-label">Редкость</span>
            <Select<CaseRarity> value={row.rarity} options={RARITY_OPTIONS} onChange={(r) => r !== row.rarity && onPatch({ rarity: r })} />
          </div>
          {!isProduct && <DiscountField row={row} onPatch={onPatch} />}
        </div>

        <PrizeSwitches row={row} onPatch={onPatch} />

        {isProduct && (
          <ReplacePanel open={open} tier={tier} row={row} usedProducts={usedProducts} onReplace={onReplace} onCatalog={() => setPicking(true)} />
        )}

        <div className="mt-4 flex min-w-0 flex-wrap justify-between gap-2 border-t border-[var(--line)] pt-3">
          <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={onRemove}>
            Убрать из кейса
          </Button>
          <Button variant="accent" onClick={onClose}>
            Готово
          </Button>
        </div>
      </Modal>
      <ProductPickModal
        open={picking}
        title="Заменить приз"
        onClose={() => setPicking(false)}
        onPick={(p) => {
          setPicking(false);
          if (!usedProducts.includes(p.id)) onReplace(catalogItem(p, row.rarity, row.weight));
        }}
      />
    </>
  );
}
