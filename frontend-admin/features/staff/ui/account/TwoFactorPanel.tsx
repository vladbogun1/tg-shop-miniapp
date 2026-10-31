"use client";

import { Button } from "@shop/ui/admin-button";
import { CheckCircle2, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@shop/core/time";
import type { AdminAccount, TwoFactorSetup } from "../../api";
import { useConfirmTotpReset, useStartTotpReset } from "../../queries";
import { CodeInput } from "../auth/CodeInput";
import { TwoFactorSecret } from "../auth/TwoFactorSecret";

export function TwoFactorPanel({ account }: { account: AdminAccount }) {
  const [stage, setStage] = useState<"idle" | "current" | "new">("idle");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);

  function cancel() {
    setStage("idle");
    setCode("");
    setSetup(null);
  }

  const start = useStartTotpReset(
    (s) => {
      setSetup(s);
      setStage("new");
      setCode("");
    },
    () => setCode(""),
  );
  const confirm = useConfirmTotpReset(cancel, () => setCode(""));
  const busy = start.isPending || confirm.isPending;

  function checkCurrent(value: string) {
    if (value.length !== 6 || busy) return;
    start.mutate(value);
  }

  function confirmNew(value: string) {
    if (value.length !== 6 || busy) return;
    confirm.mutate(value);
  }

  return (
    <section className="panel min-w-0 p-5">
      <PanelHeader icon={ShieldCheck} title="Двухфакторная защита" description="Код из приложения-аутентификатора при каждом входе (кроме доверенных устройств)." />
      <div
        className={cn(
          "mb-4 flex items-center gap-2.5 rounded-[var(--r-md)] border p-3 text-[13px]",
          account.totpEnabled
            ? "border-[color-mix(in_srgb,var(--ok)_40%,transparent)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)]"
            : "border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]",
        )}
      >
        {account.totpEnabled ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--ok)]" />
        ) : (
          <ShieldAlert className="h-4 w-4 shrink-0 text-[var(--danger-ink)]" />
        )}
        <span className="text-[var(--text)]">
          {account.totpEnabled ? (
            <>
              <b>Включена</b>
              {account.totpEnabledAt && <span className="text-[var(--text-muted)]"> с {formatDateTime(account.totpEnabledAt)}</span>}
            </>
          ) : (
            <b>Не настроена</b>
          )}
        </span>
      </div>

      {stage === "idle" && account.totpEnabled && (
        <div className="flex flex-col gap-2">
          <Button variant="surface" icon={<RefreshCw className="h-4 w-4" />} onClick={() => setStage("current")} className="sm:self-start">
            Перенастроить
          </Button>
          <p className="text-[12px] leading-snug text-[var(--text-faint)]">
            Новый телефон или другое приложение. Нужен код из текущего приложения. Потеряли телефон — обратитесь к главному админу
            {account.superAdmin ? " (для главного админа — аварийный сброс на сервере, docs/ADMIN-2FA.md)" : ""}.
          </p>
        </div>
      )}

      {stage === "current" && (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-[var(--text-muted)]">
            Шаг 1 из 2: введите код из <b className="text-[var(--text)]">текущего</b> приложения.
          </p>
          <CodeInput id="reset-current-code" label="Код из текущего приложения" value={code} onChange={setCode} onComplete={checkCurrent} autoFocus disabled={busy} />
          <div className="flex gap-2">
            <Button variant="accent" loading={busy} disabled={code.length !== 6} onClick={() => checkCurrent(code)}>
              Дальше
            </Button>
            <Button variant="ghost" onClick={cancel}>
              Отмена
            </Button>
          </div>
        </div>
      )}

      {stage === "new" && setup && (
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-[var(--text-muted)]">
            Шаг 2 из 2: добавьте <b className="text-[var(--text)]">новый</b> ключ в приложение и введите код из него.
          </p>
          <TwoFactorSecret setup={setup} />
          <CodeInput id="reset-new-code" label="Код из нового ключа" value={code} onChange={setCode} onComplete={confirmNew} disabled={busy} />
          <p className="text-[12px] leading-snug text-[var(--text-faint)]">
            После подтверждения старый ключ перестанет работать, другие сессии и доверенные устройства будут завершены.
          </p>
          <div className="flex gap-2">
            <Button variant="accent" loading={busy} disabled={code.length !== 6} onClick={() => confirmNew(code)}>
              Подтвердить
            </Button>
            <Button variant="ghost" onClick={cancel}>
              Отмена
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
