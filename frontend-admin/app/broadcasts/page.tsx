"use client";

/**
 * Рассылки — compose an HTML-formatted Telegram broadcast, send a test to a
 * specific user (admin dropdown or manual id), then broadcast to an audience
 * (all / active / inactive / premium) with live progress.
 */
import { useState } from "react";
import { useQuery, keepPreviousData, useQueryClient } from "@tanstack/react-query";
import { Bold, Italic, Code, Link2, Quote, Send, FlaskConical } from "lucide-react";
import {
  adminApi,
  type BroadcastAudience,
  type UserCardDto,
  ApiError,
} from "@/lib/api";
import { GlassTextarea } from "@/components/ui/GlassTextarea";
import { GlassInput } from "@/components/ui/GlassInput";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { GlassAutocomplete } from "@/components/ui/GlassAutocomplete";
import { GlassButton } from "@/components/ui/GlassButton";
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
  const [testing, setTesting] = useState(false);
  const [starting, setStarting] = useState(false);

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

  const audienceOptions = (Object.keys(AUDIENCE_LABEL) as BroadcastAudience[]).map((a) => ({
    value: a,
    label: `${AUDIENCE_LABEL[a]}${audiences ? ` · ${audiences[a]}` : ""}`,
  }));

  const targetId =
    manualId.trim() || (selectedUser ? String(selectedUser.telegramUserId) : "");
  const audienceCount = audiences?.[audience] ?? 0;

  async function sendTest() {
    if (!text.trim()) return push("Введите текст сообщения", "error");
    const id = Number(targetId);
    if (!id || Number.isNaN(id)) return push("Выберите админа или введите ID", "error");
    setTesting(true);
    try {
      const r = await adminApi.broadcastTest({ text, telegramUserId: id });
      push(r.detail, r.ok ? "ok" : "error");
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Ошибка отправки", "error");
    } finally {
      setTesting(false);
    }
  }

  async function startBroadcast() {
    if (!text.trim()) return push("Введите текст сообщения", "error");
    if (
      !window.confirm(
        `Разослать сообщение аудитории «${AUDIENCE_LABEL[audience]}» (${audienceCount} получателей)?`
      )
    )
      return;
    setStarting(true);
    try {
      await adminApi.broadcast({ text, audience });
      push("Рассылка запущена", "ok");
      qc.invalidateQueries({ queryKey: ["broadcast-status"] });
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось запустить", "error");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[20px] font-bold text-[var(--text)]">Рассылки</h1>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Compose */}
        <div className="glass flex flex-col gap-3 rounded-[var(--r-lg)] p-4">
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

          <GlassTextarea
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
        </div>

        {/* Preview */}
        <div className="glass flex flex-col gap-3 rounded-[var(--r-lg)] p-4">
          <div className="text-[13px] font-semibold text-[var(--text-muted)]">Предпросмотр</div>
          <div className="rounded-[var(--r-md)] bg-[#17212b] p-3">
            {text.trim() ? (
              <div
                className="tg-preview whitespace-pre-wrap break-words text-[14px] leading-relaxed text-white"
                dangerouslySetInnerHTML={{ __html: text }}
              />
            ) : (
              <div className="text-[13px] text-white/40">Сообщение появится здесь…</div>
            )}
          </div>
        </div>
      </div>

      {/* Test send */}
      <div className="glass flex flex-col gap-3 rounded-[var(--r-lg)] p-4">
        <div className="flex items-center gap-2 text-[14px] font-semibold text-[var(--text)]">
          <FlaskConical className="h-4 w-4 text-[var(--accent)]" />
          Тестовая отправка
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <GlassAutocomplete<UserCardDto>
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
            <GlassInput
              label="или ID вручную"
              value={manualId}
              inputMode="numeric"
              onChange={(e) => {
                setManualId(e.target.value);
                if (e.target.value.trim()) setSelectedUser(null);
              }}
            />
          </div>
          <GlassButton
            variant="glass"
            loading={testing}
            onClick={sendTest}
            icon={<Send className="h-4 w-4" />}
          >
            Отправить тест
          </GlassButton>
        </div>
      </div>

      {/* Broadcast */}
      <div className="glass flex flex-col gap-3 rounded-[var(--r-lg)] p-4">
        <div className="text-[14px] font-semibold text-[var(--text)]">Рассылка</div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <GlassSelect
              label="Аудитория"
              value={audience}
              options={audienceOptions}
              onChange={(v) => setAudience(v as BroadcastAudience)}
            />
          </div>
          <GlassButton
            variant="accent"
            loading={starting}
            disabled={running || audienceCount === 0}
            onClick={startBroadcast}
            icon={<Send className="h-4 w-4" />}
          >
            Разослать ({audienceCount})
          </GlassButton>
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
      </div>
    </div>
  );
}

function FmtBtn({
  icon,
  onClick,
  title,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-[var(--r-md)] bg-white/5 text-[var(--text-muted)] transition-colors hover:bg-white/10 hover:text-[var(--text)]"
    >
      {icon}
    </button>
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
    <div className="mt-1 flex flex-col gap-2 rounded-[var(--r-md)] bg-white/5 p-3">
      <div className="flex items-center justify-between text-[13px]">
        <span className="font-medium text-[var(--text)]">
          {running ? "Идёт рассылка…" : "Рассылка завершена"}
        </span>
        <span className="text-[var(--text-muted)]">
          {done} / {total} ({pct}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-4 text-[12px]">
        <span className="text-[#30d158]">✓ Доставлено: {sent}</span>
        <span className="text-[#ff453a]">✕ Ошибок: {failed}</span>
        <span className="text-[#ff9f0a]">⊘ Заблокировали: {blocked}</span>
      </div>
    </div>
  );
}
