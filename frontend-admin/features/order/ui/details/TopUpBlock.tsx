"use client";

/**
 * «Доплата» — оплаченный онлайн заказ подорожал (добавили позицию, нажали «+»).
 * По умолчанию покупатель доплачивает онлайн: бот пришлёт «Потрібна доплата» с кнопкой, когда правки
 * затихнут (~2 мин), — поэтому «+» можно жать сколько угодно, ни диалогов, ни сообщений на каждое нажатие.
 * Здесь только смена способа: наложкой при получении (заказ можно отправлять) или за счёт магазина (скидка).
 */
import { CircleDollarSign, Gift, Package, Smartphone } from "lucide-react";
import { money } from "@/lib/money";
import { needsTopUp } from "@shop/core/orders";
import { useConfirm } from "@shop/ui/confirm";
import { Button } from "@shop/ui/admin-button";
import type { AdminOrderDetail } from "../../api";
import { useTopUpModeMutation } from "../../queries/details";

/** Тот же набор условий, что у сервера (OrderMoney.topUpDueMinor): оплачен онлайн, стал дороже, ещё не отправлен. */
export function hasTopUp(order: AdminOrderDetail): boolean {
  return needsTopUp(order) && order.paid && !order.exchangeOfId && !!order.paymentDueAt;
}

function NoticeState({ order }: { order: AdminOrderDetail }) {
  if (order.topUpNotified) return <>Покупателю отправлено сообщение с кнопкой «Доплатити».</>;
  return <>Сообщение покупателю уйдёт примерно через 2 минуты после последней правки состава.</>;
}

export function TopUpBlock({ order, onChanged }: { order: AdminOrderDetail; onChanged?: () => void }) {
  const confirm = useConfirm();
  const m = useTopUpModeMutation(order.id, onChanged);
  if (!hasTopUp(order)) return null;

  const due = money(order.amountDueMinor, order.currency);
  const cod = order.balanceOnDelivery;

  async function waive() {
    const ok = await confirm({
      title: `Доплату ${due} — за счёт магазина?`,
      message: "Разница станет скидкой, итог заказа сравняется с уже оплаченным. Покупатель ничего не доплачивает.",
      confirmLabel: "Списать",
      danger: true,
    });
    if (ok) m.mutate("WAIVE");
  }

  return (
    <section
      aria-label="Доплата"
      className="mt-4 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--warn)_50%,transparent)] bg-[color-mix(in_srgb,var(--warn)_8%,var(--surface))] p-3 text-[13px]"
    >
      <div className="flex items-center gap-2 font-semibold text-[var(--text)]">
        <CircleDollarSign className="h-4 w-4 shrink-0 text-[var(--warn)]" />
        <span>
          Доплата {due} — {cod ? "наложкой при получении" : "онлайн"}
        </span>
      </div>
      <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">
        {cod
          ? "Заказ можно отправлять: остаток покупатель оплатит на почте (или онлайн, если захочет). "
          : "Пока не доплачено, отправка заблокирована. "}
        <NoticeState order={order} />
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {cod ? (
          <Button
            variant="surface"
            size="sm"
            icon={<Smartphone className="h-4 w-4" />}
            disabled={m.isPending}
            onClick={() => m.mutate("ONLINE")}
          >
            Вернуть онлайн
          </Button>
        ) : (
          <Button
            variant="surface"
            size="sm"
            icon={<Package className="h-4 w-4" />}
            disabled={m.isPending}
            onClick={() => m.mutate("ON_DELIVERY")}
          >
            Наложкой при получении
          </Button>
        )}
        <Button variant="surface" size="sm" icon={<Gift className="h-4 w-4" />} disabled={m.isPending} onClick={() => void waive()}>
          За счёт магазина
        </Button>
      </div>
    </section>
  );
}
