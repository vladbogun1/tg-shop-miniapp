"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { customerApi, getAccessToken, onAccessToken, type SendMessageRequest } from "@/lib/api";
import { dayLabel } from "@/lib/format";
import { connectSupportChat, supportApi, type SupportMessage } from "@/lib/support";
import { haptic } from "@/platform/telegram";
import { hasUnreadFromShop } from "@shop/customer/chat/model";
import { useThread } from "@shop/customer/chat/use-thread";
import { SUPPORT_KEYS } from "@shop/customer/support/model";
import { supportKeys } from "../keys";

const CONFIG_STALE_MS = 60_000;

/** Everything the support thread screen needs: queries, realtime, mark-read, send / create, close. */
export function useSupportThread() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = params.id;
  const isDraft = id === "new";
  const draftProductId = isDraft ? search.get("product") : null;

  const [connected, setConnected] = useState(false);
  const [replyTo, setReplyTo] = useState<SupportMessage | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState<string | null>(() => getAccessToken());
  useEffect(() => onAccessToken(setToken), []);

  const { data: config } = useQuery({
    queryKey: supportKeys.config,
    queryFn: () => supportApi.config(),
    enabled: !!token,
    staleTime: CONFIG_STALE_MS,
  });

  const { data: thread, refetch: refetchThread } = useQuery({
    queryKey: supportKeys.thread(id),
    queryFn: () => supportApi.thread(id),
    enabled: !!token && !isDraft,
  });

  const { data: draftProduct } = useQuery({
    queryKey: supportKeys.product(draftProductId),
    queryFn: () => customerApi.getProduct(draftProductId!),
    enabled: !!draftProductId,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: SUPPORT_KEYS.messages(id),
    queryFn: () => supportApi.messages(id),
    enabled: !!token && !isDraft,
  });

  const { messages, appendMessage, hasMore, loadingEarlier, loadEarlier, byId, days } = useThread<SupportMessage>({
    history: data,
    fetchOlder: (before) => supportApi.messages(id, before),
    scrollRef,
    dayLabel,
  });

  useEffect(() => {
    if (isDraft || !id || !token) return;
    const conn = connectSupportChat(id, appendMessage, setConnected);
    return () => conn.disconnect();
  }, [id, isDraft, token, appendMessage]);

  // Mark the shop's answers read (on load and whenever a new one arrives).
  useEffect(() => {
    if (isDraft || messages.length === 0) return;
    if (hasUnreadFromShop(messages)) {
      supportApi
        .markRead(id)
        .then(() => queryClient.invalidateQueries({ queryKey: supportKeys.threads }))
        .catch(() => {});
    }
  }, [id, isDraft, messages, queryClient]);

  async function handleSend(req: SendMessageRequest) {
    if (isDraft) {
      const created = await supportApi.create({
        productId: draftProductId ?? undefined,
        text: req.text,
        type: req.type,
        attachmentUrl: req.attachmentUrl,
        fileName: req.fileName,
        mimeType: req.mimeType,
      });
      void queryClient.invalidateQueries({ queryKey: supportKeys.threads });
      router.replace(`/account/support/${created.id}/chat`);
      return;
    }
    const sent = await supportApi.send(id, { ...req, replyToMessageId: replyTo?.id });
    appendMessage(sent);
    setReplyTo(null);
    if (thread?.status === "CLOSED") void refetchThread();
    void queryClient.invalidateQueries({ queryKey: supportKeys.threads });
  }

  async function closeThread() {
    haptic();
    try {
      await supportApi.close(id);
      await refetchThread();
      void queryClient.invalidateQueries({ queryKey: supportKeys.threads });
    } catch {
      /* the header keeps the old status; nothing else to do */
    }
  }


  return {
    id,
    isDraft,
    config,
    thread,
    draftProduct,
    connected,
    scrollRef,
    token,
    replyTo,
    setReplyTo,
    lightbox,
    setLightbox,
    isLoading,
    isError,
    refetch,
    messages,
    hasMore,
    loadingEarlier,
    loadEarlier,
    byId,
    days,
    handleSend,
    closeThread,
  };
}
