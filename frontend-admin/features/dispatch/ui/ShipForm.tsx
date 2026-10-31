"use client";

import { Input } from "@/components/ui/Input";
import { isNovaPoshtaTtn, type AdminDispatchOrder } from "@/features/order";
import { Button } from "@shop/ui/admin-button";
import { useForm } from "@shop/ui/form";
import { Send } from "lucide-react";
import { awaitingPrepayment } from "../model/dispatch";
import { useShipOrder } from "../queries";

/** ТТН + "Отправлено" right on the card (NEW/APPROVED → SHIPPED). */
export function ShipForm({ o }: { o: AdminDispatchOrder }) {
  const form = useForm<{ ttn: string }>({ defaultValues: { ttn: "" } });
  // The typed number stays in the field on a refusal or an error; only a real shipment clears it.
  const ship = useShipOrder(o, () => form.reset({ ttn: "" }));
  const clean = (form.watch("ttn") ?? "").replace(/\s+/g, "");
  const wrong = clean.length > 0 && !isNovaPoshtaTtn(clean);
  const waitPay = awaitingPrepayment(o);
  const submit = () => {
    if (clean) ship.mutate(clean);
  };

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--line)] pt-3.5 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <Input
          aria-label="Номер ТТН"
          placeholder="ТТН: 20450000000000"
          inputMode="numeric"
          autoComplete="off"
          {...form.register("ttn")}
          onKeyDown={(e) => e.key === "Enter" && !waitPay && submit()}
          error={wrong ? "Не похоже на ТТН Новой Почты (14 цифр, начало 20/59)" : undefined}
        />
      </div>
      <Button
        // Orange only once it can be pressed: a list of cards must not be a wall of orange buttons.
        variant={!clean || waitPay ? "surface" : "accent"}
        loading={ship.isPending}
        disabled={!clean || waitPay}
        icon={<Send className="h-4 w-4" />}
        onClick={submit}
        title={waitPay ? "Сначала должна прийти онлайн-оплата" : undefined}
      >
        Отправлено
      </Button>
    </div>
  );
}
