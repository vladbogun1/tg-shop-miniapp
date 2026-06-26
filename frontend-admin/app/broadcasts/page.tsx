"use client";

/**
 * Рассылки (Neo-brutalism restyle) — compose an HTML-formatted Telegram broadcast,
 * send a test to a specific user (admin autocomplete or manual id), then
 * broadcast to an audience (all / active / inactive / premium) with live
 * progress polling. Functionality & API calls preserved 1:1 with the original;
 * only the visual layer changed.
 */
import { useState, type ReactNode } from "react";
import { useQuery, keepPreviousData, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Bold,
  Italic,
  Code,
  Link2,
  Quote,
  Send,
  FlaskConical,
  MessageSquareText,
  Eye,
  Users,
} from "lucide-react";
import {
  adminApi,
  type BroadcastAudience,
  type UserCardDto,
  ApiError,
} from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Textarea } from "@/components/ui/Textarea";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Toggle } from "@/components/ui/Toggle";
import { Autocomplete } from "@/components/ui/Autocomplete";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { staggerContainer, riseItem, spring } from "@/lib/motion";
import { useToast } from "@/lib/toast";

function userLabel(u: UserCardDto): string {
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return full || (u.username ? "@" + u.username : "#" + u.telegramUserId);
}

const AUDIENCE_LABEL: Record<BroadcastAudience, string> = {
  all: "Все",
  active: "С заказами",
  inactive: "Без заказов",
  premium: "Premium",
};

export default function BroadcastsPage() {
  const { push } = useToast();
  const qc = useQueryClient();

  const [text, setText] = useState("");
  const [audience, setAudience] = useState<BroadcastAudience>("all");
  const [selectedUser, setSelectedUser] = useState<UserCardDto | null>(null);
  const [manualId, setManualId] = useState("");
  const [withButton, setWithButton] = useState(true);
  const [buttonText, setButtonText] = useState("🛍 Открыть магазин");
  const [testing, setTesting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: audiences } = useQuery({
    queryKey: ["broadcast-audiences"],
    queryFn: () => adminApi.broadcastAudiences(),
  });
  const { data: status } = useQuery({
    queryKey: ["broadcast-status"],
    queryFn: () => adminApi.broadcastStatus(),
    refetchInterval: (q) => (q.state.data?.running ? 1000 : false),
    placeholderData: keepPreviousData,
  });

  const running = status?.running ?? false;

  function wrap(open: string, close: string) {
    const ta = document.getElementById("bcast-ta") as HTMLTextAreaElement | null;
    if (!ta) {
      setText((t) => t + open + close);
      return;
    }
    const s = ta.selectionStart ?? text.length;
    const e = ta.selectionEnd ?? text.length;
    const sel = text.slice(s, e);
    const next = text.slice(0, s) + open + sel + close + text.slice(e);
    setText(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = s + open.length + sel.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  const audienceOptions = (Object.keys(AUDIENCE_LABEL) as BroadcastAudience[]).map(
    (a) => ({
      value: a,
      label: `${AUDIENCE_LABEL[a]}${audiences ? ` · ${audiences[a]}` : ""}`,
    })
  );

  const targetId =
    manualId.trim() || (selectedUser ? String(selectedUser.telegramUserId) : "");
  const audienceCount = audiences?.[audience] ?? 0;

  async function sendTest() {
    if (!text.trim()) return push("Введите текст сообщения", "error");
    const id = Number(targetId);
    if (!id || Number.isNaN(id)) return push("Выберите админа или введите ID", "error");
    setTesting(true);
    try {
      const r = await adminApi.broadcastTest({
        text,
        telegramUserId: id,
        withButton,
        buttonText: buttonText.trim() || undefined,
      });
      push(r.detail, r.ok ? "ok" : "error");
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Ошибка отправки", "error");
    } finally {
      setTesting(false);
    }
  }

  function requestBroadcast() {
    if (!text.trim()) return push("Введите текст сообщения", "error");
    setConfirmOpen(true);
  }

  async function startBroadcast() {
    setConfirmOpen(false);
    setStarting(true);
    try {
      await adminApi.broadcast({
        text,
        audience,
        withButton,
        buttonText: buttonText.trim() || undefined,
      });
      push("Рассылка запущена", "ok");
      qc.invalidateQueries({ queryKey: ["broadcast-status"] });
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось запустить", "error");
    } finally {
      setStarting(false);
    }
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="flex flex-col"
    >
      {/* Scoped styling for HTML rendered inside the Telegram preview bubble. */}
      <style>{`
        .tg-preview a { color: #6ab3f3; text-decoration: none; }
        .tg-preview a:hover { text-decoration: underline; }
        .tg-preview code {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          background: rgba(255,255,255,0.08);
          border-radius: 5px;
          padding: 1px 5px;
          font-size: 13px;
        }
        .tg-preview blockquote {
          border-left: 3px solid #6ab3f3;
          margin: 4px 0;
          padding: 2px 0 2px 10px;
          color: rgba(255,255,255,0.85);
        }
        .tg-preview b, .tg-preview strong { font-weight: 700; }
        .tg-preview i, .tg-preview em { font-style: italic; }
      `}</style>

      <PageHeader
        title="Рассылки"
        subtitle="Соберите сообщение, проверьте предпросмотр, отправьте тест и разошлите аудитории."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Compose */}
        <motion.div variants={riseItem} className="card flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2 text-[13px] font-black uppercase tracking-wide text-[var(--text)]">
            <MessageSquareText className="h-4 w-4 text-[var(--accent)]" />
            Сообщение
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <FmtBtn icon={<Bold className="h-4 w-4" />} onClick={() => wrap("<b>", "</b>")} title="Жирный" />
            <FmtBtn icon={<Italic className="h-4 w-4" />} onClick={() => wrap("<i>", "</i>")} title="Курсив" />
            <FmtBtn icon={<Code className="h-4 w-4" />} onClick={() => wrap("<code>", "</code>")} title="Моноширинный" />
            <FmtBtn icon={<Quote className="h-4 w-4" />} onClick={() => wrap("<blockquote>", "</blockquote>")} title="Цитата" />
            <FmtBtn
              icon={<Link2 className="h-4 w-4" />}
              onClick={() => wrap('<a href="https://">', "</a>")}
              title="Ссылка"
            />
          </div>

          <Textarea
            id="bcast-ta"
            label="Текст сообщения (HTML)"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={9}
          />
          <p className="text-[11px] text-[var(--text-faint)]">
            Поддерживается HTML Telegram: &lt;b&gt;, &lt;i&gt;, &lt;u&gt;, &lt;s&gt;, &lt;code&gt;,
            &lt;a href&gt;, &lt;blockquote&gt;. Эмодзи можно вставлять как есть.
          </p>

          {/* Highlighted sub-panel: shop button toggle + editable text */}
          <div className="mt-1 flex flex-col gap-3 rounded-[var(--r-md)] border-[3px] border-[var(--line)] bg-[var(--accent-soft)] p-4">
            <Toggle
              checked={withButton}
              onChange={setWithButton}
              label="Кнопка «Открыть магазин» под сообщением"
            />
            {withButton && (
              <Input
                label="Текст кнопки"
                value={buttonText}
                onChange={(e) => setButtonText(e.target.value)}
              />
            )}
          </div>
        </motion.div>

        {/* Preview */}
        <motion.div variants={riseItem} className="card flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2 text-[13px] font-black uppercase tracking-wide text-[var(--text)]">
            <Eye className="h-4 w-4 text-[var(--accent)]" />
            Предпросмотр
          </div>
          <div className="rounded-[var(--r-md)] border-[3px] border-[var(--line)] bg-[#0e1621] p-4">
            <div className="max-w-[85%] rounded-[14px] rounded-tl-[4px] bg-[#17212b] p-3 shadow-[var(--shadow-2)]">
              {text.trim() ? (
                <div
                  className="tg-preview whitespace-pre-wrap break-words text-[14px] leading-relaxed text-white"
                  dangerouslySetInnerHTML={{ __html: text }}
                />
              ) : (
                <div className="text-[13px] text-white/40">Сообщение появится здесь…</div>
              )}
              {withButton && (
                <div className="mt-2 rounded-[8px] bg-[#2b5278] px-3 py-2 text-center text-[14px] font-medium text-white">
                  {buttonText.trim() || "🛍 Открыть магазин"}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Test send */}
      <motion.div variants={riseItem} className="card mt-4 flex flex-col gap-3 p-5">
        <div className="flex items-center gap-2 text-[14px] font-black uppercase tracking-wide text-[var(--text)]">
          <FlaskConical className="h-4 w-4 text-[var(--accent)]" />
          Тестовая отправка
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Autocomplete<UserCardDto>
              label="Пользователь"
              selectedLabel={selectedUser ? userLabel(selectedUser) : null}
              fetchItems={(q) => adminApi.users({ q, size: 8 })}
              itemLabel={userLabel}
              itemSubLabel={(u) =>
                (u.username ? "@" + u.username + " · " : "") +
                "#" +
                u.telegramUserId +
                (u.ordersCount ? " · " + u.ordersCount + " зак." : "")
              }
              itemKey={(u) => String(u.telegramUserId)}
              onSelect={(u) => {
                setSelectedUser(u);
                setManualId("");
              }}
              onClear={() => setSelectedUser(null)}
            />
          </div>
          <div className="min-w-[150px] flex-1">
            <Input
              label="или ID вручную"
              value={manualId}
              inputMode="numeric"
              onChange={(e) => {
                setManualId(e.target.value);
                if (e.target.value.trim()) setSelectedUser(null);
              }}
            />
          </div>
          <Button
            variant="surface"
            loading={testing}
            onClick={sendTest}
            icon={<Send className="h-4 w-4" />}
          >
            Отправить тест
          </Button>
        </div>
      </motion.div>

      {/* Broadcast */}
      <motion.div variants={riseItem} className="card mt-4 flex flex-col gap-3 p-5">
        <div className="flex items-center gap-2 text-[14px] font-black uppercase tracking-wide text-[var(--text)]">
          <Users className="h-4 w-4 text-[var(--accent)]" />
          Рассылка
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Select
              label="Аудитория"
              value={audience}
              options={audienceOptions}
              onChange={(v) => setAudience(v)}
            />
          </div>
          <Button
            variant="accent"
            loading={starting}
            disabled={running || audienceCount === 0}
            onClick={requestBroadcast}
            icon={<Send className="h-4 w-4" />}
          >
            Разослать ({audienceCount})
          </Button>
        </div>

        {status && (status.running || status.total > 0) && (
          <BroadcastProgress
            running={status.running}
            total={status.total}
            sent={status.sent}
            failed={status.failed}
            blocked={status.blocked}
          />
        )}
      </motion.div>

      {/* Confirm dialog */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Подтвердите рассылку"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Отмена
            </Button>
            <Button
              variant="accent"
              loading={starting}
              onClick={startBroadcast}
              icon={<Send className="h-4 w-4" />}
            >
              Разослать
            </Button>
          </>
        }
      >
        <p className="text-[14px] leading-relaxed text-[var(--text)]">
          Разослать сообщение аудитории{" "}
          <span className="font-semibold text-[var(--accent)]">
            «{AUDIENCE_LABEL[audience]}»
          </span>{" "}
          —{" "}
          <span className="font-semibold">{audienceCount}</span> получателей?
        </p>
        <p className="mt-2 text-[13px] text-[var(--text-muted)]">
          Действие нельзя отменить после запуска.
        </p>
      </Modal>
    </motion.div>
  );
}

function FmtBtn({
  icon,
  onClick,
  title,
}: {
  icon: ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <motion.button
      type="button"
      title={title}
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      transition={spring}
      className="focusable nb-press grid h-9 w-9 place-items-center rounded-[var(--r-md)] border-2 border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)] shadow-[3px_3px_0_var(--shadow)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--accent-ink)]"
    >
      {icon}
    </motion.button>
  );
}

function BroadcastProgress({
  running,
  total,
  sent,
  failed,
  blocked,
}: {
  running: boolean;
  total: number;
  sent: number;
  failed: number;
  blocked: number;
}) {
  const done = sent + failed + blocked;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="card-2 mt-1 flex flex-col gap-2 rounded-[var(--r-md)] p-4"
    >
      <div className="flex items-center justify-between text-[13px]">
        <span className="font-bold uppercase tracking-wide text-[var(--text)]">
          {running ? "Идёт рассылка…" : "Рассылка завершена"}
        </span>
        <span className="font-bold text-[var(--text-muted)]">
          {done} / {total} ({pct}%)
        </span>
      </div>
      <div className="h-3.5 overflow-hidden rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--surface-3)]">
        <motion.div
          className="h-full bg-[var(--accent)]"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 24 }}
        />
      </div>
      <div className="flex flex-wrap gap-4 text-[12px]">
        <span className="text-[var(--ok)]">✓ Доставлено: {sent}</span>
        <span className="text-[var(--danger)]">✕ Ошибок: {failed}</span>
        <span className="text-[var(--warn)]">⊘ Заблокировали: {blocked}</span>
      </div>
    </motion.div>
  );
}
