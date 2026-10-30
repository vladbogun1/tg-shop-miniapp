"use client";

import { Button } from "@shop/ui/admin-button";
import { KeyRound, ShieldCheck, Smartphone } from "lucide-react";
import { useRef, useState } from "react";
import type { InviteInfo, TwoFactorSetup } from "../../api";
import { useCompleteInvite } from "../../queries";
import { CodeInput } from "../auth/CodeInput";
import { StepHeader, StepLabel, TrustToggle } from "../auth/parts";
import { TwoFactorSecret } from "../auth/TwoFactorSecret";
import type { InviteFail } from "./steps";

interface Props {
  token: string;
  info: InviteInfo;
  setup?: TwoFactorSetup;
  onFail: InviteFail;
}

export function InviteCodeStep({ token, info, setup, onFail }: Props) {
  const [code, setCode] = useState("");
  const [trust, setTrust] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const complete = useCompleteInvite();
  const busy = complete.isPending;

  function submit(value: string) {
    if (value.length !== 6 || busy) return;
    setError(null);
    complete.mutate(
      { token, code: value, trust },
      {
        onSuccess: (res) => {
          if (res.status === "OK") {
            // Полная перезагрузка: AuthGate стартовал без сессии и должен подхватить новый токен.
            window.location.replace("/");
          } else setError("Не удалось войти — попробуйте ещё раз");
        },
        onError: (err) => {
          const msg = onFail(err, info);
          if (msg) setError(msg);
          setCode("");
          requestAnimationFrame(() => inputRef.current?.focus());
        },
      },
    );
  }

  const codeField = (
    <>
      <CodeInput
        ref={inputRef}
        id="invite-code"
        value={code}
        onChange={(v) => {
          setCode(v);
          if (error) setError(null);
        }}
        onComplete={submit}
        error={!!error}
        disabled={busy}
        autoFocus={!setup}
      />
      {error && (
        <p role="alert" className="-mt-2 text-[13px] text-[var(--danger-ink)]">
          {error}
        </p>
      )}
      <TrustToggle checked={trust} onChange={setTrust} />
    </>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(code);
      }}
    >
      {setup ? (
        <>
          <StepHeader
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Защита входа"
            subtitle="Для входа в админку нужен код из приложения-аутентификатора. Настройка — один раз, около минуты."
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
              <TwoFactorSecret setup={setup} />
            </li>
            <li className="flex flex-col gap-4">
              <StepLabel n={3}>Введите код из приложения</StepLabel>
              {codeField}
              <Button type="submit" variant="accent" size="lg" loading={busy} disabled={code.length !== 6} icon={<ShieldCheck className="h-4 w-4" />} chamfer className="w-full">
                Включить и войти
              </Button>
            </li>
          </ol>
        </>
      ) : (
        <>
          <StepHeader
            icon={<Smartphone className="h-4 w-4" />}
            title="Код из приложения"
            subtitle="У вашей учётки уже включена защита входа. Введите 6 цифр из приложения-аутентификатора для «ChiSetup Admin»."
          />
          <div className="flex flex-col gap-4">
            {codeField}
            <Button type="submit" variant="accent" size="lg" loading={busy} disabled={code.length !== 6} icon={<KeyRound className="h-4 w-4" />} chamfer className="w-full">
              Сохранить пароль и войти
            </Button>
          </div>
        </>
      )}
    </form>
  );
}
