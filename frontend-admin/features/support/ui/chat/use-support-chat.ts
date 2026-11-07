"use client";

import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@shop/core/errors";
import { toast } from "@shop/ui/toast";
import { canLoadOlder, mergeMessages, SUPPORT_CHAT_PAGE } from "../../model/chat";
import type { SupportMessage } from "../../model/types";
import {
  fetchOlderMessages,
  useMarkSupportRead,
  useSupportChatCache,
  useSupportMessages,
} from "../../queries";
import { subscribeSupportThread } from "@/shell/realtime";

/**
 * Keeps a chat pinned to its last message while the box or its content changes size (photos load, quick
 * templates and the product strip appear after the first scroll). Pinned = the reader is within 80 px of the end;
 * scrolling up to read history unpins it.
 */
function useStickToBottom(ref: RefObject<HTMLDivElement | null>, key: string) {
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    let pinned = true;
    const onScroll = () => {
      pinned = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    };
    const ro = new ResizeObserver(() => {
      if (pinned) box.scrollTop = box.scrollHeight;
    });
    ro.observe(box);
    for (const child of Array.from(box.children)) ro.observe(child);
    const mo = new MutationObserver(() => {
      for (const child of Array.from(box.children)) ro.observe(child);
    });
    mo.observe(box, { childList: true });
    box.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
      box.removeEventListener("scroll", onScroll);
    };
  }, [ref, key]);
}

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
    const off = subscribeSupportThread<SupportMessage>(threadId, (msg) => {
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
  // Re-attached when the box appears (after the skeleton) or another thread opens.
  useStickToBottom(scrollRef, `${threadId}:${isLoading}`);

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
