"use client";

/**
 * Отправка (route "/dispatch") — Neo-Brutalism.
 *
 * Seller-facing shipping list: all APPROVED orders with everything needed to
 * ship at Nova Poshta — what to send, to whom, the address, and CRITICALLY how
 * much cash-on-delivery (наложка) to set, accounting for prepayment / full
 * payment. The big COD callout prevents charging COD on paid orders or
 * forgetting to subtract a prepayment.
 *
 * Backend + lib/api.ts are already done (adminApi.dispatch / dispatchBroadcast).
 * Query key: ["dispatch"].
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { MapPin, Package, Phone, Send, Truck, Hash } from "lucide-react";
import { adminApi, ApiError, type DispatchOrder } from "@/lib/api";
import { money } from "@/lib/money";
import { useToast } from "@/lib/toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { CenterSpinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";

export default function DispatchPage() {
  const { push } = useToast();
  const [broadcasting, setBroadcasting] = useState(false);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["dispatch"],
    queryFn: () => adminApi.dispatch(),
  });

  async function broadcast() {
    setBroadcasting(true);
    try {
      const { posted } = await adminApi.dispatchBroadcast();
      push(
        posted > 0
          ? `Добавлено в Telegram: ${posted}`
          : "Все карточки уже в Telegram",
        "ok"
      );
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Ошибка отправки", "error");
    } finally {
      setBroadcasting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Отправка"
        subtitle="Что отправлять и сколько брать наложкой"
        actions={
          <Button
            variant="accent"
            loading={broadcasting}
            icon={<Send className="h-4 w-4" />}
            onClick={broadcast}
            disabled={orders.length === 0}
          >
            Отправить в Telegram
          </Button>
        }
      />

      {isLoading ? (
        <CenterSpinner label="Загрузка заказов…" />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Нет заказов к отправке"
          description="Подтверждённые заказы появятся здесь — со всем, что нужно для отправки."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {orders.map((o, i) => (
            <DispatchCard key={o.id} o={o} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function DispatchCard({ o, index }: { o: DispatchOrder; index: number }) {
  const isPickup = o.deliveryMethod === "PICKUP";

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1], delay: index * 0.04 }}
      className="panel flex flex-col gap-4 p-4 sm:p-5"
    >
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b-2 border-[var(--line)] pb-3.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="inline-flex items-center gap-1 rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[13px] font-extrabold text-[var(--text)]">
            <Hash className="h-3.5 w-3.5" />
            {o.shortId}
          </span>
          <span className="text-[16px] font-black uppercase tracking-wide text-[var(--text)]">
            {o.customerName}
          </span>
          <a
            href={`tel:${o.phone}`}
            className="inline-flex items-center gap-1 text-[13px] font-bold text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <Phone className="h-3.5 w-3.5" />
            {o.phone}
          </a>
        </div>
        <Badge tone={o.paid ? "ok" : "warn"}>{o.paid ? "Оплачен" : "Не оплачен"}</Badge>
      </div>

      {/* Address */}
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)]">
          {isPickup ? <MapPin className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
        </span>
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-faint)]">
            Доставка
          </div>
          <div className="text-[14px] font-extrabold text-[var(--text)]">
            {isPickup ? "Самовывоз" : `Нова Пошта · ${o.npCityName ?? ""}, ${o.npWarehouseName ?? ""}`}
          </div>
        </div>
      </div>

      {/* Items */}
      <div>
        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-faint)]">
          Товары
        </div>
        <ul className="flex flex-col gap-1">
          {o.items.map((it, idx) => (
            <li key={idx} className="text-[14px] font-medium text-[var(--text)]">
              <span className="text-[var(--accent)]">•</span>{" "}
              {it.title}
              {it.variantName ? ` (${it.variantName})` : ""}{" "}
              <span className="font-extrabold">× {it.quantity}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Money block */}
      <div className="flex flex-col gap-1 border-t-2 border-[var(--line)] pt-3.5 text-[13px]">
        <div className="flex items-center justify-between gap-3">
          <span className="font-bold uppercase tracking-wide text-[var(--text-muted)]">
            Сумма заказа
          </span>
          <span className="font-extrabold text-[var(--text)]">
            {money(o.totalMinor, o.currency)}
          </span>
        </div>
        {o.paymentOptionTitle && (
          <div className="flex items-center justify-between gap-3">
            <span className="font-bold uppercase tracking-wide text-[var(--text-muted)]">
              Оплата
            </span>
            <span className="font-bold text-[var(--text)]">{o.paymentOptionTitle}</span>
          </div>
        )}
        {o.receivedMinor > 0 && (
          <div className="flex items-center justify-between gap-3">
            <span className="font-bold uppercase tracking-wide text-[var(--text-muted)]">
              Оплачено
            </span>
            <span className="font-extrabold text-[var(--ok)]">
              {money(o.receivedMinor, o.currency)}
            </span>
          </div>
        )}
      </div>

      {/* THE KEY LINE — big COD callout */}
      <CodCallout o={o} />

      {/* Tracking number */}
      {o.trackingNumber && (
        <div className="flex items-center gap-2 text-[13px]">
          <span className="font-bold uppercase tracking-wide text-[var(--text-faint)]">ТТН</span>
          <span className="rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--surface-2)] px-2 py-0.5 font-mono font-extrabold text-[var(--text)]">
            {o.trackingNumber}
          </span>
        </div>
      )}
    </motion.div>
  );
}

/**
 * The most prominent thing on the card. Bright fill + DARK text (--accent-ink)
 * for contrast in both themes, thick ink border, hard shadow.
 */
function CodCallout({ o }: { o: DispatchOrder }) {
  const base =
    "rounded-[var(--r-md)] border-[3px] border-[var(--line)] px-4 py-3.5 shadow-[5px_5px_0_var(--shadow)] text-[var(--accent-ink)]";

  // Paid in full — no COD.
  if (o.codMinor === 0) {
    return (
      <div className={`${base} bg-[var(--ok)]`}>
        <div className="text-[20px] font-black uppercase leading-tight tracking-wide sm:text-[24px]">
          Наложка: 0
        </div>
        <div className="mt-0.5 text-[13px] font-bold uppercase tracking-wide opacity-80">
          Оплачено, без наложки
        </div>
      </div>
    );
  }

  // Partial prepayment — COD = total − received.
  if (o.receivedMinor > 0) {
    return (
      <div className={`${base} bg-[var(--warn)]`}>
        <div className="text-[20px] font-black uppercase leading-tight tracking-wide sm:text-[26px]">
          Наложка: {money(o.codMinor, o.currency)}
        </div>
        <div className="mt-0.5 text-[12px] font-bold uppercase tracking-wide opacity-80">
          (сумма {money(o.totalMinor, o.currency)} − предоплата{" "}
          {money(o.receivedMinor, o.currency)})
        </div>
      </div>
    );
  }

  // Unpaid — full COD.
  return (
    <div className={`${base} bg-[var(--danger)]`}>
      <div className="text-[20px] font-black uppercase leading-tight tracking-wide sm:text-[26px]">
        Наложка: {money(o.codMinor, o.currency)}
      </div>
      <div className="mt-0.5 text-[13px] font-bold uppercase tracking-wide opacity-80">
        Не оплачено
      </div>
    </div>
  );
}
