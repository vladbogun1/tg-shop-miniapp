"use client";

/**
 * «Админы» (route "/admins") — only for the main admin (SUPER_ADMIN): who has access to the panel,
 * invitations, and what can be done to another admin. Hidden from the menu for everyone else; the
 * backend answers 403 there anyway (/api/admin/admins/**, role read from the database).
 *
 *  - list: name, login, role (Главный / Админ / Приглашён / Заблокирован), 2FA, last sign-in (time,
 *    city), trusted devices, created. Desktop: table; phone: cards;
 *  - «Пригласить админа»: a shop user (search by name / @username / id) or a typed Telegram id →
 *    the bot sends a link; when it cannot, the link is shown here with «Копировать»;
 *  - «⋯»: name / role, reset 2FA, reset password, forget devices, block / unblock, delete; open
 *    links: send again / revoke. Dangerous ones ask for the main admin's own code.
 * Your own account is not managed here — that is «Мой аккаунт».
 */
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import {
  Ban,
  Check,
  Copy,
  KeyRound,
  Laptop,
  LockOpen,
  MailPlus,
  MoreHorizontal,
  Pencil,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Trash2,
  TriangleAlert,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useIsSuperAdmin } from "@/components/layout/Shell";
import { CodeInput } from "@/components/auth/CodeInput";
import { ActionSheet, type SheetAction } from "@/components/orders/ActionSheet";
import { copyText } from "@/components/orders/CopyButton";
import { Autocomplete } from "@/components/ui/Autocomplete";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { QueryState } from "@/components/ui/QueryState";
import { Select } from "@/components/ui/Select";
import { CenterSpinner } from "@/components/ui/Spinner";
import {
  adminApi,
  ApiError,
  inviteUrl,
  teamApi,
  type AdminRoleCode,
  type InviteCreated,
  type TeamAdmin,
  type TeamInvite,
  type UserCardDto,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/orders";
import { useToast } from "@/lib/toast";
import { useIsDesktop } from "@/lib/use-media";

const TEAM_KEY = ["admin", "team"] as const;

const ROLE_OPTIONS: { value: AdminRoleCode; label: string }[] = [
  { value: "ADMIN", label: "Админ — всё, кроме управления админами" },
  { value: "SUPER_ADMIN", label: "Главный — ещё и управление админами" },
];

export default function AdminsPage() {
  const superAdmin = useIsSuperAdmin();
  if (superAdmin === undefined) return <CenterSpinner label="Загрузка…" />;
  if (!superAdmin) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Только для главного админа"
        description="Управлять админами может только главный админ. Свой пароль и 2FA — в «Мой аккаунт»."
      />
    );
  }
  return <Team />;
}

// ============================================================================ list

type Row = { type: "admin"; admin: TeamAdmin } | { type: "invite"; invite: TeamInvite };

function Team() {
  const teamQ = useQuery({ queryKey: TEAM_KEY, queryFn: teamApi.list });
  const qc = useQueryClient();
  const refresh = useCallback(() => void qc.invalidateQueries({ queryKey: TEAM_KEY }), [qc]);
  const [inviting, setInviting] = useState<{ telegramUserId?: number } | null>(null);
  const [link, setLink] = useState<{ created: InviteCreated; who: string } | null>(null);
  const actions = useAdminActions(refresh, (created, who) => setLink({ created, who }), (id) => setInviting({ telegramUserId: id }));

  const rows: Row[] = useMemo(() => {
    const t = teamQ.data;
    if (!t) return [];
    return [
      ...t.admins.filter((a) => a.active).map((a) => ({ type: "admin" as const, admin: a })),
      ...t.invites.map((i) => ({ type: "invite" as const, invite: i })),
      ...t.admins.filter((a) => !a.active).map((a) => ({ type: "admin" as const, admin: a })),
    ];
  }, [teamQ.data]);

  return (
    <div className="min-w-0">
      <PageHeader
        title="Админы"
        subtitle="Кто входит в админку. Приглашения, сброс 2FA и пароля, блокировка. Свою учётку — в «Мой аккаунт»."
        actions={
          <Button variant="accent" icon={<UserPlus className="h-4 w-4" />} onClick={() => setInviting({})}>
            Пригласить админа
          </Button>
        }
      />
      <QueryState isLoading={teamQ.isLoading} isError={teamQ.isError} error={teamQ.error} refetch={teamQ.refetch} loadingLabel="Загружаем админов">
        {rows.length === 0 ? (
          <EmptyState icon={UsersRound} title="Админов нет" />
        ) : (
          <>
            <div className="card thin-scroll hidden overflow-x-auto p-0 md:block">
              <table className="data-table min-w-[860px]">
                <thead>
                  <tr>
                    <th>Админ</th>
                    <th>Роль</th>
                    <th>2FA</th>
                    <th>Последний вход</th>
                    <th>Устройства</th>
                    <th>Создан</th>
                    <th className="w-12" aria-label="Действия" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) =>
                    r.type === "admin" ? (
                      <tr key={`a${r.admin.telegramUserId}`} data-admin={r.admin.telegramUserId} className={cn(!r.admin.active && "opacity-70")}>
                        <td>
                          <Who admin={r.admin} />
                        </td>
                        <td>
                          <StatusBadges admin={r.admin} />
                        </td>
                        <td>
                          <TwoFa on={r.admin.totpEnabled} />
                        </td>
                        <td>
                          <LastLogin admin={r.admin} />
                        </td>
                        <td className="tabular">{r.admin.trustedDevices}</td>
                        <td className="tabular whitespace-nowrap text-[var(--text-muted)]">
                          {r.admin.createdAt ? formatDateTime(r.admin.createdAt) : "—"}
                        </td>
                        <td>
                          <RowMenu row={r} actions={actions} />
                        </td>
                      </tr>
                    ) : (
                      <tr key={`i${r.invite.id}`} data-invite={r.invite.telegramUserId}>
                        <td>
                          <InviteWho invite={r.invite} />
                        </td>
                        <td>
                          <InviteBadge invite={r.invite} />
                        </td>
                        <td className="text-[var(--text-faint)]">—</td>
                        <td className="text-[var(--text-faint)]">ещё не входил</td>
                        <td className="text-[var(--text-faint)]">—</td>
                        <td className="tabular whitespace-nowrap text-[var(--text-muted)]">{formatDateTime(r.invite.createdAt)}</td>
                        <td>
                          <RowMenu row={r} actions={actions} />
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-2.5 md:hidden">
              {rows.map((r) =>
                r.type === "admin" ? (
                  <div key={`a${r.admin.telegramUserId}`} data-admin={r.admin.telegramUserId} className={cn("card p-3.5", !r.admin.active && "opacity-75")}>
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <Who admin={r.admin} />
                      </div>
                      <RowMenu row={r} actions={actions} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <StatusBadges admin={r.admin} />
                      <TwoFa on={r.admin.totpEnabled} />
                    </div>
                    <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12.5px]">
                      <dt className="text-[var(--text-faint)]">Последний вход</dt>
                      <dd className="min-w-0 text-right">
                        <LastLogin admin={r.admin} compact />
                      </dd>
                      <dt className="text-[var(--text-faint)]">Устройства</dt>
                      <dd className="tabular text-right">{r.admin.trustedDevices}</dd>
                      <dt className="text-[var(--text-faint)]">Создан</dt>
                      <dd className="tabular text-right text-[var(--text-muted)]">
                        {r.admin.createdAt ? formatDateTime(r.admin.createdAt) : "—"}
                      </dd>
                    </dl>
                  </div>
                ) : (
                  <div key={`i${r.invite.id}`} data-invite={r.invite.telegramUserId} className="card border-dashed p-3.5">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <InviteWho invite={r.invite} />
                      </div>
                      <RowMenu row={r} actions={actions} />
                    </div>
                    <div className="mt-2">
                      <InviteBadge invite={r.invite} />
                    </div>
                  </div>
                )
              )}
            </div>
          </>
        )}
      </QueryState>

      {inviting && (
        <InviteModal
          initialTelegramId={inviting.telegramUserId}
          admins={teamQ.data?.admins ?? []}
          onClose={() => setInviting(null)}
          onCreated={(created, who) => {
            setInviting(null);
            refresh();
            if (!created.delivered) setLink({ created, who });
          }}
        />
      )}
      {link && <LinkModal created={link.created} who={link.who} onClose={() => setLink(null)} />}
      {actions.ui}
    </div>
  );
}

function adminName(a: TeamAdmin): string {
  return a.name?.trim() || a.username || `tg ${a.telegramUserId}`;
}

function Who({ admin }: { admin: TeamAdmin }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="truncate text-[14px] font-semibold text-[var(--text)]">{adminName(admin)}</span>
        {admin.self && <Badge tone="info">Это вы</Badge>}
      </div>
      <div className="mt-0.5 truncate text-[12.5px] text-[var(--text-muted)]">
        {admin.username ? <span className="font-mono">{admin.username}</span> : <span className="text-[var(--text-faint)]">без логина · вход через Telegram</span>}
      </div>
      <div className="truncate text-[11.5px] text-[var(--text-faint)]">
        tg {admin.telegramUserId}
        {admin.telegramLabel ? ` · ${admin.telegramLabel}` : ""}
      </div>
    </div>
  );
}

function InviteWho({ invite }: { invite: TeamInvite }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[14px] font-semibold text-[var(--text)]">{invite.name || `tg ${invite.telegramUserId}`}</div>
      <div className="truncate text-[11.5px] text-[var(--text-faint)]">
        tg {invite.telegramUserId}
        {invite.telegramLabel ? ` · ${invite.telegramLabel}` : ""}
        {invite.invitedByName ? ` · пригласил ${invite.invitedByName}` : ""}
      </div>
    </div>
  );
}

function StatusBadges({ admin }: { admin: TeamAdmin }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {admin.status === "BLOCKED" ? (
        <Badge tone="danger" dot>
          Заблокирован
        </Badge>
      ) : admin.status === "SUPER_ADMIN" ? (
        <Badge tone="accent">Главный</Badge>
      ) : (
        <Badge>Админ</Badge>
      )}
      {admin.invite && (
        <Badge tone="info" className="whitespace-nowrap">
          {admin.invite.kind === "PASSWORD_RESET" ? "Сброс пароля" : "Приглашён"} до {formatDateTime(admin.invite.expiresAt)}
        </Badge>
      )}
      {admin.lockedUntil && <Badge tone="warn">Вход закрыт до {formatDateTime(admin.lockedUntil)}</Badge>}
    </span>
  );
}

function InviteBadge({ invite }: { invite: TeamInvite }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge tone="info" dot className="whitespace-nowrap">
        Приглашён до {formatDateTime(invite.expiresAt)}
      </Badge>
      <Badge>{invite.role === "SUPER_ADMIN" ? "Главный" : "Админ"}</Badge>
      {!invite.delivered && <Badge tone="warn">бот не доставил</Badge>}
    </span>
  );
}

function TwoFa({ on }: { on: boolean }) {
  return on ? (
    <Badge tone="ok">
      <ShieldCheck className="h-3 w-3" /> 2FA
    </Badge>
  ) : (
    <Badge tone="warn">
      <ShieldOff className="h-3 w-3" /> Без 2FA
    </Badge>
  );
}

function LastLogin({ admin, compact = false }: { admin: TeamAdmin; compact?: boolean }) {
  const l = admin.lastLogin;
  if (!l) return <span className="text-[var(--text-faint)]">не входил</span>;
  const place = l.city || l.country || "место неизвестно";
  return (
    <span className={cn("inline-flex flex-col", compact && "items-end")}>
      <span className="tabular whitespace-nowrap text-[var(--text)]">{formatDateTime(l.at)}</span>
      <span className="truncate text-[11.5px] text-[var(--text-faint)]">{place}</span>
    </span>
  );
}

// ============================================================================ «⋯» menu

interface MenuItem {
  key: string;
  label: string;
  icon: ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

function RowMenu({ row, actions }: { row: Row; actions: AdminActions }) {
  const desktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const items = actions.itemsFor(row);
  const title = row.type === "admin" ? adminName(row.admin) : row.invite.name || `tg ${row.invite.telegramUserId}`;

  if (row.type === "admin" && row.admin.self) {
    return (
      <Link href="/account" className="hit whitespace-nowrap text-[12px] font-semibold text-[var(--accent-hi)] hover:underline">
        Мой аккаунт
      </Link>
    );
  }
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={`Действия: ${title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="nb-press focusable grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--border-2)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] pointer-coarse:h-11 pointer-coarse:w-11"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {desktop ? (
        open && <Popover anchor={btn} items={items} onClose={() => setOpen(false)} />
      ) : (
        <ActionSheet
          open={open}
          title={title}
          onClose={() => setOpen(false)}
          actions={items.map<SheetAction>((i) => ({ key: i.key, label: i.label, icon: i.icon, danger: i.danger, onSelect: i.onSelect }))}
        />
      )}
    </>
  );
}

/** Desktop dropdown in a portal (the table scrolls horizontally and would clip it). */
function Popover({ anchor, items, onClose }: { anchor: React.RefObject<HTMLButtonElement | null>; items: MenuItem[]; onClose: () => void }) {
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    const width = 248;
    const height = items.length * 40 + 10;
    const below = r.bottom + 6 + height < window.innerHeight;
    setPos({ top: below ? r.bottom + 6 : Math.max(8, r.top - 6 - height), left: Math.max(8, r.right - width) });
  }, [anchor, items.length]);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // Opening may itself scroll the table into place: only a later scroll closes the menu.
    const openedAt = performance.now();
    const scroll = () => performance.now() - openedAt > 250 && onClose();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [anchor, onClose]);

  if (!pos) return null;
  return createPortal(
    <div
      ref={menu}
      role="menu"
      className="elevated fixed z-[150] w-[248px] overflow-hidden p-1"
      style={{ top: pos.top, left: pos.left }}
    >
      {items.map((i) => (
        <button
          key={i.key}
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            i.onSelect();
          }}
          className={cn(
            "flex h-10 w-full items-center gap-2.5 rounded-[var(--r-sm)] px-3 text-left text-[13.5px] font-medium transition-colors hover:bg-[var(--surface-hover)]",
            i.danger ? "text-[var(--danger-ink)]" : "text-[var(--text)]"
          )}
        >
          <span className="shrink-0 opacity-80">{i.icon}</span>
          {i.label}
        </button>
      ))}
    </div>,
    document.body
  );
}

// ============================================================================ actions

interface AdminActions {
  itemsFor: (row: Row) => MenuItem[];
  ui: ReactNode;
}

interface CodeAsk {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  run: (code: string) => Promise<void>;
}

function useAdminActions(
  refresh: () => void,
  showLink: (created: InviteCreated, who: string) => void,
  inviteExisting: (telegramUserId: number) => void
): AdminActions {
  const { push } = useToast();
  const [confirm, confirmUi] = useConfirm();
  const [ask, setAsk] = useState<CodeAsk | null>(null);
  const [editing, setEditing] = useState<TeamAdmin | null>(null);

  const fail = useCallback((e: unknown, fallback: string) => push(e instanceof ApiError ? e.message : fallback, "error"), [push]);

  const linkResult = useCallback(
    (created: InviteCreated, who: string, sentMsg: string) => {
      if (created.delivered) push(sentMsg, "ok");
      else showLink(created, who);
    },
    [push, showLink]
  );

  const itemsFor = useCallback(
    (row: Row): MenuItem[] => {
      if (row.type === "invite") {
        const inv = row.invite;
        const who = inv.name || `tg ${inv.telegramUserId}`;
        return [
          {
            key: "resend",
            label: "Отправить заново",
            icon: <Send className="h-4 w-4" />,
            onSelect: async () => {
              if (!(await confirm({ title: "Отправить приглашение заново?", message: "Будет создана новая ссылка на 48 часов, старая перестанет работать.", confirmLabel: "Отправить" }))) return;
              try {
                linkResult(await teamApi.resendInvite(inv.id), who, "Новая ссылка отправлена в Telegram");
                refresh();
              } catch (e) {
                fail(e, "Не удалось отправить");
              }
            },
          },
          {
            key: "revoke",
            label: "Отозвать приглашение",
            icon: <X className="h-4 w-4" />,
            danger: true,
            onSelect: async () => {
              if (!(await confirm({ title: "Отозвать приглашение?", message: `Ссылка для «${who}» перестанет работать.`, confirmLabel: "Отозвать", danger: true }))) return;
              try {
                await teamApi.revokeInvite(inv.id);
                push("Приглашение отозвано", "ok");
                refresh();
              } catch (e) {
                fail(e, "Не удалось отозвать");
              }
            },
          },
        ];
      }

      const a = row.admin;
      const who = adminName(a);
      const resetPassword = (target: TeamAdmin) => {
        const name = adminName(target);
        setAsk({
          title: `Сбросить пароль «${name}»?`,
          message: "Старый пароль перестанет работать сразу, все сессии завершатся. Бот пришлёт админу ссылку, чтобы задать новый (если не сможет — ссылка появится здесь).",
          confirmLabel: "Сбросить пароль",
          danger: true,
          run: async (code) => {
            const created = await teamApi.resetPassword(target.telegramUserId, code);
            linkResult(created, name, "Пароль сброшен, ссылка отправлена в Telegram");
          },
        });
      };

      const items: MenuItem[] = [];
      if (a.invite) {
        const inv = a.invite;
        items.push(
          {
            key: "resend",
            label: "Отправить ссылку заново",
            icon: <Send className="h-4 w-4" />,
            onSelect: async () => {
              try {
                linkResult(await teamApi.resendInvite(inv.id), who, "Новая ссылка отправлена в Telegram");
                refresh();
              } catch (e) {
                fail(e, "Не удалось отправить");
              }
            },
          },
          {
            key: "revoke",
            label: "Отозвать ссылку",
            icon: <X className="h-4 w-4" />,
            onSelect: async () => {
              if (!(await confirm({ title: "Отозвать ссылку?", message: `Ссылка для «${who}» перестанет работать.`, confirmLabel: "Отозвать" }))) return;
              try {
                await teamApi.revokeInvite(inv.id);
                push("Ссылка отозвана", "ok");
                refresh();
              } catch (e) {
                fail(e, "Не удалось отозвать");
              }
            },
          }
        );
      }
      if (!a.active) {
        items.push({
          key: "unblock",
          label: "Разблокировать",
          icon: <LockOpen className="h-4 w-4" />,
          onSelect: () =>
            setAsk({
              title: `Разблокировать «${who}»?`,
              message: "Админ снова сможет войти — паролем или через Telegram, с кодом из приложения.",
              confirmLabel: "Разблокировать",
              run: async (code) => {
                await teamApi.unblock(a.telegramUserId, code);
                push(`«${who}» разблокирован`, "ok");
              },
            }),
        });
      } else {
        items.push({ key: "edit", label: "Имя и роль", icon: <Pencil className="h-4 w-4" />, onSelect: () => setEditing(a) });
        if (!a.username) {
          items.push({ key: "login", label: "Выдать логин и пароль", icon: <MailPlus className="h-4 w-4" />, onSelect: () => inviteExisting(a.telegramUserId) });
        } else {
          items.push({
            key: "password",
            label: a.passwordSet ? "Сбросить пароль" : "Новая ссылка на пароль",
            icon: <KeyRound className="h-4 w-4" />,
            onSelect: () => resetPassword(a),
          });
        }
        items.push({
          key: "2fa",
          label: "Сбросить 2FA",
          icon: <ShieldOff className="h-4 w-4" />,
          onSelect: () =>
            setAsk({
              title: `Сбросить 2FA у «${who}»?`,
              message: (
                <>
                  Для потерянного телефона. Все сессии и доверенные устройства админа завершатся; при следующем входе он заново
                  подключит приложение-аутентификатор. Пока он этого не сделал, первым настроить 2FA может любой, кто знает его пароль.
                </>
              ),
              confirmLabel: "Сбросить 2FA",
              danger: true,
              run: async (code) => {
                await teamApi.resetTwoFactor(a.telegramUserId, code);
                push("2FA сброшена, сессии завершены", "ok");
              },
            }),
        });
        items.push({
          key: "devices",
          label: "Забыть устройства",
          icon: <Laptop className="h-4 w-4" />,
          onSelect: async () => {
            if (!(await confirm({ title: `Забыть устройства «${who}»?`, message: "На всех доверенных устройствах админа снова будет спрашиваться код.", confirmLabel: "Забыть" }))) return;
            try {
              const r = await teamApi.forgetDevices(a.telegramUserId);
              push(`Забыто устройств: ${r.forgotten}`, "ok");
              refresh();
            } catch (e) {
              fail(e, "Не удалось");
            }
          },
        });
        items.push({
          key: "block",
          label: "Заблокировать",
          icon: <Ban className="h-4 w-4" />,
          danger: true,
          onSelect: () =>
            setAsk({
              title: `Заблокировать «${who}»?`,
              message: "Админ сразу выйдет на всех устройствах и не сможет войти ни паролем, ни через Telegram. История его действий сохранится.",
              confirmLabel: "Заблокировать",
              danger: true,
              run: async (code) => {
                await teamApi.block(a.telegramUserId, code);
                push(`«${who}» заблокирован`, "ok");
              },
            }),
        });
      }
      items.push({
        key: "delete",
        label: "Удалить",
        icon: <Trash2 className="h-4 w-4" />,
        danger: true,
        onSelect: () =>
          setAsk({
            title: `Удалить «${who}»?`,
            message: "Можно только если админ ничего не делал в магазине (журнал, чаты заказов, рассылки). Иначе — заблокируйте: история останется с его именем.",
            confirmLabel: "Удалить",
            danger: true,
            run: async (code) => {
              await teamApi.remove(a.telegramUserId, code);
              push(`«${who}» удалён`, "ok");
            },
          }),
      });
      return items;
    },
    [confirm, fail, inviteExisting, linkResult, push, refresh]
  );

  const ui = (
    <>
      {confirmUi}
      {ask && (
        <CodeConfirmModal
          ask={ask}
          onClose={() => setAsk(null)}
          onDone={() => {
            setAsk(null);
            refresh();
          }}
        />
      )}
      {editing && (
        <EditModal
          admin={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </>
  );
  return { itemsFor, ui };
}

/** A dangerous action: what happens + the main admin's own code from the authenticator app. */
function CodeConfirmModal({ ask, onClose, onDone }: { ask: CodeAsk; onClose: () => void; onDone: () => void }) {
  const { push } = useToast();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(value = code) {
    if (value.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await ask.run(value);
      onDone();
    } catch (e) {
      if (e instanceof ApiError && (e.code === "BAD_CODE" || e.code === "CODE_REQUIRED")) {
        setError(e.message);
        setCode("");
      } else {
        push(e instanceof ApiError ? e.message : "Не удалось выполнить", "error");
        onClose();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={ask.title}
      size="sm"
      closeOnBackdrop={false}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button variant={ask.danger ? "danger" : "accent"} loading={busy} disabled={code.length !== 6} onClick={() => void run()}>
            {ask.confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="text-[14px] leading-relaxed text-[var(--text-muted)]">{ask.message}</div>
        <CodeInput id="admin-action-code" label="Ваш код из приложения" value={code} onChange={(v) => { setCode(v); if (error) setError(null); }} onComplete={(v) => void run(v)} error={!!error} disabled={busy} autoFocus />
        {error && (
          <p role="alert" className="-mt-1 text-[13px] text-[var(--danger-ink)]">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

function EditModal({ admin, onClose, onSaved }: { admin: TeamAdmin; onClose: () => void; onSaved: () => void }) {
  const { push } = useToast();
  const [name, setName] = useState(admin.name ?? "");
  const [role, setRole] = useState<AdminRoleCode>(admin.role);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const roleChanged = role !== admin.role;
  const nameChanged = name.trim() !== (admin.name ?? "");

  async function save() {
    if (!name.trim()) {
      push("Введите имя", "error");
      return;
    }
    if (roleChanged && code.length !== 6) {
      push("Для смены роли нужен ваш код из приложения", "error");
      return;
    }
    setBusy(true);
    try {
      await teamApi.update(admin.telegramUserId, {
        name: nameChanged ? name.trim() : undefined,
        role: roleChanged ? role : undefined,
        code: roleChanged ? code : undefined,
      });
      push("Сохранено", "ok");
      onSaved();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось сохранить", "error");
      setCode("");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Имя и роль — ${adminName(admin)}`}
      size="sm"
      closeOnBackdrop={false}
      dirty={roleChanged || nameChanged}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button variant="accent" loading={busy} disabled={!roleChanged && !nameChanged} onClick={() => void save()}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input label="Имя" value={name} maxLength={64} onChange={(e) => setName(e.target.value)} />
        <Select label="Роль" value={role} onChange={(v) => setRole(v as AdminRoleCode)} options={ROLE_OPTIONS} />
        {roleChanged && (
          <>
            <p className="text-[12.5px] leading-snug text-[var(--text-faint)]">
              {role === "SUPER_ADMIN"
                ? "Главный админ может приглашать, блокировать и удалять других админов."
                : "Админ потеряет доступ к разделу «Админы». Остальное — как раньше."}
            </p>
            <CodeInput id="role-code" label="Ваш код из приложения" value={code} onChange={setCode} />
          </>
        )}
      </div>
    </Modal>
  );
}

// ============================================================================ invite

function userLabel(u: UserCardDto): string {
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ");
  return full || (u.username ? `@${u.username}` : `tg ${u.telegramUserId}`);
}

function InviteModal({
  initialTelegramId,
  admins,
  onClose,
  onCreated,
}: {
  initialTelegramId?: number;
  admins: TeamAdmin[];
  onClose: () => void;
  onCreated: (created: InviteCreated, who: string) => void;
}) {
  const { push } = useToast();
  const [manual, setManual] = useState(!!initialTelegramId);
  const [picked, setPicked] = useState<UserCardDto | null>(null);
  const [manualId, setManualId] = useState(initialTelegramId ? String(initialTelegramId) : "");
  const [name, setName] = useState("");
  const [role, setRole] = useState<AdminRoleCode>("ADMIN");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const tgId = manual ? (/^\d{1,15}$/.test(manualId.trim()) ? Number(manualId.trim()) : null) : picked?.telegramUserId ?? null;
  const existing = tgId ? admins.find((a) => a.telegramUserId === tgId) : undefined;
  const hasLogin = !!existing && !!existing.username && existing.passwordSet;
  const ready = !!tgId && code.length === 6 && (existing ? existing.active && !hasLogin && !existing.self : !!name.trim());

  async function submit() {
    if (!ready || !tgId) return;
    setBusy(true);
    try {
      const created = await teamApi.invite({
        telegramUserId: tgId,
        ...(existing ? {} : { name: name.trim(), role }),
        code,
      });
      if (created.delivered) push("Приглашение отправлено в Telegram", "ok");
      onCreated(created, existing ? adminName(existing) : name.trim());
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось пригласить", "error");
      setCode("");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? "Выдать логин и пароль" : "Пригласить админа"}
      closeOnBackdrop={false}
      dirty={!!tgId || !!name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button variant="accent" loading={busy} disabled={!ready} icon={<Send className="h-4 w-4" />} onClick={() => void submit()}>
            {existing ? "Отправить ссылку" : "Пригласить"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="field-label">Telegram нового админа</span>
            <button type="button" className="hit text-[12px] font-semibold text-[var(--accent-hi)] hover:underline" onClick={() => setManual((v) => !v)}>
              {manual ? "Выбрать из пользователей" : "Ввести id вручную"}
            </button>
          </div>
          {manual ? (
            <Input
              aria-label="Telegram id"
              inputMode="numeric"
              placeholder="например, 977067472"
              value={manualId}
              onChange={(e) => setManualId(e.target.value.replace(/[^\d]/g, ""))}
              hint="Числовой id. Его покажет, например, @userinfobot."
            />
          ) : (
            <Autocomplete<UserCardDto>
              placeholder="Имя, @username или id"
              selectedLabel={picked ? `${userLabel(picked)} · ${picked.telegramUserId}` : null}
              fetchItems={(q) => adminApi.users({ q, size: 8, sortBy: "lastSeenAt", sortDir: "desc" })}
              itemLabel={userLabel}
              itemSubLabel={(u) => [u.username ? `@${u.username}` : null, `id ${u.telegramUserId}`].filter(Boolean).join(" · ")}
              itemKey={(u) => String(u.telegramUserId)}
              onSelect={(u) => {
                setPicked(u);
                if (!name.trim()) setName(userLabel(u).replace(/^@/, ""));
              }}
              onClear={() => setPicked(null)}
            />
          )}
          {!manual && (
            <p className="mt-1.5 text-[12px] text-[var(--text-faint)]">
              Из пользователей магазина. Бот сможет написать, только если человек хоть раз нажал /start.
            </p>
          )}
        </div>

        {existing ? (
          <div
            className={cn(
              "rounded-[var(--r-md)] border px-3 py-2.5 text-[13px] leading-snug",
              hasLogin || !existing.active || existing.self
                ? "border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[var(--danger-ink)]"
                : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)]"
            )}
          >
            {existing.self
              ? "Это вы."
              : !existing.active
                ? `«${adminName(existing)}» заблокирован — сначала разблокируйте.`
                : hasLogin
                  ? `«${adminName(existing)}» уже админ с логином. Забыл пароль — «Сбросить пароль» в его меню.`
                  : `«${adminName(existing)}» уже админ, но входит только через Telegram. Ему придёт ссылка, чтобы задать логин и пароль (и 2FA, если её нет). Роль не меняется.`}
          </div>
        ) : (
          <>
            <Input label="Имя в админке" value={name} maxLength={64} placeholder="Например, Оля — склад" onChange={(e) => setName(e.target.value)} />
            <Select label="Роль" value={role} onChange={(v) => setRole(v as AdminRoleCode)} options={ROLE_OPTIONS} />
          </>
        )}

        <CodeInput id="invite-code" label="Ваш код из приложения" value={code} onChange={setCode} />
        <p className="text-[12px] leading-snug text-[var(--text-faint)]">
          Бот пришлёт ссылку на 48 часов: человек задаст логин и пароль и подключит приложение-аутентификатор. Пока он этого не
          сделал, доступа нет.
        </p>
      </div>
    </Modal>
  );
}

/** The bot could not deliver: the link to hand over personally. */
function LinkModal({ created, who, onClose }: { created: InviteCreated; who: string; onClose: () => void }) {
  const { push } = useToast();
  const url = inviteUrl(created) ?? "";
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (await copyText(url)) {
      setCopied(true);
      push("Ссылка скопирована", "ok");
      setTimeout(() => setCopied(false), 1500);
    } else {
      push("Не удалось скопировать — выделите ссылку вручную", "error");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Бот не смог написать"
      size="sm"
      footer={
        <Button variant="accent" onClick={onClose}>
          Готово
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[14px] leading-relaxed text-[var(--text-muted)]">
          Видимо, «{who}» ещё не нажимал /start в боте магазина. Передайте ссылку сами — она действует до{" "}
          <b className="text-[var(--text)]">{formatDateTime(created.expiresAt)}</b>.
        </p>
        <div className="flex items-stretch gap-2">
          <div className="min-w-0 flex-1">
            <Input
              readOnly
              value={url}
              aria-label="Ссылка-приглашение"
              data-testid="invite-link"
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-[12px]"
            />
          </div>
          <Button variant="surface" icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} onClick={() => void copy()}>
            Копировать
          </Button>
        </div>
        <div className="flex gap-2.5 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] px-3 py-2.5 text-[13px] leading-snug text-[var(--text)]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warn)]" />
          <span>
            Передавайте только лично этому человеку (в личном чате). Кто откроет ссылку первым, тот и задаст пароль. Ссылку не
            видно второй раз — если потеряли, «Отправить заново».
          </span>
        </div>
      </div>
    </Modal>
  );
}
