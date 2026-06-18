"use client";

/**
 * Admin login — browser username + password (POST /api/auth/admin/login).
 * Credentials are managed server-side (bcrypt) and bootstrapped from
 * ADMIN_LOGIN / ADMIN_PASSWORD env on the backend.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { LogIn, ShieldCheck } from "lucide-react";
import { authAdminLogin, ApiError } from "@/lib/api";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassInput } from "@/components/ui/GlassInput";
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
      const msg = e instanceof ApiError ? e.message : "Не удалось войти";
      push(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="glass glass--floating glass--strong w-full max-w-md rounded-[var(--r-lg)] p-7"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 grid h-14 w-14 place-items-center rounded-[var(--r-lg)] [background:var(--accent)]">
            <ShieldCheck className="h-7 w-7 text-[var(--accent-ink)]" />
          </div>
          <h1 className="text-[22px] font-bold text-[var(--text)]">Админ-панель</h1>
          <p className="mt-1 text-[14px] text-[var(--text-muted)]">tg-shop-v2 — вход для администратора</p>
        </div>

        <div className="flex flex-col gap-3">
          <GlassInput
            label="Логин"
            value={username}
            autoComplete="username"
            onChange={(e) => setUsername(e.target.value)}
          />
          <GlassInput
            label="Пароль"
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
          />
          <GlassButton
            type="submit"
            variant="accent"
            fullWidth
            loading={loading}
            icon={<LogIn className="h-4 w-4" />}
          >
            Войти
          </GlassButton>
        </div>
      </motion.form>
    </div>
  );
}
