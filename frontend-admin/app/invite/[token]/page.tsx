"use client";

/**
 * /invite/<token> — accepting an invite to the admin panel, WITHOUT signing in (AuthGate lets this
 * route through bare). The link comes from the shop bot or, handed over personally, from the main
 * admin. Steps:
 *   1. the link is checked (unknown / used / revoked / expired — one «link is dead» screen);
 *   2. login (3–32: latin, digits, . _ -) + password (≥ 10, twice). For a password reset the login is
 *      fixed;
 *   3. 2FA: a new authenticator entry (QR, key — the same parts as the first sign-in), or — when the
 *      account already has 2FA (password reset) — the current code;
 *   4. signed in → the panel. The link is burnt only by step 3; before that the account is inactive.
 */
import { motion } from "framer-motion";
import { ArrowRight, KeyRound, Link2Off, Lock, ShieldCheck, Smartphone, User, UserPlus } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CodeInput } from "@/components/auth/CodeInput";
import { StepHeader, StepLabel, TrustToggle } from "@/components/auth/Login";
import { TwoFactorSecret } from "@/components/auth/TwoFactorSecret";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CenterSpinner } from "@/components/ui/Spinner";
import { ApiError, inviteApi, type InviteInfo, type TwoFactorSetup } from "@/lib/api";
import { formatDateTime } from "@/lib/orders";
import { useToast } from "@/lib/toast";

type Step =
  | { kind: "loading" }
  | { kind: "dead"; message: string }
  | { kind: "form"; info: InviteInfo; loginError?: string }
  | { kind: "setup"; info: InviteInfo; setup: TwoFactorSetup }
  | { kind: "verify"; info: InviteInfo };

const DEAD = new Set(["INVITE_INVALID", "INVITE_REVOKED"]);
const LOGIN_RE = /^[A-Za-z0-9._-]{3,32}$/;

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = decodeURIComponent(params?.token ?? "");
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    inviteApi
      .check(token)
      .then((info) => setStep({ kind: "form", info }))
      .catch((e) => setStep({ kind: "dead", message: e instanceof ApiError ? e.message : "Не удалось проверить ссылку" }));
  }, [token]);

  /** Any error: a dead link ends the flow, an expired first step goes back to the form. */
  const fail = useCallback(
    (e: unknown, info: InviteInfo): string | null => {
      if (e instanceof ApiError && e.code && DEAD.has(e.code)) {
        setStep({ kind: "dead", message: e.message });
        return null;
      }
      if (e instanceof ApiError && e.code === "INVITE_STEP_EXPIRED") {
        setStep({ kind: "form", info });
        return e.message;
      }
      return e instanceof ApiError ? e.message : "Что-то пошло не так — попробуйте ещё раз";
    },
    []
  );

  if (step.kind === "loading") return <CenterSpinner label="Проверяем ссылку…" />;

  return (
    <div className="relative grid min-h-dvh place-items-center px-4 py-8 sm:py-10">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 26 }}
        className="hud-frame w-full max-w-[440px] rounded-[var(--r-lg)] border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-5 py-7 backdrop-blur-sm sm:px-9 sm:py-9"
      >
        <motion.div key={step.kind} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18 }}>
          {step.kind === "dead" && <DeadLink message={step.message} />}
          {step.kind === "form" && (
            <CredentialsForm
              token={token}
              info={step.info}
              loginError={step.loginError}
              onNext={(next) => setStep(next)}
              onFail={fail}
            />
          )}
          {step.kind === "setup" && (
            <CodeStep token={token} info={step.info} setup={step.setup} onFail={fail} />
          )}
          {step.kind === "verify" && <CodeStep token={token} info={step.info} onFail={fail} />}
        </motion.div>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function DeadLink({ message }: { message: string }) {
  return (
    <div>
      <StepHeader icon={<Link2Off className="h-4 w-4" />} title="Ссылка не действует" subtitle={message} />
      <p className="text-center text-[13px] leading-relaxed text-[var(--text-muted)]">
        Ссылки-приглашения одноразовые и действуют 48 часов. Попросите главного админа нажать «Отправить заново».
      </p>
      <Button variant="ghost" className="mx-auto mt-5 flex" onClick={() => window.location.replace("/")}>
        На страницу входа
      </Button>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] py-1.5 text-[13px] last:border-b-0">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 truncate font-semibold text-[var(--text)]">{children}</span>
    </div>
  );
}

function CredentialsForm({
  token,
  info,
  loginError,
  onNext,
  onFail,
}: {
  token: string;
  info: InviteInfo;
  loginError?: string;
  onNext: (s: Step) => void;
  onFail: (e: unknown, info: InviteInfo) => string | null;
}) {
  const { push } = useToast();
  const reset = info.kind === "PASSWORD_RESET" && !info.loginEditable;
  const [username, setUsername] = useState(info.username ?? "");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [usernameError, setUsernameError] = useState<string | undefined>(loginError);

  const badLogin = !reset && username.length > 0 && !LOGIN_RE.test(username.trim());
  const shortPassword = password.length > 0 && [...password].length < 10;
  const mismatch = repeat.length > 0 && password !== repeat;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if ((!reset && !LOGIN_RE.test(username.trim())) || [...password].length < 10 || password !== repeat) {
      push("Проверьте поля: логин, пароль от 10 символов и его повтор", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await inviteApi.accept(token, username.trim(), password);
      if (res.next === "SETUP" && res.setup) onNext({ kind: "setup", info, setup: res.setup });
      else onNext({ kind: "verify", info });
    } catch (err) {
      const msg = onFail(err, info);
      if (msg) {
        if (err instanceof ApiError && (err.code === "USERNAME_TAKEN" || err.code === "BAD_USERNAME")) setUsernameError(msg);
        else push(msg, "error");
      }
      setBusy(false);
    }
  }

  const title = reset ? "Новый пароль" : info.kind === "NEW" ? "Приглашение" : "Вход по логину";
  return (
    <form onSubmit={submit}>
      <StepHeader
        icon={reset ? <KeyRound className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
        title={title}
        subtitle={
          reset ? (
            <>Главный админ сбросил пароль{info.name ? <> учётки «{info.name}»</> : null}. Задайте новый.</>
          ) : (
            <>
              {info.name ? <>{info.name}, вас</> : "Вас"} пригласили в админку ChiSetup. Придумайте логин и пароль, затем
              подключите приложение-аутентификатор.
            </>
          )
        }
      />
      <div className="mb-5 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1">
        <Fact label="Роль">{info.role}</Fact>
        <Fact label="Ссылка действует до">{formatDateTime(info.expiresAt)}</Fact>
      </div>
      <div className="flex flex-col gap-4">
        {reset ? (
          <Input label="Логин" value={info.username ?? ""} readOnly autoComplete="username" icon={<User className="h-4 w-4" />} />
        ) : (
          <Input
            label="Логин"
            value={username}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            icon={<User className="h-4 w-4" />}
            hint="3–32 символа: латиница, цифры, точка, дефис, подчёркивание"
            error={usernameError ?? (badLogin ? "Только латиница, цифры и . _ - (3–32)" : undefined)}
            onChange={(e) => {
              setUsername(e.target.value);
              setUsernameError(undefined);
            }}
          />
        )}
        <Input
          label="Пароль"
          type="password"
          value={password}
          autoComplete="new-password"
          icon={<Lock className="h-4 w-4" />}
          hint="Минимум 10 символов. Лучше фраза из нескольких слов."
          error={shortPassword ? "Минимум 10 символов" : undefined}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Input
          label="Повторите пароль"
          type="password"
          value={repeat}
          autoComplete="new-password"
          icon={<Lock className="h-4 w-4" />}
          error={mismatch ? "Пароли не совпадают" : undefined}
          onChange={(e) => setRepeat(e.target.value)}
        />
        <Button type="submit" variant="accent" size="lg" loading={busy} iconRight={<ArrowRight className="h-4 w-4" />} chamfer className="mt-1 w-full">
          Дальше
        </Button>
        <p className="flex items-center justify-center gap-1.5 text-center text-[12px] text-[var(--text-faint)]">
          <ShieldCheck className="h-3.5 w-3.5" />
          {info.twoFactorSetup ? "Следующий шаг — приложение-аутентификатор" : "Следующий шаг — код из вашего приложения"}
        </p>
      </div>
    </form>
  );
}

function CodeStep({
  token,
  info,
  setup,
  onFail,
}: {
  token: string;
  info: InviteInfo;
  setup?: TwoFactorSetup;
  onFail: (e: unknown, info: InviteInfo) => string | null;
}) {
  const [code, setCode] = useState("");
  const [trust, setTrust] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = useCallback(
    async (value: string) => {
      if (value.length !== 6 || busy) return;
      setBusy(true);
      setError(null);
      try {
        const res = await inviteApi.complete(token, value, trust);
        if (res.status === "OK") {
          // Full reload: AuthGate booted without a session and has to pick the new token up.
          window.location.replace("/");
          return;
        }
        setError("Не удалось войти — попробуйте ещё раз");
      } catch (err) {
        const msg = onFail(err, info);
        if (msg) setError(msg);
        setCode("");
        setBusy(false);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    },
    [busy, info, onFail, token, trust]
  );

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
        void submit(code);
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
