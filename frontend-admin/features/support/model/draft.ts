import { sessionStore } from "@shop/core/storage";

const drafts = new Map<string, string>();
const DRAFT_KEY = (id: string) => `tgshop_admin_support_draft:${id}`;

/** Черновик ответа по вопросу: в памяти и в sessionStorage (переживает закрытие панели). */
export function loadDraft(id: string): string {
  if (drafts.has(id)) return drafts.get(id) ?? "";
  try {
    return sessionStore.getItem(DRAFT_KEY(id)) ?? "";
  } catch {
    return "";
  }
}

export function saveDraft(id: string, text: string) {
  drafts.set(id, text);
  try {
    if (text) sessionStore.setItem(DRAFT_KEY(id), text);
    else sessionStore.removeItem(DRAFT_KEY(id));
  } catch {
    // storage unavailable — the in-memory copy still survives closing the drawer
  }
}
