"use client";

/**
 * ORDER DETAIL (design doc §6ter.2 customer view): items, delivery, payment,
 * status timeline, tracking, requisites. Top button «💬 Чат заказа».
 * GET /api/me/orders/{id}.
 */
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MessageCircle, Package, Truck, WifiOff } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { StatusTimeline } from "@/components/account/StatusTimeline";
import { GlassButton } from "@/components/ui/GlassButton";
import { StatusChip } from "@/components/ui/StatusChip";
import { customerApi, type OrderDetail } from "@/lib/api";
import { formatDateTime, shortOrderId } from "@/lib/format";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["me", "orders", id],
    queryFn: () => customerApi.getOrder(id),
    enabled: !!id,
  });

  return (
    <div className="pt-2">
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          aria-label="Назад"
          onClick={() => router.push("/account")}
          className="tap -ml-2 flex items-center justify-center rounded-full text-[var(--text-muted)]"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-[22px] font-bold text-[var(--text)]">
          Заказ {shortOrderId(id)}
        </h1>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="shimmer h-28 rounded-[var(--r-md)]" />
          ))}
        </div>
      )}

      {isError && (
        <div className="glass flex flex-col items-center gap-3 rounded-[var(--r-lg)] px-6 py-12 text-center">
          <WifiOff className="h-8 w-8 text-[var(--text-muted)]" />
          <p className="text-[14px] text-[var(--text-muted)]">
            Не удалось загрузить заказ.
          </p>
          <GlassButton variant="accent" loading={isRefetching} onClick={() => refetch()}>
            Повторить
          </GlassButton>
        </div>
      )}

      {data && <OrderBody order={data} id={id} />}
    </div>
  );
}

function OrderBody({ order, id }: { order: OrderDetail; id: string }) {
  return (
    <div className="flex flex-col gap-4">
      {/* chat CTA */}
      <Link href={`/account/orders/${id}/chat`} className="block">
        <GlassButton variant="accent" fullWidth icon={<MessageCircle className="h-4 w-4" />}>
          Чат заказа
        </GlassButton>
      </Link>

      {/* status */}
      <section className="glass rounded-[var(--r-md)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
            Статус
          </h3>
          <StatusChip status={order.status} />
        </div>
        <StatusTimeline status={order.status} />
        {order.status === "REJECTED" && order.rejectReason && (
          <p className="mt-2 text-[13px] text-[var(--danger)]">
            Причина: {order.rejectReason}
          </p>
        )}
        {order.trackingNumber && (
          <div className="mt-3 flex items-center gap-2 rounded-[var(--r-sm)] bg-white/5 px-3 py-2">
            <Truck className="h-4 w-4 text-[var(--accent)]" />
            <span className="text-[13px] text-[var(--text-muted)]">ТТН:</span>
            <span className="text-[14px] font-semibold text-[var(--text)]">
              {order.trackingNumber}
            </span>
          </div>
        )}
        <p className="mt-3 text-[12px] text-[var(--text-faint)]">
          Создан {formatDateTime(order.createdAt)}
        </p>
      </section>

      {/* items */}
      <section className="glass rounded-[var(--r-md)] p-4">
        <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
          <Package className="h-4 w-4" /> Состав
        </h3>
        <div className="flex flex-col gap-3">
          {order.items.map((it, i) => (
            <div key={it.id ?? i} className="flex items-center gap-3">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[var(--r-sm)]">
                <Image src={it.imageUrl} alt={it.title} size={120} className="h-full w-full" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[14px] font-medium text-[var(--text)]">
                  {it.title}
                </p>
                {it.variantName && (
                  <p className="text-[12px] text-[var(--text-muted)]">{it.variantName}</p>
                )}
                <p className="text-[12px] text-[var(--text-faint)]">
                  {it.quantity} × {money(it.priceMinor, it.currency ?? order.currency)}
                </p>
              </div>
              <span className="text-[14px] font-semibold text-[var(--text)]">
                {money(it.priceMinor * it.quantity, it.currency ?? order.currency)}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-1.5 border-t border-white/10 pt-3">
          <TotalRow label="Сумма" value={money(order.subtotalMinor, order.currency)} />
          {order.discountMinor > 0 && (
            <TotalRow
              label={`Скидка${order.promoCode ? ` (${order.promoCode})` : ""}`}
              value={`− ${money(order.discountMinor, order.currency)}`}
            />
          )}
          <TotalRow label="Итого" value={money(order.totalMinor, order.currency)} strong />
        </div>
      </section>

      {/* delivery + payment */}
      <section className="glass flex flex-col gap-3 rounded-[var(--r-md)] p-4">
        <InfoRow label="Получатель" value={`${order.customerName}, ${order.phone}`} />
        <InfoRow
          label="Доставка"
          value={
            order.deliveryMethod === "PICKUP"
              ? "Самовывоз"
              : `Новая Почта · ${order.npCityName ?? ""}${
                  order.npWarehouseName ? `, ${order.npWarehouseName}` : ""
                }`
          }
        />
        {order.paymentOptionTitle && (
          <InfoRow label="Оплата" value={order.paymentOptionTitle} />
        )}
        {order.comment && <InfoRow label="Комментарий" value={order.comment} />}
      </section>

      {/* requisites */}
      {order.requisites && (
        <section className="glass rounded-[var(--r-md)] p-4">
          <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
            Реквизиты оплаты
          </h3>
          <div className="flex flex-col gap-1.5">
            {order.requisites.cardNumber && (
              <InfoRow label="Карта" value={order.requisites.cardNumber} />
            )}
            {order.requisites.iban && <InfoRow label="IBAN" value={order.requisites.iban} />}
            {order.requisites.recipient && (
              <InfoRow label="Получатель" value={order.requisites.recipient} />
            )}
            {order.requisites.edrpou && (
              <InfoRow label="РНОКПП" value={order.requisites.edrpou} />
            )}
            {order.requisites.purpose && (
              <InfoRow label="Назначение" value={order.requisites.purpose} />
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function TotalRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={
          strong
            ? "text-[15px] font-semibold text-[var(--text)]"
            : "text-[13px] text-[var(--text-muted)]"
        }
      >
        {label}
      </span>
      <span
        className={
          strong
            ? "text-[16px] font-bold text-[var(--accent)]"
            : "text-[13px] text-[var(--text)]"
        }
      >
        {value}
      </span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">
        {label}
      </span>
      <span className="break-words text-[14px] text-[var(--text)]">{value}</span>
    </div>
  );
}
