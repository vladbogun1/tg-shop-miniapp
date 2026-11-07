"use client";

import { nowMs, formatDateTime } from "@shop/core/time";
import { useConfirm } from "@shop/ui/confirm";
import { toast } from "@shop/ui/toast";
import { Copy, ListOrdered, Pencil, Percent, Trash2, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { copyText } from "@/components/ui/CopyButton";
import { Toggle } from "@/components/ui/Toggle";
import { cn } from "@/lib/cn";
import { money } from "@/lib/money";
import { mainStatus, promoOrigin, ratioPercent, usesOf, type MainStatus } from "../model/promo";
import type { PromoCode, PromoOrigin } from "../model/types";
import { useTogglePromo } from "../queries";
import { RowMenu, type MenuItem } from "./RowMenu";

interface Props {
  p: PromoCode;
  onEdit: () => void;
  onDelete: () => void;
  onOrders: () => void;
}

const STATUS_BADGE: Record<MainStatus, { tone: "ok" | "neutral" | "warn" | "info"; label: string }> = {
  live: { tone: "ok", label: "активен" },
  off: { tone: "neutral", label: "выключен" },
  exhausted: { tone: "warn", label: "лимит исчерпан" },
  expired: { tone: "warn", label: "истёк" },
  reserve: { tone: "info", label: "слоты в резерве" },
};

const ORIGIN_LABEL: Record<Exclude<PromoOrigin, "OURS">, string> = {
  REVIEW: "бонус за отзыв",
  PERSONAL: "личный",
  CASE: "приз кейса",
};

function Discount({ p }: { p: PromoCode }) {
  if (p.discountAmountMinor) {
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-[var(--text)]">
        <Wallet className="h-3.5 w-3.5 text-[var(--text-faint)]" />−{money(p.discountAmountMinor)}
      </span>
    );
  }
  if (p.discountPercent) {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-1 font-semibold text-[var(--text)]">
        <Percent className="h-3.5 w-3.5 text-[var(--text-faint)]" />
        {p.discountPercent}% скидка
        {p.maxDiscountMinor ? (
          <span className="font-normal text-[var(--text-muted)]">, не больше {money(p.maxDiscountMinor)}</span>
        ) : null}
      </span>
    );
  }
  return null;
}

/** «Использовано 3 / 10» с мини-полосой; резерв — в той же подписи. */
function Usage({ p }: { p: PromoCode }) {
  const used = usesOf(p);
  const reserved = p.reservedCount ?? 0;
  const max = p.maxUses ?? 0;
  return (
    <div className="min-w-0 text-[12.5px] text-[var(--text-faint)]">
      {max ? `Использовано ${used} / ${max}` : `Использовано ${used} · без лимита`}
      {reserved > 0 ? ` · резерв ${reserved}` : ""}
      {max > 0 && (
        <div className="mt-1 h-1 w-full max-w-[140px] overflow-hidden rounded-full bg-[var(--surface-3)]" aria-hidden>
          <div
            className={cn("h-full rounded-full", used >= max ? "bg-[var(--warn)]" : "bg-[var(--accent)]")}
            style={{ width: `${ratioPercent(used, max)}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function PromoRow({ p, onEdit, onDelete, onOrders }: Props) {
  const confirm = useConfirm();
  const toggleM = useTogglePromo();
  const status = STATUS_BADGE[mainStatus(p, nowMs())];
  const origin = promoOrigin(p);
  const used = usesOf(p);
  const reserved = p.reservedCount ?? 0;

  async function toggle(active: boolean) {
    if (!active && reserved > 0) {
      const ok = await confirm({
        title: "Выключить код?",
        message: `Клиентов, которые держат этот код в корзине (резерв на 30 минут): ${reserved}. При оформлении у них код перестанет работать.`,
        confirmLabel: "Выключить",
      });
      if (!ok) return;
    }
    toggleM.mutate({ p, active });
  }

  const items: MenuItem[] = [
    { key: "edit", label: "Редактировать", icon: <Pencil className="h-4 w-4" />, onSelect: onEdit },
    ...(used > 0 ? [{ key: "orders", label: "Заказы с кодом", icon: <ListOrdered className="h-4 w-4" />, onSelect: onOrders }] : []),
    {
      key: "copy",
      label: "Копировать код",
      icon: <Copy className="h-4 w-4" />,
      onSelect: () => void copyText(p.code).then((ok) => (ok ? toast.success("Код скопирован") : toast.error("Не удалось скопировать"))),
    },
    {
      key: "delete",
      label: "Удалить",
      icon: <Trash2 className="h-4 w-4" />,
      danger: true,
      disabled: used > 0,
      hint: used > 0 ? `Код уже использован ${used} раз — можно только выключить` : undefined,
      onSelect: onDelete,
    },
  ];

  return (
    <div
      data-testid="promo-row"
      className={cn(
        "flex min-h-[56px] flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 pointer-coarse:min-h-[64px] sm:px-4",
        "lg:grid lg:grid-cols-[minmax(170px,1.3fr)_minmax(180px,1.2fr)_minmax(150px,1fr)_auto] lg:gap-x-4",
        !p.active && "opacity-80"
      )}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 lg:flex-none">
        <span className="font-mono text-[15px] font-semibold tracking-wide text-[var(--ink)]">{p.code}</span>
        <Badge tone={status.tone} dot>
          {status.label}
        </Badge>
        {origin !== "OURS" && (
          <Badge tone="accent">
            {ORIGIN_LABEL[origin]}
            {p.ownerUserId != null ? ` · tg ${p.ownerUserId}` : ""}
          </Badge>
        )}
        {p.expiresAt && <span className="text-[12px] text-[var(--text-faint)]">до {formatDateTime(p.expiresAt)}</span>}
      </div>

      <div className="order-3 w-full text-[12.5px] text-[var(--text-muted)] lg:order-none lg:w-auto">
        <Discount p={p} />
      </div>
      <div className="order-4 w-full lg:order-none lg:w-auto">
        <Usage p={p} />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
        <Toggle checked={p.active} disabled={toggleM.isPending} onChange={(on) => void toggle(on)} />
        <RowMenu title={p.code} items={items} />
      </div>
    </div>
  );
}
