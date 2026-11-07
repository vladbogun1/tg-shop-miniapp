"use client";

/** Итог массового «Показать»: что выложено и что нет (с причиной); принудительный показ — отдельным подтверждением. */
import { Rocket, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@shop/ui/admin-button";
import { Modal } from "@shop/ui/overlay";
import { cardsWizardHref } from "@/features/cards";
import type { AdminProduct } from "../../model/types";
import type { PublishReport } from "./use-bulk-actions";

function Group({ title, items }: { title: string; items: { p: AdminProduct; why?: string }[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-1 text-[13px] font-semibold text-[var(--text)]">{title}</p>
      <ul className="flex max-h-40 flex-col gap-0.5 overflow-y-auto text-[13px] text-[var(--text-muted)]">
        {items.map(({ p, why }) => (
          <li key={p.id} className="truncate">
            {p.title}
            {why ? <span className="text-[var(--text-faint)]"> — {why}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BulkPublishReport({ report, busy, onForce, onClose }: { report: PublishReport | null; busy: boolean; onForce: (l: AdminProduct[]) => void; onClose: () => void }) {
  const router = useRouter();
  const r = report;
  return (
    <Modal
      open={!!r}
      onClose={onClose}
      size="md"
      title={r ? `На витрине: ${r.shown}, не опубликовано: ${r.notReady.length + r.blocked.length + r.failed.length}` : ""}
      footer={
        r && (
          <>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Закрыть
            </Button>
            {r.notReady.length > 0 && (
              <>
                <Button variant="surface" loading={busy} icon={<Rocket className="h-4 w-4" />} onClick={() => onForce(r.notReady)} title="Карточки останутся черновиками: покупатель увидит пустые характеристики">
                  Выложить без оформления ({r.notReady.length})
                </Button>
                <Button variant="accent" disabled={busy} icon={<Wand2 className="h-4 w-4" />} onClick={() => router.push(cardsWizardHref(r.notReady.map((p) => p.id)))}>
                  Оформить с ИИ ({r.notReady.length})
                </Button>
              </>
            )}
          </>
        )
      }
    >
      {r && (
        <div className="flex flex-col gap-3">
          <Group title="Карточка не оформлена" items={r.notReady.map((p) => ({ p }))} />
          <Group title="Нельзя выложить" items={r.blocked} />
          <Group title="Ошибка" items={r.failed} />
          <p className="text-[12.5px] text-[var(--text-faint)]">Остальные выложены. Незаполненное дополните в товаре и включите «На витрине» снова.</p>
        </div>
      )}
    </Modal>
  );
}
