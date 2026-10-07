"use client";

/**
 * Chat reply templates (⚡): pick one filled in for this order in the customer's language, or
 * manage the list (create / edit / delete, texts in ru / uk / en).
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Settings2, Trash2, Zap } from "lucide-react";
import { ApiError } from "@/lib/api";
import { ordersApi, type ReplyTemplate, type ReplyTemplateWrite } from "@/lib/orders-api";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/cn";
import { Modal, ModalCancel } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { QueryState } from "@/components/ui/QueryState";
import { useConfirm } from "@/components/ui/ConfirmModal";

const LOCALE_LABEL = { ru: "рус", uk: "укр", en: "eng" } as const;

export const PLACEHOLDERS: { key: string; hint: string }[] = [
  { key: "{name}", hint: "ФИО клиента" },
  { key: "{orderNo}", hint: "номер заказа" },
  { key: "{total}", hint: "сумма заказа" },
  { key: "{cod}", hint: "наложка" },
  { key: "{ttn}", hint: "ТТН" },
  { key: "{warehouse}", hint: "город и отделение" },
];

/** ⚡ — list of templates rendered for this order; choosing one hands its text to the chat input. */
export function TemplatePicker({
  open,
  orderId,
  onClose,
  onPick,
}: {
  open: boolean;
  orderId: string;
  onClose: () => void;
  onPick: (text: string) => void;
}) {
  const [manage, setManage] = useState(false);
  const q = useQuery({
    queryKey: ["reply-templates", "order", orderId],
    queryFn: () => ordersApi.renderedTemplates(orderId),
    enabled: open,
  });

  return (
    <>
      <Modal
        open={open && !manage}
        onClose={onClose}
        title={
          <span className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-[var(--accent-hi)]" /> Шаблоны ответов
          </span>
        }
        footer={
          <Button variant="ghost" icon={<Settings2 className="h-4 w-4" />} onClick={() => setManage(true)}>
            Управлять шаблонами
          </Button>
        }
      >
        <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch}>
          {(q.data ?? []).length === 0 ? (
            <p className="text-[13px] text-[var(--text-muted)]">Шаблонов пока нет — добавьте в «Управлять шаблонами».</p>
          ) : (
            <div className="flex flex-col gap-2">
              {q.data!.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    onPick(t.text);
                    onClose();
                  }}
                  className="card-2 nb-press px-3.5 py-3 text-left transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[13.5px] font-semibold text-[var(--text)]">{t.title}</span>
                    <span className="chip-tint shrink-0 !bg-[var(--surface-3)] !px-2 !text-[10px]">
                      {LOCALE_LABEL[t.locale] ?? t.locale}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[12.5px] text-[var(--text-muted)]">{t.text}</p>
                </button>
              ))}
              <p className="text-[11px] text-[var(--text-faint)]">
                Текст подставится в поле ввода на языке клиента — его можно поправить перед отправкой.
              </p>
            </div>
          )}
        </QueryState>
      </Modal>
      <TemplatesManager open={open && manage} onClose={() => setManage(false)} />
    </>
  );
}

/** CRUD over all templates. */
export function TemplatesManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { push } = useToast();
  const [confirm, confirmUi] = useConfirm();
  const [editing, setEditing] = useState<ReplyTemplate | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const q = useQuery({ queryKey: ["reply-templates"], queryFn: ordersApi.replyTemplates, enabled: open });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["reply-templates"] });
  }

  async function save(body: ReplyTemplateWrite) {
    setSaving(true);
    try {
      if (editing === "new") await ordersApi.createReplyTemplate(body);
      else if (editing) await ordersApi.updateReplyTemplate(editing.id, body);
      push("Шаблон сохранён", "ok");
      setEditing(null);
      invalidate();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось сохранить", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(t: ReplyTemplate) {
    const ok = await confirm({
      title: "Удалить шаблон?",
      message: `«${t.title}» исчезнет из списка ⚡.`,
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
    try {
      await ordersApi.deleteReplyTemplate(t.id);
      push("Шаблон удалён", "ok");
      invalidate();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось удалить", "error");
    }
  }

  return (
    <>
      <Modal
        open={open && editing === null}
        onClose={onClose}
        title="Шаблоны ответов"
        size="lg"
        footer={
          <>
            <ModalCancel>Готово</ModalCancel>
            <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>
              Новый шаблон
            </Button>
          </>
        }
      >
        <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch}>
          <div className="flex flex-col gap-2">
            {(q.data ?? []).map((t) => (
              <div key={t.id} className="card-2 flex items-start gap-2 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold text-[var(--text)]">{t.title}</div>
                  <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-[12px] text-[var(--text-muted)]">{t.bodyRu}</p>
                  <div className="font-display mt-1.5 flex gap-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--text-faint)]">
                    <span>рус ✓</span>
                    <span
                      className={cn(!t.bodyUk && "line-through opacity-60", t.ukStale && "text-[var(--warn,#F59E0B)]")}
                      title={t.ukStale ? "Перевод устарел" : t.bodyUk ? undefined : "Нет перевода"}
                    >
                      укр
                    </span>
                    <span
                      className={cn(!t.bodyEn && "line-through opacity-60", t.enStale && "text-[var(--warn,#F59E0B)]")}
                      title={t.enStale ? "Перевод устарел" : t.bodyEn ? undefined : "Нет перевода"}
                    >
                      eng
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Изменить"
                  onClick={() => setEditing(t)}
                  className="nb-press grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-sm)] border border-[var(--border-2)] bg-[var(--surface-3)] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)]"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Удалить"
                  onClick={() => remove(t)}
                  className="nb-press grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-sm)] border border-[var(--border-2)] bg-[var(--surface-3)] text-[var(--text-muted)] transition-colors hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] hover:text-[var(--danger-ink)]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </QueryState>
      </Modal>
      <TemplateEditor
        open={open && editing !== null}
        template={editing === "new" ? null : editing}
        saving={saving}
        onClose={() => setEditing(null)}
        onSave={save}
      />
      {confirmUi}
    </>
  );
}

function TemplateEditor({
  open,
  template,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  template: ReplyTemplate | null;
  saving: boolean;
  onClose: () => void;
  onSave: (body: ReplyTemplateWrite) => void;
}) {
  const [title, setTitle] = useState("");
  const [ru, setRu] = useState("");
  const [uk, setUk] = useState("");
  const [en, setEn] = useState("");
  // Russian first: the admin writes in Russian, the other languages are optional (typed here or
  // translated later in «Переводы», where an empty one shows up as missing).
  const [lang, setLang] = useState<"uk" | "ru" | "en">("ru");

  const id = template?.id ?? null;
  useEffect(() => {
    if (!open) return;
    setTitle(template?.title ?? "");
    setRu(template?.bodyRu ?? "");
    setUk(template?.bodyUk ?? "");
    setEn(template?.bodyEn ?? "");
    setLang("ru");
    // Reset only when a different template is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id]);

  const dirty =
    title !== (template?.title ?? "") ||
    ru !== (template?.bodyRu ?? "") ||
    uk !== (template?.bodyUk ?? "") ||
    en !== (template?.bodyEn ?? "");
  const value = lang === "ru" ? ru : lang === "uk" ? uk : en;
  // A uk/en text made for an older Russian one is not used in the chat until it is redone.
  const stale = (l: "uk" | "en") =>
    (l === "uk" ? template?.ukStale && uk === (template?.bodyUk ?? "") : template?.enStale && en === (template?.bodyEn ?? "")) &&
    ru === (template?.bodyRu ?? "");
  const setValue = lang === "ru" ? setRu : lang === "uk" ? setUk : setEn;

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      dirty={dirty}
      size="lg"
      title={template ? "Изменить шаблон" : "Новый шаблон"}
      footer={
        <>
          <ModalCancel />
          <Button
            variant="accent"
            loading={saving}
            disabled={!title.trim() || !ru.trim()}
            onClick={() =>
              onSave({ title: title.trim(), bodyRu: ru.trim(), bodyUk: uk.trim(), bodyEn: en.trim(), sort: template?.sort })
            }
          >
            Сохранить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input label="Название (видите только вы)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={128} />
        <div className="flex gap-1.5">
          {(["ru", "uk", "en"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={cn(
                "nb-chip nb-press h-8 px-3.5 text-[12px] uppercase tracking-[0.06em]",
                lang === l ? "nb-chip-active" : "text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text)]"
              )}
            >
              {LOCALE_LABEL[l]}
              {l === "ru" && " *"}
              {l !== "ru" && stale(l) && <span className="ml-1 text-[var(--warn,#F59E0B)]" title="Перевод устарел">•</span>}
            </button>
          ))}
        </div>
        <Textarea
          label={
            lang === "ru"
              ? "Текст на русском (обязательно)"
              : lang === "uk"
                ? "Текст українською (необязательно)"
                : "Text in English (необязательно)"
          }
          rows={7}
          value={value}
          maxLength={4000}
          onChange={(e) => setValue(e.target.value)}
        />
        {lang !== "ru" && (
          <p className={cn("-mt-1.5 text-[11.5px]", stale(lang) ? "text-[var(--warn,#F59E0B)]" : "text-[var(--text-faint)]")}>
            {stale(lang)
              ? "Перевод сделан для старого русского текста — в чате пока уходит русский. Обновите его здесь или во вкладке «Переводы»."
              : "Можно не заполнять: пустой появится во вкладке «Переводы» вместе с товарами. Пока перевода нет, клиенту уходит русский текст."}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {PLACEHOLDERS.map((p) => (
            <button
              key={p.key}
              type="button"
              title={p.hint}
              onClick={() => setValue(value + p.key)}
              className="nb-press rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1 font-mono text-[11.5px] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--accent-hi)]"
            >
              {p.key}
            </button>
          ))}
        </div>
        <p className="text-[11.5px] text-[var(--text-faint)]">
          Плейсхолдеры подставятся из заказа: {PLACEHOLDERS.map((p) => `${p.key} — ${p.hint}`).join(", ")}.
        </p>
      </div>
    </Modal>
  );
}
