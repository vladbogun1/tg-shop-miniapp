"use client";

/**
 * Payment settings (route "/payment").
 *  - Payment options: GET ?includeInactive=true / PUT /api/admin/payment-options (the whole list,
 *    in checkout order). Each option can be switched off (kept for old orders) and moved up/down.
 *  - Requisites: GET/PUT /api/admin/payment-requisites, with a live customer preview.
 *
 * Nothing can be saved until both loads succeeded (A7: a failed load used to leave an empty form
 * whose «Сохранить» switched every payment option off and wiped the requisites). One «Сохранить»
 * writes whatever changed; leaving with unsaved edits asks first. Card and IBAN are checked
 * (Luhn, UA + 27 digits) before they reach customers.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  CreditCard,
  Languages,
  Plus,
  ReceiptText,
  Save,
  Trash2,
  Wallet,
} from "lucide-react";
import { adminApi, ApiError, type PaymentRequisitesDto } from "@/lib/api";
import { extApi, type PaymentOptionFull } from "@/lib/api-extra";
import { toMajor, toMinor } from "@/lib/money";
import { cardProblem, ibanProblem } from "@/lib/requisites";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { QueryState } from "@/components/ui/QueryState";
import { Textarea } from "@/components/ui/Textarea";
import { Toggle } from "@/components/ui/Toggle";
import { ease } from "@/lib/motion";
import { useToast } from "@/lib/toast";

interface OptionRow {
  /** Stable key for React while rows move (id is absent on new rows). */
  key: string;
  id?: string;
  title: string;
  description: string;
  requiresPrepayment: boolean;
  prepaymentMajor: string;
  active: boolean;
}

let rowSeq = 0;

function toRows(list: PaymentOptionFull[]): OptionRow[] {
  return list.map((o) => ({
    key: o.id ?? `new-${rowSeq++}`,
    id: o.id,
    title: o.title ?? "",
    description: o.description ?? "",
    requiresPrepayment: !!o.requiresPrepayment,
    prepaymentMajor: o.prepaymentMinor ? String(toMajor(o.prepaymentMinor)) : "",
    active: o.active !== false,
  }));
}

/** Comparable shape (no React keys) for the dirty check. */
function optionsSnapshot(rows: OptionRow[]): string {
  return JSON.stringify(
    rows.map((r) => [r.id, r.title, r.description, r.requiresPrepayment, r.prepaymentMajor, r.active])
  );
}

const EMPTY_REQ: PaymentRequisitesDto = {};
function reqSnapshot(r: PaymentRequisitesDto): string {
  const n = (s?: string | null) => (s ?? "").trim();
  return JSON.stringify([n(r.cardNumber), n(r.iban), n(r.recipient), n(r.edrpou), n(r.purpose), n(r.note)]);
}

export default function PaymentPage() {
  const { push } = useToast();

  const optionsQ = useQuery({
    queryKey: ["payment-options", "all"],
    queryFn: () => extApi.paymentOptionsAll(),
  });
  const reqQ = useQuery({
    queryKey: ["payment-requisites"],
    queryFn: () => adminApi.paymentRequisites(),
  });

  const [options, setOptions] = useState<OptionRow[]>([]);
  const [baseOptions, setBaseOptions] = useState("");
  const [req, setReq] = useState<PaymentRequisitesDto>(EMPTY_REQ);
  const [baseReq, setBaseReq] = useState<PaymentRequisitesDto | null>(null);
  const [showHidden, setShowHidden] = useState(true);
  const [toDelete, setToDelete] = useState<OptionRow | null>(null);
  const [saving, setSaving] = useState(false);

  // Fill the form only from a successful load — never from the empty initial state.
  useEffect(() => {
    if (!optionsQ.data) return;
    const rows = toRows(optionsQ.data);
    setOptions(rows);
    setBaseOptions(optionsSnapshot(rows));
  }, [optionsQ.data]);
  useEffect(() => {
    if (!reqQ.data) return;
    setReq(reqQ.data);
    setBaseReq(reqQ.data);
  }, [reqQ.data]);

  const loaded = !!optionsQ.data && !!reqQ.data && baseReq !== null;
  const optionsDirty = loaded && optionsSnapshot(options) !== baseOptions;
  const reqDirty = loaded && reqSnapshot(req) !== reqSnapshot(baseReq ?? EMPTY_REQ);
  const dirty = optionsDirty || reqDirty;
  useUnsavedGuard(dirty);

  // Checked only when changed: an old value that predates the rule must not block other edits.
  const cardErr =
    (req.cardNumber ?? "").trim() !== (baseReq?.cardNumber ?? "").trim() ? cardProblem(req.cardNumber) : null;
  const ibanErr = (req.iban ?? "").trim() !== (baseReq?.iban ?? "").trim() ? ibanProblem(req.iban) : null;
  const named = options.filter((o) => o.title.trim());
  const activeCount = named.filter((o) => o.active).length;
  const blankTitles = options.some((o) => !o.title.trim() && (o.description.trim() || o.id));
  const blocker = !loaded
    ? "Настройки не загружены"
    : activeCount === 0
      ? "Включите хотя бы один способ оплаты — иначе покупатели не смогут оформить заказ"
      : blankTitles
        ? "У каждого способа оплаты должно быть название"
        : cardErr || ibanErr;

  function patchOption(key: string, patch: Partial<OptionRow>) {
    setOptions((prev) => prev.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  }

  function move(key: string, delta: -1 | 1) {
    setOptions((prev) => {
      const i = prev.findIndex((o) => o.key === key);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function addOption() {
    setShowHidden(true);
    setOptions((p) => [
      ...p,
      {
        key: `new-${rowSeq++}`,
        title: "",
        description: "",
        requiresPrepayment: false,
        prepaymentMajor: "",
        active: true,
      },
    ]);
  }

  async function save() {
    if (blocker) {
      push(blocker, "error");
      return;
    }
    setSaving(true);
    try {
      if (optionsDirty) {
        const payload: PaymentOptionFull[] = named.map((o) => ({
          id: o.id,
          title: o.title.trim(),
          description: o.description.trim() || undefined,
          requiresPrepayment: o.requiresPrepayment,
          prepaymentMinor: o.requiresPrepayment && o.prepaymentMajor ? toMinor(o.prepaymentMajor) : null,
          active: o.active,
        }));
        const saved = await extApi.putPaymentOptions(payload);
        const rows = toRows(saved);
        setOptions(rows);
        setBaseOptions(optionsSnapshot(rows));
      }
      if (reqDirty) {
        const saved = await adminApi.putPaymentRequisites(req);
        setReq(saved);
        setBaseReq(saved);
      }
      push("Настройки оплаты сохранены", "ok");
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось сохранить", "error");
    } finally {
      setSaving(false);
    }
  }

  const visible = useMemo(
    () => options.filter((o) => showHidden || o.active || !o.id),
    [options, showHidden]
  );
  const hiddenCount = options.filter((o) => o.id && !o.active).length;

  return (
    <div className="min-w-0">
      <PageHeader title="Оплата" subtitle="Варианты оплаты и реквизиты, которые видит покупатель." />

      <QueryState
        isLoading={optionsQ.isLoading || reqQ.isLoading}
        isError={optionsQ.isError || reqQ.isError}
        error={optionsQ.error ?? reqQ.error}
        refetch={() => {
          optionsQ.refetch();
          reqQ.refetch();
        }}
        loadingLabel="Загрузка настроек оплаты"
      >
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
                <span className="accent-tint grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-md)]">
                  <Wallet className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="section-title !text-[15px] text-[var(--ink)]">
                    Варианты оплаты
                  </h2>
                  <p className="mt-0.5 text-[12px] leading-snug text-[var(--text-muted)]">
                    Покупатель выбирает один из них. Порядок — как в оформлении.
                  </p>
                </div>
              </div>
              <Button size="sm" variant="surface" icon={<Plus className="h-4 w-4" />} onClick={addOption}>
                Добавить
              </Button>
            </div>

            {hiddenCount > 0 && (
              <div className="mb-3">
                <Toggle
                  checked={showHidden}
                  onChange={setShowHidden}
                  label={`Показывать выключенные (${hiddenCount})`}
                />
              </div>
            )}

            {options.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="Нет вариантов оплаты"
                description="Добавьте хотя бы один способ оплаты, чтобы покупатели могли оформить заказ."
                action={
                  <Button size="sm" variant="accent" icon={<Plus className="h-4 w-4" />} onClick={addOption}>
                    Добавить вариант
                  </Button>
                }
              />
            ) : (
              <div className="flex min-w-0 flex-col gap-3">
                {visible.map((o) => {
                  const i = options.indexOf(o);
                  return (
                    <div
                      key={o.key}
                      className={cn(
                        "card-2 flex min-w-0 flex-col gap-3 rounded-[var(--r-md)] p-4",
                        !o.active && "opacity-70"
                      )}
                    >
                      {/* items-end: the ↑↓ pair and the bin sit level with the field, not with its label. */}
                      <div className="flex items-end gap-2">
                        <div className="flex shrink-0 flex-col gap-1">
                          <OrderBtn label="Выше" disabled={i === 0} onClick={() => move(o.key, -1)}>
                            <ArrowUp className="h-3.5 w-3.5" />
                          </OrderBtn>
                          <OrderBtn
                            label="Ниже"
                            disabled={i === options.length - 1}
                            onClick={() => move(o.key, 1)}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </OrderBtn>
                        </div>
                        <div className="min-w-0 flex-1">
                          <Input
                            label="Название"
                            className="max-w-full"
                            value={o.title}
                            onChange={(e) => patchOption(o.key, { title: e.target.value })}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => (o.id ? setToDelete(o) : setOptions((p) => p.filter((x) => x.key !== o.key)))}
                          className="focusable grid h-[38px] w-10 shrink-0 place-items-center rounded-[var(--r-md)] text-[var(--text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] hover:text-[var(--danger-ink)] pointer-coarse:h-[42px]"
                          aria-label="Удалить"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <Input
                        label="Описание"
                        className="max-w-full"
                        value={o.description}
                        onChange={(e) => patchOption(o.key, { description: e.target.value })}
                      />

                      <div className="flex flex-wrap items-end justify-between gap-3">
                        <Toggle
                          checked={o.requiresPrepayment}
                          onChange={(v) => patchOption(o.key, { requiresPrepayment: v })}
                          label="Предоплата"
                        />
                        {o.requiresPrepayment && (
                          <Input
                            label="Сумма, ₴"
                            inputMode="decimal"
                            className="max-w-full"
                            value={o.prepaymentMajor}
                            onChange={(e) => patchOption(o.key, { prepaymentMajor: e.target.value })}
                          />
                        )}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-3">
                        <Toggle
                          checked={o.active}
                          onChange={(v) => patchOption(o.key, { active: v })}
                          label="Показывать покупателям"
                        />
                        {!o.active && <Badge tone="warn">выключен</Badge>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {activeCount === 0 && options.length > 0 && (
              <p className="mt-3 text-[13px] font-semibold text-[var(--danger-ink)]">
                Все способы выключены — оформить заказ будет нельзя.
              </p>
            )}
          </motion.section>

          {/* ===================== Requisites + preview ===================== */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...ease, delay: 0.06 }}
            className="panel min-w-0 p-5"
          >
            <div className="mb-4 flex min-w-0 items-center gap-3">
              <span className="accent-tint grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-md)]">
                <ReceiptText className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="section-title !text-[15px] text-[var(--ink)]">Реквизиты</h2>
                <p className="text-[12px] text-[var(--text-muted)]">
                  Отображаются покупателю для оплаты заказа. Каждая смена карты/IBAN пишется в журнал и
                  приходит уведомлением в Telegram.
                </p>
              </div>
            </div>

            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <Input
                label="Номер карты"
                className="max-w-full"
                inputMode="numeric"
                value={req.cardNumber ?? ""}
                error={cardErr ?? undefined}
                onChange={(e) => setReq({ ...req, cardNumber: e.target.value })}
              />
              <Input
                label="IBAN"
                className="max-w-full"
                value={req.iban ?? ""}
                error={ibanErr ?? undefined}
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
            <p className="mt-2 flex items-start gap-1.5 text-[12px] text-[var(--text-muted)]">
              <Languages className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Назначение и примечание покупатель видит на своём языке — переводы uk/en в{" "}
                <Link href="/translations" className="hit font-semibold text-[var(--accent-hi)] hover:underline">
                  «Переводах»
                </Link>
                . Правка русского текста сбрасывает перевод, пока его не обновят.
              </span>
            </p>

            {/* Live preview — matches what the customer sees */}
            <div className="mt-4 min-w-0">
              <div className="field-label mb-2">
                Превью (как у клиента)
              </div>
              <div className="card-2 min-w-0 rounded-[var(--r-md)] p-4">
                <div className="mb-3 flex items-center gap-2 font-display text-[14px] font-bold text-[var(--ink)]">
                  <CreditCard className="h-4 w-4 text-[var(--accent)]" />
                  Реквизиты для оплаты
                </div>
                {req.cardNumber || req.iban || req.recipient || req.edrpou || req.purpose ? (
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
          </motion.section>
        </div>

        {/* One save for the whole page, pinned so it is reachable on a phone. */}
        <div style={{ bottom: "calc(var(--bottom-nav) + 12px)" }} className="elevated sticky z-20 mt-6 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              className={cn(
                "text-[13px] font-semibold",
                blocker && dirty ? "text-[var(--danger-ink)]" : "text-[var(--text-muted)]"
              )}
            >
              {dirty ? (blocker ?? "Есть несохранённые изменения") : "Все изменения сохранены"}
            </span>
            <Button
              variant="accent"
              loading={saving}
              disabled={!dirty || !!blocker}
              icon={<Save className="h-4 w-4" />}
              onClick={save}
            >
              Сохранить
            </Button>
          </div>
        </div>
      </QueryState>

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        size="sm"
        title="Удалить способ оплаты?"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button variant="ghost" onClick={() => setToDelete(null)}>
              Отмена
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const k = toDelete?.key;
                setOptions((p) => p.filter((x) => x.key !== k));
                setToDelete(null);
              }}
            >
              Удалить
            </Button>
          </div>
        }
      >
        <p className="text-[14px] text-[var(--text)]">
          «{toDelete?.title || "Без названия"}» пропадёт из оформления заказа после «Сохранить». Старые заказы
          сохранят его название. Если нужно убрать на время — лучше выключите тумблер «Показывать покупателям».
        </p>
      </Modal>
    </div>
  );
}

function OrderBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-[17px] w-7 place-items-center rounded-[var(--r-sm)] border border-[var(--border-2)] bg-[var(--surface-3)] text-[var(--text)] transition-colors hover:border-[var(--line-strong)] disabled:opacity-30 pointer-coarse:h-8 pointer-coarse:w-10"
    >
      {children}
    </button>
  );
}

function ReqRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="field-label !text-[10.5px] !text-[var(--text-faint)]">{label}</div>
      <div className={`break-words text-[14px] text-[var(--text)] ${mono ? "font-mono tracking-wide" : ""}`}>
        {value}
      </div>
    </div>
  );
}
