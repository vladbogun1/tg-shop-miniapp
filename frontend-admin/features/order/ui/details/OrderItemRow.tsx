"use client";

/** Строка состава: фото и название открывают товар, кнопки количества и «убрать» — пока заказ можно править. */
import { Trash2 } from "lucide-react";
import type { CSSProperties } from "react";
import { CASE_RARITY_COLOR, CASE_TIER_METAL } from "@shop/core/giftcase";
import { money } from "@/lib/money";
import { CASE_RARITY_LABEL, CASE_TIER_LABEL } from "@/features/gift";
import { Image } from "@/lib/image";
import { cn } from "@/lib/cn";
import type { AdminOrderDetail } from "../../api";
import type { DetailHandlers } from "./types";

type Item = AdminOrderDetail["items"][number];

/** «🎁 Кейс · редкость» / «🎁 Подарок» / «🎁 За сумму» перед названием. */
function GiftChip({ it }: { it: Item }) {
  if (!it.gift) return null;
  if (it.caseRarity) {
    return (
      <span
        className="chip-tint mr-1.5 !px-2 align-[1px] !text-[10px]"
        style={{ "--chip": CASE_RARITY_COLOR[it.caseRarity] } as CSSProperties}
      >
        🎁 Кейс · {CASE_RARITY_LABEL[it.caseRarity]}
      </span>
    );
  }
  return (
    <span className="chip-tint mr-1.5 !px-2 align-[1px] !text-[10px]" style={{ "--chip": "var(--accent-hi)" } as CSSProperties}>
      {it.autoGift ? "🎁 За сумму" : "🎁 Подарок"}
    </span>
  );
}

function VariantLine({ it, order }: { it: Item; order: AdminOrderDetail }) {
  if (it.variantPending) {
    return (
      <div className="text-[12px] font-semibold text-[var(--warn)]">
        ⚠ размер не выбран
        {order.giftCaseStatus === "SEALED" ? " (выберет после открытия кейса)" : ""}
        {it.variantName && <span className="font-normal text-[var(--text-faint)]"> · пока забронирован {it.variantName}</span>}
      </div>
    );
  }
  return it.variantName ? <div className="text-[12px] text-[var(--text-faint)]">{it.variantName}</div> : null;
}

function CaseLines({ it, order }: { it: Item; order: AdminOrderDetail }) {
  const gift = order.gift ?? null;
  if (!it.caseRarity) return null;
  return (
    <>
      {gift?.tier && (
        <div className="text-[12px] font-semibold" style={{ color: CASE_TIER_METAL[gift.tier].ga }}>
          {CASE_TIER_LABEL[gift.tier]} кейс
          {gift.swap?.swappedAt ? " · заменён на промокод" : ""}
        </div>
      )}
      {order.giftCaseStatus === "SEALED" && (
        <div className="text-[12px] text-[var(--text-faint)]">
          покупатель ещё не открыл кейс
          {!order.giftCaseOpenable && order.status !== "REJECTED" && " · откроет после оплаты"}
        </div>
      )}
    </>
  );
}

const STEP_BTN =
  "nb-press grid h-9 w-9 place-items-center text-[16px] font-semibold leading-none text-[var(--text)] transition-colors hover:bg-[var(--surface-3)] disabled:opacity-40 pointer-coarse:h-11 pointer-coarse:w-11";

/**
 * «− 2 +» одной таблеткой (36 px, на тач 44) и корзина отдельно, с зазором: промах по «−» не нажимает «+» или удаление.
 * Количество оплаченного заказа запускает доплату — поэтому цели крупные, а удаление всегда через подтверждение.
 */
function QtyControls({ it, h }: { it: Item; h: DetailHandlers }) {
  const id = it.id!;
  return (
    <div className="mt-1.5 flex items-center gap-3">
      <div className="inline-flex items-center overflow-hidden rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)]">
        <button
          type="button"
          onClick={() => h.onChangeQty(id, it.quantity - 1)}
          disabled={!!h.busyKey || it.quantity <= 1}
          className={STEP_BTN}
          aria-label="Меньше"
        >
          −
        </button>
        <span className="tabular w-8 text-center text-[13px] font-semibold text-[var(--text)]" aria-live="polite">
          {it.quantity}
        </span>
        <button
          type="button"
          onClick={() => h.onChangeQty(id, it.quantity + 1)}
          disabled={!!h.busyKey}
          className={STEP_BTN}
          aria-label="Больше"
        >
          +
        </button>
      </div>
      <button
        type="button"
        onClick={() => h.onRemoveItem(id, it.title)}
        disabled={!!h.busyKey}
        className="nb-press grid h-9 w-9 place-items-center rounded-[var(--r-md)] border border-transparent text-[var(--text-faint)] transition-colors hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] hover:text-[var(--danger-ink)] focus-visible:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] focus-visible:text-[var(--danger-ink)] disabled:opacity-40 pointer-coarse:h-11 pointer-coarse:w-11"
        aria-label="Убрать позицию"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function ItemTitle({ it, open }: { it: Item; open: (() => void) | undefined }) {
  return (
    // Two lines, not one: on a phone a single truncated line hid what was ordered.
    <div
      role={open ? "button" : undefined}
      tabIndex={open ? 0 : undefined}
      onClick={open}
      onKeyDown={open ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open()) : undefined}
      className={cn(
        "line-clamp-2 break-words text-[14px] leading-snug text-[var(--text)]",
        open && "cursor-pointer decoration-[var(--accent)] underline-offset-2 hover:underline",
      )}
      title={it.title}
    >
      <GiftChip it={it} />
      {it.title}
    </div>
  );
}

function ItemPrice({ it, currency }: { it: Item; currency: string }) {
  return (
    <div className="shrink-0 text-right text-[13px]">
      <div className="tabular font-semibold text-[var(--text)]">{it.gift ? "0 ₴" : money(it.priceMinor * it.quantity, currency)}</div>
      {!it.gift && it.quantity > 1 && <div className="text-[11px] text-[var(--text-faint)]">{money(it.priceMinor, currency)}/шт</div>}
    </div>
  );
}

export function OrderItemRow({ it, order, h }: { it: Item; order: AdminOrderDetail; h: DetailHandlers }) {
  const editable = order.status === "NEW" || order.status === "APPROVED";
  const pid = it.productId;
  const open = h.onOpenProduct && pid ? () => h.onOpenProduct!(pid) : undefined;
  return (
    <div className="flex items-start gap-3">
      {/* Photo and title open the product's quick view; the qty buttons below stay their own targets. */}
      <button
        type="button"
        onClick={open}
        disabled={!open}
        aria-label={`Просмотр товара «${it.title}»`}
        className="nb-press shrink-0 rounded-[var(--r-md)] transition-shadow enabled:hover:shadow-[0_0_0_2px_var(--accent)] disabled:cursor-default pointer-coarse:-m-1 pointer-coarse:p-1"
      >
        <Image
          src={it.imageUrl ?? undefined}
          alt={it.title}
          size={96}
          className="h-12 w-12 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)]"
        />
      </button>
      <div className="min-w-0 flex-1">
        <ItemTitle it={it} open={open} />
        <VariantLine it={it} order={order} />
        <CaseLines it={it} order={order} />
        {(it.returnedQty ?? 0) > 0 && <div className="text-[12px] font-semibold text-[var(--warn)]">↩ возвращено {it.returnedQty} шт.</div>}
        {editable && it.id != null ? (
          <QtyControls it={it} h={h} />
        ) : (
          <div className="mt-0.5 text-[12px] text-[var(--text-faint)]">×{it.quantity}</div>
        )}
      </div>
      <ItemPrice it={it} currency={order.currency} />
    </div>
  );
}
