"use client";

/**
 * Payment settings: «Настройки → Оплата» → «Способы оплаты» (route "/settings/payment"; old "/payment" redirects).
 *  - monobank status: is the acquiring token set and accepted, the merchant, the last webhook and
 *    whether its signature was valid (GET /api/admin/payments/monobank/status).
 *  - Payment options: GET ?includeInactive=true / PUT /api/admin/payment-options (the whole list,
 *    in checkout order). Every option is paid ONLINE through monobank: the whole amount, or a
 *    prepayment now + the rest cash on delivery (наложка). The customer has 24 h to pay, then the
 *    order is cancelled automatically. Each option can be switched off (kept for old orders) and
 *    moved up/down. Rows are compact; the editor opens in the row (laptop) or in a sheet (phone).
 *
 * Nothing can be saved until the options loaded (A7: a failed load used to leave an empty form
 * whose «Сохранить» switched every payment option off). Unsaved edits are reported via `onDirtyChange`; the section page asks before leaving.
 */
import { useEffect, useMemo, useState } from "react";
import { CircleHelp, Plus, Wallet } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { useMediaQuery } from "@shop/ui/use-media";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@shop/ui/overlay";
import { QueryState } from "@/components/ui/QueryState";
import { Toggle } from "@/components/ui/Toggle";
import { toast } from "@shop/ui/toast";
import { firstProblemKey, newRow, optionsSnapshot, saveBlocker, toPayload, toRows, type OptionRow } from "../model/options";
import { useMonobankStatusQuery, usePaymentOptionsQuery, useSavePaymentOptions } from "../queries";
import { HowItWorks } from "./HowItWorks";
import { MonobankCard } from "./MonobankCard";
import { OptionsList } from "./OptionsList";
import { PaymentSaveBar } from "./PaymentSaveBar";

interface Props {
  /**
   * Несохранённые правки отдаются наверх: экран живёт вкладкой страницы «Настройки → Оплата», и уход с неё
   * спрашивает один общий guard раздела (свой заголовок и свой guard у экрана больше не нужны).
   */
  onDirtyChange?: (dirty: boolean) => void;
}

export function PaymentSettingsScreen({ onDirtyChange }: Props = {}) {
  const optionsQ = usePaymentOptionsQuery("all");
  const monoQ = useMonobankStatusQuery();
  const wide = useMediaQuery("(min-width: 1536px)");

  const [options, setOptions] = useState<OptionRow[]>([]);
  const [baseRows, setBaseRows] = useState<OptionRow[]>([]);
  const [baseOptions, setBaseOptions] = useState("");
  const [showHidden, setShowHidden] = useState(true);
  const [toDelete, setToDelete] = useState<OptionRow | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [help, setHelp] = useState(false);

  const fill = (rows: OptionRow[]) => {
    setOptions(rows);
    setBaseRows(rows);
    setBaseOptions(optionsSnapshot(rows));
  };
  const saveMut = useSavePaymentOptions((saved) => fill(toRows(saved)));

  // Fill the form only from a successful load — never from the empty initial state.
  useEffect(() => {
    if (optionsQ.data) fill(toRows(optionsQ.data));
  }, [optionsQ.data]);

  const loaded = !!optionsQ.data;
  const dirty = loaded && optionsSnapshot(options) !== baseOptions;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const activeCount = options.filter((o) => o.title.trim() && o.active).length;
  const blocker = saveBlocker(options, loaded);
  const problemKey = dirty && blocker ? firstProblemKey(options) : null;

  function addOption() {
    const row = newRow();
    setShowHidden(true);
    setOptions((p) => [...p, row]);
    setOpenKey(row.key);
  }

  function save() {
    if (blocker) {
      toast.error(blocker);
      return;
    }
    saveMut.mutate(toPayload(options));
  }

  function remove(o: OptionRow) {
    if (o.id) setToDelete(o);
    else {
      setOptions((p) => p.filter((x) => x.key !== o.key));
      setOpenKey(null);
    }
  }

  function showProblem() {
    setShowHidden(true);
    setOpenKey(problemKey);
  }

  const visible = useMemo(() => options.filter((o) => showHidden || o.active || !o.id), [options, showHidden]);
  const hiddenCount = options.filter((o) => o.id && !o.active).length;

  return (
    <div className="min-w-0">
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
        <div className="grid min-w-0 items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="panel min-w-0 p-4 sm:p-5" aria-label="Способы оплаты">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="section-title !text-[15px] text-[var(--ink)]">Способы оплаты · {options.length}</h2>
                <p className="mt-0.5 text-[12px] leading-snug text-[var(--text-muted)]">
                  Покупатель выбирает один из них; каждый оплачивается онлайн. Порядок — как в оформлении.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {!wide && (
                  <Button size="sm" variant="ghost" icon={<CircleHelp className="h-4 w-4" />} aria-expanded={help} onClick={() => setHelp((v) => !v)}>
                    Как это работает
                  </Button>
                )}
                <Button size="sm" variant="surface" icon={<Plus className="h-4 w-4" />} onClick={addOption}>
                  Способ оплаты
                </Button>
              </div>
            </div>

            {help && !wide && (
              <div className="mb-3">
                <HowItWorks />
              </div>
            )}

            {hiddenCount > 0 && (
              <div className="mb-3">
                <Toggle checked={showHidden} onChange={setShowHidden} label={`Показывать выключенные (${hiddenCount})`} />
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
              <OptionsList
                all={options}
                visible={visible}
                openKey={openKey}
                problemKey={problemKey}
                setOptions={setOptions}
                onOpen={setOpenKey}
                onRemove={remove}
              />
            )}
            {activeCount === 0 && options.length > 0 && (
              <p className="mt-3 text-[13px] font-semibold text-[var(--danger-ink)]">
                Все способы выключены — оформить заказ будет нельзя.
              </p>
            )}
          </section>

          {wide && <HowItWorks />}
        </div>

        <PaymentSaveBar
          dirty={dirty}
          blocker={blocker}
          saving={saveMut.isPending}
          onShow={problemKey ? showProblem : null}
          onDiscard={() => {
            setOptions(baseRows);
            setOpenKey(null);
          }}
          onSave={save}
        />
      </QueryState>

      <DeleteOptionModal
        option={toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          const k = toDelete?.key;
          setOptions((p) => p.filter((x) => x.key !== k));
          setToDelete(null);
          setOpenKey(null);
        }}
      />
    </div>
  );
}

function DeleteOptionModal({ option, onClose, onConfirm }: { option: OptionRow | null; onClose: () => void; onConfirm: () => void }) {
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
