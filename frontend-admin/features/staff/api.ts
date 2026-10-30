/**
 * Команда админки: вход (пароль / Telegram + 2FA), «Мой аккаунт», «Админы», приглашения, журнал,
 * инциденты. Единственное место путей `/api/admin/{account,admins,audit,incidents}` и
 * `/api/auth/admin/**`; ответы — типы из OpenAPI.
 */
import type { Schemas } from "@shop/core/api/schemas";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, logoutEverywhere, setAccessToken } from "@/lib/api";
import type { AdminRoleCode } from "./model/roles";

export type AdminAccount = Schemas["Profile"];
export type AdminLoginEntry = Schemas["LoginLogEntry"];
export type AdminLoginResult = Schemas["AdminLoginResponse"];
export type TwoFactorSetup = Schemas["TwoFactorSetupResponse"];
export type Team = Schemas["Team"];
export type TeamAdmin = Schemas["AdminRow"];
export type TeamInvite = Schemas["InviteRow"];
export type InviteCreated = Schemas["InviteCreated"];
export type InviteInfo = Schemas["InviteInfo"];
export type InviteAccepted = Schemas["InviteAcceptResponse"];
export type AuditEntry = Schemas["AuditEntryDto"];
export type Incident = Schemas["IncidentDto"];

export interface AuditFilter {
  action?: string;
  entityType?: string;
  entityId?: string;
  adminId?: number;
  /** yyyy-MM-dd, shop timezone, inclusive. */
  from?: string;
  to?: string;
}

/** Варианты фильтров журнала (GET /api/admin/audit/facets — в OpenAPI это «объект», форма известна по коду). */
export interface AuditFacets {
  actions: string[];
  entityTypes: string[];
  admins: { adminId: number; adminName: string }[];
}

function query(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// ---- вход: два шага ---------------------------------------------------------
// Пароль или Telegram → { status: TOTP_REQUIRED | SETUP_REQUIRED, preAuthToken } → код из приложения
// (или настройка 2FA) → { status: OK, accessToken }. Доверенное устройство отвечает OK сразу после первого шага.

function signedIn(res: AdminLoginResult): AdminLoginResult {
  if (res.status === "OK" && res.accessToken) setAccessToken(res.accessToken);
  return res;
}

export const authApi = {
  /** First factor from the Telegram Mini App. */
  telegram: async (initData: string) => signedIn(await apiPost<AdminLoginResult>("/api/auth/admin/telegram", { initData })),
  /** First factor: login + password. */
  login: async (username: string, password: string) =>
    signedIn(await apiPost<AdminLoginResult>("/api/auth/admin/login", { username, password })),
  /** The code from the app. */
  verify: async (preAuthToken: string, code: string, trustDevice: boolean) =>
    signedIn(await apiPost<AdminLoginResult>("/api/auth/admin/2fa/verify", { preAuthToken, code, trustDevice })),
  /** First sign-in without 2FA: a new secret. */
  startSetup: (preAuthToken: string) => apiPost<TwoFactorSetup>("/api/auth/admin/2fa/setup", { preAuthToken }),
  /** The first code from the new secret; signs in. */
  confirmSetup: async (preAuthToken: string, code: string, trustDevice: boolean) =>
    signedIn(await apiPost<AdminLoginResult>("/api/auth/admin/2fa/confirm", { preAuthToken, code, trustDevice })),
  /** «Выйти на всех устройствах»: every token of this admin dies, the session is dropped locally. */
  logoutEverywhere,
};

// ---- «Мой аккаунт» ----------------------------------------------------------

export const accountApi = {
  get: () => apiGet<AdminAccount>("/api/admin/account"),
  logins: () => apiGet<AdminLoginEntry[]>("/api/admin/account/logins"),
  /** Ends every other session; the answer carries this device's new token (stored here). */
  async changePassword(currentPassword: string, newPassword: string, code: string): Promise<void> {
    const res = await apiPost<Schemas["AccessTokenResponse"]>("/api/admin/account/password", { currentPassword, newPassword, code });
    setAccessToken(res.accessToken);
  },
  startTotpReset: (code: string) => apiPost<TwoFactorSetup>("/api/admin/account/2fa/reset", { code }),
  async confirmTotpReset(code: string): Promise<void> {
    const res = await apiPost<Schemas["AccessTokenResponse"]>("/api/admin/account/2fa/confirm", { code });
    setAccessToken(res.accessToken);
  },
  forgetDevices: () => apiPost<Record<string, number>>("/api/admin/account/devices/forget"),
};

// ---- «Админы» (SUPER_ADMIN only) ----------------------------------------------

export const teamApi = {
  list: () => apiGet<Team>("/api/admin/admins"),
  invite: (body: { telegramUserId: number; name?: string; role?: AdminRoleCode; code: string }) =>
    apiPost<InviteCreated>("/api/admin/admins/invites", body),
  resendInvite: (id: number) => apiPost<InviteCreated>(`/api/admin/admins/invites/${id}/resend`),
  revokeInvite: (id: number) => apiDelete<void>(`/api/admin/admins/invites/${id}`),
  update: (id: number, body: { name?: string; role?: AdminRoleCode; code?: string }) =>
    apiPatch<void>(`/api/admin/admins/${id}`, body),
  resetTwoFactor: (id: number, code: string) => apiPost<void>(`/api/admin/admins/${id}/reset-2fa`, { code }),
  resetPassword: (id: number, code: string) => apiPost<InviteCreated>(`/api/admin/admins/${id}/reset-password`, { code }),
  forgetDevices: (id: number) => apiPost<Record<string, number>>(`/api/admin/admins/${id}/forget-devices`),
  block: (id: number, code: string) => apiPost<void>(`/api/admin/admins/${id}/block`, { code }),
  unblock: (id: number, code: string) => apiPost<void>(`/api/admin/admins/${id}/unblock`, { code }),
  setFinance: (id: number, finance: boolean, code: string) => apiPut<void>(`/api/admin/admins/${id}/finance`, { finance, code }),
  remove: (id: number, code: string) => apiPost<void>(`/api/admin/admins/${id}/delete`, { code }),
};

// ---- публичная /invite/<token> (без входа) -------------------------------------

export const inviteApi = {
  check: (token: string) => apiPost<InviteInfo>("/api/auth/admin/invite/check", { token }),
  accept: (token: string, username: string, password: string) =>
    apiPost<InviteAccepted>("/api/auth/admin/invite/accept", { token, username, password }),
  /** Burns the link, activates the account and signs in (the token is stored). */
  async complete(token: string, code: string, trustDevice: boolean): Promise<AdminLoginResult> {
    return signedIn(await apiPost<AdminLoginResult>("/api/auth/admin/invite/complete", { token, code, trustDevice }));
  },
};

// ---- журнал действий админов ---------------------------------------------------

export const auditApi = {
  /** Newest first. */
  list: (filter: AuditFilter, page = 0, size = 50) =>
    apiGet<AuditEntry[]>(`/api/admin/audit${query({ ...filter, page, size })}`),
  facets: () => apiGet<AuditFacets>("/api/admin/audit/facets"),
};

// ---- инциденты (SUPER_ADMIN only) ------------------------------------------------

export const incidentApi = {
  list: () => apiGet<Incident[]>("/api/admin/incidents"),
  resolve: (id: number, resolution: string) => apiPost<Incident>(`/api/admin/incidents/${id}/resolve`, { resolution }),
  reopen: (id: number) => apiPost<Incident>(`/api/admin/incidents/${id}/reopen`, {}),
};
