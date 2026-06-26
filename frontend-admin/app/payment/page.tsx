"use client";

/**
 * Payment settings (route "/payment") — Neo-brutalism restyle.
 *  - Payment options list: GET/PUT /api/admin/payment-options (replace list).
 *  - Requisites: GET/PUT /api/admin/payment-requisites, with a live customer preview.
 * Functionality preserved 1:1 from the original; only the look changed.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Plus, Trash2, Save, CreditCard, Wallet, ReceiptText } from "lucide-react";
import {
  adminApi,
  ApiError,
  type PaymentOption,
  type PaymentRequisitesDto,
} from "@/lib/api";
import { toMajor, toMinor } from "@/lib/money";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Toggle } from "@/components/ui/Toggle";
import { CenterSpinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { staggerContainer, riseItem, ease } from "@/lib/motion";
import { useToast } from "@/lib/toast";

interface OptionRow extends Omit<PaymentOption, "prepaymentMinor"> {
  prepaymentMajor: string;
}

export default function PaymentPage() {
  const { push } = useToast();

  const optionsQ = useQuery({
    queryKey: ["payment-options"],
    queryFn: () => adminApi.paymentOptions(),
  });
  const reqQ = useQuery({
    queryKey: ["payment-requisites"],
    queryFn: () => adminApi.paymentRequisites(),
  });

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

  function addOption() {
    setOptions((p) => [
      ...p,
      { title: "", description: "", requiresPrepayment: false, prepaymentMajor: "" },
    ]);
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
          prepaymentMinor:
            o.requiresPrepayment && o.prepaymentMajor ? toMinor(o.prepaymentMajor) : null,
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

  const loading = optionsQ.isLoading || reqQ.isLoading;

  return (
    <div className="min-w-0">
      <PageHeader
        title="Оплата"
        subtitle="Варианты оплаты и реквизиты, которые видит покупатель."
      />

      {loading ? (
        <CenterSpinner label="Загрузка настроек оплаты" />
      ) : (
        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          {/* ===================== Payment options ===================== */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={ease}
            className="panel min-w-0 p-5"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-md)] border-2 border-[var(--line)] bg-[var(--accent)] text-[var(--accent-ink)]">
                  <Wallet className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[16px] font-black uppercase tracking-wide text-[var(--text)]">
                    Варианты оплаты
                  </h2>
                  <p className="text-[12px] text-[var(--text-muted)]">
                    Покупатель выбирает один из них при оформлении.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="surface"
                icon={<Plus className="h-4 w-4" />}
                onClick={addOption}
              >
                Добавить
              </Button>
            </div>

            {options.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="Нет вариантов оплаты"
                description="Добавьте хотя бы один способ оплаты, чтобы покупатели могли оформить заказ."
                action={
                  <Button
                    size="sm"
                    variant="accent"
                    icon={<Plus className="h-4 w-4" />}
                    onClick={addOption}
                  >
                    Добавить вариант
                  </Button>
                }
              />
            ) : (
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="flex min-w-0 flex-col gap-3"
              >
                {options.map((o, i) => (
                  <motion.div
                    key={i}
                    variants={riseItem}
                    className="card-2 flex min-w-0 flex-col gap-3 rounded-[var(--r-md)] p-4"
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <Input
                          label="Название"
                          className="max-w-full"
                          value={o.title}
                          onChange={(e) => patchOption(i, { title: e.target.value })}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setOptions((p) => p.filter((_, j) => j !== i))}
                        className="focusable mt-[26px] grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--danger)]"
                        aria-label="Удалить"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <Input
                      label="Описание"
                      className="max-w-full"
                      value={o.description ?? ""}
                      onChange={(e) => patchOption(i, { description: e.target.value })}
                    />

                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <Toggle
                        checked={o.requiresPrepayment}
                        onChange={(v) => patchOption(i, { requiresPrepayment: v })}
                        label="Предоплата"
                      />
                      {o.requiresPrepayment && (
                        <Input
                          label="Сумма (UAH)"
                          inputMode="decimal"
                          className="max-w-full"
                          value={o.prepaymentMajor}
                          onChange={(e) => patchOption(i, { prepaymentMajor: e.target.value })}
                        />
                      )}
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}

            <Button
              variant="accent"
              className="mt-4"
              loading={savingOpts}
              icon={<Save className="h-4 w-4" />}
              onClick={saveOptions}
            >
              Сохранить варианты
            </Button>
          </motion.section>

          {/* ===================== Requisites + preview ===================== */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...ease, delay: 0.06 }}
            className="panel min-w-0 p-5"
          >
            <div className="mb-4 flex min-w-0 items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-md)] border-2 border-[var(--line)] bg-[var(--accent)] text-[var(--accent-ink)]">
                <ReceiptText className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-[16px] font-black uppercase tracking-wide text-[var(--text)]">Реквизиты</h2>
                <p className="text-[12px] text-[var(--text-muted)]">
                  Отображаются покупателю для оплаты заказа.
                </p>
              </div>
            </div>

            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <Input
                label="Номер карты"
                className="max-w-full"
                value={req.cardNumber ?? ""}
                onChange={(e) => setReq({ ...req, cardNumber: e.target.value })}
              />
              <Input
                label="IBAN"
                className="max-w-full"
                value={req.iban ?? ""}
                onChange={(e) => setReq({ ...req, iban: e.target.value })}
              />
              <Input
                label="Получатель"
                className="max-w-full"
                value={req.recipient ?? ""}
                onChange={(e) => setReq({ ...req, recipient: e.target.value })}
              />
              <Input
                label="РНОКПП / ЕДРПОУ"
                className="max-w-full"
                value={req.edrpou ?? ""}
                onChange={(e) => setReq({ ...req, edrpou: e.target.value })}
              />
              <div className="min-w-0 sm:col-span-2">
                <Input
                  label="Назначение платежа"
                  className="max-w-full"
                  value={req.purpose ?? ""}
                  onChange={(e) => setReq({ ...req, purpose: e.target.value })}
                />
              </div>
              <div className="min-w-0 sm:col-span-2">
                <Textarea
                  label="Примечание (необязательно)"
                  rows={2}
                  className="max-w-full"
                  value={req.note ?? ""}
                  onChange={(e) => setReq({ ...req, note: e.target.value })}
                />
              </div>
            </div>

            {/* Live preview — matches what the customer sees */}
            <div className="mt-4 min-w-0">
              <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                Превью (как у клиента)
              </div>
              <div className="card-2 min-w-0 rounded-[var(--r-md)] p-4">
                <div className="mb-3 flex items-center gap-2 text-[14px] font-bold text-[var(--text)]">
                  <CreditCard className="h-4 w-4 text-[var(--accent)]" />
                  Реквизиты для оплаты
                </div>
                {req.cardNumber ||
                req.iban ||
                req.recipient ||
                req.edrpou ||
                req.purpose ? (
                  <div className="flex min-w-0 flex-col gap-2.5">
                    {req.cardNumber && <ReqRow label="Карта" value={req.cardNumber} mono />}
                    {req.iban && <ReqRow label="IBAN" value={req.iban} mono />}
                    {req.recipient && <ReqRow label="Получатель" value={req.recipient} />}
                    {req.edrpou && <ReqRow label="РНОКПП / ЕДРПОУ" value={req.edrpou} mono />}
                    {req.purpose && <ReqRow label="Назначение" value={req.purpose} />}
                  </div>
                ) : (
                  <p className="text-[13px] text-[var(--text-faint)]">
                    Заполните поля выше — здесь появится превью.
                  </p>
                )}
                {req.note && (
                  <p className="mt-3 whitespace-pre-wrap break-words text-[12px] text-[var(--text-faint)]">
                    {req.note}
                  </p>
                )}
              </div>
            </div>

            <Button
              variant="accent"
              className="mt-4"
              loading={savingReq}
              icon={<Save className="h-4 w-4" />}
              onClick={saveReq}
            >
              Сохранить реквизиты
            </Button>
          </motion.section>
        </div>
      )}
    </div>
  );
}

function ReqRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-[var(--text-faint)]">{label}</div>
      <div
        className={`break-words text-[14px] text-[var(--text)] ${
          mono ? "font-mono tracking-wide" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
