"use client";

import { Button } from "@shop/ui/admin-button";
import { useForm } from "@shop/ui/form";
import { toast } from "@shop/ui/toast";
import { motion } from "framer-motion";
import { Lock, LogIn, ShieldCheck, User } from "lucide-react";
import { LogoFull } from "@/components/brand/Logo";
import { Input } from "@/components/ui/Input";
import type { AdminLoginResult } from "../../api";
import { useLoginMutation } from "../../queries";

export function CredentialsStep({ onResult }: { onResult: (res: AdminLoginResult) => void }) {
  const form = useForm<{ username: string; password: string }>({ defaultValues: { username: "", password: "" } });
  const login = useLoginMutation(onResult);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const { username, password } = form.getValues();
    if (!username.trim() || !password) {
      toast.error("Введите логин и пароль");
      return;
    }
    login.mutate({ username: username.trim(), password });
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
        <Input label="Логин" autoComplete="username" icon={<User className="h-4 w-4" />} {...form.register("username")} />
        <Input label="Пароль" type="password" autoComplete="current-password" icon={<Lock className="h-4 w-4" />} {...form.register("password")} />
        <Button type="submit" variant="accent" size="lg" loading={login.isPending} icon={<LogIn className="h-4 w-4" />} chamfer className="mt-2 w-full">
          Войти
        </Button>
        <p className="flex items-center justify-center gap-1.5 text-center text-[12px] text-[var(--text-faint)]">
          <ShieldCheck className="h-3.5 w-3.5" /> Дальше понадобится код из приложения-аутентификатора
        </p>
      </div>
    </form>
  );
}
