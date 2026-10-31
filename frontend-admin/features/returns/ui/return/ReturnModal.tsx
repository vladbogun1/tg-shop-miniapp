"use client";

/**
 * Мастер возврата (POST /orders/{id}/returns): 1. Что возвращают, 2. Деньги, 3. Проверьте.
 * Отклонённый заказ или переплата до отправки пропускают шаг 1 — только деньги.
 * Расчёты — model/return-wizard.ts, состояние — use-return-wizard.ts, шаги — Step*.tsx.
 */
import { cn } from "@/lib/cn";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";
import type { ReturnWizardBody } from "../../api";
import type { ReturnOrder } from "../../model/types";
import { StepConfirm } from "./StepConfirm";
import { StepMoney } from "./StepMoney";
import { StepWhat } from "./StepWhat";
import { useReturnWizard } from "./use-return-wizard";

const STEP_TITLES = ["Что возвращают", "Деньги", "Проверьте и подтвердите"] as const;

export function ReturnModal({
  open,
  order,
  onClose,
  onSave,
  loading,
}: {
  open: boolean;
  order: ReturnOrder | null;
  onClose: () => void;
  onSave: (body: ReturnWizardBody) => Promise<unknown> | void;
  loading?: boolean;
}) {
  const w = useReturnWizard(open, order, onSave);
  if (!order || !w.d) return null;

  const { step } = w;
  const moneyOnly = w.d.moneyOnly;
  const firstStep = moneyOnly ? 2 : 1;
  const stepNo = moneyOnly ? step - 1 : step;
  const stepTotal = moneyOnly ? 2 : 3;

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      dirty={w.dirty}
      title="↩️ Возврат"
      footer={
        <>
          {step === firstStep ? (
            <ModalCancel />
          ) : (
            <Button variant="ghost" onClick={w.back} disabled={loading}>
              Назад
            </Button>
          )}
          {step < 3 ? (
            <Button variant="accent" disabled={w.nextBlocked} onClick={w.next}>
              Далее
            </Button>
          ) : (
            <Button variant="accent" loading={loading} disabled={w.blocked} onClick={w.submit}>
              Оформить возврат
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="flex gap-1" aria-hidden>
            {Array.from({ length: stepTotal }).map((_, i) => (
              <span
                key={i}
                className={cn("h-1.5 w-6 rounded-full", i < stepNo ? "bg-[var(--accent)]" : "bg-[var(--surface-3)]")}
              />
            ))}
          </div>
          <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
            Шаг {stepNo} из {stepTotal} · {STEP_TITLES[step - 1]}
          </span>
        </div>

        {step === 1 && <StepWhat w={w} />}
        {step === 2 && <StepMoney w={w} order={order} />}
        {step === 3 && <StepConfirm w={w} />}
      </div>
    </Modal>
  );
}
