"use client";

/**
 * Коробка в блоке «Нова пошта · ТТН» заказа: «Пакуй в» / подтверждённая коробка (только у нашей живой ТТН)
 * и перемер Новой Почты, когда она приняла посылку, — подсвечен, если разница больше 15 %.
 */
import { cn } from "@/lib/cn";
import { remeasureText } from "../../model/packing";
import type { Packing, Shipment } from "../../model/types";
import { PackBox } from "./PackBox";

export function NpMeasure({ p, s }: { p: Packing; s: Shipment }) {
  const r = remeasureText(p, { ...s, seats: p.seats });
  if (!r) return null;
  return (
    <p
      className={cn(
        "break-words rounded-[var(--r-md)] px-3 py-2 text-[12.5px] leading-snug",
        r.differs
          ? "border border-[color-mix(in_srgb,var(--warn)_45%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] font-semibold text-[var(--text)]"
          : "text-[var(--text-muted)]",
      )}
    >
      {r.text}
    </p>
  );
}

export function ShipmentPacking({ orderId, s, open, onChanged }: { orderId: string; s: Shipment; open: boolean; onChanged: () => void }) {
  const p = s.packing;
  if (!p) return null;
  const canPack = open && s.stage !== "CANCELLED" && !s.staleReasons?.length;
  return (
    <>
      {(canPack || p.boxConfirmedAt) && (
        <PackBox orderId={orderId} packing={p} ttn={s.ttn} onDone={onChanged} readOnly={!canPack} postomat={s.serviceType === "POSTOMAT"} />
      )}
      <NpMeasure p={p} s={s} />
    </>
  );
}
