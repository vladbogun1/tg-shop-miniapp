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
import { useForm } from "@shop/ui/form";
import { shortId } from "../../model/status";
import { defaultKeepThis, mergeView, mustStay } from "../../model/merge";
import type { AdminOrderDetail, MergeBody, MergeCandidate } from "../../api";
import { useMergeCandidatesQuery } from "../../queries/modals";
import { Modal } from "@shop/ui/overlay";
import { Textarea } from "@/components/ui/Textarea";
import { AddressChoice, CandidateList, KeepChoice, MergeFooter, ResultBox } from "./merge-parts";

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
  const form = useForm<{ note: string }>({ defaultValues: { note: "" } });
  const { reset } = form;
  const note = form.watch("note");

  const q = useMergeCandidatesQuery(orderId, open && !!orderId);
  const candidates = useMemo(() => q.data ?? [], [q.data]);

  useEffect(() => {
    if (!open) return;
    setPickedId(null);
    setKeepThis(true);
    setSourceAddress(false);
    setNotify(true);
    reset({ note: "" });
  }, [open, orderId, reset]);

  // One mergeable order: pick it right away.
  useEffect(() => {
    if (!open || pickedId) return;
    const ok = candidates.filter((c) => !c.blocker);
    if (ok.length === 1) pick(ok[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, candidates]);

  const other = candidates.find((c) => c.id === pickedId) ?? null;

  function pick(c: MergeCandidate) {
    setPickedId(c.id);
    setSourceAddress(false);
    if (!order) return;
    // The older order stays, unless one side has to.
    setKeepThis(defaultKeepThis(order, c));
  }

  if (!order) return null;

  const { target, source, sameAddress, result, ready } = mergeView(order, other, keepThis);

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
      footer={<MergeFooter notify={notify} onNotify={setNotify} loading={loading} ready={ready} onSubmit={submit} />}
    >
      <div className="flex flex-col gap-5">
        <p className="text-[13px] text-[var(--text-muted)]">
          Товары, скидка и уже оплаченное переедут в один заказ — отправите одной посылкой. Второй заказ закроется как «Объединён»: не
          удаляется, история и журнал денег остаются.
        </p>

        <CandidateList
          loading={q.isLoading}
          failed={q.isError}
          candidates={candidates}
          pickedId={pickedId}
          cur={order.currency}
          onPick={pick}
        />

        {other && !other.blocker && (
          <>
            <KeepChoice
              order={order}
              other={other}
              keepThis={keepThis}
              thisMustStay={mustStay(order)}
              otherMustStay={mustStay(other)}
              onChange={setKeepThis}
            />
            {!sameAddress && target && source && (
              <AddressChoice target={target} source={source} sourceAddress={sourceAddress} onChange={setSourceAddress} />
            )}
            {result && target && <ResultBox targetId={target.id} result={result} cur={order.currency} />}
            <Textarea label="Комментарий (в историю, по желанию)" rows={2} maxLength={500} {...form.register("note")} />
          </>
        )}
      </div>
    </Modal>
  );
}
