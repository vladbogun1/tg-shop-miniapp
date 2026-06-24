"use client";

/**
 * ORDER DETAIL (design doc §6ter.2 customer view): items, delivery, payment,
 * status timeline, tracking, requisites. Open-chat CTA «Написать в чат».
 * GET /api/me/orders/{id} (queryKey ["me","orders",id]).
 *
 * NEO-BRUTALISM restyle: a sticky ink-bordered header (back + title + status),
 * stacked `.nb` sections (status + StatusTimeline, items with thumbnails,
 * totals, delivery, payment + tracking, reject banner, copyable requisites) and
 * a prominent sticky bottom "Написать в чат" button within thumb reach.
 * All data fields, routes and query keys are preserved.
 */
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  Copy,
  CreditCard,
  MapPin,
  MessageCircle,
  Package,
  Receipt,
  Store,
  Truck,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { StatusTimeline } from "@/components/account/StatusTimeline";
import { GlassButton } from "@/components/ui/GlassButton";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  customerApi,
  type OrderDetail,
  type PaymentRequisites,
} from "@/lib/api";
import { formatDateTime, shortOrderId } from "@/lib/format";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { riseItem, spring, staggerContainer } from "@/lib/motion";
import { haptic } from "@/lib/telegram";

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
      {/* sticky ink header */}
      <header
        className="sticky z-20 -mx-4 mb-4 flex items-center gap-2 border-b-[3px] border-[var(--line)] bg-[var(--bg)] px-4 py-3"
        style={{ top: "var(--safe-top)" }}
      >
        <button
          type="button"
          aria-label="Назад"
          onClick={() => {
            haptic();
            router.push("/account");
          }}
          className="tap nb-flat nb-press -ml-1 flex h-10 w-10 shrink-0 items-center justify-center bg-[var(--surface)] text-[var(--ink)]"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2.75} />
        </button>
        <h1 className="nb-up flex-1 truncate text-[18px] font-black text-[var(--ink)]">
          Заказ {shortOrderId(id)}
        </h1>
        {data && <StatusChip status={data.status} />}
      </header>

      {isLoading && (
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="shimmer h-32 rounded-[var(--r)]" />
          ))}
        </div>
      )}

      {isError && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="nb flex flex-col items-center gap-3 px-6 py-12 text-center"
        >
          <WifiOff className="h-8 w-8 text-[var(--muted)]" strokeWidth={2.5} />
          <p className="text-[14px] font-semibold text-[var(--muted)]">
            Не удалось загрузить заказ.
          </p>
          <GlassButton
            variant="accent"
            loading={isRefetching}
            onClick={() => {
              haptic();
              void refetch();
            }}
          >
            Повторить
          </GlassButton>
        </motion.div>
      )}

      {data && <OrderBody order={data} id={id} />}
    </div>
  );
}

function OrderBody({ order, id }: { order: OrderDetail; id: string }) {
  const isPickup = order.deliveryMethod === "PICKUP";

  return (
    <>
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        // leave room for the sticky chat bar (button + safe area)
        className="flex flex-col gap-4 pb-28"
      >
        {/* status + timeline */}
        <motion.section variants={riseItem} className="nb p-4">
          <h3 className="nb-up mb-3 text-[12px] font-black text-[var(--faint)]">
            Статус
          </h3>
          <StatusTimeline status={order.status} />

          {order.status === "REJECTED" && order.rejectReason && (
            <div className="mt-3 border-[3px] border-[var(--line)] bg-[color-mix(in_srgb,var(--danger)_16%,var(--surface))] px-4 py-3">
              <p className="nb-up text-[11px] font-black text-[var(--danger)]">
                Причина отклонения
              </p>
              <p className="mt-1 text-[14px] font-semibold text-[var(--ink)]">
                {order.rejectReason}
              </p>
            </div>
          )}

          {order.trackingNumber && (
            <div className="mt-3 flex items-center gap-2 border-[3px] border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5">
              <Truck
                className="h-4 w-4 shrink-0 text-[var(--accent)]"
                strokeWidth={2.5}
              />
              <span className="nb-up text-[11px] font-bold text-[var(--muted)]">
                ТТН
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px] font-black text-[var(--ink)]">
                {order.trackingNumber}
              </span>
              <CopyButton value={order.trackingNumber} label="ТТН" />
            </div>
          )}

          <p className="mt-3 text-[12px] font-semibold text-[var(--faint)]">
            Создан {formatDateTime(order.createdAt)}
          </p>
        </motion.section>

        {/* items + totals */}
        <motion.section variants={riseItem} className="nb p-4">
          <h3 className="nb-up mb-3 flex items-center gap-2 text-[12px] font-black text-[var(--faint)]">
            <Package className="h-4 w-4" strokeWidth={2.5} /> Состав
          </h3>
          <div className="flex flex-col gap-3">
            {order.items.map((it, i) => (
              <div key={it.id ?? i} className="flex items-center gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden border-[2.5px] border-[var(--line)]">
                  <Image
                    src={it.imageUrl}
                    alt={it.title}
                    size={120}
                    className="h-full w-full"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[14px] font-bold text-[var(--ink)]">
                    {it.title}
                  </p>
                  {it.variantName && (
                    <p className="text-[12px] font-semibold text-[var(--muted)]">
                      {it.variantName}
                    </p>
                  )}
                  <p className="mt-0.5 text-[12px] font-medium text-[var(--faint)]">
                    {it.quantity} ×{" "}
                    {money(it.priceMinor, it.currency ?? order.currency)}
                  </p>
                </div>
                <span className="shrink-0 text-[14px] font-black text-[var(--ink)]">
                  {money(
                    it.priceMinor * it.quantity,
                    it.currency ?? order.currency
                  )}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-2 border-t-[3px] border-[var(--line)] pt-3">
            <TotalRow
              label="Сумма"
              value={money(order.subtotalMinor, order.currency)}
            />
            {order.discountMinor > 0 && (
              <TotalRow
                label={`Скидка${order.promoCode ? ` (${order.promoCode})` : ""}`}
                value={`− ${money(order.discountMinor, order.currency)}`}
                discount
              />
            )}
            <TotalRow
              label="Итого"
              value={money(order.totalMinor, order.currency)}
              strong
            />
          </div>
        </motion.section>

        {/* delivery + payment */}
        <motion.section
          variants={riseItem}
          className="nb flex flex-col gap-4 p-4"
        >
          <InfoRow
            icon={<Receipt className="h-4 w-4" strokeWidth={2.5} />}
            label="Получатель"
            value={`${order.customerName}, ${order.phone}`}
          />
          <InfoRow
            icon={
              isPickup ? (
                <Store className="h-4 w-4" strokeWidth={2.5} />
              ) : (
                <MapPin className="h-4 w-4" strokeWidth={2.5} />
              )
            }
            label="Доставка"
            value={
              isPickup
                ? "Самовывоз"
                : `Новая Почта · ${order.npCityName ?? ""}${
                    order.npWarehouseName ? `, ${order.npWarehouseName}` : ""
                  }`
            }
          />
          {order.paymentOptionTitle && (
            <InfoRow
              icon={<CreditCard className="h-4 w-4" strokeWidth={2.5} />}
              label="Оплата"
              value={order.paymentOptionTitle}
            />
          )}
          {order.comment && (
            <InfoRow label="Комментарий" value={order.comment} />
          )}
        </motion.section>

        {/* requisites */}
        {order.requisites && hasAnyRequisite(order.requisites) && (
          <motion.section variants={riseItem} className="nb p-4">
            <h3 className="nb-up mb-3 flex items-center gap-2 text-[12px] font-black text-[var(--faint)]">
              <CreditCard className="h-4 w-4" strokeWidth={2.5} /> Реквизиты
              оплаты
            </h3>
            <div className="flex flex-col gap-3">
              {order.requisites.cardNumber && (
                <CopyRow label="Карта" value={order.requisites.cardNumber} />
              )}
              {order.requisites.iban && (
                <CopyRow label="IBAN" value={order.requisites.iban} />
              )}
              {order.requisites.recipient && (
                <InfoRow label="Получатель" value={order.requisites.recipient} />
              )}
              {order.requisites.edrpou && (
                <CopyRow label="РНОКПП" value={order.requisites.edrpou} />
              )}
              {order.requisites.purpose && (
                <InfoRow label="Назначение" value={order.requisites.purpose} />
              )}
              {order.requisites.note && (
                <InfoRow label="Примечание" value={order.requisites.note} />
              )}
            </div>
          </motion.section>
        )}
      </motion.div>

      {/* sticky chat CTA — within thumb reach, above the TabBar */}
      <div
        className="fixed inset-x-0 z-30 mx-auto max-w-[480px] px-4"
        style={{ bottom: "calc(84px + var(--safe-bottom))" }}
      >
        <Link
          href={`/account/orders/${id}/chat`}
          onClick={() => haptic()}
          className="block"
        >
          <GlassButton
            variant="accent"
            fullWidth
            icon={<MessageCircle className="h-4 w-4" strokeWidth={2.75} />}
          >
            Написать в чат
          </GlassButton>
        </Link>
      </div>
    </>
  );
}

function TotalRow({
  label,
  value,
  strong,
  discount,
}: {
  label: string;
  value: string;
  strong?: boolean;
  discount?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span
        className={
          strong
            ? "nb-up text-[14px] font-black text-[var(--ink)]"
            : "text-[13px] font-semibold text-[var(--muted)]"
        }
      >
        {label}
      </span>
      {strong ? (
        <span className="border-[2.5px] border-[var(--line)] bg-[var(--c3)] px-2 py-0.5 text-[16px] font-black text-[var(--ink)]">
          {value}
        </span>
      ) : (
        <span
          className={
            discount
              ? "text-[13px] font-black text-[var(--ok)]"
              : "text-[13px] font-bold text-[var(--ink)]"
          }
        >
          {value}
        </span>
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      {icon && (
        <span className="mt-0.5 shrink-0 text-[var(--accent)]">{icon}</span>
      )}
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="nb-up text-[11px] font-bold text-[var(--faint)]">
          {label}
        </span>
        <span className="break-words text-[14px] font-semibold text-[var(--ink)]">
          {value}
        </span>
      </div>
    </div>
  );
}

/** InfoRow with a copy-to-clipboard action (card/IBAN/edrpou). */
function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="nb-up text-[11px] font-bold text-[var(--faint)]">
          {label}
        </span>
        <span className="break-words text-[14px] font-black text-[var(--ink)]">
          {value}
        </span>
      </div>
      <CopyButton value={value} label={label} />
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    haptic();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={`Скопировать: ${label}`}
      className="tap nb-flat nb-press flex h-9 w-9 shrink-0 items-center justify-center bg-[var(--surface)] text-[var(--ink)]"
    >
      {copied ? (
        <Check className="h-4 w-4 text-[var(--ok)]" strokeWidth={2.75} />
      ) : (
        <Copy className="h-4 w-4 text-[var(--muted)]" strokeWidth={2.5} />
      )}
    </button>
  );
}

function hasAnyRequisite(r: PaymentRequisites): boolean {
  return Boolean(
    r.cardNumber || r.iban || r.recipient || r.edrpou || r.purpose || r.note
  );
}
