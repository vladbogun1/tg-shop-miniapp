"use client";

/**
 * «🎁 Выдать кейс» (POST /api/admin/orders/{id}/gift-case): the admin picks the tier (bronze / silver /
 * gold); the server draws the prize right away among that tier's prizes that can drop — a product is
 * added to the order for free, a discount becomes a personal code (status SEALED); the customer opens
 * the case after paying. The admin also chooses whether the bot tells the customer.
 */
import { useEffect } from "react";
import { CASE_TIER_METAL, CASE_TIER_ORDER, type CaseTier } from "@shop/core/giftcase";
import { useForm } from "@shop/ui/form";
import { CASE_TIER_LABEL } from "@/features/gift";
import { useGiftTiersQuery } from "../../queries/modals";
import { cn } from "@/lib/cn";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";

/** У уровня есть что выдать (пока список не загружен — считаем, что есть). */
function tierIsLive(tiers: { tier: CaseTier; livePrizes?: number | null }[] | undefined, t: CaseTier): boolean {
  return (tiers?.find((x) => x.tier === t)?.livePrizes ?? 1) > 0;
}

export function GiftCaseModal({
  open,
  loading,
  onClose,
  onConfirm,
}: {
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (tier: CaseTier, notifyCustomer: boolean) => void;
}) {
  const form = useForm<{ notify: boolean; tier: CaseTier }>({ defaultValues: { notify: true, tier: "SILVER" } });
  const { notify, tier } = form.watch();
  const { setValue, getValues } = form;
  const tiersQ = useGiftTiersQuery(open);
  const tiers = tiersQ.data;
  const live = (t: CaseTier) => tierIsLive(tiers, t);
  useEffect(() => {
    if (open) setValue("notify", true);
  }, [open, setValue]);
  // Default: silver, or the first tier that has something to drop.
  useEffect(() => {
    if (!open || !tiers) return;
    const current = getValues("tier");
    if (!tierIsLive(tiers, current)) {
      setValue("tier", (["SILVER", "BRONZE", "GOLD"] as CaseTier[]).find((t) => tierIsLive(tiers, t)) ?? current);
    }
  }, [open, tiers, getValues, setValue]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="🎁 Выдать кейс?"
      footer={
        <>
          <ModalCancel />
          <Button variant="accent" loading={loading} disabled={!live(tier)} onClick={() => onConfirm(tier, notify)}>
            Выдать {CASE_TIER_LABEL[tier].toLowerCase()}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div role="radiogroup" aria-label="Кейс" className="grid grid-cols-3 gap-2">
          {CASE_TIER_ORDER.map((t) => {
            const on = t === tier;
            const ok = live(t);
            const color = CASE_TIER_METAL[t].ga;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={!ok}
                onClick={() => form.setValue("tier", t)}
                className={cn(
                  "focusable card-2 flex min-w-0 flex-col items-center gap-1 px-1 pb-2 pt-1.5 text-center transition-[border-color,background] disabled:opacity-40",
                  on ? "!border-[var(--tier)] bg-[color-mix(in_srgb,var(--tier)_12%,var(--surface-2))]" : "hover:bg-[var(--surface-hover)]"
                )}
                style={{ ["--tier" as string]: color }}
              >
                <img src={`/case/${t.toLowerCase()}/case-closed-sm.webp`} alt="" className="h-10 w-14 object-contain" draggable={false} />
                <span className="font-display text-[12.5px] font-bold leading-tight" style={{ color: on ? color : "var(--ink)" }}>
                  {CASE_TIER_LABEL[t]}
                </span>
                {!ok && <span className="text-[10.5px] leading-tight text-[var(--text-faint)]">нет призов</span>}
              </button>
            );
          })}
        </div>
        <p className="text-[13.5px] leading-snug text-[var(--text-muted)]">
          Сервер сразу разыграет приз этого кейса: товар добавится в заказ бесплатно, скидка станет личным промокодом. Покупатель
          откроет кейс после оплаты.
        </p>
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[14px] font-semibold text-[var(--text)]">
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 accent-[var(--accent)]"
            {...form.register("notify")}
          />
          Сообщить покупателю в Telegram
        </label>
      </div>
    </Modal>
  );
}
