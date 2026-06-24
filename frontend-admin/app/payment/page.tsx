"use client";

/**
 * Payment settings (route "/payment"):
 *  - Payment options list: GET/PUT /api/admin/payment-options (replace list).
 *  - Requisites: GET/PUT /api/admin/payment-requisites, with a live preview.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, Save, CreditCard } from "lucide-react";
import {
  adminApi,
  ApiError,
  type PaymentOption,
  type PaymentRequisitesDto,
} from "@/lib/api";
import { toMajor, toMinor } from "@/lib/money";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassInput } from "@/components/ui/GlassInput";
import { GlassTextarea } from "@/components/ui/GlassTextarea";
import { GlassToggle } from "@/components/ui/GlassToggle";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/lib/toast";

interface OptionRow extends Omit<PaymentOption, "prepaymentMinor"> {
  prepaymentMajor: string;
}

export default function PaymentPage() {
  const { push } = useToast();

  const optionsQ = useQuery({ queryKey: ["payment-options"], queryFn: () => adminApi.paymentOptions() });
  const reqQ = useQuery({ queryKey: ["payment-requisites"], queryFn: () => adminApi.paymentRequisites() });

  const [options, setOptions] = useState<OptionRow[]>([]);
  const [req, setReq] = useState<PaymentRequisitesDto>({});
  const [savingOpts, setSavingOpts] = useState(false);
  const [savingReq, setSavingReq] = useState(false);

  useEffect(() => {
    if (optionsQ.data) {
      setOptions(
        optionsQ.data.map((o) => ({
          ...o,
          prepaymentMajor: o.prepaymentMinor ? String(toMajor(o.prepaymentMinor)) : "",
        }))
      );
    }
  }, [optionsQ.data]);

  useEffect(() => {
    if (reqQ.data) setReq(reqQ.data);
  }, [reqQ.data]);

  function patchOption(i: number, patch: Partial<OptionRow>) {
    setOptions((prev) => prev.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  }

  async function saveOptions() {
    setSavingOpts(true);
    try {
      const payload: PaymentOption[] = options
        .filter((o) => o.title.trim())
        .map((o) => ({
          id: o.id,
          title: o.title.trim(),
          description: o.description?.trim() || undefined,
          requiresPrepayment: o.requiresPrepayment,
          prepaymentMinor: o.requiresPrepayment && o.prepaymentMajor ? toMinor(o.prepaymentMajor) : null,
        }));
      await adminApi.putPaymentOptions(payload);
      push("Варианты оплаты сохранены", "ok");
      optionsQ.refetch();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Ошибка", "error");
    } finally {
      setSavingOpts(false);
    }
  }

  async function saveReq() {
    setSavingReq(true);
    try {
      await adminApi.putPaymentRequisites(req);
      push("Реквизиты сохранены", "ok");
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Ошибка", "error");
    } finally {
      setSavingReq(false);
    }
  }

  return (
    <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
      {/* Options */}
      <section className="min-w-0">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-[20px] font-bold text-[var(--text)]">Варианты оплаты</h1>
          <GlassButton
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() =>
              setOptions((p) => [
                ...p,
                { title: "", description: "", requiresPrepayment: false, prepaymentMajor: "" },
              ])
            }
          >
            Добавить
          </GlassButton>
        </div>

        {optionsQ.isLoading ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="flex flex-col gap-3">
            {options.map((o, i) => (
              <div key={i} className="glass flex flex-col gap-3 rounded-[var(--r-md)] p-4">
                <GlassInput label="Название" value={o.title} onChange={(e) => patchOption(i, { title: e.target.value })} />
                <GlassInput
                  label="Описание"
                  value={o.description ?? ""}
                  onChange={(e) => patchOption(i, { description: e.target.value })}
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <GlassToggle
                    checked={o.requiresPrepayment}
                    onChange={(v) => patchOption(i, { requiresPrepayment: v })}
                    label="Предоплата"
                  />
                  {o.requiresPrepayment && (
                    <GlassInput
                      label="Сумма (UAH)"
                      inputMode="decimal"
                      className="w-32 max-w-full"
                      value={o.prepaymentMajor}
                      onChange={(e) => patchOption(i, { prepaymentMajor: e.target.value })}
                    />
                  )}
                  <button
                    onClick={() => setOptions((p) => p.filter((_, j) => j !== i))}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--danger)]"
                    aria-label="Удалить"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            {options.length === 0 && (
              <div className="glass rounded-[var(--r-md)] px-4 py-8 text-center text-[var(--text-faint)]">
                Нет вариантов
              </div>
            )}
          </div>
        )}

        <GlassButton
          variant="accent"
          className="mt-4"
          loading={savingOpts}
          icon={<Save className="h-4 w-4" />}
          onClick={saveOptions}
        >
          Сохранить варианты
        </GlassButton>
      </section>

      {/* Requisites + preview */}
      <section className="min-w-0">
        <h1 className="mb-4 text-[20px] font-bold text-[var(--text)]">Реквизиты</h1>
        {reqQ.isLoading ? (
          <Skeleton className="h-60" />
        ) : (
          <div className="flex flex-col gap-3">
            <GlassInput
              label="Номер карты"
              value={req.cardNumber ?? ""}
              onChange={(e) => setReq({ ...req, cardNumber: e.target.value })}
            />
            <GlassInput
              label="IBAN"
              value={req.iban ?? ""}
              onChange={(e) => setReq({ ...req, iban: e.target.value })}
            />
            <GlassInput
              label="Получатель"
              value={req.recipient ?? ""}
              onChange={(e) => setReq({ ...req, recipient: e.target.value })}
            />
            <GlassInput
              label="РНОКПП / ЕДРПОУ"
              value={req.edrpou ?? ""}
              onChange={(e) => setReq({ ...req, edrpou: e.target.value })}
            />
            <GlassInput
              label="Назначение платежа"
              value={req.purpose ?? ""}
              onChange={(e) => setReq({ ...req, purpose: e.target.value })}
            />
            <GlassTextarea
              label="Примечание (необязательно)"
              rows={2}
              value={req.note ?? ""}
              onChange={(e) => setReq({ ...req, note: e.target.value })}
            />

            {/* Live preview — matches what the customer sees */}
            <div>
              <div className="mb-2 text-[12px] font-medium text-[var(--text-muted)]">Превью (как у клиента)</div>
              <div className="glass glass--strong rounded-[var(--r-md)] p-4">
                <div className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-[var(--text)]">
                  <CreditCard className="h-4 w-4 text-[var(--accent)]" />
                  Реквизиты для оплаты
                </div>
                <div className="flex flex-col gap-2">
                  {req.cardNumber && <ReqRow label="Карта" value={req.cardNumber} mono />}
                  {req.iban && <ReqRow label="IBAN" value={req.iban} mono />}
                  {req.recipient && <ReqRow label="Получатель" value={req.recipient} />}
                  {req.edrpou && <ReqRow label="РНОКПП / ЕДРПОУ" value={req.edrpou} mono />}
                  {req.purpose && <ReqRow label="Назначение" value={req.purpose} />}
                </div>
                {req.note && (
                  <p className="mt-2 whitespace-pre-wrap text-[12px] text-[var(--text-faint)]">{req.note}</p>
                )}
              </div>
            </div>

            <GlassButton
              variant="accent"
              className="mt-1"
              loading={savingReq}
              icon={<Save className="h-4 w-4" />}
              onClick={saveReq}
            >
              Сохранить реквизиты
            </GlassButton>
          </div>
        )}
      </section>
    </div>
  );
}

function ReqRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-[var(--text-faint)]">{label}</div>
      <div className={`text-[14px] text-[var(--text)] ${mono ? "font-mono tracking-wide" : ""}`}>{value}</div>
    </div>
  );
}
