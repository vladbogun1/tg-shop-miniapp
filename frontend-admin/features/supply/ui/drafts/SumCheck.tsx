"use client";

/**
 * Сверка суммы строк с итогом документа — крупно, сверху. Сходится — зелёная плашка; не сходится — сколько не хватает
 * (или лишнего) и что делать: перечитать накладную, дописать строку, убрать лишнюю.
 */
import { Button } from "@shop/ui/admin-button";
import { AlertTriangle, CheckCircle2, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/Input";
import type { DraftSumInfo, ManualLine } from "../../api-drafts";
import { parseAmount, type DraftSum } from "../../model/drafts/draft";
import { fmtDoc } from "./review";

export function ManualLineForm({ onAdd, onClose }: { onAdd: (l: ManualLine) => Promise<boolean>; onClose: () => void }) {
  const [text, setText] = useState("");
  const [variant, setVariant] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const q = parseAmount(qty);
  const valid = text.trim() !== "" && q != null && q > 0 && Number.isInteger(q);

  async function submit() {
    if (!valid || q == null) return;
    setBusy(true);
    const ok = await onAdd({ text: text.trim(), variant: variant.trim() || null, qty: q, unitPrice: parseAmount(price) });
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <div className="mt-3 grid min-w-0 gap-3 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1.2fr_90px_130px]">
      <Input id="manual-text" label="Что написано в накладной" value={text} onChange={(e) => setText(e.target.value)} />
      <Input id="manual-variant" label="Вариант" value={variant} placeholder="необязательно" onChange={(e) => setVariant(e.target.value)} />
      <Input id="manual-qty" label="Кол-во" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
      <Input id="manual-price" label="Цена за штуку" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
        <Button variant="accent" size="sm" disabled={!valid} loading={busy} onClick={() => void submit()}>
          Добавить строку
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Отмена
        </Button>
      </div>
    </div>
  );
}

function Notes({ info }: { info: DraftSumInfo | undefined }) {
  if (!info || (info.rereads === 0 && info.removedRepeats.length === 0)) return null;
  return (
    <div className="mt-2 space-y-0.5 text-[12px] text-[var(--text-faint)]">
      {info.rereads > 0 && <p>ИИ перечитывал накладную: {info.rereads} раз.</p>}
      {info.removedRepeats.length > 0 && <p className="break-words">Убрано как повтор на стыке скринов: {info.removedRepeats.join("; ")}.</p>}
    </div>
  );
}

export interface SumCheckProps {
  sum: DraftSum;
  currency: string;
  info: DraftSumInfo | undefined;
  rereading: boolean;
  onReread: () => void;
  onAdd: (l: ManualLine) => Promise<boolean>;
}

export function SumCheck({ sum, currency, info, rereading, onReread, onAdd }: SumCheckProps) {
  const [adding, setAdding] = useState(false);
  const f = (n: number) => fmtDoc(n, currency);
  if (sum.status === "OK" && sum.docTotal != null) {
    return (
      <div className="card mb-4 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-[var(--ok)] p-4">
        <CheckCircle2 className="h-6 w-6 shrink-0 text-[var(--ok)]" />
        <div className="min-w-0 flex-1 text-[16px] font-bold text-[var(--text)]">
          Сходится с заказом · <span className="tabular-nums">{f(sum.docTotal)}</span>
        </div>
        <Notes info={info} />
      </div>
    );
  }
  if (sum.status === "NO_TOTAL" || sum.docTotal == null || sum.diff == null) {
    return (
      <div className="card mb-4 min-w-0 p-4 text-[13.5px] text-[var(--text-muted)]">
        В документе нет итога — сверить сумму не с чем. Сумма строк: <span className="font-semibold tabular-nums text-[var(--text)]">{f(sum.linesSum)}</span>.
      </div>
    );
  }
  const missing = sum.diff > 0;
  return (
    <div className="card mb-4 min-w-0 border-[var(--warn)] p-4">
      <div className="flex min-w-0 items-start gap-3">
        <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-[var(--warn)]" />
        <div className="min-w-0 flex-1">
          <div className="text-[17px] font-bold leading-snug text-[var(--text)]">
            {missing ? "Не хватает" : "Лишние"} <span className="tabular-nums">{f(sum.diff)}</span>
          </div>
          <div className="mt-0.5 text-[13px] tabular-nums text-[var(--text-muted)]">
            в заказе {f(sum.docTotal)}, в строках {f(sum.linesSum)}
          </div>
          <p className="mt-1.5 text-[12.5px] text-[var(--text-muted)]">
            {missing
              ? "Скорее всего, ИИ пропустил строку на стыке скринов. Перечитайте накладную или допишите строку сами."
              : "Скорее всего, где-то есть повтор. Уберите лишнюю строку («Пропустить» сумму не меняет — только «Убрать из документа»)."}
          </p>
          <Notes info={info} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" icon={<RefreshCw className="h-4 w-4" />} loading={rereading} onClick={onReread}>
          Перечитать накладную
        </Button>
        <Button variant="outline" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
          Добавить строку вручную
        </Button>
      </div>
      {adding && <ManualLineForm onAdd={onAdd} onClose={() => setAdding(false)} />}
    </div>
  );
}
