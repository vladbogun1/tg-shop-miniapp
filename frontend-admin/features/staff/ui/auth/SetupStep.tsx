"use client";

import { Button } from "@shop/ui/admin-button";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError } from "@/lib/api";
import type { TwoFactorSetup } from "../../api";
import { useConfirmSetup, useStartSetup } from "../../queries";
import { CodeInput } from "./CodeInput";
import { handleSecondStepError, StepHeader, StepLabel, TrustToggle } from "./parts";
import { TwoFactorSecret } from "./TwoFactorSecret";

interface Props {
  preAuthToken: string;
  name?: string;
  onDone: () => void;
  onRestart: (message?: string) => void;
}

/** Первый вход без 2FA: QR + ключ + первый код (2FA обязательна). */
export function SetupStep({ preAuthToken, name, onDone, onRestart }: Props) {
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState("");
  const [trust, setTrust] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const start = useStartSetup(setSetup, (err) => onRestart(err instanceof ApiError ? err.message : "Не удалось начать настройку"));
  const confirm = useConfirmSetup(
    (res) => (res.status === "OK" ? onDone() : onRestart()),
    (err) =>
      handleSecondStepError(
        err,
        (msg) => {
          setError(msg);
          setCode("");
          requestAnimationFrame(() => inputRef.current?.focus());
        },
        onRestart,
      ),
  );
  const loading = confirm.isPending;

  useEffect(() => {
    // Один раз: каждый вызов делает НОВЫЙ ключ (двойной эффект React в dev показал бы устаревший QR).
    if (started.current) return;
    started.current = true;
    start.mutate(preAuthToken);
  }, [preAuthToken, start]);

  function submit(value: string) {
    if (value.length !== 6 || loading) return;
    setError(null);
    confirm.mutate({ preAuthToken, code: value, trust });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(code);
      }}
    >
      <StepHeader
        icon={<ShieldCheck className="h-4 w-4" />}
        title="Защита входа"
        subtitle={
          <>
            {name ? <>{name}, для</> : "Для"} входа в админку нужен код из приложения-аутентификатора. Настройка — один раз, около минуты.
          </>
        }
      />
      <ol className="flex flex-col gap-5">
        <li>
          <StepLabel n={1}>Установите приложение</StepLabel>
          <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
            Google Authenticator, 1Password, Authy или любое другое с кодами «по времени» (TOTP).
          </p>
        </li>
        <li>
          <StepLabel n={2}>Добавьте аккаунт</StepLabel>
          {setup ? (
            <TwoFactorSecret setup={setup} />
          ) : (
            <div className="grid h-[184px] place-items-center">
              <Spinner />
            </div>
          )}
        </li>
        <li className="flex flex-col gap-4">
          <StepLabel n={3}>Введите код из приложения</StepLabel>
          <CodeInput
            ref={inputRef}
            value={code}
            onChange={(v) => {
              setCode(v);
              if (error) setError(null);
            }}
            onComplete={submit}
            error={!!error}
            disabled={loading || !setup}
            id="totp-setup-code"
          />
          {error && (
            <p role="alert" className="-mt-2 text-[13px] text-[var(--danger-ink)]">
              {error}. Проверьте, что добавили именно этот ключ.
            </p>
          )}
          <TrustToggle checked={trust} onChange={setTrust} />
          <Button type="submit" variant="accent" size="lg" loading={loading} disabled={code.length !== 6 || !setup} icon={<ShieldCheck className="h-4 w-4" />} chamfer className="w-full">
            Включить и войти
          </Button>
          <Button type="button" variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => onRestart()} className="self-center">
            Назад
          </Button>
        </li>
      </ol>
    </form>
  );
}
