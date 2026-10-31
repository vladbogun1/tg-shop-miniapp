"use client";

import { ChevronDown, PencilLine, X } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import type { CardMeta as ApiCardMeta, ProductSpecs } from "@/lib/api";
import { attributesForCategory as adminAttributesFor, SpecsForm, useCatalogSchemaQuery } from "@/features/catalog";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@shop/ui/admin-button";
import type { CardItem } from "../../model/item";
import type { CardReviewData } from "../../model";
import type { CardSchema } from "../../model/schema";
import { buildSpecRows, groupSpecRows, type SpecGroups, type SpecRow } from "../../model/review-edit";
import { CONFIDENCE_HINT } from "../shared";
import { Section } from "./parts";
import { SpecLine } from "./SpecLine";

/** Правка характеристик формой каталога: поля категории товара из админской схемы. */
function SpecsEditor({ item, draft, onDraft }: { item: CardItem; draft: ProductSpecs; onDraft: (s: ProductSpecs | null) => void }) {
  const schemaQ = useCatalogSchemaQuery({ enabled: true });
  const attrs = useMemo(
    () => (schemaQ.data && item.categoryId ? adminAttributesFor(schemaQ.data.attributes, schemaQ.data.categories, item.categoryId) : []),
    [schemaQ.data, item.categoryId]
  );
  if (schemaQ.isLoading) return <Skeleton className="h-40" />;
  if (attrs.length === 0) return <div className="text-[13px] text-[var(--text-faint)]">У категории нет характеристик в схеме.</div>;
  return (
    <div className="tab-in rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-2)] p-3">
      <SpecsForm
        attrs={attrs}
        groups={schemaQ.data?.groups ?? []}
        specs={draft}
        onChange={onDraft}
        meta={item.cardMeta as ApiCardMeta | null}
        resetKey={`${item.id}-${item.categoryId}`}
        highlightMissing
      />
    </div>
  );
}

/** Таблица «Характеристика / Было → стало / ИИ»; без изменений — под спойлером. */
function SpecsTable({ groups, showSameRaw, setShowSame }: { groups: SpecGroups; showSameRaw: boolean | null; setShowSame: (v: boolean) => void }) {
  const { changed, empty, same } = groups;
  // Nothing changed and nothing missing (a reviewed card): show what it has right away.
  const showSame = showSameRaw ?? (changed.length === 0 && empty.length === 0);
  return (
    <div className="overflow-hidden rounded-[var(--r-md)] border border-[var(--line)]">
      <div className="hidden grid-cols-[minmax(150px,1.1fr)_minmax(0,1.6fr)_104px] gap-3 border-b border-[var(--line)] bg-[var(--bg-2)] px-3 py-1.5 sm:grid">
        <span className="field-label !text-[10.5px]">Характеристика</span>
        <span className="field-label !text-[10.5px]">Было → стало</span>
        <span className="field-label text-right !text-[10.5px]" title={CONFIDENCE_HINT}>
          ИИ
        </span>
      </div>
      {changed.map((r) => (
        <SpecLine key={r.key} r={r} />
      ))}
      {empty.map((r) => (
        <SpecLine key={r.key} r={r} />
      ))}
      {same.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowSame(!showSame)}
            aria-expanded={showSame}
            className="focusable flex w-full items-center gap-1.5 border-t border-[var(--line)] px-3 py-2 text-left text-[12px] font-semibold text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-muted)]"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showSame && "rotate-180")} />
            Без изменений: {same.length}
          </button>
          {showSame && (
            <div className="tab-in">
              {same.map((r: SpecRow) => (
                <SpecLine key={r.key} r={r} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

type SameToggle = { showSameRaw: boolean | null; setShowSame: (v: boolean) => void };

function SpecsContent({ item, rows, groups, draft, onDraft, same }: { item: CardItem; rows: SpecRow[]; groups: SpecGroups; draft: ProductSpecs | null; onDraft: (s: ProductSpecs | null) => void; same: SameToggle }) {
  if (draft !== null) return <SpecsEditor item={item} draft={draft} onDraft={onDraft} />;
  if (rows.length === 0)
    return (
      <div className="rounded-[var(--r-md)] border border-dashed border-[var(--line)] px-3 py-4 text-center text-[13px] text-[var(--text-faint)]">
        Характеристик нет — оформите карточку с ИИ или заполните вручную («Править»).
      </div>
    );
  return <SpecsTable groups={groups} showSameRaw={same.showSameRaw} setShowSame={same.setShowSame} />;
}

export function SpecsSection({
  item,
  schema,
  data,
  draft,
  onDraft,
}: {
  item: CardItem;
  schema: CardSchema | undefined;
  data: CardReviewData | undefined;
  draft: ProductSpecs | null;
  onDraft: (s: ProductSpecs | null) => void;
}) {
  const editing = draft !== null;
  // Lives here, not in the table: stays through entering/leaving edit mode, as in the old panel.
  const [showSameRaw, setShowSame] = useState<boolean | null>(null);
  const rows = useMemo(() => buildSpecRows(item, schema, data?.last?.changed?.specs ?? {}), [schema, item, data]);
  const groups = useMemo(() => groupSpecRows(rows), [rows]);
  return (
    <Section
      title="Характеристики"
      aside={
        <>
          {!editing && groups.low > 0 && <Badge tone="warn">неуверенных {groups.low}</Badge>}
          <Button
            size="sm"
            variant={editing ? "ghost" : "outline"}
            icon={editing ? <X className="h-3.5 w-3.5" /> : <PencilLine className="h-3.5 w-3.5" />}
            onClick={() => onDraft(editing ? null : ({ ...(item.specs ?? {}) } as ProductSpecs))}
            disabled={!item.categoryId}
            title={item.categoryId ? undefined : "У товара нет категории — сначала выберите её в редакторе"}
          >
            {editing ? "Отменить правки" : "Править"}
          </Button>
        </>
      }
    >
      <SpecsContent item={item} rows={rows} groups={groups} draft={draft} onDraft={onDraft} same={{ showSameRaw, setShowSame }} />
    </Section>
  );
}
