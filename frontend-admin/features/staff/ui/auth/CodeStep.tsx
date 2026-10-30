"use client";

import { Button } from "@shop/ui/admin-button";
import { ArrowLeft, KeyRound, Smartphone } from "lucide-react";
import { useRef, useState } from "react";
import { useVerifyCode } from "../../queries";
import { CodeInput } from "./CodeInput";
import { handleSecondStepError, StepHeader, TrustToggle } from "./parts";

interface Props {
  preAuthToken: string;
  name?: string;
  onDone: () => void;
  onRestart: (message?: string) => void;
}

export function CodeStep({ preAuthToken, name, onDone, onRestart }: Props) {
  const [code, setCode] = useState("");
  const [trust, setTrust] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const verify = useVerifyCode(
    (res) => (res.status === "OK" ? onDone() : onRestart("Не удалось войти — попробуйте ещё раз")),
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
  const loading = verify.isPending;

  function submit(value: string) {
    if (value.length !== 6 || loading) return;
    setError(null);
    verify.mutate({ preAuthToken, code: value, trust });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(code);
      }}
    >
      <StepHeader
        icon={<Smartphone className="h-4 w-4" />}
        title="Код из приложения"
        subtitle={
          <>
            {name ? <>{name}, откройте</> : "Откройте"} приложение-аутентификатор (Google Authenticator, 1Password, Authy) и
            введите 6 цифр для «ChiSetup Admin».
          </>
        }
      />
      <div className="flex flex-col gap-4">
        <CodeInput
          ref={inputRef}
          value={code}
          onChange={(v) => {
            setCode(v);
            if (error) setError(null);
          }}
          onComplete={submit}
          autoFocus
          error={!!error}
          disabled={loading}
        />
        {error && (
          <p role="alert" className="-mt-2 text-[13px] text-[var(--danger-ink)]">
            {error}. Код обновляется каждые 30 секунд.
          </p>
        )}
        <TrustToggle checked={trust} onChange={setTrust} />
        <Button type="submit" variant="accent" size="lg" loading={loading} disabled={code.length !== 6} icon={<KeyRound className="h-4 w-4" />} chamfer className="w-full">
          Подтвердить
        </Button>
        <Button type="button" variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => onRestart()} className="self-center">
          Другой аккаунт
        </Button>
      </div>
    </form>
  );
}
