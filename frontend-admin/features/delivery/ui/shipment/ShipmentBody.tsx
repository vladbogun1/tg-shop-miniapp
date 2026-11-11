"use client";

/** Тело окна ТТН: куда едет, предупреждения, получатель, отделение отправки, посылка, деньги, оценка. */
import { money } from "@shop/core/money";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { serviceLabel } from "../../model/labels";
import { boxError, type ShipmentForm, type ShipmentMode } from "../../model/shipment-form";
import type { ShipmentPreview } from "../../model/types";
import { Notice } from "../parts";
import { CodAndDocuments, Estimate, MoneyFields, ParcelFields, RecipientFields, SenderChips, UnpaidCheck, type SetForm } from "./fields";



function Destination({ p }: { p: ShipmentPreview }) {
  return (
    <div className="card-2 flex min-w-0 flex-col gap-1.5 px-3.5 py-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">Заказ #{p.shortId}</span>
        <Badge tone="info">{serviceLabel(p.serviceType)}</Badge>
        {p.dryRun && <Badge tone="warn">Тестовый режим — в НП ничего не уйдёт</Badge>}
      </div>
      <div className="min-w-0 break-words text-[14px] font-semibold text-[var(--text)]">{[p.cityName, p.destination].filter(Boolean).join(", ") || "—"}</div>
      {p.recipientPhone && <div className="tabular text-[var(--text-muted)]">{p.recipientPhone}</div>}
    </div>
  );
}

function ModeNotice({ mode, p }: { mode: ShipmentMode; p: ShipmentPreview }) {
  const existing = p.existing;
  if (!existing) return null;
  if (mode === "create") {
    return <Notice tone="danger">У заказа уже есть ТТН {existing.ttn}. Чтобы создать новую, сначала отмените её.</Notice>;
  }
  if (existing.printedAt) {
    return (
      <Notice tone="warn" title="Этикетка уже напечатана">
        Новая почта не меняет напечатанную ТТН: {existing.ttn} удалим и создадим новую с другим номером. Старую этикетку выбросьте и
        напечатайте новую.
      </Notice>
    );
  }
  return mode === "remake" ? (
    <Notice tone="warn">Вес и коробка заново посчитаны по заказу. Этикетку ещё не печатали — номер ТТН останется тем же.</Notice>
  ) : null;
}

export function ShipmentBody({
  mode,
  form,
  set,
  initial,
  preview: p,
  loading,
  loadError,
}: {
  mode: ShipmentMode;
  form: ShipmentForm;
  set: SetForm;
  initial: ShipmentPreview;
  preview: ShipmentPreview;
  loading: boolean;
  loadError: string | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Destination p={p} />
      <ModeNotice mode={mode} p={p} />
      {p.problems.length > 0 && <Notice tone="danger" title="Нельзя создать ТТН" items={p.problems} />}
      {p.warnings.length > 0 && <Notice tone="warn" title="Обратите внимание" items={p.warnings} />}
      {loadError && <Notice tone="danger">{loadError}</Notice>}
      <RecipientFields form={form} set={set} />
      <SenderChips form={form} set={set} warehouses={p.senderWarehouses} />
      <ParcelFields form={form} set={set} initial={initial} presets={p.presets} boxError={boxError(form)} />
      <MoneyFields form={form} set={set} />
      <CodAndDocuments form={form} set={set} p={p} />
      <Input
        label="Описание груза"
        value={form.description}
        maxLength={100}
        onChange={(e) => set({ description: e.target.value })}
        hint="Пусто — из настроек"
      />
      <Estimate form={form} p={p} loading={loading} />
      {mode === "create" && p.unpaid && (
        <UnpaidCheck checked={form.allowUnpaid} onChange={(v) => set({ allowUnpaid: v })} dueText={p.amountDueMinor > 0 ? money(p.amountDueMinor) : null} />
      )}
    </div>
  );
}
