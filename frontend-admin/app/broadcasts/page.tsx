"use client";

/**
 * Рассылки — compose an HTML-formatted Telegram broadcast, test it, send it to an audience, and see
 * past broadcasts with their results (R9).
 *
 *  - Text: the main version + optional uk / ru / en versions; each customer gets the version of
 *    their language (users.locale → Telegram language → uk), else the main text.
 *  - Audience: all / with orders / without / premium, optionally narrowed to one language.
 *  - Draft (texts, audience, button) survives leaving the page (localStorage).
 *  - Character counter against Telegram's 4096 limit; HTML is validated before anything is sent.
 *  - Test: «себе» (the signed-in admin) or any user picked by name / id.
 *  - History: GET /api/admin/broadcast/history (table `broadcasts`).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  History,
  RotateCcw,
  UserRound,
} from "lucide-react";
import { sanitizeTelegramHtml, validateTelegramHtml } from "@shop/shared";
import { adminApi, type BroadcastAudience, type UserCardDto, ApiError } from "@/lib/api";
import { extApi, LANG_LABEL, type BroadcastHistoryItem, type ShopLang } from "@/lib/api-extra";
import { formatDateTime } from "@/lib/orders";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/layout/PageHeader";
import { Textarea } from "@/components/ui/Textarea";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Toggle } from "@/components/ui/Toggle";
import { Autocomplete } from "@/components/ui/Autocomplete";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { staggerContainer, riseItem, spring } from "@/lib/motion";
import { useToast } from "@/lib/toast";

/** Telegram refuses longer messages (the backend checks the same). */
const MAX_LEN = 4096;
const DRAFT_KEY = "admin.broadcast.draft.v1";

type TextKey = "main" | ShopLang;
type Texts = Record<TextKey, string>;
const EMPTY_TEXTS: Texts = { main: "", uk: "", ru: "", en: "" };

const TEXT_TABS: { value: TextKey; label: string }[] = [
  { value: "main", label: "Основной" },
  { value: "uk", label: "UA" },
  { value: "ru", label: "RU" },
  { value: "en", label: "EN" },
];

const AUDIENCE_LABEL: Record<BroadcastAudience, string> = {
  all: "Все",
  active: "С заказами",
  inactive: "Без заказов",
  premium: "Premium",
};

const DEFAULT_BUTTON = "🛍 Открыть магазин";

interface Draft {
  texts: Texts;
  audience: BroadcastAudience;
  lang: ShopLang | "";
  withButton: boolean;
  buttonText: string;
}

function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<Draft>;
    return {
      texts: { ...EMPTY_TEXTS, ...(d.texts ?? {}) },
      audience: d.audience ?? "all",
      lang: d.lang ?? "",
      withButton: d.withButton ?? true,
      buttonText: d.buttonText ?? "",
    };
  } catch {
    return null;
  }
}

function saveDraft(d: Draft | null) {
  try {
    if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // private mode / blocked storage — the draft simply does not persist
  }
}

function userLabel(u: UserCardDto): string {
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return full || (u.username ? "@" + u.username : "#" + u.telegramUserId);
}

export default function BroadcastsPage() {
  const { push } = useToast();
  const qc = useQueryClient();

  const [texts, setTexts] = useState<Texts>(EMPTY_TEXTS);
  const [editing, setEditing] = useState<TextKey>("main");
  const [audience, setAudience] = useState<BroadcastAudience>("all");
  const [lang, setLang] = useState<ShopLang | "">("");
  const [withButton, setWithButton] = useState(true);
  const [buttonText, setButtonText] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserCardDto | null>(null);
  const [manualId, setManualId] = useState("");
  const [testing, setTesting] = useState<"me" | "user" | null>(null);
  const [starting, setStarting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restored, setRestored] = useState(false);

  // Restore the draft once, then mirror every change into it.
  useEffect(() => {
    const d = loadDraft();
    if (d) {
      setTexts(d.texts);
      setAudience(d.audience);
      setLang(d.lang);
      setWithButton(d.withButton);
      setButtonText(d.buttonText);
    }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    const empty = !Object.values(texts).some((t) => t.trim());
    saveDraft(empty && !buttonText ? null : { texts, audience, lang, withButton, buttonText });
  }, [restored, texts, audience, lang, withButton, buttonText]);

  const { data: audiences } = useQuery({
    queryKey: ["broadcast-audiences", lang],
    queryFn: () => extApi.broadcastAudiences(lang),
    placeholderData: keepPreviousData,
  });
  const { data: status } = useQuery({
    queryKey: ["broadcast-status"],
    queryFn: () => adminApi.broadcastStatus(),
    refetchInterval: (q) => (q.state.data?.running ? 1000 : false),
    placeholderData: keepPreviousData,
  });
  const running = status?.running ?? false;
  const historyQ = useQuery({
    queryKey: ["broadcast-history"],
    queryFn: () => extApi.broadcastHistory(20),
    refetchInterval: running ? 3000 : false,
  });
  // The last progress tick of a finished broadcast also refreshes the history row.
  useEffect(() => {
    if (status && !status.running) qc.invalidateQueries({ queryKey: ["broadcast-history"] });
  }, [status, qc]);

  const text = texts[editing];
  function setText(v: string | ((t: string) => string)) {
    setTexts((prev) => ({ ...prev, [editing]: typeof v === "function" ? v(prev[editing]) : v }));
  }

  function wrap(open: string, close: string) {
    const ta = document.getElementById("bcast-ta") as HTMLTextAreaElement | null;
    if (!ta) {
      setText((t) => t + open + close);
      return;
    }
    const s = ta.selectionStart ?? text.length;
    const e = ta.selectionEnd ?? text.length;
    const sel = text.slice(s, e);
    setText(text.slice(0, s) + open + sel + close + text.slice(e));
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
  const audienceCount = audiences?.[audience] ?? 0;

  // Every filled version must be valid HTML and fit the limit — Telegram rejects the whole
  // message on one bad tag, and a broadcast would only report it as N failed sends.
  const problems = useMemo(() => {
    const out: string[] = [];
    for (const t of TEXT_TABS) {
      const v = texts[t.value];
      if (!v.trim()) continue;
      const tag = t.value === "main" ? "" : `${t.label}: `;
      if (v.length > MAX_LEN) out.push(`${tag}длиннее ${MAX_LEN} символов (${v.length})`);
      const html = validateTelegramHtml(v);
      if (html.length) out.push(tag + html[0].message);
    }
    return out;
  }, [texts]);
  const ok = problems.length === 0 && texts.main.trim().length > 0;
  const currentProblems = useMemo(() => validateTelegramHtml(text), [text]);

  /** What the preview shows: the edited version, or the main text it falls back to. */
  const previewSource = text.trim() ? text : texts.main;
  const previewHtml = useMemo(() => sanitizeTelegramHtml(previewSource), [previewSource]);
  const versions = (["uk", "ru", "en"] as ShopLang[]).filter((l) => texts[l].trim());

  async function sendTest(toMe: boolean) {
    if (!text.trim()) return push("Сначала напишите текст", "error");
    if (currentProblems.length) return push(currentProblems[0].message, "error");
    let id: number | undefined;
    if (!toMe) {
      const raw = manualId.trim() || (selectedUser ? String(selectedUser.telegramUserId) : "");
      id = Number(raw);
      if (!raw || !id || Number.isNaN(id)) {
        return push("Выберите получателя в списке или введите его Telegram ID", "error");
      }
    }
    setTesting(toMe ? "me" : "user");
    try {
      const r = await extApi.broadcastTest({
        text,
        telegramUserId: id,
        withButton,
        buttonText: buttonText.trim() || undefined,
      });
      push(r.detail, r.ok ? "ok" : "error");
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Ошибка отправки", "error");
    } finally {
      setTesting(null);
    }
  }

  function requestBroadcast() {
    if (!texts.main.trim()) return push("Основной текст обязателен — он уходит тем, для кого нет версии", "error");
    if (problems.length) return push(problems[0], "error");
    setConfirmOpen(true);
  }

  async function startBroadcast() {
    setConfirmOpen(false);
    setStarting(true);
    try {
      await extApi.broadcast({
        text: texts.main,
        textUk: texts.uk.trim() || undefined,
        textRu: texts.ru.trim() || undefined,
        textEn: texts.en.trim() || undefined,
        audience,
        lang,
        withButton,
        buttonText: buttonText.trim() || undefined,
      });
      push("Рассылка запущена", "ok");
      setTexts(EMPTY_TEXTS);
      setEditing("main");
      qc.invalidateQueries({ queryKey: ["broadcast-status"] });
      qc.invalidateQueries({ queryKey: ["broadcast-history"] });
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось запустить", "error");
    } finally {
      setStarting(false);
    }
  }

  function reuse(h: BroadcastHistoryItem) {
    setTexts({ main: h.text, uk: h.textUk ?? "", ru: h.textRu ?? "", en: h.textEn ?? "" });
    setAudience(h.audience);
    setLang(h.lang ?? "");
    setWithButton(h.withButton);
    setEditing("main");
    window.scrollTo({ top: 0, behavior: "smooth" });
    push("Текст рассылки загружен в черновик", "info");
  }

  function clearDraft() {
    setTexts(EMPTY_TEXTS);
    setButtonText("");
    setEditing("main");
  }

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="flex min-w-0 flex-col">
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

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        {/* Compose */}
        <motion.div variants={riseItem} className="card flex min-w-0 flex-col gap-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[13px] font-black uppercase tracking-wide text-[var(--text)]">
              <MessageSquareText className="h-4 w-4 text-[var(--accent)]" />
              Сообщение
            </div>
            {Object.values(texts).some((t) => t.trim()) && (
              <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={clearDraft}>
                Очистить черновик
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <SegmentedControl<TextKey>
              size="sm"
              value={editing}
              onChange={setEditing}
              options={TEXT_TABS.map((t) => ({
                value: t.value,
                label: t.label + (t.value !== "main" && texts[t.value].trim() ? " ✓" : ""),
              }))}
            />
            <p className="text-[11px] text-[var(--text-faint)]">
              {editing === "main"
                ? "Основной текст получают все, для чьего языка нет отдельной версии."
                : `Версия для тех, кто читает магазин на языке «${LANG_LABEL[editing]}». Пусто — получат основной текст.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <FmtBtn icon={<Bold className="h-4 w-4" />} onClick={() => wrap("<b>", "</b>")} title="Жирный" />
            <FmtBtn icon={<Italic className="h-4 w-4" />} onClick={() => wrap("<i>", "</i>")} title="Курсив" />
            <FmtBtn icon={<Code className="h-4 w-4" />} onClick={() => wrap("<code>", "</code>")} title="Моноширинный" />
            <FmtBtn icon={<Quote className="h-4 w-4" />} onClick={() => wrap("<blockquote>", "</blockquote>")} title="Цитата" />
            <FmtBtn icon={<Link2 className="h-4 w-4" />} onClick={() => wrap('<a href="https://">', "</a>")} title="Ссылка" />
          </div>

          <Textarea
            id="bcast-ta"
            label={editing === "main" ? "Текст сообщения (HTML)" : `Текст: ${LANG_LABEL[editing]} (HTML)`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={9}
          />
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-[11px] text-[var(--text-faint)]">
              HTML Telegram: &lt;b&gt;, &lt;i&gt;, &lt;u&gt;, &lt;s&gt;, &lt;code&gt;, &lt;a href&gt;, &lt;blockquote&gt;.
              Эмодзи — как есть. Черновик сохраняется автоматически.
            </p>
            <span
              className={cn(
                "shrink-0 text-[12px] font-bold tabular-nums",
                text.length > MAX_LEN ? "text-[var(--danger)]" : "text-[var(--text-muted)]"
              )}
            >
              {text.length} / {MAX_LEN}
            </span>
          </div>

          {problems.length > 0 && Object.values(texts).some((t) => t.trim()) && (
            <ul className="flex flex-col gap-1 rounded-[var(--r-sm)] border-2 border-[var(--danger)] bg-[var(--surface-2)] px-3 py-2">
              {problems.map((p) => (
                <li key={p} className="text-[12px] font-bold text-[var(--danger)]">
                  {p}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-1 flex flex-col gap-3 rounded-[var(--r-md)] border-[3px] border-[var(--line)] bg-[var(--accent-soft)] p-4">
            <Toggle checked={withButton} onChange={setWithButton} label="Кнопка «Открыть магазин» под сообщением" />
            {withButton && (
              <Input
                label="Текст кнопки"
                value={buttonText}
                placeholder={`${DEFAULT_BUTTON} (на языке получателя)`}
                hint="Пусто — стандартная подпись на языке получателя."
                onChange={(e) => setButtonText(e.target.value)}
              />
            )}
          </div>
        </motion.div>

        {/* Preview */}
        <motion.div variants={riseItem} className="card flex min-w-0 flex-col gap-3 p-5">
          <div className="flex items-center gap-2 text-[13px] font-black uppercase tracking-wide text-[var(--text)]">
            <Eye className="h-4 w-4 text-[var(--accent)]" />
            Предпросмотр
            {editing !== "main" && (
              <span className="text-[11px] font-bold normal-case text-[var(--text-faint)]">
                — {LANG_LABEL[editing]}
                {!text.trim() && texts.main.trim() ? " (будет основной текст)" : ""}
              </span>
            )}
          </div>
          <div className="rounded-[var(--r-md)] border-[3px] border-[var(--line)] bg-[#0e1621] p-4">
            <div className="max-w-[85%] rounded-[14px] rounded-tl-[4px] bg-[#17212b] p-3 shadow-[var(--shadow-2)]">
              {previewSource.trim() ? (
                <div
                  className="tg-preview whitespace-pre-wrap break-words text-[14px] leading-relaxed text-white"
                  // Sanitised to Telegram's tag subset (see @shop/shared): attributes are dropped
                  // except safe hrefs, so the preview cannot execute what was pasted into it.
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              ) : (
                <div className="text-[13px] text-white/40">Сообщение появится здесь…</div>
              )}
              {withButton && (
                <div className="mt-2 rounded-[8px] bg-[#2b5278] px-3 py-2 text-center text-[14px] font-medium text-white">
                  {buttonText.trim() || DEFAULT_BUTTON}
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
          <span className="text-[11px] font-bold normal-case text-[var(--text-faint)]">
            — уходит текст открытой вкладки ({TEXT_TABS.find((t) => t.value === editing)?.label})
          </span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Button
            variant="accent"
            loading={testing === "me"}
            onClick={() => sendTest(true)}
            icon={<UserRound className="h-4 w-4" />}
          >
            Тест себе
          </Button>
          <div className="min-w-[200px] flex-1">
            <Autocomplete<UserCardDto>
              label="или пользователю"
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
          <div className="min-w-[140px] flex-1">
            <Input
              label="или Telegram ID"
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
            loading={testing === "user"}
            onClick={() => sendTest(false)}
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
          <div className="min-w-[200px] flex-1">
            <Select label="Аудитория" value={audience} options={audienceOptions} onChange={(v) => setAudience(v)} />
          </div>
          <div className="min-w-[180px] flex-1">
            <Select<string>
              label="Язык покупателя"
              value={lang}
              onChange={(v) => setLang(v as ShopLang | "")}
              options={[
                { value: "", label: "Все языки" },
                { value: "uk", label: LANG_LABEL.uk },
                { value: "ru", label: LANG_LABEL.ru },
                { value: "en", label: LANG_LABEL.en },
              ]}
            />
          </div>
          <Button
            variant="accent"
            loading={starting}
            disabled={running || audienceCount === 0 || !ok}
            onClick={requestBroadcast}
            icon={<Send className="h-4 w-4" />}
          >
            Разослать ({audienceCount})
          </Button>
        </div>
        <p className="text-[11px] text-[var(--text-faint)]">
          Язык — выбранный покупателем в магазине; если не выбирал — язык Telegram, иначе украинский.
        </p>

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

      {/* History */}
      <motion.div variants={riseItem} className="card mt-4 flex min-w-0 flex-col gap-3 p-5">
        <div className="flex items-center gap-2 text-[14px] font-black uppercase tracking-wide text-[var(--text)]">
          <History className="h-4 w-4 text-[var(--accent)]" />
          Прошлые рассылки
        </div>
        {historyQ.isError ? (
          <p className="text-[13px] text-[var(--danger)]">
            Не удалось загрузить историю.{" "}
            <button type="button" className="font-bold underline" onClick={() => historyQ.refetch()}>
              Повторить
            </button>
          </p>
        ) : (historyQ.data ?? []).length === 0 ? (
          <p className="text-[13px] text-[var(--text-faint)]">
            {historyQ.isLoading ? "Загружаем…" : "Пока ни одной рассылки (история ведётся с этой версии)."}
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {(historyQ.data ?? []).map((h) => (
              <HistoryRow key={h.id} h={h} onReuse={() => reuse(h)} />
            ))}
          </div>
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
            <Button variant="accent" loading={starting} onClick={startBroadcast} icon={<Send className="h-4 w-4" />}>
              Разослать
            </Button>
          </>
        }
      >
        <p className="text-[14px] leading-relaxed text-[var(--text)]">
          Разослать сообщение аудитории{" "}
          <span className="font-semibold text-[var(--accent)]">«{AUDIENCE_LABEL[audience]}»</span>
          {lang ? (
            <>
              {" "}
              (язык: <span className="font-semibold">{LANG_LABEL[lang]}</span>)
            </>
          ) : null}{" "}
          — <span className="font-semibold">{audienceCount}</span> получателей?
        </p>
        <p className="mt-2 text-[13px] text-[var(--text-muted)]">
          {versions.length
            ? `Отдельные версии: ${versions.map((v) => v.toUpperCase()).join(", ")}; остальным — основной текст.`
            : "Все получат основной текст."}
        </p>
        <p className="mt-2 text-[13px] text-[var(--text-muted)]">Действие нельзя отменить после запуска.</p>
      </Modal>
    </motion.div>
  );
}

function HistoryRow({ h, onReuse }: { h: BroadcastHistoryItem; onReuse: () => void }) {
  const versions = [h.textUk && "UA", h.textRu && "RU", h.textEn && "EN"].filter(Boolean);
  const plain = h.text.replace(/<[^>]+>/g, "");
  return (
    <div className="card-2 flex min-w-0 flex-col gap-1.5 rounded-[var(--r-md)] p-3">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="font-bold text-[var(--text)]">{formatDateTime(h.startedAt)}</span>
        {h.status === "RUNNING" ? (
          <Badge tone="info">идёт</Badge>
        ) : h.status === "INTERRUPTED" ? (
          <Badge tone="warn">прервана</Badge>
        ) : (
          <Badge tone="ok">готово</Badge>
        )}
        <span className="text-[var(--text-muted)]">
          {AUDIENCE_LABEL[h.audience] ?? h.audience}
          {h.lang ? ` · ${LANG_LABEL[h.lang]}` : ""}
          {versions.length ? ` · версии ${versions.join(", ")}` : ""}
        </span>
        {h.adminName && <span className="text-[var(--text-faint)]">· {h.adminName}</span>}
      </div>
      <p className="line-clamp-2 break-words text-[13px] text-[var(--text)]">{plain}</p>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
        <span className="flex flex-wrap gap-3">
          <span className="text-[var(--ok)]">✓ {h.sent}</span>
          <span className="text-[var(--danger)]">✕ {h.failed}</span>
          <span className="text-[var(--warn)]">⊘ {h.blocked}</span>
          <span className="text-[var(--text-muted)]">из {h.total}</span>
        </span>
        <button
          type="button"
          onClick={onReuse}
          className="text-[12px] font-extrabold uppercase tracking-wide text-[var(--accent)] hover:underline"
        >
          В черновик
        </button>
      </div>
    </div>
  );
}

function FmtBtn({ icon, onClick, title }: { icon: ReactNode; onClick: () => void; title: string }) {
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
