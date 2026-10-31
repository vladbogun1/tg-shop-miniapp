"use client";

import { ArrowLeftRight, Ban, HandCoins, Undo2 } from "lucide-react";
import { shortOrderId } from "@shop/core/format";
import { formatDateTime } from "@shop/core/time";
import { Button } from "@shop/ui/admin-button";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Image } from "@/lib/image";
import { lineDone } from "../../model/records";
import type { ReturnRecord } from "../../model/types";

function RecordLines({ rec }: { rec: ReturnRecord }) {
  return (
    <div className="flex flex-col gap-1.5">
      {rec.lines.map((l, i) => (
        <div key={`${l.itemId}-${i}`} className="flex items-center gap-2.5">
          <Image
            src={l.imageUrl ?? undefined}
            alt={l.title}
            size={96}
            className="h-9 w-9 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)]"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] text-[var(--text)]">
              {l.title} <span className="tabular text-[var(--text-muted)]">×{l.quantity}</span>
            </div>
            <div className="text-[11.5px] text-[var(--text-faint)]">{lineDone(l)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Что с деньгами: зачёт в новый заказ (обмен), возврат покупателю или «не возвращали». */
function RecordMoney({ rec, cur }: { rec: ReturnRecord; cur: string }) {
  const given = rec.refundMinor + rec.monoRefundMinor;
  return (
    <div className="text-[12.5px] text-[var(--text-muted)]">
      {rec.kind === "EXCHANGE" ? (
        <>
          В счёт нового заказа{rec.newOrderId && <> {shortOrderId(rec.newOrderId)}</>}:{" "}
          <b className="tabular text-[var(--text)]">{money(rec.refundMinor, cur)}</b>
        </>
      ) : given > 0 ? (
        <>
          Вернули покупателю <b className="tabular text-[var(--text)]">{money(given, cur)}</b>
          {rec.monoRefundMinor > 0 && " (monobank)"}
        </>
      ) : (
        "Деньги не возвращали"
      )}
      {rec.note && <> · {rec.note}</>}
    </div>
  );
}

/** Долг покупателя после отмены возврата: открытый — с кнопкой «Деньги пришли», закрытый — строкой. */
function RecordDebt({
  rec,
  cur,
  busy,
  onDebtPaid,
}: {
  rec: ReturnRecord;
  cur: string;
  busy: boolean;
  onDebtPaid: () => void;
}) {
  if (rec.debtMinor > 0 && !rec.debtPaidAt) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--warn)_50%,transparent)] bg-[color-mix(in_srgb,var(--warn)_8%,var(--surface))] px-3 py-2">
        <span className="text-[13px] font-semibold text-[var(--warn)]">
          Покупатель должен вернуть {money(rec.debtMinor, cur)}
        </span>
        <Button
          size="sm"
          variant="surface"
          loading={busy}
          icon={<HandCoins className="h-4 w-4" />}
          onClick={onDebtPaid}
        >
          Деньги пришли
        </Button>
      </div>
    );
  }
  if (rec.debtMinor > 0 && rec.debtPaidAt) {
    return (
      <div className="text-[12px] text-[var(--text-faint)]">
        Долг {money(rec.debtMinor, cur)} вернули {formatDateTime(rec.debtPaidAt)}
      </div>
    );
  }
  return null;
}

function RecordCancel({ rec, onCancel }: { rec: ReturnRecord; onCancel: () => void }) {
  return (
    <div className="flex flex-col gap-1">
      <Button
        size="sm"
        variant="surface"
        className="self-start"
        disabled={!rec.cancellable}
        icon={<Ban className="h-4 w-4" />}
        onClick={onCancel}
      >
        {rec.kind === "EXCHANGE" ? "Отменить обмен" : "Отменить возврат"}
      </Button>
      {rec.cancelBlocker && <span className="text-[12px] text-[var(--text-faint)]">{rec.cancelBlocker}</span>}
    </div>
  );
}

/** Одна запись «Возвраты и обмены»: что вернули, куда, деньги, долг и кнопка отмены (у самой новой активной). */
export function ReturnRecordCard({
  rec,
  cur,
  busy,
  onDebtPaid,
  onCancel,
}: {
  rec: ReturnRecord;
  cur: string;
  /** «Деньги пришли» по этой записи в полёте. */
  busy: boolean;
  onDebtPaid: (rec: ReturnRecord) => void;
  onCancel: (rec: ReturnRecord) => void;
}) {
  const exchange = rec.kind === "EXCHANGE";
  const cancelled = !!rec.cancelledAt;
  const isNewestActive = !cancelled && (rec.cancellable || !!rec.cancelBlocker);
  return (
    <div
      data-testid={`return-record-${rec.id}`}
      className={cn("card-2 flex flex-col gap-2 p-3", cancelled && "opacity-70")}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-[var(--text)]">
          {exchange ? <ArrowLeftRight className="h-4 w-4" /> : <Undo2 className="h-4 w-4" />}
          {exchange ? "Обмен" : "Возврат"}
          {cancelled && <span className="chip-tint !text-[10.5px]">отменён</span>}
        </span>
        <span className="text-[12px] text-[var(--text-faint)]">
          {formatDateTime(rec.createdAt)}
          {rec.adminName && ` · ${rec.adminName}`}
        </span>
      </div>

      <RecordLines rec={rec} />
      <RecordMoney rec={rec} cur={cur} />

      {cancelled && (
        <div className="text-[12px] text-[var(--text-faint)]">
          Отменён {formatDateTime(rec.cancelledAt!)}
          {rec.cancelledBy && ` · ${rec.cancelledBy}`}
          {rec.cancelNote && ` · ${rec.cancelNote}`}
        </div>
      )}

      <RecordDebt rec={rec} cur={cur} busy={busy} onDebtPaid={() => onDebtPaid(rec)} />
      {isNewestActive && <RecordCancel rec={rec} onCancel={() => onCancel(rec)} />}
    </div>
  );
}
