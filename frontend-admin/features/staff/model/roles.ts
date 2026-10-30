import type { Schemas } from "@shop/core/api/schemas";

export type AdminRoleCode = "ADMIN" | "SUPER_ADMIN";
export type InviteKind = "NEW" | "CREDENTIALS" | "PASSWORD_RESET";

export const ROLE_OPTIONS: { value: AdminRoleCode; label: string }[] = [
  { value: "ADMIN", label: "Админ — всё, кроме управления админами" },
  { value: "SUPER_ADMIN", label: "Главный — ещё и управление админами" },
];

export function adminName(a: Pick<Schemas["AdminRow"], "name" | "username" | "telegramUserId">): string {
  return a.name?.trim() || a.username || `tg ${a.telegramUserId}`;
}

export function inviteName(i: Pick<Schemas["InviteRow"], "name" | "telegramUserId">): string {
  return i.name || `tg ${i.telegramUserId}`;
}

/** The full invite URL to hand over: the backend's absolute link, or this admin's origin + path. */
export function inviteUrl(c: Schemas["InviteCreated"]): string | null {
  if (c.link) return c.link;
  if (c.path && typeof window !== "undefined") return `${window.location.origin}${c.path}`;
  return null;
}

interface UserName {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  telegramUserId: number;
}

/** Подпись пользователя магазина в выборе при приглашении. */
export function userLabel(u: UserName): string {
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ");
  return full || (u.username ? `@${u.username}` : `tg ${u.telegramUserId}`);
}
