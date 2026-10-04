"use client";

/**
 * Admin login — browser username + password (POST /api/auth/admin/login).
 * ChiSetup v3: full logo (HUD brackets + tagline) in a HUD-framed card, chamfered «Войти».
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { LogIn, User, Lock } from "lucide-react";
import { LogoFull } from "@/components/brand/Logo";
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
    <div className="relative grid min-h-dvh place-items-center px-4 py-10">
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 26 }}
        className="hud-frame w-full max-w-[420px] rounded-[var(--r-lg)] border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-6 py-8 backdrop-blur-sm sm:px-9 sm:py-10"
      >
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
          <p className="mt-2 text-[14px] text-[var(--text-muted)]">
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
            chamfer
            className="mt-2 w-full"
          >
            Войти
          </Button>
        </div>
      </motion.form>
    </div>
  );
}
