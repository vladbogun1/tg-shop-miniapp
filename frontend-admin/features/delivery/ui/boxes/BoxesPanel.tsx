"use client";

/**
 * Коробки на «Отправке». Пока владелец ни разу не нажал «Готово» (reviewed = false) — карточка первого запуска
 * «Какие коробки у вас есть?» с редактором; потом — строка ссылок «Коробки» и «Журнал упаковки» (окна).
 */
import { useState, type ReactNode } from "react";
import { BookOpen, Boxes } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { Modal } from "@shop/ui/overlay";
import { useBoxesQuery, useBoxesReviewed } from "../../queries-packing";
import { PackingJournalModal } from "../packing/PackingJournal";
import { BoxEditor } from "./BoxEditor";

/** Окно «Коробки» — тот же редактор, что при первом запуске и в настройках. */
export function BoxesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal open onClose={onClose} size="lg" title="Коробки">
      <p className="mb-3 text-[13px] leading-snug text-[var(--text-muted)]">
        Отметьте коробки, которые есть у упаковщиков: из них подбираем «Пакуй в» и коробку в ТТН.
      </p>
      <BoxEditor />
    </Modal>
  );
}

function Onboarding() {
  const done = useBoxesReviewed();
  return (
    <section className="panel flex min-w-0 flex-col gap-3 p-3 sm:p-4" aria-label="Какие коробки у вас есть?">
      <div className="min-w-0">
        <h2 className="text-[16px] font-bold text-[var(--ink)]">Какие коробки у вас есть?</h2>
        <p className="mt-1 text-[13px] leading-snug text-[var(--text-muted)]">
          Нажмите на коробки, которые есть у упаковщиков. По ним система подскажет, во что паковать, и ТТН сразу
          будет с правильным размером — Новая Почта не будет перемерять.
        </p>
      </div>
      <BoxEditor />
      <Button variant="accent" className="self-stretch sm:self-start pointer-coarse:min-h-11" loading={done.isPending} onClick={() => done.mutate()}>
        Готово
      </Button>
    </section>
  );
}

function LinkButton({ icon, children, onClick }: { icon: ReactNode; children: ReactNode; onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" className="pointer-coarse:min-h-11" icon={icon} onClick={onClick}>
      {children}
    </Button>
  );
}

/** `extra` — что показать в строке ссылок рядом (например, счётчик неподтверждённых коробок). */
export function BoxesPanel({ extra }: { extra?: ReactNode }) {
  const q = useBoxesQuery();
  const [open, setOpen] = useState<"boxes" | "journal" | null>(null);
  if (q.data && !q.data.reviewed) return <Onboarding />;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <LinkButton icon={<Boxes className="h-4 w-4" />} onClick={() => setOpen("boxes")}>
        Коробки
      </LinkButton>
      <LinkButton icon={<BookOpen className="h-4 w-4" />} onClick={() => setOpen("journal")}>
        Журнал упаковки
      </LinkButton>
      {extra}
      {open === "boxes" && <BoxesModal onClose={() => setOpen(null)} />}
      {open === "journal" && <PackingJournalModal onClose={() => setOpen(null)} />}
    </div>
  );
}
