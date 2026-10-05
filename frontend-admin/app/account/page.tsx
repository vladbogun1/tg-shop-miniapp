"use client";

/**
 * «Мой аккаунт» (route "/account") — the signed-in admin's own account, for every admin:
 * profile, password, two-factor protection (status + «Перенастроить»), trusted devices,
 * the last 20 sign-ins (place by GeoIP, device, method, result, «новое устройство / город») and
 * «Выйти на всех устройствах». Data: /api/admin/account/**.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  History,
  KeyRound,
  Laptop,
  Lock,
  MonitorX,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PanelHeader } from "@/app/settings/PanelHeader";
import { CodeInput } from "@/components/auth/CodeInput";
import { TwoFactorSecret } from "@/components/auth/TwoFactorSecret";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { Input } from "@/components/ui/Input";
import { QueryState } from "@/components/ui/QueryState";
import {
  accountApi,
  ApiError,
  logoutEverywhere,
  type AdminAccount,
  type AdminLoginEntry,
  type TwoFactorSetup,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/orders";
import { useToast } from "@/lib/toast";

const ACCOUNT_KEY = ["admin", "account"] as const;
const LOGINS_KEY = ["admin", "account", "logins"] as const;

export default function AccountPage() {
  const accountQ = useQuery({ queryKey: ACCOUNT_KEY, queryFn: accountApi.get });
  const loginsQ = useQuery({ queryKey: LOGINS_KEY, queryFn: accountApi.logins });
  const account = accountQ.data;

  return (
    <div className="min-w-0">
      <PageHeader title="Мой аккаунт" subtitle="Пароль, двухфакторная защита, устройства и история входов." />
      <QueryState isLoading={accountQ.isLoading} isError={accountQ.isError} error={accountQ.error} refetch={accountQ.refetch}>
        {account && (
          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            <ProfilePanel account={account} />
            <TwoFactorPanel account={account} />
            <PasswordPanel account={account} />
            <DevicesPanel account={account} />
            <section className="panel min-w-0 p-5 xl:col-span-2">
              <PanelHeader icon={History} title="История входов" description="Последние 20 попыток входа в вашу учётку — удачных и нет. Хранится 90 дней." />
              <QueryState isLoading={loginsQ.isLoading} isError={loginsQ.isError} error={loginsQ.error} refetch={loginsQ.refetch}>
                <LoginHistory entries={loginsQ.data ?? []} />
              </QueryState>
            </section>
          </div>
        )}
      </QueryState>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3 border-b border-[var(--line)] py-1.5 last:border-b-0">
      <span className="text-[13px] text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 truncate text-right text-[13px] font-semibold text-[var(--text)]">{children}</span>
    </div>
  );
}

function ProfilePanel({ account }: { account: AdminAccount }) {
  return (
    <section className="panel min-w-0 p-5">
      <PanelHeader icon={UserRound} title="Профиль" description="Кто вы в админке. Имя и роль меняет главный админ." />
      <div className="flex flex-col">
        <Row label="Имя">{account.name || "—"}</Row>
        <Row label="Логин">{account.username || "нет (вход только через Telegram)"}</Row>
        <Row label="Роль">
          <Badge tone={account.superAdmin ? "accent" : "neutral"}>{account.superAdmin ? "Главный админ" : "Админ"}</Badge>
        </Row>
        <Row label="Telegram ID">{account.telegramUserId}</Row>
      </div>
    </section>
  );
}

function PasswordPanel({ account }: { account: AdminAccount }) {
  const { push } = useToast();
  const qc = useQueryClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  if (!account.passwordSet) {
    return (
      <section className="panel min-w-0 p-5">
        <PanelHeader icon={Lock} title="Пароль" description="У этой учётки нет входа по паролю — только через Telegram + код из приложения." />
      </section>
    );
  }

  const tooShort = next.length > 0 && [...next].length < 10;
  const mismatch = repeat.length > 0 && next !== repeat;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!current || [...next].length < 10 || next !== repeat || code.length !== 6) {
      push("Заполните все поля: новый пароль от 10 символов, повтор и код из приложения", "error");
      return;
    }
    setBusy(true);
    try {
      await accountApi.changePassword(current, next, code);
      push("Пароль изменён. Остальные сессии и доверенные устройства завершены", "ok");
      setCurrent("");
      setNext("");
      setRepeat("");
      setCode("");
      void qc.invalidateQueries({ queryKey: ACCOUNT_KEY });
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Не удалось сменить пароль", "error");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel min-w-0 p-5">
      <PanelHeader
        icon={Lock}
        title="Пароль"
        description={
          account.passwordChangedAt ? `Последняя смена: ${formatDateTime(account.passwordChangedAt)}` : "Минимум 10 символов."
        }
      />
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input type="text" autoComplete="username" value={account.username ?? ""} readOnly hidden />
        <Input label="Текущий пароль" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <Input
          label="Новый пароль"
          type="password"
          autoComplete="new-password"
          value={next}
          hint="Минимум 10 символов. Лучше фраза из нескольких слов."
          error={tooShort ? "Минимум 10 символов" : undefined}
          onChange={(e) => setNext(e.target.value)}
        />
        <Input
          label="Повторите новый пароль"
          type="password"
          autoComplete="new-password"
          value={repeat}
          error={mismatch ? "Пароли не совпадают" : undefined}
          onChange={(e) => setRepeat(e.target.value)}
        />
        <CodeInput id="password-code" value={code} onChange={setCode} />
        <p className="text-[12px] leading-snug text-[var(--text-faint)]">
          После смены все другие сессии и доверенные устройства будут завершены — на них нужно будет войти заново.
        </p>
        <Button type="submit" variant="accent" loading={busy} icon={<KeyRound className="h-4 w-4" />} className="sm:self-start">
          Сменить пароль
        </Button>
      </form>
    </section>
  );
}

function TwoFactorPanel({ account }: { account: AdminAccount }) {
  const { push } = useToast();
  const qc = useQueryClient();
  const [stage, setStage] = useState<"idle" | "current" | "new">("idle");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [busy, setBusy] = useState(false);

  function cancel() {
    setStage("idle");
    setCode("");
    setSetup(null);
  }

  async function checkCurrent(value: string) {
    if (value.length !== 6 || busy) return;
    setBusy(true);
    try {
      setSetup(await accountApi.startTotpReset(value));
      setStage("new");
      setCode("");
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Не удалось начать перенастройку", "error");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function confirmNew(value: string) {
    if (value.length !== 6 || busy) return;
    setBusy(true);
    try {
      await accountApi.confirmTotpReset(value);
      push("Двухфакторная защита перенастроена. Старое приложение больше не подходит", "ok");
      cancel();
      void qc.invalidateQueries({ queryKey: ACCOUNT_KEY });
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Не удалось перенастроить", "error");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel min-w-0 p-5">
      <PanelHeader icon={ShieldCheck} title="Двухфакторная защита" description="Код из приложения-аутентификатора при каждом входе (кроме доверенных устройств)." />
      <div
        className={cn(
          "mb-4 flex items-center gap-2.5 rounded-[var(--r-md)] border p-3 text-[13px]",
          account.totpEnabled
            ? "border-[color-mix(in_srgb,var(--ok)_40%,transparent)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)]"
            : "border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
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
          <p className="text-[13px] text-[var(--text-muted)]">Шаг 1 из 2: введите код из <b className="text-[var(--text)]">текущего</b> приложения.</p>
          <CodeInput id="reset-current-code" label="Код из текущего приложения" value={code} onChange={setCode} onComplete={checkCurrent} autoFocus disabled={busy} />
          <div className="flex gap-2">
            <Button variant="accent" loading={busy} disabled={code.length !== 6} onClick={() => void checkCurrent(code)}>
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
            <Button variant="accent" loading={busy} disabled={code.length !== 6} onClick={() => void confirmNew(code)}>
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

function DevicesPanel({ account }: { account: AdminAccount }) {
  const { push } = useToast();
  const qc = useQueryClient();
  const [confirm, confirmUi] = useConfirm();
  const [busy, setBusy] = useState<"forget" | "logout" | null>(null);

  async function forget() {
    const ok = await confirm({
      title: "Забыть все устройства?",
      message: "На всех доверенных устройствах, включая это, при следующем входе снова понадобится код из приложения.",
      confirmLabel: "Забыть все",
      danger: true,
    });
    if (!ok) return;
    setBusy("forget");
    try {
      const r = await accountApi.forgetDevices();
      push(r.forgotten > 0 ? `Забыто устройств: ${r.forgotten}` : "Доверенных устройств не было", "ok");
      void qc.invalidateQueries({ queryKey: ACCOUNT_KEY });
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Не удалось забыть устройства", "error");
    } finally {
      setBusy(null);
    }
  }

  async function logoutAll() {
    const ok = await confirm({
      title: "Выйти на всех устройствах?",
      message: "Все сессии, включая эту, будут завершены, доверенные устройства — забыты. Войти придётся заново везде.",
      confirmLabel: "Выйти везде",
      danger: true,
    });
    if (!ok) return;
    setBusy("logout");
    try {
      await logoutEverywhere();
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Не удалось выйти на всех устройствах", "error");
      setBusy(null);
    }
  }

  return (
    <section className="panel min-w-0 p-5">
      <PanelHeader icon={Laptop} title="Устройства и сессии" description={`Доверенное устройство не спрашивает код ${account.trustedDeviceDays} дней.`} />
      <div className="mb-4 flex flex-col">
        <Row label="Доверенных устройств">{account.trustedDevices}</Row>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button variant="surface" icon={<ShieldAlert className="h-4 w-4" />} loading={busy === "forget"} disabled={account.trustedDevices === 0} onClick={forget}>
          Забыть все устройства
        </Button>
        <Button variant="danger" icon={<MonitorX className="h-4 w-4" />} loading={busy === "logout"} onClick={logoutAll}>
          Выйти на всех устройствах
        </Button>
      </div>
      {confirmUi}
    </section>
  );
}

const RESULT: Record<AdminLoginEntry["result"], { label: string; tone: "ok" | "danger" | "warn" | "neutral" }> = {
  OK: { label: "Вход", tone: "ok" },
  BAD_PASSWORD: { label: "Неверный пароль", tone: "danger" },
  UNKNOWN_LOGIN: { label: "Неизвестный логин", tone: "danger" },
  BAD_CODE: { label: "Неверный код", tone: "danger" },
  LOCKED: { label: "Блокировка", tone: "warn" },
  NOT_ADMIN: { label: "Не админ", tone: "danger" },
  BAD_TELEGRAM: { label: "Ошибка Telegram", tone: "danger" },
};

const SECOND: Record<string, string> = {
  TOTP: "код",
  TRUSTED_DEVICE: "доверенное устройство",
  SETUP: "настройка 2FA",
};

function LoginHistory({ entries }: { entries: AdminLoginEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-[13px] text-[var(--text-muted)]">Пока пусто.</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-[var(--line)]" aria-label="История входов">
      {entries.map((e) => {
        const r = RESULT[e.result] ?? { label: e.result, tone: "neutral" as const };
        const place = [e.city, e.country].filter(Boolean).join(", ") || "место неизвестно";
        const method = e.method === "TELEGRAM" ? "Telegram" : "пароль";
        return (
          <li key={e.id} className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex min-w-0 items-center gap-2 sm:w-[190px] sm:shrink-0">
              <Badge tone={r.tone} dot>
                {r.label}
              </Badge>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-[var(--text)]">
                <span className="font-semibold">{place}</span>
                <span className="text-[var(--text-faint)]">·</span>
                <span>{e.device || "устройство неизвестно"}</span>
                {e.newDevice && <Badge tone="warn">Новое устройство</Badge>}
                {e.newCity && <Badge tone="warn">Новый город</Badge>}
              </div>
              <div className="mt-0.5 text-[12px] text-[var(--text-faint)]">
                {method}
                {e.secondFactor ? ` + ${SECOND[e.secondFactor] ?? e.secondFactor}` : ""}
                {e.ip ? ` · IP ${e.ip}` : ""}
              </div>
            </div>
            <time dateTime={e.at} className="shrink-0 text-[12.5px] tabular-nums text-[var(--text-muted)]">
              {formatDateTime(e.at)}
            </time>
          </li>
        );
      })}
    </ul>
  );
}
