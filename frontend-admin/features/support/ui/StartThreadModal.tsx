"use client";

/**
 * «Написать клиенту»: админ открывает вопрос первым (победитель розыгрыша, вопрос по посылке).
 * Покупатель получает обычное сообщение бота с кнопкой в чат; ответ придёт в «Поддержку».
 * POST /api/admin/support/threads — id покупателя = его Telegram id.
 *
 * Клиента можно подставить из профиля (`initialUser`), найти по имени/@username/ID или ввести Telegram id
 * руками. Если у клиента уже есть открытый вопрос (по загруженному списку), предупреждаем и даём открыть его.
 */
import { Send, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@shop/ui/admin-button";
import { Modal } from "@shop/ui/overlay";
import { customerApi, displayName, type UserCardDto } from "@/features/customer";
import { Autocomplete } from "@/components/ui/Autocomplete";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { manualIdProblem, openThreadOf, parseStartThread } from "../model/start-thread";
import type { SupportThread } from "../model/types";
import { useStartSupportThread, useSupportThreads } from "../queries";

interface Props {
  open: boolean;
  onClose: () => void;
  onStarted: (thread: SupportThread) => void;
  /** Клиент, подставленный из профиля. */
  initialUser?: UserCardDto | null;
}

const searchUsers = (q: string) => customerApi.users({ q, size: 8 });

const userSub = (u: UserCardDto) =>
  (u.username ? "@" + u.username + " · " : "") + "#" + u.telegramUserId + (u.ordersCount ? " · " + u.ordersCount + " зак." : "");

export function StartThreadModal({ open, onClose, onStarted, initialUser = null }: Props) {
  // Окно монтируется один раз; подставленный клиент задаётся ключом при открытии (см. ниже).
  return (
    <Modal open={open} onClose={onClose} title="Написать клиенту" size="sm" footer={null}>
      {open && <StartForm key={initialUser?.telegramUserId ?? "new"} onClose={onClose} onStarted={onStarted} initialUser={initialUser} />}
    </Modal>
  );
}

function StartForm({ onClose, onStarted, initialUser }: Omit<Props, "open">) {
  const [picked, setPicked] = useState<UserCardDto | null>(initialUser ?? null);
  const [manualId, setManualId] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const start = useStartSupportThread(onStarted);
  const { data: openThreads } = useSupportThreads("open", "");

  const userId = picked ? String(picked.telegramUserId) : manualId;
  const body = parseStartThread(userId, subject, text);
  const idProblem = picked ? null : manualIdProblem(manualId);
  const existing = openThreadOf(openThreads ?? [], body?.userId ?? null);
  const blocked = !!picked?.botBlocked;

  return (
    <div className="flex flex-col gap-3">
      {picked ? (
        <div className="flex items-center gap-3 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold text-[var(--text)]">{displayName(picked)}</div>
            <div className="truncate text-[12px] text-[var(--text-faint)]">{userSub(picked)}</div>
          </div>
          <button
            type="button"
            aria-label="Выбрать другого клиента"
            onClick={() => setPicked(null)}
            className="focusable hit grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--text-faint)] hover:text-[var(--text)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <Autocomplete<UserCardDto>
            label="Клиент"
            placeholder="Имя, @username или ID"
            selectedLabel={null}
            fetchItems={searchUsers}
            itemLabel={displayName}
            itemSubLabel={userSub}
            itemKey={(u) => String(u.telegramUserId)}
            onSelect={(u) => {
              setPicked(u);
              setManualId("");
            }}
          />
          <Input
            label="или Telegram id клиента"
            inputMode="numeric"
            value={manualId}
            error={idProblem ?? undefined}
            onChange={(e) => setManualId(e.target.value)}
            hint="Его можно скопировать в карточке покупателя."
          />
        </>
      )}

      {blocked && <p className="text-[12.5px] font-semibold text-[var(--danger-ink)]">Клиент заблокировал бота — сообщение не дойдёт.</p>}

      {existing && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--warn)_45%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] px-3 py-2 text-[12.5px] text-[var(--text)]">
          <span>У клиента уже есть открытый вопрос — возможно, лучше ответить в нём.</span>
          <Button size="sm" variant="surface" onClick={() => onStarted(existing)}>
            Открыть
          </Button>
        </div>
      )}

      <Input label="Тема (необязательно)" value={subject} maxLength={255} onChange={(e) => setSubject(e.target.value)} />
      <Textarea
        label="Сообщение"
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        hint="Клиент получит сообщение от бота с кнопкой в чат."
      />

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onClose}>
          Отмена
        </Button>
        <Button
          variant="accent"
          loading={start.isPending}
          disabled={!body || blocked}
          icon={<Send className="h-4 w-4" />}
          onClick={() => body && start.mutate(body)}
        >
          Отправить
        </Button>
      </div>
    </div>
  );
}
