"use client";

/**
 * "Am I signed in?" for the website.
 *
 * The session is two HttpOnly cookies the page cannot read, so the only honest answer comes from
 * the server: a cheap authenticated call (`/api/me/unread-count`, which already exists for the
 * Mini App) that goes through the refresh-once logic in `lib/api`. Success → signed in; a 401/403
 * that survives the refresh → guest.
 *
 * A guest is NOT asked: that probe (401) plus the refresh attempt (401) landed in the console of
 * every visitor. The server is only asked when the browser shows a sign of a session — the
 * script-readable `signed_in=1` cookie the backend sets and clears together with the refresh cookie
 * (WebCookies.SESSION_HINT), or, for sessions opened before that cookie existed, the local marks a
 * sign-in leaves (below). A probe that ends in "guest" wipes the local marks, so it happens once.
 *
 * The display name is NOT a secret and the backend has no "who am I" endpoint, so the user object
 * from `/complete` is remembered in localStorage purely for the greeting.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { AuthUser } from "@shop/shared";
import { api, isAuthFailure } from "./api";
import { flushCart } from "./cart-sync";

const USER_KEY = "site-user-v1";
/** Set on sign-in even when `/complete` returned no user object (see {@link hasSessionHint}). */
const SIGNED_IN_KEY = "site-signed-in-v1";
const HINT_COOKIE = /(?:^|;\s*)signed_in=1(?:;|$)/;

/** Remembers the greeting user — or, with null, forgets it and the local sign-in mark. */
export function rememberUser(user: AuthUser | null | undefined): void {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else {
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(SIGNED_IN_KEY);
    }
  } catch {
    /* private mode */
  }
}

/** Called right after a successful sign-in on this page. */
export function markSignedIn(user: AuthUser | null | undefined): void {
  rememberUser(user);
  try {
    localStorage.setItem(SIGNED_IN_KEY, "1");
  } catch {
    /* private mode — the backend's signed_in cookie still works */
  }
}

/**
 * Whether this browser may have a session worth checking with the server. False = a guest as far
 * as the page can tell: no request is made.
 */
export function hasSessionHint(): boolean {
  if (typeof document === "undefined") return false;
  if (HINT_COOKIE.test(document.cookie)) return true;
  try {
    return localStorage.getItem(SIGNED_IN_KEY) !== null || localStorage.getItem(USER_KEY) !== null;
  } catch {
    return false;
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

/**
 * Two letters for the header account button, from the Telegram profile: first letters of the first
 * and last name ("Влад Богун" → "ВБ"); otherwise the first two letters of the first name or of the
 * username. Grapheme-safe enough for names (Array.from keeps surrogate pairs together).
 */
export function initials(user: AuthUser | null): string | null {
  if (!user) return null;
  const first = Array.from((user.firstName ?? "").trim());
  const last = Array.from((user.lastName ?? "").trim());
  if (first.length && last.length) return (first[0] + last[0]).toUpperCase();
  if (first.length) return first.slice(0, 2).join("").toUpperCase();
  const nick = Array.from((user.username ?? "").replace(/^@/, "").trim());
  if (nick.length) return nick.slice(0, 2).join("").toUpperCase();
  if (last.length) return last.slice(0, 2).join("").toUpperCase();
  return null;
}

export type SessionStatus = "loading" | "authed" | "guest";

export const SESSION_KEY = ["session"] as const;

export function useSession() {
  const query = useQuery({
    queryKey: SESSION_KEY,
    queryFn: async () => {
      if (!hasSessionHint()) return { authed: false as const, unread: 0 };
      try {
        const r = await api.unreadCount();
        return { authed: true as const, unread: r?.count ?? 0 };
      } catch (e) {
        if (isAuthFailure(e)) {
          // The session is gone: drop the local marks so the next pages do not ask again.
          rememberUser(null);
          return { authed: false as const, unread: 0 };
        }
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
  return {
    status,
    /** The server answered "not signed in" (not merely unreachable). */
    confirmedGuest: query.data?.authed === false,
    unread: query.data?.unread ?? 0,
    refetch: query.refetch,
  };
}

/** Signs out on the server, forgets the greeting and drops every cached /api/me answer. */
export function useLogout() {
  const qc = useQueryClient();
  return useCallback(async () => {
    // A cart change still waiting for its debounce must reach the server while the cookie is valid.
    await flushCart().catch(() => {});
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
