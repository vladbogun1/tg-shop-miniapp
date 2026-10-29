"use client";

/** Очередь на поставку/товар: кто ждёт, сколько, в каком статусе; «убрать из очереди». */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BellOff, X } from "lucide-react";
import { ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/orders";
import { PREORDERS_KEY, SUB_STATUS_LABEL, SUB_STATUS_TONE, isLiveSub, lineTitle, preordersApi, sourceLabel, type Subscriber } from "@/lib/preorders";
import { useToast } from "@/lib/toast";
import { Badge } from "@/components/ui/Badge";
import { useConfirm } from "@/components/ui/ConfirmModal";

export function SubscribersList({ subs, showLine }: { subs: Subscriber[]; /** Показывать товар в строке (список по товару/поставке). */ showLine?: boolean }) {
  const qc = useQueryClient();
  const { push } = useToast();
  const [confirm, confirmUi] = useConfirm();

  const remove = useMutation({
    mutationFn: (id: number) => preordersApi.removeSubscriber(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PREORDERS_KEY });
      push("Убран из очереди", "ok");
    },
    onError: (e) => push(e instanceof ApiError ? e.message : "Не удалось убрать", "error"),
  });

  async function ask(s: Subscriber) {
    const ok = await confirm({
      title: "Убрать из очереди?",
      message: `${s.name || s.username || "Покупатель"} · ${s.qty} шт.${s.status === "HELD" ? " Забронированная штука уйдёт следующему в очереди." : ""}`,
      confirmLabel: "Убрать",
      danger: true,
    });
    if (ok) remove.mutate(s.id);
  }

  if (subs.length === 0) {
    return (
      <div className="card-2 flex items-center gap-2 p-3 text-[13px] text-[var(--text-faint)]">
        <BellOff className="h-4 w-4" /> Очередь пуста.
      </div>
    );
  }

  return (
    <>
      <div className="flex min-w-0 flex-col gap-1.5">
        {subs.map((s) => (
          <div key={s.id} className="card-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
            <span className="tabular w-7 shrink-0 text-[12px] text-[var(--text-faint)]">{s.position != null ? `#${s.position}` : "—"}</span>
            <div className="min-w-0 flex-1 basis-48">
              <div className="truncate text-[14px] font-semibold text-[var(--text)]">
                {s.name || "Без имени"}
                {s.username && <span className="ml-1.5 font-normal text-[var(--text-muted)]">@{s.username}</span>}
              </div>
              <div className="tabular truncate text-[12px] text-[var(--text-faint)]">
                {showLine && <>{lineTitle(s.productTitle, s.variantName)} · </>}
                встал {formatDateTime(s.createdAt)} · {sourceLabel(s.source)}
              </div>
            </div>
            <span className="tabular shrink-0 text-[13px] text-[var(--text)]">{s.qty} шт</span>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              <Badge tone={SUB_STATUS_TONE[s.status]} dot>
                {SUB_STATUS_LABEL[s.status]}
                {s.status === "HELD" && s.holdUntil ? ` до ${formatDateTime(s.holdUntil)}` : ""}
              </Badge>
              {s.botBlocked && <Badge tone="danger">бот заблокирован</Badge>}
            </div>
            {isLiveSub(s.status) && (
              <button
                type="button"
                aria-label="Убрать из очереди"
                onClick={() => ask(s)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-md)] text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--danger-ink)] pointer-coarse:h-11 pointer-coarse:w-11"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      {confirmUi}
    </>
  );
}
