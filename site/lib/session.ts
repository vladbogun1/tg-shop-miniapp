"use client";

/**
 * "Am I signed in?" for the website.
 *
 * The session is two HttpOnly cookies the page cannot read, so the only honest answer comes from
 * the server: a cheap authenticated call (`/api/me/unread-count`, which already exists for the
 * Mini App) that goes through the refresh-once logic in `lib/api`. Success → signed in; a 401/403
 * that survives the refresh → guest.
 *
 * The display name is NOT a secret and the backend has no "who am I" endpoint, so the user object
 * from `/complete` is remembered in localStorage purely for the greeting.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { AuthUser } from "@shop/shared";
import { api, isAuthFailure } from "./api";

const USER_KEY = "site-user-v1";

export function rememberUser(user: AuthUser | null | undefined): void {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* private mode */
  }
}

export function rememberedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function displayName(user: AuthUser | null): string | null {
  if (!user) return null;
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return full || (user.username ? `@${user.username.replace(/^@/, "")}` : null);
}

export type SessionStatus = "loading" | "authed" | "guest";

export const SESSION_KEY = ["session"] as const;

export function useSession() {
  const query = useQuery({
    queryKey: SESSION_KEY,
    queryFn: async () => {
      try {
        const r = await api.unreadCount();
        return { authed: true as const, unread: r?.count ?? 0 };
      } catch (e) {
        if (isAuthFailure(e)) return { authed: false as const, unread: 0 };
        throw e;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
  const status: SessionStatus = query.isPending
    ? "loading"
    : query.data?.authed
      ? "authed"
      : "guest";
  return { status, unread: query.data?.unread ?? 0, refetch: query.refetch };
}

/** Signs out on the server, forgets the greeting and drops every cached /api/me answer. */
export function useLogout() {
  const qc = useQueryClient();
  return useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* cookies may already be gone — the local cleanup below still applies */
    }
    rememberUser(null);
    qc.removeQueries({ queryKey: ["me"] });
    qc.setQueryData(SESSION_KEY, { authed: false, unread: 0 });
  }, [qc]);
}
