"use client";

import { Button } from "@shop/ui/admin-button";
import { nowMs } from "@shop/core/time";
import { motion } from "framer-motion";
import { ChevronDown, Pencil, Percent, Ticket, Trash2, Wallet } from "lucide-react";
import { useState } from "react";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import type { OrderStatus } from "@/lib/api";
import { riseItem } from "@/lib/motion";
import { money } from "@/lib/money";
import { formatDateTime } from "@shop/core/time";
import { shortOrderId as shortId } from "@shop/core/format";
import { promoOrigin, usesOf } from "../model/promo";
import type { PromoCode } from "../model/types";
import { usePromoOrders } from "../queries";

interface Props {
  p: PromoCode;
  onEdit: () => void;
  onDelete: () => void;
  onOpenOrder: (id: string) => void;
}

function Badges({ p, exhausted, heldByReserve }: { p: PromoCode; exhausted: boolean; heldByReserve: boolean }) {
  const origin = promoOrigin(p);
  const expired = !!p.expiresAt && new Date(p.expiresAt).getTime() < nowMs();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[15px] font-semibold tracking-wide text-[var(--ink)]">{p.code}</span>
      <Badge tone={p.active ? "ok" : "neutral"} dot>
        {p.active ? "активен" : "выключен"}
      </Badge>
      {exhausted && <Badge tone="warn">лимит исчерпан</Badge>}
      {heldByReserve && <Badge tone="info">слоты в резерве</Badge>}
      {origin !== "OURS" && (
        <Badge tone="accent">
          {origin === "REVIEW" ? "бонус за отзыв" : "личный"}
          {p.ownerUserId != null ? ` · tg ${p.ownerUserId}` : ""}
        </Badge>
      )}
      {p.expiresAt && (
        <Badge tone={expired ? "warn" : "neutral"}>
          {expired ? "истёк" : "до"} {formatDateTime(p.expiresAt)}
        </Badge>
      )}
    </div>
  );
}

function Discount({ p }: { p: PromoCode }) {
  if (p.discountAmountMinor) {
    return (
      <span className="inline-flex items-center gap-1">
        <Wallet className="h-3.5 w-3.5 text-[var(--text-faint)]" />−{money(p.discountAmountMinor)}
      </span>
    );
  }
  if (p.discountPercent) {
    return (
      <span className="inline-flex items-center gap-1">
        <Percent className="h-3.5 w-3.5 text-[var(--text-faint)]" />
        {p.discountPercent}% скидка
        {p.maxDiscountMinor ? `, не больше ${money(p.maxDiscountMinor)}` : ""}
      </span>
    );
  }
  return null;
}

function OrdersList({ id, onOpenOrder }: { id: string; onOpenOrder: (id: string) => void }) {
  const ordersQ = usePromoOrders(id, true);
  const rows = ordersQ.data ?? [];
  if (ordersQ.isLoading) return <span className="text-[12px] text-[var(--text-faint)]">Загружаем…</span>;
  if (ordersQ.isError) return <span className="text-[12px] text-[var(--danger-ink)]">Не удалось загрузить заказы</span>;
  if (rows.length === 0) {
    return (
      <span className="text-[12px] text-[var(--text-faint)]">
        Заказов с этим кодом нет (возможно, их удалили или код переименовали).
      </span>
    );
  }
  return (
    <>
      {rows.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onOpenOrder(o.id)}
          className="card-2 flex flex-wrap items-center gap-2 rounded-[var(--r-sm)] px-3 py-2 text-left text-[12.5px] hover:bg-[var(--surface-hover)]"
        >
          <span className="font-mono font-semibold text-[var(--text)]">{shortId(o.id)}</span>
          <StatusBadge status={o.status as OrderStatus} />
          <span className="min-w-0 flex-1 truncate text-[var(--text-muted)]">{o.customerName ?? "—"}</span>
          <span className="tabular font-semibold text-[var(--text)]">{money(o.totalMinor)}</span>
          <span className="text-[var(--ok)]">−{money(o.discountMinor)}</span>
          <span className="text-[var(--text-faint)]">{formatDateTime(o.createdAt)}</span>
        </button>
      ))}
    </>
  );
}

export function PromoRow({ p, onEdit, onDelete, onOpenOrder }: Props) {
  const [showOrders, setShowOrders] = useState(false);
  const limited = !!p.maxUses;
  const used = usesOf(p);
  const reserved = p.reservedCount ?? 0;
  const exhausted = limited && used >= (p.maxUses ?? 0);
  const heldByReserve = limited && !exhausted && used + reserved >= (p.maxUses ?? 0);

  return (
    <motion.div variants={riseItem} className="card card-hover flex flex-col gap-3 px-4 py-3.5">
      <div className="flex items-center gap-4">
        <div className="accent-tint grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-md)]">
          <Ticket className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <Badges p={p} exhausted={exhausted} heldByReserve={heldByReserve} />
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[var(--text-muted)]">
            <Discount p={p} />
            <span className="text-[var(--text-faint)]">
              {limited ? `Использовано ${used} / ${p.maxUses}` : `Использовано ${used} · без лимита`}
              {reserved > 0 ? ` · резерв ${reserved}` : ""}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="ghost" size="icon" aria-label="Редактировать" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Удалить"
            className="hover:text-[var(--danger-ink)]"
            disabled={used > 0}
            title={used > 0 ? "Промокод уже использовали — его можно только выключить" : undefined}
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {used > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowOrders((v) => !v)}
            className="hit inline-flex items-center gap-1 font-display text-[11.5px] font-bold uppercase tracking-[0.06em] text-[var(--accent-hi)] hover:underline"
          >
            Заказы с кодом
            <ChevronDown className={showOrders ? "h-3.5 w-3.5 rotate-180" : "h-3.5 w-3.5"} />
          </button>
          {showOrders && (
            <div className="mt-2 flex flex-col gap-1.5">
              <OrdersList id={p.id} onOpenOrder={onOpenOrder} />
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
