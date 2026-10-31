"use client";

import { useEffect, useState } from "react";
import { getAccessToken, onAccessToken } from "@/lib/api";

/**
 * The access token as state. Opening a chat from a Telegram deep link can beat the initData→JWT
 * exchange: tracking the token in state means the history and the socket start the moment it arrives,
 * instead of a 403 on the first request or a socket retrying forever with no credentials.
 */
export function useChatToken(): string | null {
  const [token, setToken] = useState<string | null>(() => getAccessToken());
  useEffect(() => onAccessToken(setToken), []);
  return token;
}
