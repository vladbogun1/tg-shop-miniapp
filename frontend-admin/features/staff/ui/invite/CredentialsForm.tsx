"use client";

import { Button } from "@shop/ui/admin-button";
import { useForm } from "@shop/ui/form";
import { toast } from "@shop/ui/toast";
import { ArrowRight, KeyRound, Lock, ShieldCheck, User, UserPlus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Input } from "@/components/ui/Input";
import { ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/orders";
import type { InviteInfo } from "../../api";
import { useAcceptInvite } from "../../queries";
import { StepHeader } from "../auth/parts";
import type { InviteFail, InviteStep } from "./steps";

const LOGIN_RE = /^[A-Za-z0-9._-]{3,32}$/;

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] py-1.5 text-[13px] last:border-b-0">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 truncate font-semibold text-[var(--text)]">{children}</span>
    </div>
  );
}

interface Props {
  token: string;
  info: InviteInfo;
  onNext: (s: InviteStep) => void;
  onFail: InviteFail;
}

interface Values {
  username: string;
  password: string;
  repeat: string;
}

interface Fields {
  reset: boolean;
  username: string;
  password: string;
  repeat: string;
}

function fieldProblems(f: Fields) {
  return {
    badLogin: !f.reset && f.username.length > 0 && !LOGIN_RE.test(f.username.trim()),
    shortPassword: f.password.length > 0 && [...f.password].length < 10,
    mismatch: f.repeat.length > 0 && f.password !== f.repeat,
  };
}

function hasBlockingProblem(f: Fields): boolean {
  const loginBad = !f.reset && !LOGIN_RE.test(f.username.trim());
  return loginBad || [...f.password].length < 10 || f.password !== f.repeat;
}

function isUsernameError(err: unknown): boolean {
  return err instanceof ApiError && (err.code === "USERNAME_TAKEN" || err.code === "BAD_USERNAME");
}

function formTitle(reset: boolean, info: InviteInfo): string {
  if (reset) return "Новый пароль";
  return info.kind === "NEW" ? "Приглашение" : "Вход по логину";
}

export function CredentialsForm({ token, info, onNext, onFail }: Props) {
  const reset = info.kind === "PASSWORD_RESET" && !info.loginEditable;
  const form = useForm<Values>({ defaultValues: { username: info.username ?? "", password: "", repeat: "" } });
  const { username, password, repeat } = form.watch();
  const [usernameError, setUsernameError] = useState<string | undefined>();

  const accept = useAcceptInvite();

  const { badLogin, shortPassword, mismatch } = fieldProblems({ reset, username, password, repeat });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (hasBlockingProblem({ reset, username, password, repeat })) {
      toast.error("Проверьте поля: логин, пароль от 10 символов и его повтор");
      return;
    }
    accept.mutate(
      { token, username: username.trim(), password },
      {
        onSuccess: (res) => {
          if (res.next === "SETUP" && res.setup) onNext({ kind: "setup", info, setup: res.setup });
          else onNext({ kind: "verify", info });
        },
        onError: (err) => {
          const msg = onFail(err, info);
          if (!msg) return;
          if (isUsernameError(err)) setUsernameError(msg);
          else toast.error(msg);
        },
      },
    );
  }

  const title = formTitle(reset, info);
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
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            icon={<User className="h-4 w-4" />}
            hint="3–32 символа: латиница, цифры, точка, дефис, подчёркивание"
            error={usernameError ?? (badLogin ? "Только латиница, цифры и . _ - (3–32)" : undefined)}
            {...form.register("username", { onChange: () => setUsernameError(undefined) })}
          />
        )}
        <Input
          label="Пароль"
          type="password"
          autoComplete="new-password"
          icon={<Lock className="h-4 w-4" />}
          hint="Минимум 10 символов. Лучше фраза из нескольких слов."
          error={shortPassword ? "Минимум 10 символов" : undefined}
          {...form.register("password")}
        />
        <Input
          label="Повторите пароль"
          type="password"
          autoComplete="new-password"
          icon={<Lock className="h-4 w-4" />}
          error={mismatch ? "Пароли не совпадают" : undefined}
          {...form.register("repeat")}
        />
        <Button type="submit" variant="accent" size="lg" loading={accept.isPending} iconRight={<ArrowRight className="h-4 w-4" />} chamfer className="mt-1 w-full">
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
