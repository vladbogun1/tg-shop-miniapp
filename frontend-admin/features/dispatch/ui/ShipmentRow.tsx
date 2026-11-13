"use client";

/**
 * Строка ТТН на карточке «Отправки»: стадия и текст НП; без ТТН — «появится после «Упаковано»» (главному админу ещё
 * «Создать ТТН» вручную); устаревшая — тревога и «Пересоздать ТТН».
 */
import { RotateCcw, Truck } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { LabelPrint, Notice, ShipmentStageBadge, UNCONFIRMED_PRINT, type LabelFormat, type ShipmentMode } from "@/features/delivery";
import type { AdminDispatchOrder } from "@/features/order";
import { useIsSuperAdmin } from "@/features/staff";
import { isPrintable, isUnconfirmed } from "../model/batch";

export function ShipmentRow({ o, format, onTtn }: { o: AdminDispatchOrder; format: LabelFormat; onTtn: (mode: ShipmentMode) => void }) {
  const isSuper = useIsSuperAdmin() === true;
  const stale = o.shipmentStaleReasons ?? [];
  if (stale.length > 0) {
    return (
      <div className="flex flex-col gap-2 border-t border-[var(--line)] pt-3">
        <Notice tone="danger" title="ТТН недействительна — не отправлять с ней и с её этикеткой" items={stale} />
        <Button size="sm" variant="accent" className="self-start" icon={<RotateCcw className="h-4 w-4" />} onClick={() => onTtn("remake")}>
          Пересоздать ТТН
        </Button>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--line)] pt-3">
      {o.shipmentStage ? (
        <>
          <ShipmentStageBadge stage={o.shipmentStage} />
          {o.shipmentStatusText && (
            <span className="min-w-0 flex-1 basis-48 break-words text-[12.5px] text-[var(--text-muted)]">{o.shipmentStatusText}</span>
          )}
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 basis-48 text-[12.5px] text-[var(--text-muted)]">ТТН появится после «Упаковано»</span>
          {isSuper && (
            <Button size="sm" variant="ghost" icon={<Truck className="h-4 w-4" />} onClick={() => onTtn("create")}>
              Создать ТТН вручную
            </Button>
          )}
        </>
      )}
      {isPrintable(o) && <LabelPrint orderIds={[o.id]} format={format} confirmFirst={isUnconfirmed(o) ? UNCONFIRMED_PRINT : undefined} />}
    </div>
  );
}
