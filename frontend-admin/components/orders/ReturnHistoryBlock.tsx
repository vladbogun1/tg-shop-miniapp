"use client";

/**
 * «Возвраты и обмены» (V70) — every return-wizard run and exchange of the order, with pictures.
 * The newest active one can be cancelled («Отменить возврат» / «Отменить обмен») when the customer
 * changes their mind: units go back into the order (from the shelf, from брак, or simply stop
 * travelling), and the refunded money comes back now, is written down as a debt, or stays with the
 * customer. An exchange cancel also cancels the replacement order and brings its credit back here.
 * Nothing is deleted: the record is stamped, the money journal gets counter-entries.
 */
import { useEffect, useState } from "react";
import { ArrowLeftRight, Ban, CircleDollarSign, Gift, HandCoins, Undo2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { ordersApi, type AdminOrderDetail, type CancelMoney, type ReturnRecord, type ReturnRecordLine } from "@/lib/orders-api";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/orders";
import { useToast } from "@/lib/toast";
import { Image } from "@/lib/image";
import { Modal, ModalCancel } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { ChoiceCard } from "./ReturnModal";

/** What the return did with a line, in words. */
function lineDone(l: ReturnRecordLine): string {
  if (l.outcome === "KEPT") return "оставили покупателю";
  if (l.outcome === "RESTOCK") return "вернулся на склад";
  if (l.outcome === "DEFECT") return "брак, списан";
  const parts: string[] = [];
  if (l.pendingQty > 0) parts.push(`едет назад: ${l.pendingQty}`);
  if (l.restockedQty > 0) parts.push(`на склад: ${l.restockedQty}`);
  if (l.defectQty > 0) parts.push(`брак: ${l.defectQty}`);
  return parts.join(" · ") || "отправил почтой";
}

/** What a cancel will do with the line. */
function lineUndo(l: ReturnRecordLine): string | null {
  if (l.outcome === "KEPT") return null;
  const parts: string[] = [];
  if (l.pendingQty > 0) parts.push(`${l.pendingQty} шт ещё в пути — просто вернутся в заказ`);
  if (l.restockedQty > 0) parts.push(`${l.restockedQty} шт заберём со склада`);
  if (l.defectQty > 0) parts.push(`${l.defectQty} шт уберём из брака`);
  return parts.join(", ");
}

/** Money that really went back to the customer with this record (a monobank refund counts once confirmed). */
function givenBack(rec: ReturnRecord, order: AdminOrderDetail): number {
  return Math.min(rec.refundMinor + rec.monoRefundMinor, order.refundedMinor ?? rec.refundMinor + rec.monoRefundMinor);
}

export function ReturnHistoryBlock({ order, onChanged }: { order: AdminOrderDetail; onChanged?: () => void }) {
  const records = order.admin?.returns ?? [];
  const { push } = useToast();
  const [cancelling, setCancelling] = useState<ReturnRecord | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  if (records.length === 0) return null;
  const cur = order.currency;

  async function debtPaid(rec: ReturnRecord) {
    setBusy(rec.id);
    try {
      await ordersApi.returnDebtPaid(order.id, rec.id);
      push(`${money(rec.debtMinor, cur)} записали как полученные`, "ok");
      onChanged?.();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось записать деньги", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card p-4">
      <div className="mb-3 flex min-h-7 items-center">
        <h3 className="section-title !text-[12px] !text-[var(--text-muted)]">Возвраты и обмены</h3>
      </div>
      <div className="flex flex-col gap-3">
        {records
          .slice()
          .reverse()
          .map((rec) => {
            const exchange = rec.kind === "EXCHANGE";
            const cancelled = !!rec.cancelledAt;
            const given = rec.refundMinor + rec.monoRefundMinor;
            const debtOpen = rec.debtMinor > 0 && !rec.debtPaidAt;
            const isNewestActive = !cancelled && (rec.cancellable || !!rec.cancelBlocker);
            return (
              <div
                key={rec.id}
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

                <div className="text-[12.5px] text-[var(--text-muted)]">
                  {exchange
                    ? <>В счёт нового заказа{rec.newOrderId && <> #{rec.newOrderId.slice(0, 8)}</>}: <b className="tabular text-[var(--text)]">{money(rec.refundMinor, cur)}</b></>
                    : given > 0
                      ? <>Вернули покупателю <b className="tabular text-[var(--text)]">{money(given, cur)}</b>{rec.monoRefundMinor > 0 && " (monobank)"}</>
                      : "Деньги не возвращали"}
                  {rec.note && <> · {rec.note}</>}
                </div>

                {cancelled && (
                  <div className="text-[12px] text-[var(--text-faint)]">
                    Отменён {formatDateTime(rec.cancelledAt!)}
                    {rec.cancelledBy && ` · ${rec.cancelledBy}`}
                    {rec.cancelNote && ` · ${rec.cancelNote}`}
                  </div>
                )}

                {debtOpen && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--warn)_50%,transparent)] bg-[color-mix(in_srgb,var(--warn)_8%,var(--surface))] px-3 py-2">
                    <span className="text-[13px] font-semibold text-[var(--warn)]">
                      Покупатель должен вернуть {money(rec.debtMinor, cur)}
                    </span>
                    <Button
                      size="sm"
                      variant="surface"
                      loading={busy === rec.id}
                      icon={<HandCoins className="h-4 w-4" />}
                      onClick={() => void debtPaid(rec)}
                    >
                      Деньги пришли
                    </Button>
                  </div>
                )}
                {rec.debtMinor > 0 && rec.debtPaidAt && (
                  <div className="text-[12px] text-[var(--text-faint)]">
                    Долг {money(rec.debtMinor, cur)} вернули {formatDateTime(rec.debtPaidAt)}
                  </div>
                )}

                {isNewestActive && (
                  <div className="flex flex-col gap-1">
                    <Button
                      size="sm"
                      variant="surface"
                      className="self-start"
                      disabled={!rec.cancellable}
                      icon={<Ban className="h-4 w-4" />}
                      onClick={() => setCancelling(rec)}
                    >
                      {exchange ? "Отменить обмен" : "Отменить возврат"}
                    </Button>
                    {rec.cancelBlocker && (
                      <span className="text-[12px] text-[var(--text-faint)]">{rec.cancelBlocker}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      <CancelReturnModal
        order={order}
        record={cancelling}
        onClose={() => setCancelling(null)}
        onDone={() => onChanged?.()}
      />
    </section>
  );
}

function CancelReturnModal({
  order,
  record,
  onClose,
  onDone,
}: {
  order: AdminOrderDetail;
  record: ReturnRecord | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { push } = useToast();
  const [moneyChoice, setMoneyChoice] = useState<CancelMoney | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (record) {
      setMoneyChoice(null);
      setNote("");
    }
  }, [record]);

  const cur = order.currency;
  const exchange = record?.kind === "EXCHANGE";
  const given = record && !exchange ? givenBack(record, order) : 0;
  const needMoney = given > 0;
  const clean = note.trim();
  const valid = clean.length >= 3 && (!needMoney || moneyChoice !== null);
  const label = exchange ? "Отменить обмен" : "Отменить возврат";

  async function submit() {
    if (!record || !valid) return;
    setBusy(true);
    try {
      await ordersApi.cancelReturn(order.id, record.id, { money: needMoney ? moneyChoice! : undefined, note: clean });
      push(exchange ? "Обмен отменён, товар снова в заказе" : "Возврат отменён, товар снова в заказе", "ok");
      onDone();
      onClose();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось отменить", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={record !== null}
      onClose={onClose}
      closeOnBackdrop={false}
      dirty={clean !== ""}
      title={label}
      footer={
        <>
          <ModalCancel />
          <Button variant="accent" loading={busy} disabled={!valid} onClick={() => void submit()}>
            {label}
          </Button>
        </>
      }
    >
      {record && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="field-label">Что вернётся в заказ</div>
            {record.lines.map((l, i) => {
              const undo = lineUndo(l);
              return (
                <div key={`${l.itemId}-${i}`} className="card-2 flex items-center gap-3 px-3 py-2">
                  <Image
                    src={l.imageUrl ?? undefined}
                    alt={l.title}
                    size={96}
                    className={cn(
                      "h-12 w-12 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)]",
                      !undo && "opacity-50"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-[var(--text)]">
                      {l.title} <span className="tabular text-[var(--text-muted)]">×{l.quantity}</span>
                    </div>
                    <div className="text-[12px] text-[var(--text-faint)]">{undo ?? "и так у покупателя — ничего не меняем"}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {exchange && (
            <div className="card-2 flex items-start gap-2.5 px-3 py-2.5 text-[13px] text-[var(--text-muted)]">
              <ArrowLeftRight className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Новый заказ{record.newOrderId && <> #{record.newOrderId.slice(0, 8)}</>} отменится, его товар вернётся
                на склад, покупатель получит обычное сообщение об отмене. {money(record.refundMinor, cur)}, перенесённые
                в него, снова засчитаются в этот заказ.
              </span>
            </div>
          )}

          {needMoney && (
            <div className="flex flex-col gap-2">
              <div className="field-label">Покупателю вернули {money(given, cur)}. Что с этими деньгами?</div>
              <div className="grid gap-2">
                <ChoiceCard
                  active={moneyChoice === "RETURNED"}
                  onClick={() => setMoneyChoice("RETURNED")}
                  icon={<CircleDollarSign className="h-5 w-5" />}
                  label="Покупатель уже вернул деньги"
                  sub="Запишем, что деньги снова у нас"
                />
                <ChoiceCard
                  active={moneyChoice === "DEBT"}
                  onClick={() => setMoneyChoice("DEBT")}
                  icon={<HandCoins className="h-5 w-5" />}
                  label="Ещё не вернул — запишем долг"
                  sub="В заказе появится кнопка «Деньги пришли»"
                />
                <ChoiceCard
                  active={moneyChoice === "KEEP"}
                  onClick={() => setMoneyChoice("KEEP")}
                  icon={<Gift className="h-5 w-5" />}
                  label="Оставляем деньги покупателю"
                  sub="Товар у него, деньги не просим"
                />
              </div>
            </div>
          )}

          <Textarea
            label="Почему отменяем (обязательно)"
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Например: передумал возвращать"
            hint={clean !== "" && clean.length < 3 ? "Минимум 3 символа." : undefined}
          />
        </div>
      )}
    </Modal>
  );
}
