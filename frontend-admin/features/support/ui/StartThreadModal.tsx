"use client";

/**
 * «Написать клиенту»: админ открывает вопрос первым (победитель розыгрыша, вопрос по посылке).
 * Покупатель получает обычное сообщение бота с кнопкой в чат; ответ придёт в «Поддержку».
 * POST /api/admin/support/threads — id покупателя = его Telegram id.
 */
import { Send } from "lucide-react";
import { useState } from "react";
import { Button } from "@shop/ui/admin-button";
import { Modal } from "@shop/ui/overlay";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { parseStartThread } from "../model/start-thread";
import type { SupportThread } from "../model/types";
import { useStartSupportThread } from "../queries";

interface Props {
  open: boolean;
  onClose: () => void;
  onStarted: (thread: SupportThread) => void;
}

export function StartThreadModal({ open, onClose, onStarted }: Props) {
  const [userId, setUserId] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const start = useStartSupportThread((t) => {
    setUserId("");
    setSubject("");
    setText("");
    onStarted(t);
  });
  const body = parseStartThread(userId, subject, text);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Написать клиенту"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="accent"
            loading={start.isPending}
            disabled={!body}
            icon={<Send className="h-4 w-4" />}
            onClick={() => body && start.mutate(body)}
          >
            Отправить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          label="Telegram id клиента"
          inputMode="numeric"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          hint="Его можно скопировать в карточке покупателя."
        />
        <Input label="Тема (необязательно)" value={subject} maxLength={255} onChange={(e) => setSubject(e.target.value)} />
        <Textarea label="Сообщение" rows={5} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
    </Modal>
  );
}
