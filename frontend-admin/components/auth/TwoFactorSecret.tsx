"use client";

/**
 * How to add the account to the authenticator app: the QR code, the secret as text (grouped by
 * four, with «Копировать») and an otpauth:// link that opens the app when the panel itself is on
 * the phone. Used by the first-sign-in setup and by «Перенастроить» in «Мой аккаунт».
 */
import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { copyText } from "@/components/orders/CopyButton";
import { QrCode } from "@/components/auth/QrCode";
import type { TwoFactorSetup } from "@/lib/api";
import { useToast } from "@/lib/toast";

export function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

export function TwoFactorSecret({ setup }: { setup: TwoFactorSetup }) {
  const { push } = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (await copyText(setup.secret)) {
      setCopied(true);
      push("Ключ скопирован", "ok");
      setTimeout(() => setCopied(false), 1500);
    } else {
      push("Не удалось скопировать — выделите ключ вручную", "error");
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <div className="shrink-0 rounded-[var(--r-lg)] border border-[var(--line)] bg-white p-2">
        <QrCode value={setup.otpauthUri} size={168} label="QR-код для приложения-аутентификатора" />
      </div>
      <div className="flex w-full min-w-0 flex-col gap-2.5">
        <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
          Отсканируйте QR-код в приложении. Не получается — введите ключ вручную (тип «по времени»).
        </p>
        <div className="flex min-w-0 items-center gap-2 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-2)] py-1.5 pl-3 pr-1.5">
          <code
            aria-label="Секретный ключ"
            data-secret={setup.secret}
            className="min-w-0 flex-1 break-words font-mono text-[13.5px] leading-snug tracking-[0.04em] text-[var(--ink)] select-all"
          >
            {groupSecret(setup.secret)}
          </code>
          <button
            type="button"
            onClick={copy}
            className="nb-press focusable grid h-9 shrink-0 grid-flow-col items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--border-2)] bg-[var(--surface-2)] px-2.5 text-[12px] font-semibold text-[var(--text)] hover:bg-[var(--surface-3)]"
          >
            {copied ? <Check className="h-4 w-4 text-[var(--ok)]" /> : <Copy className="h-4 w-4" />}
            Копировать
          </button>
        </div>
        <p className="text-[12px] text-[var(--text-faint)]">
          Аккаунт: <span className="text-[var(--text-muted)]">{setup.issuer}: {setup.account}</span>
        </p>
        <a
          href={setup.otpauthUri}
          className="inline-flex items-center gap-1.5 self-start text-[13px] font-semibold text-[var(--accent-hi)] underline-offset-4 hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          Открыть в приложении на этом телефоне
        </a>
      </div>
    </div>
  );
}
