"use client";

/** Step 3 of «Оформление с ИИ»: one product — what changes, field by field, with checkboxes. */
import type { Proposal, ProductReview, TextField, TextLang } from "../model";
import type { CardSchema } from "../model/schema";
import type { ProductSel } from "../model/selection";
import { cn } from "@/lib/cn";
import { CardIssues } from "./shared";
import { FieldsTable, ProposalsBox, ReviewCardHeader, ScalarChanges, SourcesBox } from "./ReviewCardParts";
import { TextsBlock } from "./TextsBlock";

const STRIPE = { ok: "var(--ok)", warn: "var(--warn)", error: "var(--danger)" } as const;

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
  const disabled = r.level === "error";
  const off = !sel.on || disabled;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[var(--r-md)] border bg-[var(--surface-2)] pl-[2px] transition-colors",
        sel.on && !disabled ? "border-[rgba(255,102,0,.45)]" : "border-[var(--line)]"
      )}
    >
      <span className="absolute inset-y-0 left-0 w-[2px]" style={{ backgroundColor: STRIPE[r.level] }} aria-hidden />
      <div className="p-3">
        <ReviewCardHeader r={r} sel={sel} disabled={disabled} onSel={onSel} />
        <div className={cn("transition-opacity", off && "opacity-55")}>
          <ScalarChanges r={r} schema={schema} sel={sel} onSel={onSel} />
          <FieldsTable r={r} sel={sel} onSel={onSel} />
          {/* title / description / condition note in ru·uk·en */}
          {Object.keys(r.texts).length > 0 && <TextsBlock review={r} sel={sel} onSel={onSel} onEditText={onEditText} />}
          <ProposalsBox proposals={r.proposals} onAddOption={onAddOption} />
          <SourcesBox r={r} />
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
