"use client";

import { QUERY_PRESETS } from "@shop/core/query";
import { useConfirm } from "@shop/ui/confirm";
import { useApiMutation } from "@shop/ui/mutation";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";
import {
  accountApi,
  auditApi,
  authApi,
  incidentApi,
  inviteApi,
  teamApi,
  type AdminLoginResult,
  type AuditEntry,
  type AuditFilter,
  type InviteCreated,
  type TwoFactorSetup,
} from "./api";
import { staffKeys } from "./keys";
import type { AdminRoleCode } from "./model/roles";

export const AUDIT_PAGE = 50;

// ---- аккаунт ---------------------------------------------------------------

export function useAccountQuery() {
  return useQuery({ queryKey: staffKeys.account(), queryFn: accountApi.get });
}

/** 60 с, как было до выноса в фичу. */
const SUPER_ADMIN_STALE_MS = QUERY_PRESETS.list.staleTime * 2;
const AUDIT_FACETS_STALE_MS = QUERY_PRESETS.list.staleTime * 2;

/**
 * Is the signed-in admin the main one (SUPER_ADMIN)? Same query as «Мой аккаунт». Hides «Админы»
 * for everyone else — the backend answers 403 there anyway.
 */
export function useIsSuperAdmin(): boolean | undefined {
  const { data } = useQuery({
    queryKey: staffKeys.account(),
    queryFn: accountApi.get,
    staleTime: SUPER_ADMIN_STALE_MS,
  });
  return data?.superAdmin;
}

export function useLoginsQuery() {
  return useQuery({ queryKey: staffKeys.logins(), queryFn: accountApi.logins });
}

export function useChangePassword(onDone: () => void, onFail: () => void) {
  return useApiMutation({
    mutationFn: (v: { current: string; next: string; code: string }) => accountApi.changePassword(v.current, v.next, v.code),
    invalidate: [staffKeys.account()],
    success: "Пароль изменён. Остальные сессии и доверенные устройства завершены",
    errorFallback: "Не удалось сменить пароль",
    onSuccess: onDone,
    onError: onFail,
  });
}

/** Шаг 1 перенастройки 2FA: код из текущего приложения → новый ключ. */
export function useStartTotpReset(onStarted: (setup: TwoFactorSetup) => void, onFail: () => void) {
  return useApiMutation({
    mutationFn: (code: string) => accountApi.startTotpReset(code),
    errorFallback: "Не удалось начать перенастройку",
    onSuccess: onStarted,
    onError: onFail,
  });
}

/** Шаг 2: код из нового ключа. */
export function useConfirmTotpReset(onDone: () => void, onFail: () => void) {
  return useApiMutation({
    mutationFn: (code: string) => accountApi.confirmTotpReset(code),
    invalidate: [staffKeys.account()],
    success: "Двухфакторная защита перенастроена. Старое приложение больше не подходит",
    errorFallback: "Не удалось перенастроить",
    onSuccess: onDone,
    onError: onFail,
  });
}

export function useForgetOwnDevices() {
  return useApiMutation({
    mutationFn: () => accountApi.forgetDevices(),
    invalidate: [staffKeys.account()],
    success: (r) => (r.forgotten > 0 ? `Забыто устройств: ${r.forgotten}` : "Доверенных устройств не было"),
    errorFallback: "Не удалось забыть устройства",
  });
}

interface LogoutText {
  message: string;
  confirmLabel: string;
  failText: string;
}

const SIDEBAR_LOGOUT_TEXT: LogoutText = {
  message: "Админку придётся открыть заново везде, включая это устройство.",
  confirmLabel: "Выйти",
  failText: "Не удалось выйти на всех устройствах",
};

/**
 * «Выйти на всех устройствах»: спросить → отозвать все токены этого админа. `busy` остаётся
 * включённым и после успеха — экран сразу уходит на вход.
 */
export function useLogoutEverywhere(text: LogoutText = SIDEBAR_LOGOUT_TEXT) {
  const confirm = useConfirm();
  const m = useApiMutation({
    mutationFn: () => authApi.logoutEverywhere(),
    errorFallback: text.failText,
  });
  return {
    busy: m.isPending || m.isSuccess,
    async run() {
      const ok = await confirm({
        title: "Выйти на всех устройствах?",
        message: text.message,
        confirmLabel: text.confirmLabel,
        danger: true,
      });
      if (ok) m.mutate();
    },
  };
}

// ---- вход ------------------------------------------------------------------

export function useLoginMutation(onResult: (res: AdminLoginResult) => void) {
  return useApiMutation({
    mutationFn: (v: { username: string; password: string }) => authApi.login(v.username, v.password),
    errorFallback: "Не удалось войти",
    onSuccess: onResult,
  });
}

/** Второй шаг входа: ошибки разбирает экран (неверный код остаётся на шаге, остальное — на вход). */
export function useVerifyCode(onResult: (res: AdminLoginResult) => void, onFail: (e: unknown) => void) {
  return useApiMutation({
    mutationFn: (v: { preAuthToken: string; code: string; trust: boolean }) => authApi.verify(v.preAuthToken, v.code, v.trust),
    toastOnError: false,
    onSuccess: onResult,
    onError: (e) => onFail(e),
  });
}

export function useConfirmSetup(onResult: (res: AdminLoginResult) => void, onFail: (e: unknown) => void) {
  return useApiMutation({
    mutationFn: (v: { preAuthToken: string; code: string; trust: boolean }) =>
      authApi.confirmSetup(v.preAuthToken, v.code, v.trust),
    toastOnError: false,
    onSuccess: onResult,
    onError: (e) => onFail(e),
  });
}

export function useStartSetup(onStarted: (setup: TwoFactorSetup) => void, onFail: (e: unknown) => void) {
  return useApiMutation({
    mutationFn: (preAuthToken: string) => authApi.startSetup(preAuthToken),
    toastOnError: false,
    onSuccess: onStarted,
    onError: (e) => onFail(e),
  });
}

// ---- «Админы» -----------------------------------------------------------------

export function useTeamQuery() {
  return useQuery({ queryKey: staffKeys.team(), queryFn: teamApi.list });
}

export interface LinkToShow {
  created: InviteCreated;
  who: string;
}

/** Действия без кода из приложения: заново отправить / отозвать ссылку, забыть устройства. */
export function useTeamLinkActions(showLink: (l: LinkToShow) => void) {
  const resend = useApiMutation({
    mutationFn: (v: { id: number; who: string }) => teamApi.resendInvite(v.id).then((created) => ({ created, who: v.who })),
    invalidate: [staffKeys.team()],
    success: (r) => (r.created.delivered ? "Новая ссылка отправлена в Telegram" : undefined),
    errorFallback: "Не удалось отправить",
    onSuccess: (r) => {
      if (!r.created.delivered) showLink(r);
    },
  });
  const revoke = useApiMutation({
    mutationFn: (v: { id: number; success: string }) => teamApi.revokeInvite(v.id),
    invalidate: [staffKeys.team()],
    success: (_r, v) => v.success,
    errorFallback: "Не удалось отозвать",
  });
  const forgetDevices = useApiMutation({
    mutationFn: (id: number) => teamApi.forgetDevices(id),
    invalidate: [staffKeys.team()],
    success: (r) => `Забыто устройств: ${r.forgotten}`,
    errorFallback: "Не удалось",
  });
  return { resend, revoke, forgetDevices };
}

/** Опасное действие над админом: что произойдёт + код из приложения главного админа. */
export interface CodeAsk {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  run: (code: string) => Promise<unknown>;
  success: string;
  /** `run` вернул ссылку: если бот доставил — тост `success`, иначе показать ссылку для этого имени. */
  linkFor?: string;
}

/** Ссылка, которую бот не смог доставить (только для действий с `linkFor`). */
function undelivered(ask: CodeAsk, res: unknown): InviteCreated | null {
  const created = ask.linkFor ? (res as InviteCreated | undefined) : undefined;
  return created && !created.delivered ? created : null;
}

export function useCodeAction(
  ask: CodeAsk,
  handlers: { onDone: () => void; onLink: (l: LinkToShow) => void; onFail: (e: unknown) => void },
) {
  return useApiMutation({
    mutationFn: (code: string) => ask.run(code),
    invalidate: [staffKeys.team()],
    success: (res) => (undelivered(ask, res) ? undefined : ask.success),
    toastOnError: false,
    onError: (e) => handlers.onFail(e),
    onSuccess: (res) => {
      const created = undelivered(ask, res);
      if (created && ask.linkFor) handlers.onLink({ created, who: ask.linkFor });
      handlers.onDone();
    },
  });
}

export function useUpdateAdmin(onSaved: () => void, onFail: () => void) {
  return useApiMutation({
    mutationFn: (v: { id: number; name?: string; role?: AdminRoleCode; code?: string }) =>
      teamApi.update(v.id, { name: v.name, role: v.role, code: v.code }),
    invalidate: [staffKeys.team()],
    success: "Сохранено",
    errorFallback: "Не удалось сохранить",
    onSuccess: onSaved,
    onError: onFail,
  });
}

export function useInviteAdmin(onCreated: (created: InviteCreated, who: string) => void, onFail: () => void) {
  return useApiMutation({
    mutationFn: (v: { telegramUserId: number; name?: string; role?: AdminRoleCode; code: string; who: string }) =>
      teamApi
        .invite({ telegramUserId: v.telegramUserId, name: v.name, role: v.role, code: v.code })
        .then((created) => ({ created, who: v.who })),
    invalidate: [staffKeys.team()],
    success: (r) => (r.created.delivered ? "Приглашение отправлено в Telegram" : undefined),
    errorFallback: "Не удалось пригласить",
    onSuccess: (r) => onCreated(r.created, r.who),
    onError: onFail,
  });
}

// ---- приглашение (публичная страница) --------------------------------------------

/** Проверка ссылки один раз за открытие страницы; ошибка (мёртвая ссылка) — состояние экрана, не тост. */
export function useInviteInfo(token: string) {
  return useQuery({
    queryKey: staffKeys.invite(token),
    queryFn: () => inviteApi.check(token),
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });
}

export function useAcceptInvite() {
  return useApiMutation({
    mutationFn: (v: { token: string; username: string; password: string }) => inviteApi.accept(v.token, v.username, v.password),
    toastOnError: false,
  });
}

export function useCompleteInvite() {
  return useApiMutation({
    mutationFn: (v: { token: string; code: string; trust: boolean }) => inviteApi.complete(v.token, v.code, v.trust),
    toastOnError: false,
  });
}

// ---- журнал ------------------------------------------------------------------------

export function useAuditFacets() {
  return useQuery({
    queryKey: staffKeys.auditFacets(),
    queryFn: () => auditApi.facets(),
    staleTime: AUDIT_FACETS_STALE_MS,
  });
}

export function useAuditLog(filter: AuditFilter) {
  const q = useInfiniteQuery({
    queryKey: staffKeys.audit(filter),
    queryFn: ({ pageParam }) => auditApi.list(filter, pageParam, AUDIT_PAGE),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.length < AUDIT_PAGE ? undefined : all.length),
  });
  const rows: AuditEntry[] = useMemo(() => q.data?.pages.flat() ?? [], [q.data]);
  return { q, rows };
}

// ---- инциденты ----------------------------------------------------------------------

export function useIncidentsQuery(enabled: boolean) {
  return useQuery({ queryKey: staffKeys.incidents(), queryFn: incidentApi.list, enabled });
}

export function useIncidentAction(onDone: () => void) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (v: { id: number; resolution?: string }) =>
      v.resolution === undefined ? incidentApi.reopen(v.id) : incidentApi.resolve(v.id, v.resolution),
    errorFallback: "Не получилось",
    // The card keeps its state until the list is refreshed (no flash of the old status).
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: staffKeys.incidents() });
      onDone();
    },
  });
}
