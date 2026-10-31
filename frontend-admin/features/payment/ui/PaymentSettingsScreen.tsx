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
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CreditCard, Plus, Save, Wallet } from "lucide-react";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import { cn } from "@/lib/cn";
import { ease } from "@/lib/motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@shop/ui/admin-button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@shop/ui/overlay";
import { QueryState } from "@/components/ui/QueryState";
import { Toggle } from "@/components/ui/Toggle";
import { toast } from "@shop/ui/toast";
import { moveRow, newRow, optionsSnapshot, saveBlocker, toPayload, toRows, type OptionRow } from "../model/options";
import { useMonobankStatusQuery, usePaymentOptionsQuery, useSavePaymentOptions } from "../queries";
import { HowItWorks } from "./HowItWorks";
import { MonobankCard } from "./MonobankCard";
import { OptionCard } from "./OptionCard";

export function PaymentSettingsScreen() {
  const optionsQ = usePaymentOptionsQuery("all");
  const monoQ = useMonobankStatusQuery();

  const [options, setOptions] = useState<OptionRow[]>([]);
  const [baseOptions, setBaseOptions] = useState("");
  const [showHidden, setShowHidden] = useState(true);
  const [toDelete, setToDelete] = useState<OptionRow | null>(null);

  const saveMut = useSavePaymentOptions((saved) => {
    const rows = toRows(saved);
    setOptions(rows);
    setBaseOptions(optionsSnapshot(rows));
  });

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

  const activeCount = options.filter((o) => o.title.trim() && o.active).length;
  const blocker = saveBlocker(options, loaded);

  function patchOption(key: string, patch: Partial<OptionRow>) {
    setOptions((prev) => prev.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  }

  function addOption() {
    setShowHidden(true);
    setOptions((p) => [...p, newRow()]);
  }

  function save() {
    if (blocker) {
      toast.error(blocker);
      return;
    }
    saveMut.mutate(toPayload(options));
  }

  const visible = useMemo(() => options.filter((o) => showHidden || o.active || !o.id), [options, showHidden]);
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
                {visible.map((o) => (
                  <OptionCard
                    key={o.key}
                    o={o}
                    index={options.indexOf(o)}
                    count={options.length}
                    onPatch={(patch) => patchOption(o.key, patch)}
                    onMove={(delta) => setOptions((prev) => moveRow(prev, o.key, delta))}
                    onRemove={() => (o.id ? setToDelete(o) : setOptions((p) => p.filter((x) => x.key !== o.key)))}
                  />
                ))}
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
              loading={saveMut.isPending}
              disabled={!dirty || !!blocker}
              icon={<Save className="h-4 w-4" />}
              onClick={save}
            >
              Сохранить
            </Button>
          </div>
        </div>
      </QueryState>

      <DeleteOptionModal
        option={toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          const k = toDelete?.key;
          setOptions((p) => p.filter((x) => x.key !== k));
          setToDelete(null);
        }}
      />
    </div>
  );
}

function DeleteOptionModal({
  option,
  onClose,
  onConfirm,
}: {
  option: OptionRow | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={!!option}
      onClose={onClose}
      size="sm"
      title="Удалить способ оплаты?"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Удалить
          </Button>
        </div>
      }
    >
      <p className="text-[14px] text-[var(--text)]">
        «{option?.title || "Без названия"}» пропадёт из оформления заказа после «Сохранить». Совсем он не
        удаляется: на нём старые заказы, поэтому в списке он останется выключенным (среди скрытых).
      </p>
    </Modal>
  );
}
