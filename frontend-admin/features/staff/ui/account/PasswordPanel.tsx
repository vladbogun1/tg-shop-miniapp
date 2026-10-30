"use client";

import { Button } from "@shop/ui/admin-button";
import { useForm } from "@shop/ui/form";
import { toast } from "@shop/ui/toast";
import { KeyRound, Lock } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { formatDateTime } from "@/lib/orders";
import type { AdminAccount } from "../../api";
import { useChangePassword } from "../../queries";
import { CodeInput } from "../auth/CodeInput";

interface Values {
  current: string;
  next: string;
  repeat: string;
  code: string;
}

const EMPTY: Values = { current: "", next: "", repeat: "", code: "" };

export function PasswordPanel({ account }: { account: AdminAccount }) {
  const form = useForm<Values>({ defaultValues: EMPTY });
  const { current, next, repeat, code } = form.watch();
  const change = useChangePassword(
    () => form.reset(EMPTY),
    () => form.setValue("code", ""),
  );

  if (!account.passwordSet) {
    return (
      <section className="panel min-w-0 p-5">
        <PanelHeader icon={Lock} title="Пароль" description="У этой учётки нет входа по паролю — только через Telegram + код из приложения." />
      </section>
    );
  }

  const tooShort = next.length > 0 && [...next].length < 10;
  const mismatch = repeat.length > 0 && next !== repeat;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!current || [...next].length < 10 || next !== repeat || code.length !== 6) {
      toast.error("Заполните все поля: новый пароль от 10 символов, повтор и код из приложения");
      return;
    }
    change.mutate({ current, next, code });
  }

  return (
    <section className="panel min-w-0 p-5">
      <PanelHeader
        icon={Lock}
        title="Пароль"
        description={account.passwordChangedAt ? `Последняя смена: ${formatDateTime(account.passwordChangedAt)}` : "Минимум 10 символов."}
      />
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input type="text" autoComplete="username" value={account.username ?? ""} readOnly hidden />
        <Input label="Текущий пароль" type="password" autoComplete="current-password" {...form.register("current")} />
        <Input
          label="Новый пароль"
          type="password"
          autoComplete="new-password"
          hint="Минимум 10 символов. Лучше фраза из нескольких слов."
          error={tooShort ? "Минимум 10 символов" : undefined}
          {...form.register("next")}
        />
        <Input
          label="Повторите новый пароль"
          type="password"
          autoComplete="new-password"
          error={mismatch ? "Пароли не совпадают" : undefined}
          {...form.register("repeat")}
        />
        <CodeInput id="password-code" value={code} onChange={(v) => form.setValue("code", v)} />
        <p className="text-[12px] leading-snug text-[var(--text-faint)]">
          После смены все другие сессии и доверенные устройства будут завершены — на них нужно будет войти заново.
        </p>
        <Button type="submit" variant="accent" loading={change.isPending} icon={<KeyRound className="h-4 w-4" />} className="sm:self-start">
          Сменить пароль
        </Button>
      </form>
    </section>
  );
}
