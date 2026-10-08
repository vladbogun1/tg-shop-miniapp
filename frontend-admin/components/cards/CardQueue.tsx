"use client";

/**
 * «Очередь»: every product card by status — unfinished (hidden drafts, first), filled by the AI
 * (waiting for review), legacy drafts on the storefront, incomplete, reviewed — with «Оформить
 * с ИИ» (CardCompletionModal), a jump into the product editor and a quick «Проверено».
 */
import { useQueryClient } from "@tanstack/react-query";
import { CheckCheck, ClipboardList, ExternalLink, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import { ApiError } from "@/lib/api";
import { attributesForCategory, categoryPathName, type CardItem, type CardSchema } from "@/lib/card-prompt";
import { cardsApi, type CardMeta } from "@/lib/cards-api";
import { invalidateCards } from "@/lib/cards";
import { useToast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { CardCompletionModal } from "@/components/cards/CardCompletionModal";
import { CardStatusChip, ConfidencePill, fmtDate, Thumb } from "@/components/cards/shared";

type QFilter = "unfinished" | "ai" | "draft" | "incomplete" | "ready" | "all";

const STATUS_ORDER: Record<string, number> = { AI_FILLED: 0, DRAFT: 1, READY: 2 };
const isDraft = (i: CardItem) => (i.cardStatus ?? "DRAFT") === "DRAFT";
const isUnfinished = (i: CardItem) => i.unfinished === true;

export function CardQueue({ items, schema }: { items: CardItem[]; schema: CardSchema | undefined }) {
  const qc = useQueryClient();
  const { push } = useToast();
  const [filter, setFilter] = useState<QFilter>("unfinished");
  const [completing, setCompleting] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(100);

  const counts = useMemo(
    () => ({
      unfinished: items.filter(isUnfinished).length,
      ai: items.filter((i) => i.cardStatus === "AI_FILLED").length,
      draft: items.filter((i) => isDraft(i) && !isUnfinished(i)).length,
      incomplete: items.filter((i) => (i.missingRequired?.length ?? 0) > 0).length,
      ready: items.filter((i) => i.cardStatus === "READY").length,
      all: items.length,
    }),
    [items]
  );

  const list = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("ru");
    return items
      .filter((i) => {
        const st = i.cardStatus ?? "DRAFT";
        if (filter === "unfinished" && !isUnfinished(i)) return false;
        if (filter === "ai" && st !== "AI_FILLED") return false;
        if (filter === "draft" && (st !== "DRAFT" || isUnfinished(i))) return false;
        if (filter === "ready" && st !== "READY") return false;
        if (filter === "incomplete" && !(i.missingRequired?.length ?? 0)) return false;
        return !q || `${i.title} ${i.brand ?? ""}`.toLocaleLowerCase("ru").includes(q);
      })
      .sort(
        (a, b) =>
          (STATUS_ORDER[a.cardStatus ?? "DRAFT"] ?? 9) - (STATUS_ORDER[b.cardStatus ?? "DRAFT"] ?? 9) ||
          // Least sure first: that is what needs the admin's eyes.
          (a.cardConfidence ?? 101) - (b.cardConfidence ?? 101) ||
          a.title.localeCompare(b.title, "ru")
      );
  }, [items, filter, query]);

  async function markReady(it: CardItem) {
    setBusy((s) => new Set(s).add(it.id));
    try {
      await cardsApi.setCardStatus(it.id, "READY");
      push(`«${it.title}» — проверено`, "ok");
      invalidateCards(qc);
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось сохранить", "error");
    } finally {
      setBusy((s) => {
        const n = new Set(s);
        n.delete(it.id);
        return n;
      });
    }
  }

  function missingLabels(it: CardItem): string {
    if (!schema) return (it.missingRequired ?? []).join(", ");
    const attrs = attributesForCategory(schema, it.categorySlug);
    return (it.missingRequired ?? []).map((k) => attrs.find((a) => a.key === k)?.labelRu ?? k).join(", ");
  }

  return (
    <div className="card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SegmentedControl<QFilter>
          size="sm"
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setLimit(100);
          }}
          options={[
            { value: "unfinished", label: "Незавершённые", count: counts.unfinished },
            { value: "ai", label: "От ИИ — проверить", count: counts.ai },
            { value: "draft", label: "Без оформления (на витрине)", count: counts.draft },
            { value: "incomplete", label: "Неполные", count: counts.incomplete },
            { value: "ready", label: "Проверены", count: counts.ready },
            { value: "all", label: "Все", count: counts.all },
          ]}
        />
        <div className="ml-auto flex h-9 w-full items-center gap-2 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 sm:w-[260px]">
          <Search className="h-4 w-4 text-[var(--text-faint)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск"
            aria-label="Поиск в очереди"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
          />
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Пусто" description="В этой группе карточек нет." />
      ) : (
        <ul className="flex flex-col">
          {list.slice(0, limit).map((it) => {
            const meta = (it.cardMeta ?? {}) as CardMeta;
            const imported = fmtDate(meta.importedAt);
            const reviewed = fmtDate(meta.reviewedAt);
            const missing = it.missingRequired?.length ?? 0;
            return (
              <li key={it.id} className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] py-2 last:border-b-0">
                <Thumb src={it.imageUrl} alt={it.title} size={44} />
                <div className="min-w-0 flex-1 basis-[220px]">
                  <div className="truncate text-[13.5px] font-semibold text-[var(--text)]" title={it.title}>
                    {it.title}
                  </div>
                  <div className="truncate text-[11.5px] text-[var(--text-faint)]">
                    {(schema && categoryPathName(schema, it.categorySlug)) || it.categorySlug || "без категории"}
                    {it.brand ? ` · ${it.brand}` : ""}
                    {imported ? ` · импорт ИИ ${imported}` : ""}
                    {reviewed ? ` · проверено ${reviewed}${meta.reviewedBy ? ` (${meta.reviewedBy})` : ""}` : ""}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {isUnfinished(it) ? (
                    <span className="chip-tint !px-2 !text-[10px] !leading-[16px]" style={{ "--chip": "var(--warn)" } as CSSProperties}>
                      скрыт
                    </span>
                  ) : (
                    <CardStatusChip status={it.cardStatus} />
                  )}
                  {it.cardConfidence != null && <ConfidencePill value={it.cardConfidence} />}
                  {missing > 0 && (
                    <span className="chip-tint !bg-[var(--surface-3)] !px-2 !text-[10px] !leading-[16px]" title={`Не заполнено: ${missingLabels(it)}`}>
                      не заполнено {missing}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {it.cardStatus !== "READY" && (
                    <Button
                      size="sm"
                      variant={isUnfinished(it) ? "accent" : "outline"}
                      icon={<Sparkles className="h-4 w-4" />}
                      onClick={() => setCompleting(it.id)}
                    >
                      Оформить с ИИ
                    </Button>
                  )}
                  <Link
                    href={`/products?edit=${it.id}`}
                    target="_blank"
                    title="Открыть товар в редакторе (новая вкладка)"
                    className="inline-flex h-8 items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--border-2)] px-3 font-display text-[11.5px] font-bold uppercase tracking-[0.04em] text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-hi)]"
                  >
                    Открыть товар <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                  {it.cardStatus === "AI_FILLED" && (
                    <Button size="sm" variant="surface" icon={<CheckCheck className="h-4 w-4" />} loading={busy.has(it.id)} onClick={() => markReady(it)}>
                      Проверено
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {completing && (
        <CardCompletionModal
          productId={completing}
          open
          reason="manual"
          onClose={() => {
            setCompleting(null);
            invalidateCards(qc);
          }}
        />
      )}
      {list.length > limit && (
        <div className="mt-3 flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setLimit(limit + 100)}>
            Показать ещё ({list.length - limit})
          </Button>
        </div>
      )}
    </div>
  );
}
