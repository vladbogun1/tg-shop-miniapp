"use client";

/**
 * «Все переводы»: every translatable field with its uk/en state. Inline edit saves a MANUAL
 * translation (force — the backend keeps MANUAL rows from being overwritten by the AI import
 * otherwise), reset deletes one field of one language (the Russian original is shown again).
 */
import { useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, RotateCcw, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { adminApi, ApiError, type TrLocale } from "@/lib/api";
import { cn } from "@/lib/cn";
import { checkTranslation, LOCALES, type FieldRef, type WorkSet } from "@/lib/translation-check";
import { invalidateTranslations } from "@/lib/translations";
import { useToast } from "@/lib/toast";
import { useDebounced } from "@/lib/use-debounced";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { InlineText, IssueList, KindBadge, ProductLink, SourceText, StatusChip } from "@/components/translations/shared";

type StatusFilter = "all" | "missing" | "stale" | "translated";
type TypeFilter = "" | "PRODUCT" | "VARIANT" | "TAG" | "PAYMENT_OPTION" | "REPLY_TEMPLATE";
const PAGE = 40;

export function TranslationList({ ws }: { ws: WorkSet }) {
  const qc = useQueryClient();
  const { push } = useToast();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [type, setType] = useState<TypeFilter>("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 250);
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState<{ key: string; locale: TrLocale; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState<{ f: FieldRef; locale: TrLocale } | null>(null);

  const counts = useMemo(() => {
    const c = { all: ws.fields.length, missing: 0, stale: 0, translated: 0 };
    for (const f of ws.fields) {
      const st = LOCALES.map((l) => f.status[l]);
      if (st.includes("MISSING")) c.missing++;
      if (st.includes("STALE")) c.stale++;
      if (st.every((s) => s === "TRANSLATED")) c.translated++;
    }
    return c;
  }, [ws]);

  const filtered = useMemo(() => {
    const needle = dq.trim().toLowerCase();
    return ws.fields.filter((f) => {
      if (type && f.entityType !== type) return false;
      const st = LOCALES.map((l) => f.status[l]);
      if (status === "missing" && !st.includes("MISSING")) return false;
      if (status === "stale" && !st.includes("STALE")) return false;
      if (status === "translated" && !st.every((s) => s === "TRANSLATED")) return false;
      if (needle) {
        const hay = [f.source, f.text.uk, f.text.en, f.productTitle].filter(Boolean).join("\n").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [ws, status, type, dq]);

  async function save() {
    if (!editing || busy) return;
    const f = ws.fields.find((x) => x.key === editing.key);
    if (!f || !editing.text.trim()) return;
    setBusy(true);
    try {
      const r = await adminApi.translationsImport({
        locale: editing.locale,
        origin: "MANUAL",
        force: true,
        items: [{ entityType: f.entityType, entityId: f.entityId, field: f.field, sourceHash: f.sourceHash, text: editing.text }],
      });
      if (r.applied === 1) {
        push("Перевод сохранён (ручной)", "ok");
        setEditing(null);
      } else {
        push(r.skippedStale ? "Оригинал изменился — обновите страницу" : `Не сохранено: ${r.rejected[0]?.reason ?? "?"}`, "error");
      }
      invalidateTranslations(qc);
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Ошибка", "error");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!resetting || busy) return;
    const { f, locale } = resetting;
    setBusy(true);
    try {
      await adminApi.translationsReset(locale, f.entityType, f.entityId, f.field);
      push("Перевод сброшен", "ok");
      setResetting(null);
      invalidateTranslations(qc);
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Ошибка", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <SegmentedControl<StatusFilter>
          className="h-10 pointer-coarse:h-11"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setLimit(PAGE);
          }}
          options={[
            { value: "all", label: "Всё", count: counts.all },
            { value: "missing", label: "Нет перевода", count: counts.missing },
            { value: "stale", label: "Устарело", count: counts.stale },
            { value: "translated", label: "Переведено", count: counts.translated },
          ]}
        />
        <Select<TypeFilter>
          className="w-[190px]"
          value={type}
          onChange={(v) => {
            setType(v);
            setLimit(PAGE);
          }}
          options={[
            { value: "", label: "Все типы" },
            { value: "PRODUCT", label: "Товары" },
            { value: "VARIANT", label: "Варианты" },
            { value: "TAG", label: "Категории" },
            { value: "PAYMENT_OPTION", label: "Оплата" },
            { value: "REPLY_TEMPLATE", label: "Шаблоны чата" },
          ]}
        />
        <div className="min-w-[220px] flex-1">
          <Input
            
            icon={<Search className="h-4 w-4" />}
            placeholder="Поиск по ru / uk / en / товару"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(PAGE);
            }}
          />
        </div>
      </div>

      <div className="mb-2 text-[12px] font-semibold text-[var(--text-faint)]">
        Найдено полей: {filtered.length}. Ручная правка сохраняется как «ручной» перевод — импорт ИИ его не перезапишет.
      </div>

      <div className="flex flex-col gap-2.5">
        {filtered.slice(0, limit).map((f) => (
          <div key={f.key} className="card p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <KindBadge kindKey={`${f.entityType}.${f.field}`} />
              {f.productId ? (
                <ProductLink productId={f.productId} title={f.productTitle} />
              ) : (
                <span className="text-[12px] font-semibold text-[var(--text-muted)]">
                  {f.entityType === "TAG"
                    ? f.productTitle
                      ? `Тег «${f.productTitle}»`
                      : "Теги"
                    : f.entityType === "REPLY_TEMPLATE"
                      ? `Шаблон чата «${f.productTitle ?? ""}»`
                      : "Оплата"}
                </span>
              )}
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              <div>
                <div className="field-label mb-1 !text-[11px] !text-[var(--text-faint)]">RU · оригинал</div>
                <SourceText text={f.source} />
              </div>
              {LOCALES.map((l) => {
                const isEditing = editing?.key === f.key && editing.locale === l;
                const issues = isEditing ? checkTranslation(f.source, l, editing.text) : [];
                return (
                  <div key={l} className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <StatusChip lang={l} status={f.status[l]} />
                      {f.origin[l] === "MANUAL" && <Badge tone="info" className="px-2 text-[10px] leading-[16px]">ручной</Badge>}
                      {!isEditing && (
                        <span className="ml-auto flex items-center gap-0.5">
                          <button
                            type="button"
                            aria-label={`Изменить ${l}`}
                            title={f.text[l] ? "Изменить" : "Добавить вручную"}
                            onClick={() => setEditing({ key: f.key, locale: l, text: f.text[l] ?? "" })}
                            className="grid h-7 w-7 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {f.text[l] != null && (
                            <button
                              type="button"
                              aria-label={`Сбросить ${l}`}
                              title="Сбросить перевод"
                              onClick={() => setResetting({ f, locale: l })}
                              className="grid h-7 w-7 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--danger)_16%,transparent)] hover:text-[var(--danger-ink)]"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                    {isEditing ? (
                      <div>
                        <InlineText
                          ariaLabel={`Перевод ${l}`}
                          value={editing.text}
                          invalid={!editing.text.trim()}
                          onChange={(v) => setEditing({ ...editing, text: v })}
                        />
                        <IssueList issues={issues} />
                        <div className="mt-1.5 flex gap-1.5">
                          <Button size="sm" variant="accent" loading={busy} disabled={!editing.text.trim()} icon={<Check className="h-3.5 w-3.5" />} onClick={save}>
                            Сохранить
                          </Button>
                          <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={() => setEditing(null)}>
                            Отмена
                          </Button>
                        </div>
                      </div>
                    ) : f.text[l] ? (
                      <div className={cn(f.status[l] === "STALE" && "opacity-60")}>
                        <SourceText text={f.text[l]!} />
                      </div>
                    ) : (
                      <div className="text-[12px] italic text-[var(--text-faint)]">нет перевода — покупатель видит русский</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {filtered.length > limit && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={() => setLimit(limit + PAGE * 2)}>
            Показать ещё ({filtered.length - limit})
          </Button>
        </div>
      )}

      <Modal
        open={!!resetting}
        onClose={() => (busy ? undefined : setResetting(null))}
        title="Сбросить перевод?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetting(null)} disabled={busy}>
              Отмена
            </Button>
            <Button variant="danger" loading={busy} icon={<RotateCcw className="h-4 w-4" />} onClick={reset}>
              Сбросить
            </Button>
          </>
        }
      >
        <p className="text-[14px] leading-relaxed text-[var(--text-muted)]">
          Перевод <b className="uppercase text-[var(--text)]">{resetting?.locale}</b> этого поля будет удалён: покупатели
          увидят русский оригинал, а поле снова попадёт в список «Нет перевода».
        </p>
      </Modal>
    </div>
  );
}
