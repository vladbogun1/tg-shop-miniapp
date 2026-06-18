"use client";

/**
 * NotificationsModal (admin) — inbox of orders with unread customer messages.
 * Telegram-style rows (last message preview + time + unread badge). Click a row
 * → navigate to that order's chat and close. "Прочитать всё" marks everything read.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { adminApi, type ConversationDto } from "@/lib/api";
import { STATUS_EMOJI, STATUS_LABEL, timeAgo } from "@/lib/orders";
import { Modal } from "@/components/ui/Modal";
import { GlassButton } from "@/components/ui/GlassButton";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/lib/toast";

function senderPrefix(t?: string | null): string {
  if (t === "ADMIN") return "Вы: ";
  if (t === "SYSTEM") return "";
  return "";
}

export function NotificationsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { push } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "conversations"],
    queryFn: () => adminApi.conversations(),
    enabled: open,
    refetchInterval: open ? 15_000 : false,
  });

  const rows = data ?? [];

  function openChat(c: ConversationDto) {
    onClose();
    router.push(`/orders/${c.orderId}?tab=chat`);
  }

  async function readAll() {
    try {
      await adminApi.markAllRead();
      qc.invalidateQueries({ queryKey: ["admin", "unread-count"] });
      qc.invalidateQueries({ queryKey: ["admin", "conversations"] });
      qc.invalidateQueries({ queryKey: ["board"] });
      push("Все сообщения отмечены прочитанными", "ok");
      onClose();
    } catch {
      push("Не удалось отметить", "error");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Новые сообщения"
      footer={
        rows.length > 0 ? (
          <GlassButton variant="glass" size="sm" onClick={readAll} icon={<CheckCheck className="h-4 w-4" />}>
            Прочитать всё
          </GlassButton>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-[var(--r-md)]" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-[var(--text-faint)]">
          <MessageCircle className="h-8 w-8 opacity-50" />
          <span className="text-[14px]">Нет новых сообщений</span>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((c) => (
            <button
              key={c.orderId}
              onClick={() => openChat(c)}
              className="flex items-center gap-3 rounded-[var(--r-md)] bg-white/5 p-3 text-left transition-colors hover:bg-white/10"
            >
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-[18px]">
                {STATUS_EMOJI[c.status] ?? "📦"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[14px] font-semibold text-[var(--text)]">
                    {c.customerName || "Без имени"}
                  </span>
                  <span className="shrink-0 text-[11px] text-[var(--text-faint)]">
                    {c.lastAt ? timeAgo(c.lastAt) : ""}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] text-[var(--text-muted)]">
                    {senderPrefix(c.lastSenderType)}
                    {c.lastPreview || "—"}
                  </span>
                  {c.unreadCount > 0 && (
                    <span className="glossy flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none">
                      {c.unreadCount > 99 ? "99+" : c.unreadCount}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="font-mono text-[10px] text-[var(--text-faint)]">#{c.shortId}</span>
                  <Badge>{STATUS_LABEL[c.status]}</Badge>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
