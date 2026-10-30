"use client";

import { Button } from "@shop/ui/admin-button";
import { Modal } from "@shop/ui/overlay";
import { toast } from "@shop/ui/toast";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { copyText } from "@/components/orders/CopyButton";
import { Input } from "@/components/ui/Input";
import { formatDateTime } from "@/lib/orders";
import { inviteUrl } from "../model/roles";
import type { LinkToShow } from "../queries";

/** Бот не смог доставить: ссылку нужно передать лично. */
export function LinkModal({ link, onClose }: { link: LinkToShow; onClose: () => void }) {
  const { created, who } = link;
  const url = inviteUrl(created) ?? "";
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (await copyText(url)) {
      setCopied(true);
      toast.success("Ссылка скопирована");
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error("Не удалось скопировать — выделите ссылку вручную");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Бот не смог написать"
      size="sm"
      footer={
        <Button variant="accent" onClick={onClose}>
          Готово
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[14px] leading-relaxed text-[var(--text-muted)]">
          Видимо, «{who}» ещё не нажимал /start в боте магазина. Передайте ссылку сами — она действует до{" "}
          <b className="text-[var(--text)]">{created.expiresAt ? formatDateTime(created.expiresAt) : "—"}</b>.
        </p>
        <div className="flex items-stretch gap-2">
          <div className="min-w-0 flex-1">
            <Input
              readOnly
              value={url}
              aria-label="Ссылка-приглашение"
              data-testid="invite-link"
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-[12px]"
            />
          </div>
          <Button variant="surface" icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} onClick={() => void copy()}>
            Копировать
          </Button>
        </div>
        <div className="flex gap-2.5 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] px-3 py-2.5 text-[13px] leading-snug text-[var(--text)]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warn)]" />
          <span>
            Передавайте только лично этому человеку (в личном чате). Кто откроет ссылку первым, тот и задаст пароль. Ссылку не
            видно второй раз — если потеряли, «Отправить заново».
          </span>
        </div>
      </div>
    </Modal>
  );
}
