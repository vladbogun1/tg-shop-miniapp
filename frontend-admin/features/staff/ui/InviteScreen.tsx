"use client";

/**
 * /invite/<token> — принятие приглашения в админку БЕЗ входа (AuthGate пропускает этот маршрут голым).
 * Ссылка приходит от бота или лично от главного админа. Шаги:
 *   1. проверка ссылки (неизвестная / использованная / отозванная / просроченная — один экран «ссылка не действует»);
 *   2. логин (3–32: латиница, цифры, . _ -) + пароль (≥ 10, дважды); при сбросе пароля логин зафиксирован;
 *   3. 2FA: новая запись в аутентификаторе или — если 2FA уже есть — текущий код;
 *   4. вошли → панель. Ссылка сгорает только на шаге 3.
 */
import { motion } from "framer-motion";
import { useParams } from "next/navigation";
import { useState } from "react";
import { CenterSpinner } from "@/components/ui/Spinner";
import { ApiError } from "@shop/core/errors";
import type { InviteInfo } from "../api";
import { useInviteInfo } from "../queries";
import { CredentialsForm } from "./invite/CredentialsForm";
import { DeadLink } from "./invite/DeadLink";
import { InviteCodeStep } from "./invite/InviteCodeStep";
import type { InviteFail, InviteStep } from "./invite/steps";

const DEAD = new Set(["INVITE_INVALID", "INVITE_REVOKED"]);

export function InviteScreen() {
  const params = useParams<{ token: string }>();
  const token = decodeURIComponent(params?.token ?? "");
  const check = useInviteInfo(token);
  const [override, setOverride] = useState<InviteStep | null>(null);

  const step: InviteStep | null =
    override ??
    (check.isError
      ? { kind: "dead", message: check.error instanceof ApiError ? check.error.message : "Не удалось проверить ссылку" }
      : check.data
        ? { kind: "form", info: check.data }
        : null);

  const fail: InviteFail = (e: unknown, info: InviteInfo) => {
    if (e instanceof ApiError && e.code && DEAD.has(e.code)) {
      setOverride({ kind: "dead", message: e.message });
      return null;
    }
    if (e instanceof ApiError && e.code === "INVITE_STEP_EXPIRED") {
      setOverride({ kind: "form", info });
      return e.message;
    }
    return e instanceof ApiError ? e.message : "Что-то пошло не так — попробуйте ещё раз";
  };

  if (!step) return <CenterSpinner label="Проверяем ссылку…" />;

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
          {step.kind === "form" && <CredentialsForm token={token} info={step.info} onNext={setOverride} onFail={fail} />}
          {step.kind === "setup" && <InviteCodeStep token={token} info={step.info} setup={step.setup} onFail={fail} />}
          {step.kind === "verify" && <InviteCodeStep token={token} info={step.info} onFail={fail} />}
        </motion.div>
      </motion.div>
    </div>
  );
}
