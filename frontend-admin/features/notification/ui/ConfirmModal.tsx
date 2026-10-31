"use client";

import { Button } from "@shop/ui/admin-button";
import { Modal } from "@shop/ui/overlay";
import { Send } from "lucide-react";
import { LANG_LABEL } from "@/lib/shop-lang";
import { AUDIENCE_LABEL } from "../model/compose";
import type { BroadcastAudience, ShopLang } from "../model/types";

interface Props {
  open: boolean;
  audience: BroadcastAudience;
  lang: ShopLang | "";
  count: number;
  versions: ShopLang[];
  starting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function ConfirmModal({ open, audience, lang, count, versions, starting, onClose, onConfirm }: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Подтвердите рассылку"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="accent" loading={starting} onClick={onConfirm} icon={<Send className="h-4 w-4" />}>
            Разослать
          </Button>
        </>
      }
    >
      <p className="text-[14px] leading-relaxed text-[var(--text)]">
        Разослать сообщение аудитории{" "}
        <span className="font-semibold text-[var(--accent-hi)]">«{AUDIENCE_LABEL[audience]}»</span>
        {lang ? (
          <>
            {" "}
            (язык: <span className="font-semibold">{LANG_LABEL[lang]}</span>)
          </>
        ) : null}{" "}
        — <span className="font-semibold">{count}</span> получателей?
      </p>
      <p className="mt-2 text-[13px] text-[var(--text-muted)]">
        {versions.length
          ? `Отдельные версии: ${versions.map((v) => v.toUpperCase()).join(", ")}; остальным — основной текст.`
          : "Все получат основной текст."}
      </p>
      <p className="mt-2 text-[13px] text-[var(--text-muted)]">Действие нельзя отменить после запуска.</p>
    </Modal>
  );
}
