"use client";

import type { ReactNode } from "react";
import { CircleAlert, MapPin, Merge } from "lucide-react";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@shop/core/time";
import { Skeleton } from "@/components/ui/Skeleton";
import { Toggle } from "@/components/ui/Toggle";
import { ChoiceCard } from "@/features/returns";
import { Button } from "@shop/ui/admin-button";
import { ModalCancel } from "@shop/ui/overlay";
import { shortId, STATUS_LABEL } from "../../model/status";
import { mergeAddress, mergePreview } from "../../model/merge";
import type { AdminOrderDetail, MergeCandidate } from "../../api";

const TITLE = "section-title !text-[12px] !text-[var(--text-muted)]";

function paidLabel(c: MergeCandidate, cur: string): string {
  if (c.receivedMinor > 0) return ` · оплачено ${money(c.receivedMinor, cur)}`;
  return c.paid ? " · оплачен" : " · не оплачен";
}

function CandidateCard({ c, active, cur, onPick }: { c: MergeCandidate; active: boolean; cur: string; onPick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={!!c.blocker}
      onClick={onPick}
      className={cn(
        "nb-press flex flex-col gap-1 rounded-[var(--r-md)] border px-3 py-2.5 text-left transition-colors",
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
          : "border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--line-strong)]",
        c.blocker && "cursor-not-allowed opacity-60 hover:border-[var(--line)]",
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
        {paidLabel(c, cur)}
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
}

/** «С каким заказом»: the customer's other orders; the server says why one cannot be merged. */
export function CandidateList({
  loading,
  failed,
  candidates,
  pickedId,
  cur,
  onPick,
}: {
  loading: boolean;
  failed: boolean;
  candidates: MergeCandidate[];
  pickedId: string | null;
  cur: string;
  onPick: (c: MergeCandidate) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className={TITLE}>С каким заказом</h3>
      {loading && <Skeleton className="h-20 rounded-[var(--r-md)]" />}
      {!loading && failed && <p className="text-[13px] text-[var(--danger-ink)]">Не удалось загрузить заказы покупателя.</p>}
      {!loading && !failed && candidates.length === 0 && (
        <p className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-3 text-[13px] text-[var(--text-muted)]">
          У покупателя нет других неотправленных заказов (новых или одобренных).
        </p>
      )}
      {!loading &&
        !failed &&
        candidates.map((c) => <CandidateCard key={c.id} c={c} active={c.id === pickedId} cur={cur} onPick={() => onPick(c)} />)}
    </div>
  );
}

/** «Какой заказ останется»: the older one by default; a sealed case or a ТТН stays with its own order. */
export function KeepChoice({
  order,
  other,
  keepThis,
  thisMustStay,
  otherMustStay,
  onChange,
}: {
  order: AdminOrderDetail;
  other: MergeCandidate;
  keepThis: boolean;
  thisMustStay: string | null;
  otherMustStay: string | null;
  onChange: (keepThis: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className={TITLE}>Какой заказ останется</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <ChoiceCard
          active={keepThis}
          onClick={() => !otherMustStay && onChange(true)}
          icon={<Merge className="h-4 w-4" />}
          label={`${shortId(order.id)} (этот)`}
          sub={otherMustStay ? `нельзя: ${shortId(other.id)} ${otherMustStay}` : formatDateTime(order.createdAt)}
        />
        <ChoiceCard
          active={!keepThis}
          onClick={() => !thisMustStay && onChange(false)}
          icon={<Merge className="h-4 w-4" />}
          label={`${shortId(other.id)}`}
          sub={thisMustStay ? `нельзя: ${shortId(order.id)} ${thisMustStay}` : formatDateTime(other.createdAt)}
        />
      </div>
    </div>
  );
}

type Addressed = { id: string; customerName?: string | null; npCityName?: string | null; npWarehouseName?: string | null };

/** «Получатель и отделение»: whose recipient and Nova Poshta branch, when they differ. */
export function AddressChoice({
  target,
  source,
  sourceAddress,
  onChange,
}: {
  target: Addressed;
  source: Addressed;
  sourceAddress: boolean;
  onChange: (fromSource: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className={TITLE}>Получатель и отделение</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <ChoiceCard
          active={!sourceAddress}
          onClick={() => onChange(false)}
          icon={<MapPin className="h-4 w-4" />}
          label={`Из ${shortId(target.id)}`}
          sub={mergeAddress(target) || "не указано"}
        />
        <ChoiceCard
          active={sourceAddress}
          onClick={() => onChange(true)}
          icon={<MapPin className="h-4 w-4" />}
          label={`Из ${shortId(source.id)}`}
          sub={mergeAddress(source) || "не указано"}
        />
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[var(--text-muted)]">{label}</span>
      {children}
    </div>
  );
}

/** What the order that stays will look like. */
export function ResultBox({ targetId, result, cur }: { targetId: string; result: ReturnType<typeof mergePreview>; cur: string }) {
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-[13px]">
      <Row label={`Итого в ${shortId(targetId)}`}>
        <b className="tabular text-[var(--text)]">{money(result.total, cur)}</b>
      </Row>
      <Row label="Уже оплачено">
        <span className="tabular text-[var(--text)]">{money(result.received, cur)}</span>
      </Row>
      {result.due > 0 && (
        <Row label="Оплатить онлайн">
          <span className="tabular text-[var(--text)]">{money(result.due, cur)}</span>
        </Row>
      )}
      <Row label="Наложкой при получении">
        <b className="tabular text-[var(--text)]">{money(result.cod, cur)}</b>
      </Row>
    </div>
  );
}

export function MergeFooter({
  notify,
  onNotify,
  loading,
  ready,
  onSubmit,
}: {
  notify: boolean;
  onNotify: (v: boolean) => void;
  loading?: boolean;
  ready: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-2">
      <Toggle checked={notify} onChange={onNotify} label="Написать покупателю" />
      <div className="flex gap-2">
        <ModalCancel />
        <Button variant="accent" loading={loading} disabled={!ready} onClick={onSubmit}>
          Объединить
        </Button>
      </div>
    </div>
  );
}
