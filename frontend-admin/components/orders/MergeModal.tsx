"use client";

/**
 * «Объединить заказы» (POST /orders/{id}/merge, V71): the customer placed two orders that have not
 * shipped yet — they go out as one parcel.
 *   1. which other order of the customer (NEW / APPROVED; the server says why one cannot be merged);
 *   2. which one stays — the older one by default; a sealed case or a ТТН stays with its own order;
 *   3. whose recipient and Nova Poshta branch, when they differ.
 * The lines, the discount and what was already paid move into the order that stays; the other one is
 * closed as «Объединён» and keeps its history (orders are never deleted).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, MapPin, Merge } from "lucide-react";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import { formatDateTime, shortId, STATUS_LABEL } from "@/lib/orders";
import { ordersApi, type AdminOrderDetail, type MergeBody, type MergeCandidate } from "@/lib/orders-api";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { Toggle } from "@/components/ui/Toggle";
import { ChoiceCard } from "./ReturnModal";

/** The side of a pair that has to stay: a sealed case or a ТТН does not move to another order. */
function mustStay(o: { trackingNumber?: string | null; giftCaseStatus?: string | null }): string | null {
  if (o.giftCaseStatus === "SEALED") return "в нём не открыт кейс";
  if (o.trackingNumber) return "у него уже есть ТТН";
  return null;
}

/** What the order that stays looks like after the merge (same rules as the server). */
function preview(total: number, received: number, prepayment: number) {
  const dueOnline = prepayment > 0 ? Math.min(prepayment, total) : total;
  const due = Math.max(0, dueOnline - received);
  return { total, received, due, cod: Math.max(0, total - received - due) };
}

function address(o: { customerName?: string | null; npCityName?: string | null; npWarehouseName?: string | null }) {
  return [o.customerName, o.npCityName, o.npWarehouseName].filter(Boolean).join(", ");
}

export function MergeModal({
  open,
  order,
  onClose,
  onSave,
  loading,
}: {
  open: boolean;
  order: AdminOrderDetail | null;
  onClose: () => void;
  /** targetId = the order that stays. */
  onSave: (targetId: string, body: MergeBody) => Promise<unknown> | void;
  loading?: boolean;
}) {
  const orderId = order?.id ?? null;
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [keepThis, setKeepThis] = useState(true);
  const [sourceAddress, setSourceAddress] = useState(false);
  const [notify, setNotify] = useState(true);
  const [note, setNote] = useState("");

  const q = useQuery({
    queryKey: ["merge-candidates", orderId],
    queryFn: () => ordersApi.mergeCandidates(orderId as string),
    enabled: open && !!orderId,
  });
  const candidates = useMemo(() => q.data ?? [], [q.data]);

  useEffect(() => {
    if (!open) return;
    setPickedId(null);
    setKeepThis(true);
    setSourceAddress(false);
    setNotify(true);
    setNote("");
  }, [open, orderId]);

  // One mergeable order: pick it right away.
  useEffect(() => {
    if (!open || pickedId) return;
    const ok = candidates.filter((c) => !c.blocker);
    if (ok.length === 1) pick(ok[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, candidates]);

  const other = candidates.find((c) => c.id === pickedId) ?? null;
  const thisMustStay = order ? mustStay(order) : null;
  const otherMustStay = other ? mustStay(other) : null;

  function pick(c: MergeCandidate) {
    setPickedId(c.id);
    setSourceAddress(false);
    if (!order) return;
    // The older order stays, unless one side has to.
    const thisOlder = new Date(order.createdAt).getTime() <= new Date(c.createdAt).getTime();
    setKeepThis(mustStay(c) ? false : mustStay(order) ? true : thisOlder);
  }

  if (!order) return null;

  const target = keepThis ? order : other;
  const source = keepThis ? other : order;
  const sameAddress = !!other && address(order) === address(other);
  const result = other
    ? preview(
        order.totalMinor + other.totalMinor,
        (order.receivedMinor ?? 0) + other.receivedMinor,
        (keepThis ? order.prepaymentMinor : other.prepaymentMinor) ?? 0
      )
    : null;
  const cur = order.currency;
  const ready = !!other && !other.blocker && !(keepThis ? otherMustStay : thisMustStay);

  function submit() {
    if (!other || !target || !source) return;
    void onSave(target.id, {
      sourceId: source.id,
      useSourceDelivery: !sameAddress && sourceAddress,
      notifyCustomer: notify,
      note: note.trim() || undefined,
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      dirty={note.trim() !== ""}
      title={`Объединить заказы · ${shortId(order.id)}`}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Toggle checked={notify} onChange={setNotify} label="Написать покупателю" />
          <div className="flex gap-2">
            <ModalCancel />
            <Button variant="accent" loading={loading} disabled={!ready} onClick={submit}>
              Объединить
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-[13px] text-[var(--text-muted)]">
          Товары, скидка и уже оплаченное переедут в один заказ — отправите одной посылкой. Второй заказ закроется
          как «Объединён»: не удаляется, история и журнал денег остаются.
        </p>

        <div className="flex flex-col gap-2">
          <h3 className="section-title !text-[12px] !text-[var(--text-muted)]">С каким заказом</h3>
          {q.isLoading ? (
            <Skeleton className="h-20 rounded-[var(--r-md)]" />
          ) : q.isError ? (
            <p className="text-[13px] text-[var(--danger-ink)]">Не удалось загрузить заказы покупателя.</p>
          ) : candidates.length === 0 ? (
            <p className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-3 text-[13px] text-[var(--text-muted)]">
              У покупателя нет других неотправленных заказов (новых или одобренных).
            </p>
          ) : (
            candidates.map((c) => {
              const active = c.id === pickedId;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={active}
                  disabled={!!c.blocker}
                  onClick={() => pick(c)}
                  className={cn(
                    "nb-press flex flex-col gap-1 rounded-[var(--r-md)] border px-3 py-2.5 text-left transition-colors",
                    active
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--line-strong)]",
                    c.blocker && "cursor-not-allowed opacity-60 hover:border-[var(--line)]"
                  )}
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="text-[14px] font-semibold text-[var(--text)]">
                      {shortId(c.id)} · {STATUS_LABEL[c.status]}
                    </span>
                    <span className="tabular text-[14px] font-bold text-[var(--text)]">{money(c.totalMinor, cur)}</span>
                  </span>
                  <span className="text-[12px] text-[var(--text-muted)]">
                    {formatDateTime(c.createdAt)}
                    {c.paymentOptionTitle ? ` · ${c.paymentOptionTitle}` : ""}
                    {c.receivedMinor > 0 ? ` · оплачено ${money(c.receivedMinor, cur)}` : c.paid ? " · оплачен" : " · не оплачен"}
                  </span>
                  <span className="text-[12.5px] text-[var(--text)]">{c.lines.join(", ")}</span>
                  {c.blocker && (
                    <span className="flex items-start gap-1.5 text-[12px] text-[var(--danger-ink)]">
                      <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
                      {c.blocker}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {other && !other.blocker && (
          <>
            <div className="flex flex-col gap-2">
              <h3 className="section-title !text-[12px] !text-[var(--text-muted)]">Какой заказ останется</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <ChoiceCard
                  active={keepThis}
                  onClick={() => !otherMustStay && setKeepThis(true)}
                  icon={<Merge className="h-4 w-4" />}
                  label={`${shortId(order.id)} (этот)`}
                  sub={otherMustStay ? `нельзя: ${shortId(other.id)} ${otherMustStay}` : formatDateTime(order.createdAt)}
                />
                <ChoiceCard
                  active={!keepThis}
                  onClick={() => !thisMustStay && setKeepThis(false)}
                  icon={<Merge className="h-4 w-4" />}
                  label={`${shortId(other.id)}`}
                  sub={thisMustStay ? `нельзя: ${shortId(order.id)} ${thisMustStay}` : formatDateTime(other.createdAt)}
                />
              </div>
            </div>

            {!sameAddress && target && source && (
              <div className="flex flex-col gap-2">
                <h3 className="section-title !text-[12px] !text-[var(--text-muted)]">Получатель и отделение</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  <ChoiceCard
                    active={!sourceAddress}
                    onClick={() => setSourceAddress(false)}
                    icon={<MapPin className="h-4 w-4" />}
                    label={`Из ${shortId(target.id)}`}
                    sub={address(target) || "не указано"}
                  />
                  <ChoiceCard
                    active={sourceAddress}
                    onClick={() => setSourceAddress(true)}
                    icon={<MapPin className="h-4 w-4" />}
                    label={`Из ${shortId(source.id)}`}
                    sub={address(source) || "не указано"}
                  />
                </div>
              </div>
            )}

            {result && target && (
              <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-[13px]">
                <div className="flex justify-between gap-3">
                  <span className="text-[var(--text-muted)]">Итого в {shortId(target.id)}</span>
                  <b className="tabular text-[var(--text)]">{money(result.total, cur)}</b>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-[var(--text-muted)]">Уже оплачено</span>
                  <span className="tabular text-[var(--text)]">{money(result.received, cur)}</span>
                </div>
                {result.due > 0 && (
                  <div className="flex justify-between gap-3">
                    <span className="text-[var(--text-muted)]">Оплатить онлайн</span>
                    <span className="tabular text-[var(--text)]">{money(result.due, cur)}</span>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <span className="text-[var(--text-muted)]">Наложкой при получении</span>
                  <b className="tabular text-[var(--text)]">{money(result.cod, cur)}</b>
                </div>
              </div>
            )}

            <Textarea
              label="Комментарий (в историю, по желанию)"
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </>
        )}
      </div>
    </Modal>
  );
}
