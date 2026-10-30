"use client";

/**
 * Вход админа по шагам (ChiSetup v3: логотип в HUD-рамке, главное действие со скосом):
 *   1. «Логин / пароль» — или Telegram, это делает AuthGate внутри Telegram;
 *   2. «Код из приложения» (6 цифр, отправляется сам на шестой) + «Доверять этому устройству»;
 *   2'. первый вход без 2FA: QR + ключ + первый код (2FA обязательна).
 * Токен между шагами живёт только в состоянии этого компонента.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useState } from "react";
import { toast } from "@shop/ui/toast";
import type { AdminLoginResult } from "../../api";
import { CodeStep } from "./CodeStep";
import { CredentialsStep } from "./CredentialsStep";
import { SetupStep } from "./SetupStep";

type Step =
  | { kind: "credentials" }
  | { kind: "code"; preAuthToken: string; name?: string }
  | { kind: "setup"; preAuthToken: string; name?: string };

/** Ответ первого шага → следующий шаг (или null, когда вошли). */
function stepAfter(res: AdminLoginResult): Step | null {
  if (res.status === "OK") return null;
  if (!res.preAuthToken) return { kind: "credentials" };
  return res.status === "SETUP_REQUIRED"
    ? { kind: "setup", preAuthToken: res.preAuthToken, name: res.name }
    : { kind: "code", preAuthToken: res.preAuthToken, name: res.name };
}

export function Login({ onSuccess, initial }: { onSuccess: () => void; initial?: AdminLoginResult | null }) {
  const [step, setStep] = useState<Step>(() => (initial ? (stepAfter(initial) ?? { kind: "credentials" }) : { kind: "credentials" }));

  const restart = useCallback((message?: string) => {
    if (message) toast.error(message);
    setStep({ kind: "credentials" });
  }, []);

  const done = useCallback(() => {
    toast.success("Вход выполнен");
    onSuccess();
  }, [onSuccess]);

  return (
    <div className="relative grid min-h-dvh place-items-center px-4 py-8 sm:py-10">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 26 }}
        className="hud-frame w-full max-w-[440px] rounded-[var(--r-lg)] border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-5 py-7 backdrop-blur-sm sm:px-9 sm:py-9"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step.kind} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>
            {step.kind === "credentials" && (
              <CredentialsStep
                onResult={(res) => {
                  const next = stepAfter(res);
                  if (next) setStep(next);
                  else done();
                }}
              />
            )}
            {step.kind === "code" && <CodeStep preAuthToken={step.preAuthToken} name={step.name} onDone={done} onRestart={restart} />}
            {step.kind === "setup" && <SetupStep preAuthToken={step.preAuthToken} name={step.name} onDone={done} onRestart={restart} />}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
