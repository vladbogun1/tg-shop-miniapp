"use client";

/**
 * «Кейсы» (gift cases, V57) — the case builder (docs/GIFT-CASE.md, «Конструктор»). Three tiers —
 * bronze, silver, gold — each with its threshold of the order sum and its own prizes (products, or
 * discounts on the next order as personal promo codes). The order gets the dearest tier its sum reaches.
 *
 * The prizes are a board by rarity. Every edit goes into a per-tier draft (chances always sum to 100 %
 * over the prizes that can drop: one change rescales the others) and reaches customers only on
 * «Опубликовать» (PUT …/tiers/{tier}/items, one transaction). «Тест кейса» runs on the draft, «Автособрать»
 * fills it from the catalog. The summary weighs a case against the margin on an order at the threshold
 * (no cost price in the shop: a product prize costs price × (1 − average margin), a discount its amount).
 *
 * Tier settings (threshold, guaranteed discount, swap, promo validity) are saved at once, apart from the draft.
 */
import { useMemo, useState } from "react";
import { Dices, Sparkles } from "lucide-react";
import { CASE_TIER_ORDER, type CaseRarity, type CaseTier } from "@shop/core/giftcase";
import type { AdminProduct } from "@/features/product";
import { toast } from "@shop/ui/toast";
import { Button } from "@shop/ui/admin-button";
import { useConfirm } from "@shop/ui/confirm";
import { QueryState } from "@/components/ui/QueryState";
import { ProductPickModal } from "@/components/ProductPickModal";
import { lanesOf, sortRows, toDraft } from "../../model/case-draft";
import { toAdminItem } from "../../model/case-rows";
import { CASE_RARITY_LABEL, CASE_TIER_LABEL } from "../../model/labels";
import { useCaseItemsQuery, useGiftTiersQuery, usePatchTier, usePublishCase } from "../../queries";
import { useCaseBoard } from "./use-case-board";
import { CaseAutofillModal } from "./CaseAutofillModal";
import { CaseLane } from "./CaseLane";
import { CasePrizeModal } from "./CasePrizeModal";
import { CaseTierSettingsModal } from "./CaseTierSettings";
import { DraftBar } from "./DraftBar";
import { SummaryCard } from "./SummaryCard";
import { TierSwitch, TierTabs } from "./TierTabs";
import { CaseTestModal } from "../test/CaseTestModal";

export function CasePanel({ reminderDays }: { reminderDays: number | null }) {
  const confirm = useConfirm();
  const tiersQ = useGiftTiersQuery();
  const itemsQ = useCaseItemsQuery();
  const [tier, setTier] = useState<CaseTier>("BRONZE");
  const tiers = useMemo(
    () => [...(tiersQ.data ?? [])].sort((a, b) => CASE_TIER_ORDER.indexOf(a.tier) - CASE_TIER_ORDER.indexOf(b.tier)),
    [tiersQ.data]
  );
  const current = tiers.find((t) => t.tier === tier) ?? null;
  const board = useCaseBoard(tier, itemsQ.data, current);
  const { rows, sum } = board;

  const patchTier = usePatchTier(tier);
  const publishCase = usePublishCase(tier, board.clearDraft);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<CaseRarity | null>(null);
  const [testing, setTesting] = useState(false);
  const [filling, setFilling] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function publish() {
    const draft = board.draft;
    if (!draft) return;
    if (draft.length > 0 && sum.live === 0) {
      toast.error("Ни один приз черновика не может выпасть — проверьте наличие и шансы");
      return;
    }
    const ok = await confirm({
      title: `Опубликовать ${CASE_TIER_LABEL[tier].toLowerCase()} кейс?`,
      message: (
        <>
          Покупатели сразу начнут получать призы из черновика ({draft.length} шт., изменений: {board.changed}). Уже выданные призы в заказах не
          изменятся.
        </>
      ),
      confirmLabel: "Опубликовать",
    });
    if (ok) publishCase.mutate(toDraft(draft));
  }

  const editingRow = rows.find((r) => r.key === editing) ?? null;
  const lanes = lanesOf(tier, rows);
  const sorted = sortRows(rows);
  const anyEnabled = tiers.some((t) => t.enabled && t.livePrizes > 0);

  return (
    <div className="min-w-0">
      <div className="mb-3 min-w-0">
        <div className="font-display text-[16px] font-bold text-[var(--ink)]">Кейсы</div>
        <p className="text-[12.5px] leading-snug text-[var(--text-muted)]">
          Заказ получает самый дорогой кейс, до порога которого дотянул (сумма после скидок). Правки призов копятся в черновике и доходят до
          покупателей только после «Опубликовать». Шансы покупатели не видят.
        </p>
      </div>

      <QueryState isLoading={tiersQ.isLoading} isError={tiersQ.isError} error={tiersQ.error} refetch={tiersQ.refetch} loadingLabel="Загрузка кейсов">
        <TierTabs
          tier={tier}
          tiers={tiers}
          dirtyTiers={board.dirtyTiers}
          onSelect={(t) => {
            setTier(t);
            setEditing(null);
          }}
        />
        {tiers.length > 0 && !anyEnabled && <NoCaseNote />}
        {current && (
          <TierSwitch
            tier={tier}
            enabled={current.enabled}
            pending={patchTier.isPending}
            onToggle={(body, okText) => patchTier.mutate({ body, okText })}
            onSettings={() => setSettingsOpen(true)}
          />
        )}
      </QueryState>

      <DraftBar
        changed={board.changed}
        hasDraft={board.hasDraft}
        total={rows.length}
        busy={publishCase.isPending}
        onDiscard={board.discard}
        onPublish={() => void publish()}
      />

      <QueryState isLoading={itemsQ.isLoading} isError={itemsQ.isError} error={itemsQ.error} refetch={itemsQ.refetch} loadingLabel="Загрузка призов">
        <div className="mt-3 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="order-2 flex min-w-0 flex-col gap-3 lg:order-1">
            {rows.length === 0 && <EmptyCase onFill={() => setFilling(true)} />}
            {lanes.map((r) => (
              <CaseLane
                key={r}
                rarity={r}
                rows={sorted.filter((x) => x.rarity === r)}
                sum={sum}
                onShare={(p) => board.setShare(r, p)}
                onOpen={setEditing}
                onAddProduct={() => setAdding(r)}
                onAddDiscount={() => setEditing(board.addDiscount(r))}
              />
            ))}
          </div>

          <aside className="order-1 min-w-0 lg:order-2">
            <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-4">
              <SummaryCard t={current} sum={sum} warnings={board.warnings} />
              <div className="grid min-w-0 grid-cols-2 gap-2">
                <Button variant="surface" icon={<Sparkles className="h-4 w-4" />} onClick={() => setFilling(true)}>
                  Автособрать
                </Button>
                <Button variant="outline" icon={<Dices className="h-4 w-4" />} disabled={sum.live === 0} onClick={() => setTesting(true)}>
                  Тест{board.hasDraft ? " черновика" : ""}
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </QueryState>

      <CasePrizeModal
        open={!!editingRow}
        onClose={() => setEditing(null)}
        tier={tier}
        row={editingRow}
        chance={editingRow ? sum.chance.get(editingRow.key) ?? 0 : 0}
        perMonth={editingRow ? sum.perMonth.get(editingRow.key) ?? 0 : 0}
        usedProducts={rows.map((r) => r.productId).filter((x): x is string => !!x)}
        onChance={(p) => editingRow && board.setRowChance(editingRow.key, p)}
        onPatch={(patch) => editingRow && board.patchRow(editingRow.key, patch)}
        onReplace={(x) => editingRow && setEditing(board.replaceRow(editingRow.key, x))}
        onRemove={() => {
          if (!editingRow) return;
          board.dropRow(editingRow.key);
          setEditing(null);
        }}
      />
      <AddPrizePicker
        rarity={adding}
        onClose={() => setAdding(null)}
        onPick={(p) => {
          if (adding) board.addProduct(adding, p);
          setAdding(null);
        }}
      />
      <CaseTestModal
        open={testing}
        onClose={() => setTesting(false)}
        tier={tier}
        items={rows.map((r, i) => toAdminItem(r, i, tier, sum))}
        draft={board.draft ? toDraft(board.draft) : null}
        lowMarginPercent={current?.lowMarginProductPercent}
      />
      <CaseAutofillModal open={filling} onClose={() => setFilling(false)} tier={tier} t={current} rows={rows} onResult={board.applyAutofill} />
      {current && (
        <CaseTierSettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          t={current}
          busy={patchTier.isPending}
          onPatch={(body, okText) => patchTier.mutate({ body, okText })}
          reminderDays={reminderDays}
        />
      )}
    </div>
  );
}

function EmptyCase({ onFill }: { onFill: () => void }) {
  return (
    <div className="card-2 flex min-w-0 flex-wrap items-center justify-between gap-3 p-3">
      <p className="min-w-0 flex-1 text-[13px] text-[var(--text-muted)]">
        Призов нет — этот кейс не разыгрывается. Соберите его автоматически или добавьте призы в нужную редкость.
      </p>
      <Button variant="accent" icon={<Sparkles className="h-4 w-4" />} onClick={onFill}>
        Автособрать
      </Button>
    </div>
  );
}

function NoCaseNote() {
  return (
    <p className="mt-2 text-[12.5px] font-semibold leading-snug text-[var(--warn)]">
      Ни один кейс сейчас не разыгрывается (выключены или без призов) — в заказ попадёт товар-подарок, если он выбран.
    </p>
  );
}

/** Pick a catalog product as a new prize of the given rarity. */
function AddPrizePicker({ rarity, onClose, onPick }: { rarity: CaseRarity | null; onClose: () => void; onPick: (p: AdminProduct) => void }) {
  return (
    <ProductPickModal
      open={rarity !== null}
      title={rarity ? `Приз · ${CASE_RARITY_LABEL[rarity].toLowerCase()}` : "Приз"}
      onClose={onClose}
      onPick={onPick}
    />
  );
}
