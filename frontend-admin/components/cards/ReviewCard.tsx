"use client";

/** Step 3 of «Оформление с ИИ»: one product — what changes, field by field, with checkboxes. */
import { ArrowRight, ExternalLink, Lightbulb, MessageSquareText, Plus } from "lucide-react";
import { formatValue, type FieldReview, type Proposal, type ProductReview, type TextField, type TextLang } from "@/lib/card-check";
import { categoryPathName, type CardSchema } from "@/lib/card-prompt";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProductLink } from "@/components/translations/shared";
import { TextsBlock } from "@/components/cards/TextsBlock";
import type { ProductSel } from "@/components/cards/selection";
import { CardIssues, CardStatusChip, Check, ConfidenceDot, ConfidencePill, Thumb } from "@/components/cards/shared";

const LEVEL_TONE = { ok: "ok", warn: "warn", error: "danger" } as const;
const LEVEL_LABEL = { ok: "готово", warn: "проверить", error: "ошибка" } as const;

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function ReviewCard({
  review: r,
  schema,
  sel,
  onSel,
  onAddOption,
  onEditText,
}: {
  review: ProductReview;
  schema: CardSchema;
  sel: ProductSel;
  onSel: (patch: Partial<ProductSel>) => void;
  onAddOption: (p: Proposal) => void;
  /** Inline edit of a text (the parent re-validates it with editText). */
  onEditText: (field: TextField, lang: TextLang, value: string) => void;
}) {
  const stripe = r.level === "error" ? "var(--danger)" : r.level === "warn" ? "var(--warn)" : "var(--ok)";
  const disabled = r.level === "error";
  const off = !sel.on || disabled;
  const toggleField = (key: string, on: boolean) => {
    const n = new Set(sel.fields);
    if (on) n.add(key);
    else n.delete(key);
    onSel({ fields: n });
  };
  const changedFields = r.fields.filter((f) => f.changed);
  const sameFields = r.fields.filter((f) => !f.changed);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[var(--r-md)] border bg-[var(--surface-2)] pl-[2px] transition-colors",
        sel.on && !disabled ? "border-[rgba(255,102,0,.45)]" : "border-[var(--line)]"
      )}
    >
      <span className="absolute inset-y-0 left-0 w-[2px]" style={{ backgroundColor: stripe }} aria-hidden />
      <div className="p-3">
        {/* header */}
        <div className="mb-3 flex flex-wrap items-start gap-3">
          <Check checked={sel.on} disabled={disabled} onChange={(on) => onSel({ on })} label={`Сохранить ${r.item.title}`} className="mt-1" />
          <Thumb src={r.item.imageUrl} alt={r.item.title} size={56} />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold leading-snug text-[var(--text)]">{r.item.title}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono text-[11.5px] text-[var(--text-faint)]">{r.id}</span>
              <CardStatusChip status={r.item.cardStatus} />
              <ProductLink productId={r.item.id} title="открыть товар" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ConfidencePill value={r.overall} label="ИИ" />
            <Badge tone={LEVEL_TONE[r.level]} dot>
              {LEVEL_LABEL[r.level]}
            </Badge>
          </div>
        </div>

        <div className={cn("transition-opacity", off && "opacity-55")}>
          {/* category / brand */}
          {(r.category || r.brand) && (
            <div className="mb-3 flex flex-col gap-1.5">
              {r.category && (
                <ChangeRow
                  label="Категория"
                  checked={sel.category}
                  disabled={!r.category.valid}
                  onChange={(v) => onSel({ category: v })}
                  from={categoryPathName(schema, r.category.from) || r.category.from || "—"}
                  to={categoryPathName(schema, r.category.to) || r.category.to}
                  issues={r.category.issues}
                />
              )}
              {r.brand && (
                <ChangeRow
                  label="Бренд"
                  checked={sel.brand}
                  disabled={!r.brand.valid}
                  onChange={(v) => onSel({ brand: v })}
                  from={r.brand.from ?? "—"}
                  to={r.brand.to}
                  issues={r.brand.issues}
                />
              )}
            </div>
          )}

          {/* fields */}
          {r.fields.length > 0 && (
            <div className="overflow-hidden rounded-[var(--r-md)] border border-[var(--line)]">
              <div className="hidden grid-cols-[24px_minmax(140px,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] gap-2 border-b border-[var(--line)] bg-[var(--bg-2)] px-2.5 py-1.5 sm:grid">
                <span />
                <span className="field-label !text-[10.5px]">Характеристика</span>
                <span className="field-label !text-[10.5px]">Было</span>
                <span className="field-label !text-[10.5px]">Станет</span>
              </div>
              {changedFields.map((f) => (
                <FieldRow key={f.key} f={f} checked={sel.fields.has(f.key)} onChange={(v) => toggleField(f.key, v)} />
              ))}
              {sameFields.length > 0 && (
                <details className="border-t border-[var(--line)]">
                  <summary className="cursor-pointer px-2.5 py-1.5 text-[12px] font-semibold text-[var(--text-faint)] hover:text-[var(--text-muted)]">
                    Без изменений: {sameFields.length} (подтверждены ИИ — уверенность запишется)
                  </summary>
                  {sameFields.map((f) => (
                    <FieldRow key={f.key} f={f} checked={sel.fields.has(f.key)} onChange={(v) => toggleField(f.key, v)} />
                  ))}
                </details>
              )}
            </div>
          )}

          {/* title / description / condition note in ru·uk·en */}
          {Object.keys(r.texts).length > 0 && <TextsBlock review={r} sel={sel} onSel={onSel} onEditText={onEditText} />}

          {/* proposals */}
          {r.proposals.length > 0 && (
            <div className="mt-3 rounded-[var(--r-md)] border border-[rgba(255,102,0,.28)] bg-[var(--accent-soft)] p-2.5">
              <div className="mb-1.5 flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-[var(--accent-hi)]" />
                <span className="font-display text-[12px] font-bold uppercase tracking-[0.06em] text-[var(--accent-hi)]">Новые опции — нет в схеме</span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {r.proposals.map((p, i) => {
                  const canAdd = !!p.attr?.id && (p.attr.type === "enum" || p.attr.type === "multi");
                  return (
                    <li key={i} className="flex flex-wrap items-center gap-2 text-[13px]">
                      <span className="text-[var(--text-muted)]">{p.attr?.labelRu ?? p.key}:</span>
                      <b className="text-[var(--text)]">«{p.value}»</b>
                      {p.why && <span className="text-[12px] text-[var(--text-faint)]">— {p.why}</span>}
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-auto"
                        icon={<Plus className="h-3.5 w-3.5" />}
                        disabled={!canAdd}
                        title={
                          canAdd
                            ? "Добавить опцию в схему категории и проверить ответ заново"
                            : !p.attr
                              ? "Нет такой характеристики в схеме категории"
                              : p.attr.type !== "enum" && p.attr.type !== "multi"
                                ? "У этой характеристики нет списка опций"
                                : "Схема загружена без id атрибутов — добавьте опцию в «Категориях»"
                        }
                        onClick={() => onAddOption(p)}
                      >
                        Добавить опцию в схему
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* sources + notes */}
          {(r.sources.length > 0 || r.notes) && (
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {r.sources.length > 0 && (
                <div>
                  <div className="field-label mb-1 !text-[11px] !text-[var(--text-faint)]">Источники</div>
                  <ul className="flex flex-col gap-0.5">
                    {r.sources.map((s, i) => (
                      <li key={i} className="min-w-0">
                        <a
                          href={s}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          title={s}
                          className="inline-flex max-w-full items-center gap-1 text-[12.5px] font-semibold text-[var(--info)] hover:underline"
                        >
                          <span className="truncate">{host(s)}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {r.notes && (
                <div>
                  <div className="field-label mb-1 flex items-center gap-1 !text-[11px] !text-[var(--text-faint)]">
                    <MessageSquareText className="h-3.5 w-3.5" /> Заметки ИИ
                  </div>
                  <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-muted)]">{r.notes}</div>
                </div>
              )}
            </div>
          )}

          {r.issues.length > 0 && (
            <div className="mt-2">
              <CardIssues issues={r.issues} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChangeRow({
  label,
  checked,
  disabled,
  onChange,
  from,
  to,
  issues,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
  from: string;
  to: string;
  issues: ProductReview["issues"];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-2)] px-2.5 py-1.5 text-[13px]">
      <Check checked={checked} disabled={disabled} onChange={onChange} label={`Применить: ${label}`} />
      <span className="field-label !text-[11px]">{label}</span>
      <span className="text-[var(--text-muted)] line-through decoration-[var(--text-faint)]">{from}</span>
      <ArrowRight className="h-3.5 w-3.5 text-[var(--text-faint)]" />
      <b className="text-[var(--text)]">{to}</b>
      <span className="ml-auto">
        <CardIssues issues={issues} />
      </span>
    </div>
  );
}

function FieldRow({ f, checked, onChange }: { f: FieldReview; checked: boolean; onChange: (v: boolean) => void }) {
  const dropped = f.value === undefined;
  return (
    <div
      className={cn(
        "grid grid-cols-[24px_minmax(0,1fr)] items-start gap-x-2 gap-y-0.5 border-b border-[var(--line)] px-2.5 py-1.5 last:border-b-0 sm:grid-cols-[24px_minmax(140px,1fr)_minmax(0,1fr)_minmax(0,1.3fr)]",
        dropped && "bg-[color-mix(in_srgb,var(--danger)_6%,transparent)]"
      )}
    >
      <span className="pt-0.5">
        <Check checked={checked} disabled={dropped} onChange={onChange} label={`Поле ${f.label}`} />
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-[var(--text)]">
        <ConfidenceDot value={f.confidence} />
        <span className="truncate" title={f.key}>
          {f.label}
        </span>
        {f.confidence != null && <span className="tabular text-[11px] font-medium text-[var(--text-faint)]">{f.confidence}%</span>}
        {f.attr?.required && <span className="text-[11px] text-[var(--accent-hi)]" title="Обязательное для полной карточки">*</span>}
      </span>
      <span className="col-start-2 text-[12.5px] text-[var(--text-muted)] sm:col-start-auto">
        <span className="sm:hidden">было: </span>
        {formatValue(f.attr ?? undefined, f.before)}
      </span>
      <span className="col-start-2 min-w-0 sm:col-start-auto">
        <span className={cn("text-[13px]", dropped ? "font-mono text-[12px] text-[var(--danger-ink)]" : f.changed ? "font-semibold text-[var(--text)]" : "text-[var(--text-muted)]")}>
          {dropped ? JSON.stringify(f.raw) : formatValue(f.attr ?? undefined, f.value)}
        </span>
        <CardIssues issues={f.issues} />
      </span>
    </div>
  );
}
