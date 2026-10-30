"use client";

/** Подтверждения админки: тот же диалог, что и прежний `ConfirmModal`. Один хост на приложение. */
import { useSyncExternalStore } from "react";
import { Modal } from "../overlay/Modal";
import { Button as AdminButton } from "../primitives/AdminButton";
import { answerConfirm, getPendingConfirm, subscribeConfirm, type PendingConfirm } from "./confirm-store";

const DEFAULT_LABELS = { confirm: "Подтвердить", cancel: "Отмена" };

function usePending(): PendingConfirm | null {
  return useSyncExternalStore(subscribeConfirm, getPendingConfirm, () => null);
}

export function AdminConfirmHost() {
  const pending = usePending();
  const labels = DEFAULT_LABELS;
  const options = pending?.options ?? null;
  return (
    <Modal
      open={pending !== null}
      onClose={() => answerConfirm(false)}
      title={options?.title}
      size="sm"
      footer={
        <>
          <AdminButton variant="ghost" onClick={() => answerConfirm(false)}>
            {options?.cancelLabel ?? labels.cancel}
          </AdminButton>
          <AdminButton variant={options?.danger ? "danger" : "accent"} onClick={() => answerConfirm(true)} autoFocus>
            {options?.confirmLabel ?? labels.confirm}
          </AdminButton>
        </>
      }
    >
      {options?.message && <div className="text-[14px] text-[var(--text-muted)]">{options.message}</div>}
    </Modal>
  );
}

