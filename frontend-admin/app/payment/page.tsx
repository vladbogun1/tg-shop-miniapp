"use client";

/**
 * Payment settings (route "/payment").
 *  - monobank status: is the acquiring token set and accepted, the merchant, the last webhook and
 *    whether its signature was valid (GET /api/admin/payments/monobank/status).
 *  - Payment options: GET ?includeInactive=true / PUT /api/admin/payment-options (the whole list,
 *    in checkout order). Every option is paid ONLINE through monobank: the whole amount, or a
 *    prepayment now + the rest cash on delivery (наложка). The customer has 24 h to pay, then the
 *    order is cancelled automatically. Each option can be switched off (kept for old orders) and
 *    moved up/down.
 *
 * Nothing can be saved until the options loaded (A7: a failed load used to leave an empty form
 * whose «Сохранить» switched every payment option off). Leaving with unsaved edits asks first.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Clock,
  CreditCard,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Truck,
  Wallet,
} from "lucide-react";
import { adminApi, ApiError, type MonobankStatus } from "@/lib/api";
import { extApi, type PaymentOptionFull } from "@/lib/api-extra";
import { money, toMajor, toMinor } from "@/lib/money";
import { formatDateTime, timeAgo } from "@/lib/orders";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { QueryState } from "@/components/ui/QueryState";
import { Skeleton } from "@/components/ui/Skeleton";
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

/** Prepayment in minor units; 0 when it is empty or not a positive number. */
function prepayMinor(o: OptionRow): number {
  const raw = o.prepaymentMajor.trim().replace(",", ".");
  const v = parseFloat(raw);
  return Number.isFinite(v) && v > 0 ? toMinor(raw) : 0;
}

export default function PaymentPage() {
  const { push } = useToast();

  const optionsQ = useQuery({
    queryKey: ["payment-options", "all"],
    queryFn: () => extApi.paymentOptionsAll(),
  });
  const monoQ = useQuery({
    queryKey: ["monobank-status"],
    queryFn: () => adminApi.getMonobankStatus(),
    staleTime: 30_000,
  });

  const [options, setOptions] = useState<OptionRow[]>([]);
  const [baseOptions, setBaseOptions] = useState("");
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

  const loaded = !!optionsQ.data;
  const dirty = loaded && optionsSnapshot(options) !== baseOptions;
  useUnsavedGuard(dirty);

  const named = options.filter((o) => o.title.trim());
  const activeCount = named.filter((o) => o.active).length;
  const blankTitles = options.some((o) => !o.title.trim() && (o.description.trim() || o.id));
  const noPrepayAmount = named.some((o) => o.requiresPrepayment && prepayMinor(o) <= 0);
  const blocker = !loaded
    ? "Настройки не загружены"
    : activeCount === 0
      ? "Включите хотя бы один способ оплаты — иначе покупатели не смогут оформить заказ"
      : blankTitles
        ? "У каждого способа оплаты должно быть название"
        : noPrepayAmount
          ? "Укажите сумму предоплаты — её покупатель оплатит онлайн"
          : null;

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
      const payload: PaymentOptionFull[] = named.map((o) => ({
        id: o.id,
        title: o.title.trim(),
        description: o.description.trim() || undefined,
        requiresPrepayment: o.requiresPrepayment,
        prepaymentMinor: o.requiresPrepayment ? prepayMinor(o) : null,
        active: o.active,
      }));
      const saved = await extApi.putPaymentOptions(payload);
      const rows = toRows(saved);
      setOptions(rows);
      setBaseOptions(optionsSnapshot(rows));
      push("Способы оплаты сохранены", "ok");
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
      <PageHeader
        title="Оплата"
        subtitle="Покупатель платит онлайн через monobank: всю сумму или предоплату, остаток — наложкой."
      />

      <MonobankCard
        status={monoQ.data}
        loading={monoQ.isLoading}
        error={monoQ.isError ? monoQ.error : null}
        fetching={monoQ.isFetching}
        onRefresh={() => monoQ.refetch()}
      />

      <QueryState
        isLoading={optionsQ.isLoading}
        isError={optionsQ.isError}
        error={optionsQ.error}
        refetch={() => optionsQ.refetch()}
        loadingLabel="Загрузка настроек оплаты"
      >
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
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
                  <CreditCard className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="section-title !text-[15px] text-[var(--ink)]">Способы оплаты</h2>
                  <p className="mt-0.5 text-[12px] leading-snug text-[var(--text-muted)]">
                    Покупатель выбирает один из них; каждый оплачивается онлайн. Порядок — как в оформлении.
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
                title="Нет способов оплаты"
                description="Добавьте хотя бы один — например «Полная оплата онлайн» или «Предоплата 100 ₴, остаток наложкой»."
                action={
                  <Button size="sm" variant="accent" icon={<Plus className="h-4 w-4" />} onClick={addOption}>
                    Добавить способ
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
                        label="Описание для покупателя"
                        className="max-w-full"
                        value={o.description}
                        onChange={(e) => patchOption(o.key, { description: e.target.value })}
                      />

                      <div className="flex flex-wrap items-end justify-between gap-3">
                        <Toggle
                          checked={o.requiresPrepayment}
                          onChange={(v) => patchOption(o.key, { requiresPrepayment: v })}
                          label="Предоплата + наложка"
                        />
                        {o.requiresPrepayment && (
                          <Input
                            label="Предоплата онлайн, ₴"
                            inputMode="decimal"
                            className="max-w-full"
                            value={o.prepaymentMajor}
                            error={o.title.trim() && prepayMinor(o) <= 0 ? "Укажите сумму" : undefined}
                            onChange={(e) => patchOption(o.key, { prepaymentMajor: e.target.value })}
                          />
                        )}
                      </div>
                      <OptionSummary row={o} />
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

          {/* ===================== How it works ===================== */}
          <HowItWorks />
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
  children: ReactNode;
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

/** One line under an option: what the customer pays online and what is left for the post office. */
function OptionSummary({ row }: { row: OptionRow }) {
  const pre = prepayMinor(row);
  return (
    <p className="flex items-start gap-1.5 text-[12px] leading-snug text-[var(--text-muted)]">
      {row.requiresPrepayment ? (
        <>
          <Truck className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Онлайн сейчас: <b className="tabular font-semibold text-[var(--text)]">{pre > 0 ? money(pre) : "—"}</b>,
            остаток — наложкой при получении.
          </span>
        </>
      ) : (
        <>
          <CreditCard className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>Вся сумма заказа онлайн через monobank.</span>
        </>
      )}
    </p>
  );
}

/** Static explainer next to the options: the rules every option follows. */
function HowItWorks() {
  const steps: { icon: typeof Clock; text: ReactNode }[] = [
    {
      icon: CreditCard,
      text: <>После оформления покупатель попадает на страницу monobank: карта, Apple Pay, Google Pay или приложение mono.</>,
    },
    {
      icon: Clock,
      text: (
        <>
          На оплату — <b className="text-[var(--text)]">24 часа</b>. Не оплатил — заказ отменяется сам (причина
          «Не оплатил за сутки»), товар возвращается на склад.
        </>
      ),
    },
    {
      icon: CircleCheck,
      text: (
        <>
          Оплаченный заказ остаётся <b className="text-[var(--text)]">«Новым»</b> — одобряете вы. Нет товара —
          «Вернуть деньги» в карточке заказа.
        </>
      ),
    },
    {
      icon: Truck,
      text: <>При предоплате остаток покупатель платит наложкой на почте.</>,
    },
  ];
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...ease, delay: 0.06 }}
      className="panel h-fit min-w-0 p-5"
    >
      <h2 className="section-title mb-3 !text-[15px] text-[var(--ink)]">Как работает оплата</h2>
      <ul className="flex flex-col gap-3">
        {steps.map(({ icon: Icon, text }, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[13px] leading-snug text-[var(--text-muted)]">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-hi)]" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </motion.section>
  );
}

type MonoState = { tone: "ok" | "warn" | "danger"; label: string; icon: typeof Clock; text: ReactNode };

function monoState(s: MonobankStatus): MonoState {
  if (!s.enabled) {
    return {
      tone: "warn",
      label: "Не настроено",
      icon: CircleDashed,
      text: (
        <>
          <span className="font-mono text-[12px]">MONOBANK_TOKEN</span> на сервере пуст — покупатели не смогут
          оплатить заказ. Токен выдаётся в web.monobank.ua → «Інтернет-еквайринг» и прописывается в .env сервера.
        </>
      ),
    };
  }
  if (s.error) {
    return { tone: "danger", label: "Ошибка", icon: CircleAlert, text: <>monobank ответил ошибкой: {s.error}</> };
  }
  return {
    tone: "ok",
    label: "Подключено",
    icon: CircleCheck,
    text: s.merchantName ? (
      <>
        Магазин в monobank: <b className="font-semibold text-[var(--text)]">{s.merchantName}</b>
      </>
    ) : (
      <>Токен принят monobank.</>
    ),
  };
}

const TONE_VAR: Record<MonoState["tone"] | "neutral", string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "#F87171",
  neutral: "var(--text-muted)",
};

/** monobank acquiring: connected / not configured / error, and the last webhook. */
function MonobankCard({
  status,
  loading,
  error,
  fetching,
  onRefresh,
}: {
  status?: MonobankStatus;
  loading: boolean;
  error: unknown;
  fetching: boolean;
  onRefresh: () => void;
}) {
  const st = status ? monoState(status) : null;
  const toneVar = TONE_VAR[st?.tone ?? "neutral"];
  const StIcon = st?.icon;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={ease}
      aria-label="Эквайринг monobank"
      className="panel mb-6 min-w-0 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-md)] border"
          style={{
            color: toneVar,
            background: `color-mix(in srgb, ${toneVar} 14%, transparent)`,
            borderColor: `color-mix(in srgb, ${toneVar} 30%, transparent)`,
          }}
        >
          <Wallet className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="section-title !text-[15px] text-[var(--ink)]">Эквайринг monobank</h2>
            {st && StIcon && (
              <Badge tone={st.tone}>
                <StIcon className="h-3 w-3" />
                {st.label}
              </Badge>
            )}
          </div>
          {loading ? (
            <Skeleton className="mt-2 h-10 max-w-md rounded-[var(--r-md)]" />
          ) : error || !status || !st ? (
            <p className="mt-1 text-[13px] text-[var(--danger-ink)]">
              Статус не загрузился{error instanceof ApiError ? `: ${error.message}` : ""}.
            </p>
          ) : (
            <div className="mt-1 flex flex-col gap-1.5 text-[13px] leading-snug text-[var(--text-muted)]">
              <p className="break-words">{st.text}</p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {status.lastWebhookAt ? (
                  <>
                    <span>
                      Последний вебхук:{" "}
                      <span className="tabular text-[var(--text)]">{formatDateTime(status.lastWebhookAt)}</span>{" "}
                      <span className="text-[var(--text-faint)]">({timeAgo(status.lastWebhookAt)})</span>
                    </span>
                    {status.lastWebhookSignatureOk === true && (
                      <Badge tone="ok">
                        <ShieldCheck className="h-3 w-3" />
                        подпись верна
                      </Badge>
                    )}
                    {status.lastWebhookSignatureOk === false && (
                      <Badge tone="danger">
                        <ShieldAlert className="h-3 w-3" />
                        подпись не сошлась
                      </Badge>
                    )}
                  </>
                ) : (
                  <span>Вебхуков от monobank ещё не было.</span>
                )}
              </div>
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          icon={<RefreshCw className={cn("h-4 w-4", fetching && "animate-spin")} />}
          onClick={onRefresh}
          disabled={fetching}
        >
          Проверить
        </Button>
      </div>
    </motion.section>
  );
}
