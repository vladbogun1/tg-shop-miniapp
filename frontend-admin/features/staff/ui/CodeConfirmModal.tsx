"use client";

import { Button } from "@shop/ui/admin-button";
import { Modal } from "@shop/ui/overlay";
import { toast } from "@shop/ui/toast";
import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useCodeAction, type CodeAsk, type LinkToShow } from "../queries";
import { CodeInput } from "./auth/CodeInput";

interface Props {
  ask: CodeAsk;
  onClose: () => void;
  onLink: (l: LinkToShow) => void;
}

/** Опасное действие: что произойдёт + собственный код главного админа из приложения. */
export function CodeConfirmModal({ ask, onClose, onLink }: Props) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const m = useCodeAction(ask, {
    onDone: onClose,
    onLink,
    onFail: (e) => {
      if (e instanceof ApiError && (e.code === "BAD_CODE" || e.code === "CODE_REQUIRED")) {
        setError(e.message);
        setCode("");
      } else {
        toast.error(e instanceof ApiError ? e.message : "Не удалось выполнить");
        onClose();
      }
    },
  });
  const busy = m.isPending;

  function run(value = code) {
    if (value.length !== 6 || busy) return;
    setError(null);
    m.mutate(value);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={ask.title}
      size="sm"
      closeOnBackdrop={false}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button variant={ask.danger ? "danger" : "accent"} loading={busy} disabled={code.length !== 6} onClick={() => run()}>
            {ask.confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="text-[14px] leading-relaxed text-[var(--text-muted)]">{ask.message}</div>
        <CodeInput
          id="admin-action-code"
          label="Ваш код из приложения"
          value={code}
          onChange={(v) => {
            setCode(v);
            if (error) setError(null);
          }}
          onComplete={(v) => run(v)}
          error={!!error}
          disabled={busy}
          autoFocus
        />
        {error && (
          <p role="alert" className="-mt-1 text-[13px] text-[var(--danger-ink)]">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
