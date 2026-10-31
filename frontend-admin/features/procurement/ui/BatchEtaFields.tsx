"use client";

import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ETA_MODES, fmtDay } from "../model/batch";
import { approxDate, type BatchFormValues } from "../model/batch-form";
import type { EtaMode } from "../model/types";

type Eta = Pick<BatchFormValues, "etaMode" | "etaFrom" | "etaTo" | "weeks">;

/** Срок поставки: дата / диапазон / «примерно через N недель» / не показывать. */
export function BatchEtaFields({ value, onChange }: { value: Eta; onChange: <K extends keyof Eta>(key: K, v: Eta[K]) => void }) {
  const { etaMode, etaFrom, etaTo, weeks } = value;
  return (
    <div className="flex flex-col gap-2">
      <span className="field-label">Срок</span>
      <SegmentedControl options={ETA_MODES} value={etaMode} onChange={(m: EtaMode) => onChange("etaMode", m)} />
      {etaMode === "DATE" && <Input aria-label="Дата" type="date" value={etaFrom} onChange={(e) => onChange("etaFrom", e.target.value)} />}
      {etaMode === "RANGE" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="С" type="date" value={etaFrom} onChange={(e) => onChange("etaFrom", e.target.value)} />
          <Input label="По" type="date" value={etaTo} onChange={(e) => onChange("etaTo", e.target.value)} />
        </div>
      )}
      {etaMode === "APPROX" && (
        <Input
          label="Через сколько недель"
          inputMode="numeric"
          value={weeks}
          onChange={(e) => onChange("weeks", e.target.value.replace(/[^\d]/g, ""))}
          hint={`Дата-цель: ${fmtDay(approxDate(weeks))}. Покупатель увидит «~N тижнів» от сегодняшнего дня; когда дата пройдёт — «найближчим часом».`}
        />
      )}
      {etaMode === "HIDDEN" && <p className="text-[12px] text-[var(--text-faint)]">Покупатель срок не увидит. Менять его можно сколько угодно — рассылки не будет.</p>}
    </div>
  );
}
