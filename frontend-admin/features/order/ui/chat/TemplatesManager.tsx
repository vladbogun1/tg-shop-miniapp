"use client";

/** CRUD над всеми шаблонами ответов. */
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";
import { QueryState } from "@/components/ui/QueryState";
import { useConfirm } from "@shop/ui/confirm";
import type { ReplyTemplate, ReplyTemplateWrite } from "../../api";
import { useDeleteTemplateMutation, useReplyTemplatesQuery, useSaveTemplateMutation } from "../../queries/templates";
import { TemplateEditor } from "./TemplateEditor";

export function TemplatesManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState<ReplyTemplate | "new" | null>(null);
  const q = useReplyTemplatesQuery(open);
  const saveM = useSaveTemplateMutation(editing === "new" ? null : editing, () => setEditing(null));
  const deleteM = useDeleteTemplateMutation();

  function save(body: ReplyTemplateWrite) {
    if (editing) saveM.mutate(body);
  }

  async function remove(t: ReplyTemplate) {
    const ok = await confirm({
      title: "Удалить шаблон?",
      message: `«${t.title}» исчезнет из списка ⚡.`,
      confirmLabel: "Удалить",
      danger: true,
    });
    if (ok) deleteM.mutate(t);
  }

  return (
    <>
      <Modal
        open={open && editing === null}
        onClose={onClose}
        title="Шаблоны ответов"
        size="lg"
        footer={
          <>
            <ModalCancel>Готово</ModalCancel>
            <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>
              Новый шаблон
            </Button>
          </>
        }
      >
        <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch}>
          <div className="flex flex-col gap-2">
            {(q.data ?? []).map((t) => (
              <div key={t.id} className="card-2 flex items-start gap-2 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold text-[var(--text)]">{t.title}</div>
                  <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-[12px] text-[var(--text-muted)]">{t.bodyRu}</p>
                  <div className="font-display mt-1.5 flex gap-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--text-faint)]">
                    <span>рус ✓</span>
                    <span
                      className={cn(!t.bodyUk && "line-through opacity-60", t.ukStale && "text-[var(--warn,#F59E0B)]")}
                      title={t.ukStale ? "Перевод устарел" : t.bodyUk ? undefined : "Нет перевода"}
                    >
                      укр
                    </span>
                    <span
                      className={cn(!t.bodyEn && "line-through opacity-60", t.enStale && "text-[var(--warn,#F59E0B)]")}
                      title={t.enStale ? "Перевод устарел" : t.bodyEn ? undefined : "Нет перевода"}
                    >
                      eng
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Изменить"
                  onClick={() => setEditing(t)}
                  className="nb-press grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-sm)] border border-[var(--border-2)] bg-[var(--surface-3)] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)]"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Удалить"
                  onClick={() => remove(t)}
                  className="nb-press grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-sm)] border border-[var(--border-2)] bg-[var(--surface-3)] text-[var(--text-muted)] transition-colors hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] hover:text-[var(--danger-ink)]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </QueryState>
      </Modal>
      <TemplateEditor
        open={open && editing !== null}
        template={editing === "new" ? null : editing}
        saving={saveM.isPending}
        onClose={() => setEditing(null)}
        onSave={save}
      />
    </>
  );
}
