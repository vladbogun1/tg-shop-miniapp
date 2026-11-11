"use client";

/** «Оплата» — способ и «Получено · Наложка · Возвращено» (наложка красная, пока её надо собрать). Счета monobank — ниже, в OnlinePaymentBlock. */
import { CreditCard, Wallet } from "lucide-react";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import type { AdminOrderDetail } from "../../api";
import { codMinor } from "../../model/status";
import { Row, Section } from "./section";

export function PaymentSummary({ order }: { order: AdminOrderDetail }) {
  const cod = codMinor(order);
  const refunded = order.refundedMinor ?? 0;
  return (
    <Section title="Оплата">
      <div className="flex flex-col gap-2">
        {order.paymentOptionTitle && (
          <Row icon={<CreditCard className="h-4 w-4" />}>
            <span className="min-w-0">{order.paymentOptionTitle}</span>
            {order.paymentOnDelivery && (
              <Badge tone="warn" className="ml-auto shrink-0">
                при получении
              </Badge>
            )}
          </Row>
        )}
        <Row icon={<Wallet className="h-4 w-4" />}>
          <span className="min-w-0">
            Получено <b className="font-semibold">{money(order.receivedMinor, order.currency)}</b>
            {order.deliveryMethod === "NOVA_POSHTA" && (
              <>
                {" · "}Наложка{" "}
                <b className={cn("font-semibold", cod > 0 ? "text-[var(--danger-ink)]" : "text-[var(--ok)]")}>
                  {money(cod, order.currency)}
                </b>
              </>
            )}
            {refunded > 0 && (
              <>
                {" · "}Возвращено <b className="font-semibold">{money(refunded, order.currency)}</b>
              </>
            )}
          </span>
        </Row>
      </div>
    </Section>
  );
}
