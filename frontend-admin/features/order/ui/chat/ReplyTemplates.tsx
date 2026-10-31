"use client";

/**
 * Chat reply templates (⚡): pick one filled in for this order in the customer's language, or
 * manage the list (create / edit / delete, texts in ru / uk / en).
 */
import { useState } from "react";
import { Settings2, Zap } from "lucide-react";
import { Modal } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";
import { QueryState } from "@/components/ui/QueryState";
import { useRenderedTemplatesQuery } from "../../queries/templates";
import { LOCALE_LABEL } from "./template-meta";
import { TemplatesManager } from "./TemplatesManager";

/** ⚡ — list of templates rendered for this order; choosing one hands its text to the chat input. */
export function TemplatePicker({
  open,
  orderId,
  onClose,
  onPick,
}: {
  open: boolean;
  orderId: string;
  onClose: () => void;
  onPick: (text: string) => void;
}) {
  const [manage, setManage] = useState(false);
  const q = useRenderedTemplatesQuery(orderId, open);

  return (
    <>
      <Modal
        open={open && !manage}
        onClose={onClose}
        title={
          <span className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-[var(--accent-hi)]" /> Шаблоны ответов
          </span>
        }
        footer={
          <Button variant="ghost" icon={<Settings2 className="h-4 w-4" />} onClick={() => setManage(true)}>
            Управлять шаблонами
          </Button>
        }
      >
        <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch}>
          {(q.data ?? []).length === 0 ? (
            <p className="text-[13px] text-[var(--text-muted)]">Шаблонов пока нет — добавьте в «Управлять шаблонами».</p>
          ) : (
            <div className="flex flex-col gap-2">
              {q.data!.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    onPick(t.text);
                    onClose();
                  }}
                  className="card-2 nb-press px-3.5 py-3 text-left transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[13.5px] font-semibold text-[var(--text)]">{t.title}</span>
                    <span className="chip-tint shrink-0 !bg-[var(--surface-3)] !px-2 !text-[10px]">
                      {LOCALE_LABEL[t.locale] ?? t.locale}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[12.5px] text-[var(--text-muted)]">{t.text}</p>
                </button>
              ))}
              <p className="text-[11px] text-[var(--text-faint)]">
                Текст подставится в поле ввода на языке клиента — его можно поправить перед отправкой.
              </p>
            </div>
          )}
        </QueryState>
      </Modal>
      <TemplatesManager open={open && manage} onClose={() => setManage(false)} />
    </>
  );
}
