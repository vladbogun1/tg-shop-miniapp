"use client";

/** Строка накладной, которая не «новый товар»: наш товар (с вариантом), нерешённая, пропущенная. Всё решается в самой карточке. */
import { Button } from "@shop/ui/admin-button";
import { Plus, RotateCcw, Search, SkipForward, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { Image } from "@/lib/image";
import type { CatalogItem, LineDecision, ReviewRow } from "../../model/ai/types";
import { blankDraft } from "../ai/use-supply-ai";
import { CardShell, DocLine, StateChip, type CardState, type ReviewEnv } from "./CardParts";
import { rowIssue } from "./review";

const BY_LABEL = { memory: "из памяти поставщика", search: "найден в каталоге", ai: "подобран ИИ", admin: "выбран вами" } as const;

function Thumb({ item, small }: { item: CatalogItem | undefined; small?: boolean }) {
  return <Image src={item?.imageUrl} alt={item?.title ?? ""} size={120} className={`shrink-0 rounded-[var(--r-md)] border border-[var(--line)] ${small ? "h-9 w-9" : "h-12 w-12"}`} />;
}

function Matched({ r, d, env }: { r: ReviewRow; d: Extract<LineDecision, { kind: "match" }>; env: ReviewEnv }) {
  const p = env.ctx.byId.get(d.productId);
  const variants = p?.variants ?? [];
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Thumb item={p} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="min-w-0 break-words text-[13.5px] font-semibold">{p?.title ?? "товар не найден"}</div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={d.by === "admin" ? "ok" : "info"}>{BY_LABEL[d.by]}</Badge>
          {p?.hidden && <Badge>скрыт с витрины</Badge>}
        </div>
        {variants.length > 0 && (
          <Select
            value={d.variantId ?? ""}
            placeholder="Выберите вариант…"
            options={variants.map((v) => ({ value: v.id, label: v.name }))}
            onChange={(v) => env.edit.review.decide(r.line.id, { ...d, variantId: v, by: "admin" })}
          />
        )}
      </div>
    </div>
  );
}

function Candidates({ r, env }: { r: ReviewRow; env: ReviewEnv }) {
  // Короткий список ИИ («одно из этих») показываем весь, догадки поиска — три лучших.
  const top = r.candidates.slice(0, r.candidates[0]?.ai ? 8 : 3).filter((c) => env.ctx.byId.has(c.productId));
  const label = r.candidates[0]?.ai ? "ИИ: это один из наших товаров — какой именно?" : top.length ? "Похожие у нас — это он?" : "В каталоге ничего похожего не нашлось";
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[12.5px] font-semibold text-[var(--warn)]">{label}</span>
      {top.map((c) => {
        const p = env.ctx.byId.get(c.productId)!;
        return (
          <button
            key={c.productId}
            type="button"
            onClick={() => env.edit.review.decide(r.line.id, { kind: "match", productId: c.productId, variantId: c.variantId, by: "admin" })}
            className="flex min-w-0 items-center gap-2.5 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-1.5 text-left hover:border-[var(--accent)]"
          >
            <Thumb item={p} small />
            <span className="min-w-0 flex-1 break-words text-[13px]">{p.title}</span>
            <span className="shrink-0 pr-1 text-[12px] font-semibold text-[var(--accent-hi)]">Это он</span>
          </button>
        );
      })}
    </div>
  );
}

function Actions({ r, env }: { r: ReviewRow; env: ReviewEnv }) {
  const { decide } = env.edit.review;
  const id = r.line.id;
  const skipped = r.decision.kind === "skip";
  return (
    <div className="flex flex-wrap gap-1 border-t border-[var(--line)] pt-2.5">
      {skipped ? (
        <Button variant="ghost" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={() => decide(id, { kind: "open" })}>
          Вернуть
        </Button>
      ) : (
        <>
          <Button variant="ghost" size="sm" icon={<Search className="h-4 w-4" />} onClick={() => env.pick(id)}>
            {r.decision.kind === "match" ? "Другой товар" : "Найти в каталоге"}
          </Button>
          <Button variant="ghost" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => decide(id, { kind: "new", draft: blankDraft(r) })}>
            Создать новый товар
          </Button>
          <Button variant="ghost" size="sm" icon={<SkipForward className="h-4 w-4" />} title="В поставку не войдёт, но в сумму документа строка считается" onClick={() => decide(id, { kind: "skip" })}>
            Пропустить
          </Button>
        </>
      )}
      <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} title="Строки нет в документе — из суммы тоже уходит" onClick={() => env.edit.removeLine(id)}>
        Убрать из документа
      </Button>
    </div>
  );
}

export function MatchCard({ r, env }: { r: ReviewRow; env: ReviewEnv }) {
  const d = r.decision;
  const issue = rowIssue(r, env.ctx);
  const state: CardState = d.kind === "skip" ? "skip" : issue ? "todo" : "ok";
  return (
    <CardShell id={`line-${r.line.id}`} state={state}>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[var(--text-faint)]">{d.kind === "match" ? "Наш товар" : d.kind === "skip" ? "Пропущена" : "Не решено"}</span>
        <StateChip state={state} />
      </div>
      <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-5">
        <DocLine r={r} env={env} />
        <div className="min-w-0">
          {d.kind === "match" && <Matched r={r} d={d} env={env} />}
          {d.kind === "skip" && <p className="text-[12.5px] text-[var(--text-muted)]">Пропущена: в поставку не войдёт. В сумму документа строка всё равно считается.</p>}
          {d.kind === "open" && <Candidates r={r} env={env} />}
        </div>
      </div>
      <div className="mt-3">
        <Actions r={r} env={env} />
      </div>
    </CardShell>
  );
}
