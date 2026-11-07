"use client";

/**
 * UserProfileDrawer (ChiSetup v3) — правая шторка профиля (на телефоне во весь экран): шапка с бейджами,
 * действия («Написать», «Открыть в Telegram»), сводка из четырёх ячеек и вкладки «Заказы» / «Данные».
 * Заказы — GET /api/admin/orders/by-user/{tgId}.
 *
 * Развязка: клик по заказу вызывает `onOpenOrder` — страница открывает OrderDrawer ПОВЕРХ профиля,
 * закрытие заказа возвращает сюда (раньше уходило на `/orders/{id}`, и список терял поиск и страницу).
 * Без `onOpenOrder` — переход на этот роут. «Написать» — `onWrite` от страницы (поддержка не импортируется
 * из клиентов: был бы цикл); у заблокировавшего бота кнопка неактивна.
 */
import { Ban, Crown, Send, PenSquare } from "lucide-react";
import { useState } from "react";
import { Button } from "@shop/ui/admin-button";
import { Drawer } from "@shop/ui/overlay";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { money } from "@/lib/money";
import { formatDate, timeAgo } from "@shop/core/time";
import { avgCheckMinor, displayName, initials, telegramHref } from "../../model/user";
import type { UserCardDto } from "../../model/types";
import { ProfileData } from "./ProfileData";
import { ProfileOrders } from "./ProfileOrders";

interface Props {
  user: UserCardDto | null;
  onClose: () => void;
  /** Open an order over the profile (the users page renders the OrderDrawer). */
  onOpenOrder?: (orderId: string) => void;
  /** «Написать»: открыть окно нового вопроса поддержки для этого покупателя. */
  onWrite?: (user: UserCardDto) => void;
}

type Tab = "orders" | "data";

function Header({ user }: { user: UserCardDto }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="accent-tint font-display grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-md)] text-[14px] font-bold">
        {initials(user)}
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-display truncate text-[17px] font-bold leading-tight text-[var(--ink)]">{displayName(user)}</span>
          {user.premium && (
            <Badge tone="warn" className="shrink-0">
              <Crown className="h-3 w-3" /> premium
            </Badge>
          )}
          {user.botBlocked && (
            <Badge tone="danger" className="shrink-0">
              <Ban className="h-3 w-3" /> заблокировал бота
            </Badge>
          )}
        </div>
        <div className="mt-0.5 truncate text-[12px] text-[var(--text-faint)]">
          {user.username ? "@" + user.username + " · " : ""}#{user.telegramUserId}
        </div>
      </div>
    </div>
  );
}

function Cell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card min-w-0 p-3">
      <div className="field-label !text-[10.5px]">{label}</div>
      <div className="kpi-num mt-1.5 truncate text-[20px]">{value}</div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-[var(--text-faint)]">{sub}</div>}
    </div>
  );
}

function Summary({ user }: { user: UserCardDto }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <Cell label="Заказов" value={String(user.ordersCount)} />
      <Cell label="Потрачено" value={money(user.totalSpentMinor)} />
      <Cell label="Средний чек" value={user.ordersCount > 0 ? money(avgCheckMinor(user)) : "—"} />
      <Cell
        label="Регистрация"
        value={user.createdAt ? formatDate(user.createdAt) : "—"}
        sub={user.lastSeenAt ? `был(а) ${timeAgo(user.lastSeenAt)}` : undefined}
      />
    </div>
  );
}

function Actions({ user, onWrite }: { user: UserCardDto; onWrite?: (u: UserCardDto) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {onWrite && (
          <Button
            variant="accent"
            icon={<PenSquare className="h-4 w-4" />}
            disabled={user.botBlocked}
            onClick={() => onWrite(user)}
            className="max-sm:flex-1"
          >
            Написать
          </Button>
        )}
        <a
          href={telegramHref(user)}
          target="_blank"
          rel="noreferrer"
          className="focusable nb-press font-display inline-flex h-10 items-center gap-2 rounded-[var(--r-md)] border border-[var(--border-2)] bg-[var(--surface-2)] px-4 text-[12.5px] font-bold uppercase tracking-[0.06em] text-[var(--text)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)] pointer-coarse:h-11 max-sm:flex-1 max-sm:justify-center"
        >
          <Send className="h-4 w-4 text-[var(--accent)]" />
          Открыть в Telegram
        </a>
      </div>
      {user.botBlocked && onWrite && (
        <p className="text-[12px] text-[var(--danger-ink)]">Клиент заблокировал бота — сообщение не дойдёт.</p>
      )}
    </div>
  );
}

function Body({ user, onOpenOrder, onWrite }: Omit<Props, "onClose"> & { user: UserCardDto }) {
  const [tab, setTab] = useState<Tab>("orders");
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      <Actions user={user} onWrite={onWrite} />
      <Summary user={user} />
      <Tabs<Tab>
        items={[
          { value: "orders", label: "Заказы", count: user.ordersCount || undefined },
          { value: "data", label: "Данные" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "orders" ? <ProfileOrders telegramUserId={user.telegramUserId} onOpenOrder={onOpenOrder} /> : <ProfileData user={user} />}
    </div>
  );
}

export function UserProfileDrawer({ user, onClose, onOpenOrder, onWrite }: Props) {
  return (
    <Drawer open={!!user} onClose={onClose} header={user ? <Header user={user} /> : null} width="max-w-2xl">
      {/* key: другой покупатель — снова вкладка «Заказы». */}
      {user && <Body key={user.telegramUserId} user={user} onOpenOrder={onOpenOrder} onWrite={onWrite} />}
    </Drawer>
  );
}
