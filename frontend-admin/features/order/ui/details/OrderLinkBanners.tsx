"use client";

/** Верх «Деталей»: связи заказа (обмен, слияние), архив, «посылка едет назад / вернулась». */
import { Merge, Repeat, Archive, Undo2, PackageCheck } from "lucide-react";
import { formatDateTime } from "@shop/core/time";
import { Button } from "@shop/ui/admin-button";
import type { AdminOrderDetail } from "../../api";
import type { DetailHandlers } from "./types";
import { OrderLink } from "./section";

const LINK_CARD = "card flex flex-wrap items-center gap-x-3 gap-y-1.5 border-[rgba(255,102,0,.35)] px-4 py-3 text-[13px]";

function OrderLinks({ ids, onOpen }: { ids: string[]; onOpen: DetailHandlers["onOpenOrder"] }) {
  return (
    <>
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 && ", "}
          <OrderLink id={id} onOpen={onOpen} />
        </span>
      ))}
    </>
  );
}

function ExchangeBanner({ order, h }: { order: AdminOrderDetail; h: DetailHandlers }) {
  const exchangeOf = order.admin?.exchangeOfId ?? null;
  const exchangeKids = order.admin?.exchangeOrderIds ?? [];
  if (!exchangeOf && exchangeKids.length === 0) return null;
  return (
    <div className={LINK_CARD}>
      <Repeat className="h-4 w-4 shrink-0 text-[var(--accent-hi)]" />
      {exchangeOf && (
        <span className="text-[var(--text-muted)]">
          Замена по обмену из заказа <OrderLink id={exchangeOf} onOpen={h.onOpenOrder} />
        </span>
      )}
      {exchangeKids.length > 0 && (
        <span className="text-[var(--text-muted)]">
          Обмен: {exchangeKids.length > 1 ? "новые заказы" : "новый заказ"} <OrderLinks ids={exchangeKids} onOpen={h.onOpenOrder} />
        </span>
      )}
    </div>
  );
}

function MergeBanner({ order, h }: { order: AdminOrderDetail; h: DetailHandlers }) {
  const mergedInto = order.admin?.mergedIntoId ?? null;
  const mergedFrom = order.admin?.mergedFromIds ?? [];
  if (!mergedInto && mergedFrom.length === 0) return null;
  return (
    <div className={LINK_CARD}>
      <Merge className="h-4 w-4 shrink-0 text-[var(--accent-hi)]" />
      {mergedInto && (
        <span className="text-[var(--text-muted)]">
          Объединён в заказ <OrderLink id={mergedInto} onOpen={h.onOpenOrder} /> — товары и оплата там
        </span>
      )}
      {mergedFrom.length > 0 && (
        <span className="text-[var(--text-muted)]">
          В этот заказ {mergedFrom.length > 1 ? "объединены" : "объединён"} <OrderLinks ids={mergedFrom} onOpen={h.onOpenOrder} />
        </span>
      )}
    </div>
  );
}

function ArchivedBanner({ admin, h }: { admin: NonNullable<AdminOrderDetail["admin"]>; h: DetailHandlers }) {
  if (!admin.archivedAt) return null;
  return (
    <div className="card flex flex-col gap-2 border-[var(--line-strong)] p-4">
      <div className="flex items-center gap-2 text-[14px] font-semibold text-[var(--text)]">
        <Archive className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />В архиве
      </div>
      <p className="text-[13px] text-[var(--text-muted)]">
        {admin.archiveReason ? <>Причина: {admin.archiveReason}. </> : null}
        {admin.archivedBy && <>{admin.archivedBy}, </>}
        {formatDateTime(admin.archivedAt)}
      </p>
      {h.onUnarchive && (
        <Button
          size="sm"
          variant="surface"
          className="self-start"
          loading={h.busyKey === "unarchive"}
          disabled={!!h.busyKey && h.busyKey !== "unarchive"}
          onClick={h.onUnarchive}
        >
          Вернуть из архива
        </Button>
      )}
    </div>
  );
}

function ReturnTransitBanner({ h }: { h: DetailHandlers }) {
  return (
    <div className="card flex flex-col gap-2 border-[color-mix(in_srgb,var(--warn)_45%,transparent)] p-4">
      <div className="flex items-center gap-2 text-[14px] font-semibold text-[var(--text)]">
        <Undo2 className="h-4 w-4 shrink-0 text-[var(--warn)]" />
        Посылка едет назад
      </div>
      <p className="text-[13px] text-[var(--text-muted)]">
        Товар ещё не на складе. Когда посылка придёт — отметьте это, и товар вернётся на склад (брак можно списать).
      </p>
      {h.onReturnReceived && (
        <Button
          size="sm"
          variant="accent"
          className="self-start"
          icon={<PackageCheck className="h-4 w-4" />}
          disabled={!!h.busyKey}
          onClick={h.onReturnReceived}
        >
          Посылка вернулась
        </Button>
      )}
    </div>
  );
}

export function OrderLinkBanners({ order, h }: { order: AdminOrderDetail; h: DetailHandlers }) {
  const admin = order.admin;
  return (
    <>
      <ExchangeBanner order={order} h={h} />
      <MergeBanner order={order} h={h} />
      {admin && <ArchivedBanner admin={admin} h={h} />}
      {admin?.returnStatus === "IN_TRANSIT" && <ReturnTransitBanner h={h} />}
      {admin?.returnStatus === "RECEIVED" && admin.returnReceivedAt && (
        <p className="px-1 text-[12.5px] text-[var(--text-muted)]">Посылка вернулась на склад {formatDateTime(admin.returnReceivedAt)}.</p>
      )}
    </>
  );
}
