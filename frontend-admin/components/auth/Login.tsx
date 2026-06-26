"use client";

/**
 * Admin login — browser username + password (POST /api/auth/admin/login).
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { LogIn, ShieldCheck, User, Lock } from "lucide-react";
import { authAdminLogin, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/lib/toast";

export function Login({ onSuccess }: { onSuccess: () => void }) {
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
      await authAdminLogin(username.trim(), password);
      push("Вход выполнен", "ok");
      onSuccess();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось войти", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative grid min-h-dvh place-items-center px-4">
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 26 }}
        className="elevated w-full max-w-md p-8"
      >
        <div className="mb-7 flex flex-col items-center text-center">
          <motion.div
            initial={{ scale: 0.6, rotate: -12, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
            className="accent-fill mb-4 grid h-16 w-16 place-items-center rounded-[var(--r-md)]"
          >
            <ShieldCheck className="h-8 w-8" />
          </motion.div>
          <h1 className="text-[26px] font-black uppercase tracking-wide text-[var(--text)]">
            MAXSOLCH <span className="text-[var(--accent)]">админка</span>
          </h1>
          <p className="mt-1.5 text-[14px] font-medium text-[var(--text-muted)]">
            Вход для администратора магазина
          </p>
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
          <Button
            type="submit"
            variant="accent"
            size="lg"
            loading={loading}
            icon={<LogIn className="h-4 w-4" />}
            className="mt-1 w-full"
          >
            Войти
          </Button>
        </div>
      </motion.form>
    </div>
  );
}
