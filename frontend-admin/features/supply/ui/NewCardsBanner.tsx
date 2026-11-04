"use client";

/**
 * Товары поставки, у которых карточка ещё не оформлена (обычно — только что созданные «Поставкой с ИИ» черновики):
 * одна кнопка ведёт в мастер «Карточек» с ними — ИИ найдёт характеристики, тексты на трёх языках и фото, сервис
 * приведёт фото к квадрату 1600. Пока карточки не оформлены, плашка остаётся.
 */
import { Button } from "@shop/ui/admin-button";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { cardsWizardHref, useUnfinishedCards } from "@/features/cards";
import type { Batch } from "@/features/procurement";

export function NewCardsBanner({ batch }: { batch: Batch }) {
  const router = useRouter();
  const ids = useUnfinishedCards(batch.items.map((i) => i.productId));
  if (!ids.length) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3 text-[13px]">
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Без карточки: {ids.length}</span>
        <span className="text-[var(--text-muted)]"> — ИИ найдёт характеристики, тексты и фото из интернета, вы проверите.</span>
      </p>
      <Button variant="accent" size="sm" icon={<Sparkles className="h-4 w-4" />} onClick={() => router.push(cardsWizardHref(ids))}>
        Оформить с ИИ
      </Button>
    </div>
  );
}
