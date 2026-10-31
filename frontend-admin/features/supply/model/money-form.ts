import { now } from "@shop/core/time";
import {
  fxToInput,
  inputToFx,
  inputToMinor,
  minorToInput,
  type Allocation,
  type BatchMoney,
  type ExpenseRequest,
  type MoneyRequest,
  type Expense,
  type ExpenseKind,
} from "@/features/procurement";
import { decimal1 } from "./format";

export interface LineDraft {
  price: string;
  weight: string;
  manual: string;
}

export interface MoneyFormValues {
  currency: string;
  fx: string;
  allocation: Allocation;
  costsFinal: boolean;
  lines: Record<number, LineDraft>;
}

export const EMPTY_DRAFT: LineDraft = { price: "", weight: "", manual: "" };

export function parseRate(s: string): number | null {
  const n = Number(s.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function marginTone(p: number | null | undefined): string {
  if (p == null) return "text-[var(--text-muted)]";
  return p < 0 ? "text-[#F87171]" : "text-[var(--ok)]";
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${decimal1(bytes / 1024 / 1024)} МБ`;
}

/** Форма из свежего ответа сервера (первая загрузка, сохранение, правка расхода). */
export function moneyFormValues(data: BatchMoney): MoneyFormValues {
  return {
    currency: data.currency,
    fx: data.fxRate != null ? String(data.fxRate) : "",
    allocation: data.allocation,
    costsFinal: data.costsFinal,
    lines: Object.fromEntries(
      data.lines.map((l) => [
        l.itemId,
        {
          price: fxToInput(l.unitPriceFx),
          weight: l.weightG != null ? String(l.weightG) : "",
          manual: minorToInput(l.manualExtraMinor),
        },
      ]),
    ),
  };
}

export function toMoneyRequest(data: BatchMoney, v: MoneyFormValues): MoneyRequest {
  return {
    currency: v.currency,
    fxRate: parseRate(v.fx),
    allocation: v.allocation,
    costsFinal: v.costsFinal,
    lines: data.lines.map((l) => {
      const d = v.lines[l.itemId] ?? EMPTY_DRAFT;
      const w = parseInt(d.weight, 10);
      return {
        itemId: l.itemId,
        unitPriceFx: inputToFx(d.price),
        weightG: Number.isFinite(w) && w > 0 ? w : null,
        manualExtraMinor: inputToMinor(d.manual),
      };
    }),
  };
}

// ---- расход -----------------------------------------------------------------------

export interface ExpenseFormValues {
  kind: ExpenseKind;
  amount: string;
  currency: string;
  rate: string;
  spentOn: string;
  note: string;
  scope: string;
}

function todayLocal(): string {
  const d = now();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function expenseFormValues(edit: Expense | null, defaultCurrency: string, defaultRate: string): ExpenseFormValues {
  return {
    kind: edit?.kind ?? "FREIGHT",
    amount: edit ? minorToInput(edit.amountMinor) : "",
    currency: edit?.currency ?? defaultCurrency,
    rate: edit?.fxRate != null ? String(edit.fxRate) : defaultRate,
    spentOn: edit?.spentOn ?? todayLocal(),
    note: edit?.note ?? "",
    scope: edit?.itemId != null ? String(edit.itemId) : "ALL",
  };
}

/** Тело запроса или текст первой ошибки. */
export function toExpenseRequest(v: ExpenseFormValues): { body: ExpenseRequest } | { error: string } {
  const amountMinor = inputToMinor(v.amount);
  if (amountMinor == null || amountMinor === 0) return { error: "Введите сумму (отрицательная — компенсация)" };
  const foreign = v.currency !== "UAH";
  const fxRate = foreign ? parseRate(v.rate) : null;
  if (foreign && fxRate == null) return { error: "Укажите курс к гривне" };
  return {
    body: {
      itemId: v.scope === "ALL" ? null : Number(v.scope),
      kind: v.kind,
      amountMinor,
      currency: v.currency,
      fxRate,
      spentOn: v.spentOn || null,
      note: v.note.trim() || null,
    },
  };
}
