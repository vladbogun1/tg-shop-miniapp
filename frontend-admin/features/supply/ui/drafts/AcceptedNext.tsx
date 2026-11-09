"use client";

/**
 * Черновик принят: поставка и новые товары созданы. Новые товары скрыты с витрины — поэтому сразу показываем
 * следующие шаги: проверить карточки (раздел «Карточки») и выложить товары. Пока шагов нет — просто ссылка на поставку.
 */
import { Button } from "@shop/ui/admin-button";
import { ArrowRight, CheckCircle2, Eye, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cardsWizardHref, useHiddenCards, useUnfinishedCards } from "@/features/cards";
import { productsSelectHref } from "@/features/product";
import { plural } from "./review";
import type { SupplyDraft } from "../../api-drafts";
import { useBatch } from "../../queries";
import { DraftHeader } from "./DraftHeader";

function Step({ n, title, text, children }: { n: number; title: string; text: string; children: React.ReactNode }) {
  return (
    <li className="card flex min-w-0 flex-wrap items-center gap-3 p-3.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[13px] font-bold text-[var(--accent-ink)]">{n}</span>
      <div className="min-w-0 flex-1 basis-56">
        <div className="text-[14px] font-semibold text-[var(--text)]">{title}</div>
        <div className="text-[12.5px] text-[var(--text-muted)]">{text}</div>
      </div>
      {children}
    </li>
  );
}

function Steps({ batchId }: { batchId: number }) {
  const router = useRouter();
  const batch = useBatch(String(batchId)).data;
  const ids = batch?.items.map((i) => i.productId) ?? [];
  const unfinished = useUnfinishedCards(ids);
  const hidden = useHiddenCards(ids);
  const count = new Set([...unfinished, ...hidden]).size;
  if (count === 0) return null;
  return (
    <section className="mb-6" aria-label="Что дальше">
      <h2 className="font-display text-[15px] font-bold uppercase tracking-[0.05em] text-[var(--ink)]">
        Новых товаров {count} — проверьте карточки и опубликуйте
      </h2>
      <p className="mt-0.5 text-[12.5px] text-[var(--text-muted)]">Покупатели их пока не видят: товары созданы скрытыми.</p>
      <ol className="mt-3 flex flex-col gap-2.5">
        {unfinished.length > 0 && (
          <Step n={1} title={`Оформить карточки: ${plural(unfinished.length, ["товар", "товара", "товаров"])}`} text="ИИ найдёт характеристики, тексты и фото — вы проверите.">
            <Button variant="accent" size="sm" icon={<Sparkles className="h-4 w-4" />} onClick={() => router.push(cardsWizardHref(unfinished))}>
              Оформить с ИИ
            </Button>
          </Step>
        )}
        {hidden.length > 0 && (
          <Step n={unfinished.length > 0 ? 2 : 1} title={`Выложить на витрину: ${plural(hidden.length, ["товар", "товара", "товаров"])}`} text="Карточки готовы — проверьте их в «Карточках» и опубликуйте.">
            <Button variant="outline" size="sm" onClick={() => router.push("/cards")}>
              Проверить карточки
            </Button>
            <Button variant="accent" size="sm" icon={<Eye className="h-4 w-4" />} onClick={() => router.push(productsSelectHref(hidden))}>
              Выложить
            </Button>
          </Step>
        )}
      </ol>
    </section>
  );
}

export function Accepted({ draft }: { draft: SupplyDraft }) {
  return (
    <>
      <DraftHeader draft={draft} />
      <div className="card mb-5 flex min-w-0 flex-wrap items-center gap-3 border-[var(--ok)] p-4">
        <CheckCircle2 className="h-6 w-6 shrink-0 text-[var(--ok)]" />
        <div className="min-w-0 flex-1 basis-56">
          <div className="text-[16px] font-bold">Поставка создана</div>
          <div className="text-[12.5px] text-[var(--text-muted)]">Этот черновик принят: товары и поставка заведены.</div>
        </div>
        {draft.batchId != null && (
          <Link href={`/preorders/${draft.batchId}`} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[var(--accent-hi)] hover:underline">
            Открыть поставку <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      {draft.batchId != null && <Steps batchId={draft.batchId} />}
    </>
  );
}
