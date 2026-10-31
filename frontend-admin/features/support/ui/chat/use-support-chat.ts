"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { toast } from "@shop/ui/toast";
import { canLoadOlder, mergeMessages, SUPPORT_CHAT_PAGE } from "../../model/chat";
import type { SupportMessage } from "../../model/types";
import {
  fetchOlderMessages,
  useMarkSupportRead,
  useSupportChatCache,
  useSupportMessages,
} from "../../queries";
import { subscribeSupportChat } from "../../realtime";

/**
 * State of one thread's chat: the latest page (cache), older pages on demand, realtime messages,
 * mark-read on open and for customer messages arriving while the chat is visible.
 */
export function useSupportChat(threadId: string) {
  const { data: latest = [], isLoading } = useSupportMessages(threadId);
  const cache = useSupportChatCache(threadId);
  const markRead = useMarkSupportRead(threadId);
  const [older, setOlder] = useState<SupportMessage[]>([]);
  const [olderExhausted, setOlderExhausted] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = useMemo(() => mergeMessages(older, latest), [older, latest]);

  useEffect(() => {
    markRead();
    const off = subscribeSupportChat(threadId, (msg) => {
      cache.append(msg);
      if (msg.senderType === "CUSTOMER" && document.visibilityState === "visible") markRead();
    });
    return off;
  }, [threadId, cache, markRead]);

  // Stick to the bottom when a message arrives at the END (not when older ones are prepended).
  const lastId = messages.length ? messages[messages.length - 1].id : null;
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lastId]);

  async function loadOlder() {
    const first = messages[0];
    if (!first || loadingOlder) return;
    const box = scrollRef.current;
    const prevHeight = box?.scrollHeight ?? 0;
    const prevTop = box?.scrollTop ?? 0;
    setLoadingOlder(true);
    try {
      const page = await fetchOlderMessages(threadId, first.id);
      if (page.length < SUPPORT_CHAT_PAGE) setOlderExhausted(true);
      setOlder((prev) => [...page, ...prev]);
      requestAnimationFrame(() => {
        if (box) box.scrollTop = box.scrollHeight - prevHeight + prevTop;
      });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Не удалось загрузить");
    } finally {
      setLoadingOlder(false);
    }
  }

  return {
    messages,
    isLoading,
    scrollRef,
    loadingOlder,
    loadOlder,
    showLoadOlder: canLoadOlder(latest.length, olderExhausted),
  };
}
