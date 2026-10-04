"use client";

/**
 * Confirmation dialog in the admin's own style — instead of `window.confirm`, which looks foreign
 * and may not show at all inside the Telegram WebView the admin is opened from.
 *
 *   const [confirm, confirmUi] = useConfirm();
 *   …
 *   if (!(await confirm({ title: "Удалить?", message: "…", confirmLabel: "Удалить", danger: true }))) return;
 *   …
 *   return <>{…}{confirmUi}</>;
 */
import { useCallback, useRef, useState, type ReactNode } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

export interface ConfirmOptions {
  title: ReactNode;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for destructive actions. */
  danger?: boolean;
}

export function ConfirmModal({
  open,
  options,
  onResult,
}: {
  open: boolean;
  options: ConfirmOptions | null;
  onResult: (ok: boolean) => void;
}) {
  return (
    <Modal
      open={open}
      onClose={() => onResult(false)}
      title={options?.title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onResult(false)}>
            {options?.cancelLabel ?? "Отмена"}
          </Button>
          <Button variant={options?.danger ? "danger" : "accent"} onClick={() => onResult(true)} autoFocus>
            {options?.confirmLabel ?? "Подтвердить"}
          </Button>
        </>
      }
    >
      {options?.message && <div className="text-[14px] text-[var(--text-muted)]">{options.message}</div>}
    </Modal>
  );
}

/** Promise-based confirm: returns the `confirm()` function and the element to render. */
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    // A second request while one is open answers the first with "no".
    resolver.current?.(false);
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const onResult = useCallback((ok: boolean) => {
    setOpen(false);
    const r = resolver.current;
    resolver.current = null;
    r?.(ok);
  }, []);

  return [confirm, <ConfirmModal key="confirm" open={open} options={options} onResult={onResult} />];
}
