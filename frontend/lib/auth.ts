"use client";

/**
 * Auth state for the screens that need it.
 */
import { useEffect, useState } from "react";
import { getAccessToken, onAccessToken } from "@/lib/api";

/**
 * The current token, as React state.
 *
 * Every `/api/me/**` screen used to fire its query on mount, which regularly beat the
 * initData→JWT exchange: the request came back 403, React Query retried once and gave up, and the
 * screen showed "не удалось загрузить" until the customer pulled to refresh. Gating a query on
 * this makes it start when there IS something to authenticate with — and re-run by itself when a
 * re-login replaces the token.
 */
export function useAccessToken(): string | null {
  const [token, setToken] = useState<string | null>(() => getAccessToken());
  useEffect(() => onAccessToken(setToken), []);
  return token;
}
