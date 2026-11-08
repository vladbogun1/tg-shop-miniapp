"use client";

import { useConfirm } from "@shop/ui/confirm";
import { formatDateTime } from "@shop/core/time";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ActionMenu, type MenuItem } from "@/components/ui/ActionMenu";
import type { SupplyDraft } from "../../api-drafts";
import { useDeleteDraft } from "../../queries-drafts";
import { DraftStatusBadge } from "./DraftStatusBadge";

function subtitle(d: SupplyDraft): string {
  const doc = d.doc;
  const parts = [doc?.supplier, doc?.docNo && `документ ${doc.docNo}`, doc?.docDate, `начат ${formatDateTime(d.createdAt)}`];
  return parts.filter(Boolean).join(" · ");
}

/**
 * Шапка черновика: название, статус, главная кнопка (её даёт экран: «Принять», «Остановить», «Повторить») и «⋯»
 * с редким и опасным — «Удалить черновик» с подтверждением (то, что уже потрачено на ИИ, остаётся в журнале ИИ).
 */
export function DraftHeader({ draft, main, extra = [] }: { draft: SupplyDraft; main?: ReactNode; extra?: MenuItem[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const remove = useDeleteDraft(draft.id);
  const title = draft.title ?? `Черновик поставки #${draft.id}`;

  async function del() {
    const ok = await confirm({
      title: "Удалить черновик?",
      message: "Работа ИИ по этой накладной пропадёт; поставка и товары не создаются. Потраченное на ИИ останется в его журнале.",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (ok) remove.mutate(undefined, { onSuccess: () => router.push("/preorders?tab=drafts") });
  }

  const actions: MenuItem[] = [
    ...extra,
    ...(draft.status !== "ACCEPTED"
      ? [{ key: "delete", label: "Удалить черновик…", icon: <Trash2 className="h-4 w-4" />, danger: true, onSelect: () => void del() }]
      : []),
  ];
  return (
    <>
      {/* На телефоне PageHeader прячет заголовок (раздел показывает верхняя панель) — название черновика нужно здесь. */}
      <div className="mb-1 break-words font-display text-[20px] font-extrabold uppercase leading-tight text-[var(--ink)] lg:hidden">{title}</div>
      <PageHeader
        title={title}
        subtitle={subtitle(draft)}
        actions={
          <>
            {main}
            {actions.length > 0 && (
              <ActionMenu trigger="header" title={title} items={actions} label="Ещё действия" busy={remove.isPending} />
            )}
          </>
        }
      />
      <div className="mb-4 -mt-2">
        <DraftStatusBadge status={draft.status} />
      </div>
    </>
  );
}
