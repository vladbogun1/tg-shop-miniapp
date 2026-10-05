"use client";

/**
 * Admin sign-in, in steps (ChiSetup v3: logo in a HUD-framed card, chamfered main action):
 *   1. «Логин / пароль» (POST /api/auth/admin/login) — or Telegram, done by AuthGate inside Telegram;
 *   2. «Код из приложения» (6 digits, submits itself on the 6th) + «Доверять этому устройству»;
 *   2'. first sign-in without 2FA: QR + key + the first code (2FA is mandatory).
 * The pre-auth token between the steps lives only in this component's state.
 */
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, KeyRound, Lock, LogIn, ShieldCheck, Smartphone, User } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { LogoFull, LogoMark } from "@/components/brand/Logo";
import { CodeInput } from "@/components/auth/CodeInput";
import { TwoFactorSecret } from "@/components/auth/TwoFactorSecret";
import {
  ApiError,
  authAdminLogin,
  confirmTwoFactorSetup,
  startTwoFactorSetup,
  verifyTwoFactor,
  type AdminLoginResult,
  type TwoFactorSetup,
} from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/lib/toast";

type Step =
  | { kind: "credentials" }
  | { kind: "code"; preAuthToken: string; name?: string }
  | { kind: "setup"; preAuthToken: string; name?: string };

/** First-factor answer → the next step (or null when signed in). */
export function stepAfter(res: AdminLoginResult): Step | null {
  if (res.status === "OK") return null;
  if (!res.preAuthToken) return { kind: "credentials" };
  return res.status === "SETUP_REQUIRED"
    ? { kind: "setup", preAuthToken: res.preAuthToken, name: res.name }
    : { kind: "code", preAuthToken: res.preAuthToken, name: res.name };
}

const TRUST_LABEL = "Доверять этому устройству 30 дней";

export function Login({ onSuccess, initial }: { onSuccess: () => void; initial?: AdminLoginResult | null }) {
  const { push } = useToast();
  const [step, setStep] = useState<Step>(() => (initial ? stepAfter(initial) ?? { kind: "credentials" } : { kind: "credentials" }));

  const restart = useCallback(
    (message?: string) => {
      if (message) push(message, "error");
      setStep({ kind: "credentials" });
    },
    [push]
  );

  const done = useCallback(() => {
    push("Вход выполнен", "ok");
    onSuccess();
  }, [onSuccess, push]);

  return (
    <div className="relative grid min-h-dvh place-items-center px-4 py-8 sm:py-10">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 26 }}
        className="hud-frame w-full max-w-[440px] rounded-[var(--r-lg)] border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-5 py-7 backdrop-blur-sm sm:px-9 sm:py-9"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step.kind}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.18 }}
          >
            {step.kind === "credentials" && (
              <CredentialsStep
                onResult={(res) => {
                  const next = stepAfter(res);
                  if (next) setStep(next);
                  else done();
                }}
              />
            )}
            {step.kind === "code" && (
              <CodeStep preAuthToken={step.preAuthToken} name={step.name} onDone={done} onRestart={restart} />
            )}
            {step.kind === "setup" && (
              <SetupStep preAuthToken={step.preAuthToken} name={step.name} onDone={done} onRestart={restart} />
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function StepHeader({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col items-center text-center">
      <LogoMark size={40} />
      <div className="mt-4 flex items-center gap-2.5">
        <span aria-hidden className="accent-tint grid h-8 w-8 place-items-center rounded-[var(--r-md)]">
          {icon}
        </span>
        <h1 className="font-display text-[15px] font-bold uppercase tracking-[0.14em] text-[var(--ink)]">{title}</h1>
      </div>
      <p className="mt-2 max-w-[34ch] text-[13.5px] leading-relaxed text-[var(--text-muted)]">{subtitle}</p>
    </div>
  );
}

function CredentialsStep({ onResult }: { onResult: (res: AdminLoginResult) => void }) {
  const { push } = useToast();
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      push("Введите логин и пароль", "error");
      return;
    }
    setLoading(true);
    try {
      onResult(await authAdminLogin(username.trim(), password));
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Не удалось войти", "error");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="mb-8 flex flex-col items-center text-center">
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.1 }}
          className="[filter:drop-shadow(0_0_22px_rgba(255,102,0,.18))]"
        >
          <LogoFull width={264} />
        </motion.div>
        <div className="mt-6 flex items-center gap-2.5">
          <span aria-hidden className="h-[2px] w-6 rounded-full bg-[var(--accent)] shadow-[var(--glow-sm)]" />
          <h1 className="font-display text-[13px] font-semibold uppercase tracking-[0.32em] text-[var(--text)]">Админка</h1>
          <span aria-hidden className="h-[2px] w-6 rounded-full bg-[var(--accent)] shadow-[var(--glow-sm)]" />
        </div>
        <p className="mt-2 text-[14px] text-[var(--text-muted)]">Вход для администратора магазина</p>
      </div>

      <div className="flex flex-col gap-4">
        <Input
          label="Логин"
          value={username}
          autoComplete="username"
          icon={<User className="h-4 w-4" />}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Input
          label="Пароль"
          type="password"
          value={password}
          autoComplete="current-password"
          icon={<Lock className="h-4 w-4" />}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" variant="accent" size="lg" loading={loading} icon={<LogIn className="h-4 w-4" />} chamfer className="mt-2 w-full">
          Войти
        </Button>
        <p className="flex items-center justify-center gap-1.5 text-center text-[12px] text-[var(--text-faint)]">
          <ShieldCheck className="h-3.5 w-3.5" /> Дальше понадобится код из приложения-аутентификатора
        </p>
      </div>
    </form>
  );
}

/** A refused code keeps the step; an expired sign-in / lock sends back to the password. */
function handleSecondStepError(
  err: unknown,
  onWrongCode: (message: string) => void,
  onRestart: (message?: string) => void
) {
  if (err instanceof ApiError && err.status === 401 && /неверный код/i.test(err.message)) {
    onWrongCode(err.message);
    return;
  }
  onRestart(err instanceof ApiError ? err.message : "Не удалось войти — попробуйте ещё раз");
}

function TrustToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5">
      <Toggle checked={checked} onChange={onChange} label={TRUST_LABEL} />
      <p className="mt-1.5 pl-14 text-[12px] leading-snug text-[var(--text-faint)]">
        Только на своём телефоне или компьютере. Код не будет спрашиваться до 30 дней; забыть устройство — в «Мой аккаунт».
      </p>
    </div>
  );
}

function CodeStep({
  preAuthToken,
  name,
  onDone,
  onRestart,
}: {
  preAuthToken: string;
  name?: string;
  onDone: () => void;
  onRestart: (message?: string) => void;
}) {
  const [code, setCode] = useState("");
  const [trust, setTrust] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = useCallback(
    async (value: string) => {
      if (value.length !== 6 || loading) return;
      setLoading(true);
      setError(null);
      try {
        const res = await verifyTwoFactor(preAuthToken, value, trust);
        if (res.status === "OK") onDone();
        else onRestart("Не удалось войти — попробуйте ещё раз");
      } catch (err) {
        handleSecondStepError(
          err,
          (msg) => {
            setError(msg);
            setCode("");
            setLoading(false);
            requestAnimationFrame(() => inputRef.current?.focus());
          },
          onRestart
        );
      }
    },
    [loading, onDone, onRestart, preAuthToken, trust]
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit(code);
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
        <CodeInput ref={inputRef} value={code} onChange={(v) => { setCode(v); if (error) setError(null); }} onComplete={submit} autoFocus error={!!error} disabled={loading} />
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

function SetupStep({
  preAuthToken,
  name,
  onDone,
  onRestart,
}: {
  preAuthToken: string;
  name?: string;
  onDone: () => void;
  onRestart: (message?: string) => void;
}) {
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState("");
  const [trust, setTrust] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Once: every call makes a NEW secret (React's dev double-effect would show a stale QR).
    if (started.current) return;
    started.current = true;
    startTwoFactorSetup(preAuthToken)
      .then(setSetup)
      .catch((err) => onRestart(err instanceof ApiError ? err.message : "Не удалось начать настройку"));
  }, [preAuthToken, onRestart]);

  const submit = useCallback(
    async (value: string) => {
      if (value.length !== 6 || loading) return;
      setLoading(true);
      setError(null);
      try {
        const res = await confirmTwoFactorSetup(preAuthToken, value, trust);
        if (res.status === "OK") onDone();
        else onRestart();
      } catch (err) {
        handleSecondStepError(
          err,
          (msg) => {
            setError(msg);
            setCode("");
            setLoading(false);
            requestAnimationFrame(() => inputRef.current?.focus());
          },
          onRestart
        );
      }
    },
    [loading, onDone, onRestart, preAuthToken, trust]
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit(code);
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
          <Button
            type="submit"
            variant="accent"
            size="lg"
            loading={loading}
            disabled={code.length !== 6 || !setup}
            icon={<ShieldCheck className="h-4 w-4" />}
            chamfer
            className="w-full"
          >
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

function StepLabel({ n, children }: { n: number; children: ReactNode }) {
  return (
    <h2 className="mb-2 flex items-center gap-2.5">
      <span className="font-display grid h-6 w-6 place-items-center rounded-full border border-[var(--accent)] text-[12px] font-bold text-[var(--accent-hi)]">
        {n}
      </span>
      <span className="font-display text-[13px] font-bold uppercase tracking-[0.08em] text-[var(--ink)]">{children}</span>
    </h2>
  );
}
