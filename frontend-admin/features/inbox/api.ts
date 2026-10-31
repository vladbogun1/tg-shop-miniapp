import { apiGet, apiPost } from "@/lib/http";
import type { Inbox, InboxItem, SnoozePreset } from "./model/types";

type RowRef = Pick<InboxItem, "type" | "entityId" | "version">;

export const inboxApi = {
  get: () => apiGet<Inbox>("/api/admin/inbox"),
  snooze: (it: RowRef, preset: SnoozePreset) =>
    apiPost<{ until: string }>("/api/admin/inbox/snooze", {
      type: it.type,
      entityId: it.entityId,
      version: it.version,
      preset,
    }),
  dismiss: (it: RowRef) =>
    apiPost<void>("/api/admin/inbox/dismiss", { type: it.type, entityId: it.entityId, version: it.version }),
  restore: (it: Pick<InboxItem, "type" | "entityId">) =>
    apiPost<void>("/api/admin/inbox/restore", { type: it.type, entityId: it.entityId }),
};
