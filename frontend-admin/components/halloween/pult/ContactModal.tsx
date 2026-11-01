"use client";

/**
 * «Написать победителю»: the filled prize template, editable, goes to the winner as a shop chat
 * message (bot DM with a button into the chat; the answer lands in «Поддержка»). In the rehearsal the
 * message goes to the admin pressing the button, never to the random customer.
 */
import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { hwDraw, type HwContactPreview, type HwPool } from "@/lib/halloween-api";
import { useToast } from "@/lib/toast";
import { Modal, ModalCancel } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Skeleton } from "@/components/ui/Skeleton";

export function ContactModal({ target, test, onClose }: { target: { pool: HwPool; round: number } | null; test: boolean; onClose: () => void }) {
  const { push } = useToast();
  const [pv, setPv] = useState<HwContactPreview | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPv(null);
    if (!target) return;
    hwDraw.contactPreview(target.pool, target.round, test).then(
      (p) => {
        setPv(p);
        setText(p.text);
      },
      (e: unknown) => {
        push(e instanceof Error ? e.message : "Не получилось", "error");
        onClose();
      }
    );
  }, [target, test, push, onClose]);

  async function send() {
    if (!target) return;
    setBusy(true);
    try {
      const r = await hwDraw.contactSend(target.pool, target.round, test, text);
      push(r.to === "you" ? "Тест: сообщение ушло вам в чат магазина" : "Отправлено победителю — ответ придёт в «Поддержку»", "ok");
      onClose();
    } catch (e) {
      push(e instanceof Error ? e.message : "Не получилось", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={Boolean(target)} onClose={onClose} title={`Написать победителю раунда ${target?.round ?? ""}`} size="lg" closeOnBackdrop={false}
      footer={<><ModalCancel /><Button variant="accent" icon={<Send className="h-4 w-4" />} loading={busy} disabled={!pv || !text.trim()} onClick={send}>Отправить</Button></>}>
      {!pv ? <Skeleton className="h-[260px]" /> : (
        <div className="flex flex-col gap-3 text-[13.5px]">
          <p>
            Кому: <b>{pv.to.name || "без имени"}</b>
            {pv.to.username && <> · <a className="text-[var(--accent-hi)] underline" href={`https://t.me/${pv.to.username}`} target="_blank" rel="noopener noreferrer">@{pv.to.username}</a></>}
            {pv.prize ? <> · приз: <b>{pv.prize.name}</b></> : <span className="text-[var(--warn)]"> · приз раунда не выбран</span>}
          </p>
          {pv.test && <p className="text-[var(--warn)]">Тестовый режим: сообщение придёт вам в чат магазина, а не этому человеку.</p>}
          {pv.sent && <p className="text-[var(--warn)]">Уже писали {new Date(pv.sent.sentAt).toLocaleString("ru-RU")}. Ещё одно сообщение откроет новый чат.</p>}
          <Textarea rows={11} value={text} onChange={(e) => setText(e.target.value)} />
          <p className="text-[12px] text-[var(--text-muted)]">Этот текст бот пришлёт отдельным сообщением, как есть, с пустыми строками. Следом придёт короткое сообщение чата поддержки с кнопкой — ответ будет в «Поддержке». Срок берётся из отсчёта «Ждём ответа» этого раунда, если он идёт, иначе 3 минуты. «Перекрутить» сам исправит это сообщение на «время вышло» и напишет об этом в чат.</p>
        </div>
      )}
    </Modal>
  );
}
