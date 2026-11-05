"use client";

import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CURRENCIES } from "@/features/procurement";
import { linesSum } from "../../model/ai/checks";
import type { SupplyAi } from "./use-supply-ai";

/** Шапка документа: поставщик (и его память), валюта, курс, сверка итога. */
interface Props {
  ai: SupplyAi;
  /** null — ИИ не понял валюту, админ выбирает сам. */
  currency: string | null;
  onCurrency: (c: string) => void;
  fxRate: string;
  setFxRate: (v: string) => void;
  finance: boolean;
}

export function DocSummary({ ai, currency, onCurrency, fxRate, setFxRate, finance }: Props) {
  const doc = ai.doc!;
  const fresh = doc.supplier ? `+ новый: ${doc.supplier}` : "— без поставщика —";
  const options = [{ value: "", label: fresh }, ...ai.suppliers.map((s) => ({ value: String(s.id), label: s.name }))];
  const taken = ai.rows.filter((r) => r.decision.kind !== "skip").map((r) => r.line);
  return (
    <div className="flex flex-col gap-3 rounded-[var(--r-md)] border border-[var(--line)] p-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_140px] sm:items-end">
        <Select label="Поставщик" value={ai.supplierId} options={options} onChange={ai.setSupplierId} />
        <Select
          label={doc.currency ? "Валюта" : "Валюта (выберите)"}
          value={currency ?? ""}
          options={[...(currency ? [] : [{ value: "", label: "— не понял —" }]), ...CURRENCIES.map((c) => ({ value: c, label: c }))]}
          onChange={(c) => c && onCurrency(c)}
        />
        {finance && <Input label="Курс к гривне" inputMode="decimal" value={fxRate} onChange={(e) => setFxRate(e.target.value)} placeholder="курс НБУ" />}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--text-muted)]">
        {ai.supplierId && <span>Память поставщика: {ai.memoryCount} строк</span>}
        <span className="tabular-nums">
          Сумма строк: {linesSum(taken)}
          {doc.total != null && ` · итог документа: ${doc.total}`}
        </span>
        {ai.sumIssue ? <span className="min-w-0 text-[var(--warn)]">⚠ не сходится: {ai.sumIssue}</span> : doc.total != null && <Badge tone="ok">итог сходится</Badge>}
      </div>
      {ai.parsed?.docNotes && <div className="text-[13px] text-[var(--text-muted)]">ИИ о документе: {ai.parsed.docNotes}</div>}
    </div>
  );
}
