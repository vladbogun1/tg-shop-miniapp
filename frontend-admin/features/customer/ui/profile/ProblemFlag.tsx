"use client";

/**
 * Метка «проблемный покупатель» в профиле: причина видна всем админам в заказе, профиле и карточке в Telegram,
 * а сам покупатель может оформить только полную оплату онлайн (предоплата + наложка ему не показывается,
 * сервер её тоже не примет). Здесь — поставить, сменить причину, снять.
 */
import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@shop/ui/admin-button";
import { useConfirm } from "@shop/ui/confirm";
import { useApiMutation } from "@shop/ui/mutation";
import { Textarea } from "@/components/ui/Textarea";
import { customerApi } from "../../api";

const MAX_REASON = 500;

interface Props {
  telegramUserId: number;
  reason: string | null;
  /** Новая причина или null, когда метку сняли. */
  onChanged: (reason: string | null) => void;
}

const BOX =
  "rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] p-3";

function Editor({ initial, saving, onSave, onCancel }: {
  initial: string;
  saving: boolean;
  onSave: (reason: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const trimmed = text.trim();
  return (
    <div className={`${BOX} flex flex-col gap-2`}>
      <Textarea
        label="Чем проблемный (видят все админы)"
        value={text}
        maxLength={MAX_REASON}
        rows={3}
        autoFocus
        placeholder="Например: не оплатил предоплату, отправили наложкой и не забрал"
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="danger" size="sm" loading={saving} disabled={!trimmed} onClick={() => onSave(trimmed)}>
          Сохранить метку
        </Button>
        <Button variant="ghost" size="sm" disabled={saving} onClick={onCancel}>
          Отмена
        </Button>
        <span className="ml-auto text-[11px] text-[var(--text-faint)]">{text.length}/{MAX_REASON}</span>
      </div>
    </div>
  );
}

export function ProblemFlag({ telegramUserId, reason, onChanged }: Props) {
  const [editing, setEditing] = useState(false);
  const confirm = useConfirm();
  const save = useApiMutation({
    mutationFn: (r: string) => customerApi.flag(telegramUserId, r),
    invalidate: [["users-table"]],
    errorFallback: "Не удалось сохранить метку",
    success: reason ? "Причина обновлена" : "Покупатель помечен проблемным",
    onSuccess: (f) => {
      setEditing(false);
      onChanged(f.reason);
    },
  });
  const clear = useApiMutation({
    mutationFn: () => customerApi.unflag(telegramUserId),
    invalidate: [["users-table"]],
    errorFallback: "Не удалось снять метку",
    success: "Метка снята",
    onSuccess: () => onChanged(null),
  });

  async function unflag() {
    const ok = await confirm({
      title: "Снять метку «проблемный покупатель»?",
      message: "Покупателю снова станет доступна предоплата с наложенным платежом.",
      confirmLabel: "Снять",
      danger: true,
    });
    if (ok) clear.mutate();
  }

  if (editing) {
    return <Editor initial={reason ?? ""} saving={save.isPending} onSave={(r) => save.mutate(r)} onCancel={() => setEditing(false)} />;
  }
  if (!reason) {
    return (
      <div>
        <Button variant="ghost" size="sm" icon={<ShieldAlert className="h-4 w-4" />} onClick={() => setEditing(true)}>
          Пометить проблемным
        </Button>
      </div>
    );
  }
  return (
    <div className={`${BOX} flex flex-col gap-2`}>
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
        <div className="min-w-0">
          <div className="text-[12.5px] font-bold text-[var(--danger-ink)]">Проблемный покупатель</div>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-[var(--text)]">{reason}</p>
          <p className="mt-1 text-[11.5px] text-[var(--text-muted)]">Может оформить только полную оплату онлайн, наложкой не отправлять.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="surface" size="sm" onClick={() => setEditing(true)}>
          Изменить причину
        </Button>
        <Button variant="ghost" size="sm" loading={clear.isPending} onClick={unflag}>
          Снять метку
        </Button>
      </div>
    </div>
  );
}
