import { connectOrderChat, type ChatConnection } from "@shop/core/ws";
import { supportTopic } from "@shop/core/support";
import { apiOrigin, getAccessToken } from "@/lib/api";
import type { SupportMessage } from "./model/types";

/** STOMP /topic/support/{threadId} → SupportMessage. Returns an unsubscribe function. */
export function subscribeSupportChat(
  threadId: string,
  onMessage: (msg: SupportMessage) => void,
  onStatus?: (connected: boolean) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const connection: ChatConnection = connectOrderChat({
    baseUrl: apiOrigin,
    orderId: threadId,
    topic: supportTopic(threadId),
    getToken: getAccessToken,
    // The payload is a SupportMessage (threadId instead of orderId); the client only parses JSON.
    onMessage: (msg) => onMessage(msg as unknown as SupportMessage),
    onStatus,
  });
  return () => connection.disconnect();
}
