/**
 * Halloween 2026 participants (page /halloween): the event's own service (events/halloween), reached on the
 * admin origin under /hw/api/admin/* with the same admin token. Remove with the event.
 */
import { apiGet, apiPost } from "@/lib/api";

const P = "/hw/api/admin";

/** Earlier customer's invite: pressed «Участвовать» / got it, not pressed / Telegram refused / not sent yet. */
export type InviteState = "joined" | "grey" | "blocked" | "error" | "not-sent";
/** What the bot broadcast got back from Telegram. */
export type SendStatus = "ok" | "blocked" | "error";

export interface HwMember {
  tgId: string;
  name: string | null;
  username: string | null;
  lang: string | null;
  /** users.bot_blocked in the shop (updated from the broadcast too). */
  botBlocked: boolean;
  pumpkins: number;
  pumpkinDays: number;
  lastPumpkinAt: number | null;
  pumpkinTickets: number;
  /** 0..1 */
  pumpkinChance: number;
  /** Orders and money inside the event window. */
  orders: number;
  spendMinor: number;
  orderTickets: number;
  orderChance: number;
  lifetimeOrders: number;
  lifetimeSpendMinor: number;
  old: boolean;
  oldSpendMinor: number;
  /** Spend before the shop database, typed by hand (already inside oldSpendMinor). */
  manualSpendMinor: number;
  invite: InviteState | null;
  joinedAt: number | null;
  broadcast: SendStatus | null;
  broadcastAt: number | null;
  /** Excluded from both draws (note), null = takes part. */
  excluded: string | null;
}

export interface HwMembers {
  rows: HwMember[];
  summary: {
    total: number;
    pumpkinPeople: number;
    pumpkinsCollected: number;
    fullSets: number;
    orderPeople: number;
    spendMinor: number;
    oldTotal: number;
    oldJoined: number;
    oldGrey: number;
    blocked: number;
    excluded: number;
  };
  rest: { sent: number; blocked: number; error: number };
  locked: { pumpkins: boolean; orders: boolean };
  rules: { goal: number; minSpendMinor: number; oldMinSpendMinor: number; endsAt: string; streamAt: string };
}

export interface HwJob {
  campaign: "old" | "rest";
  total: number;
  done: number;
  ok: number;
  blocked: number;
  error: number;
  startedAt: number;
  finishedAt: number | null;
}

export interface HwBroadcastStatus {
  job: HwJob | null;
  left: { old: number; rest: number };
  botToken: boolean;
  only: number;
}

export type HwPool = "pumpkins" | "orders";

export const hwApi = {
  members: () => apiGet<HwMembers>(`${P}/members`),
  broadcastStatus: () => apiGet<HwBroadcastStatus>(`${P}/broadcast/status`),
  broadcastTest: () => apiPost<{ lang: string; result: Record<string, SendStatus> }>(`${P}/broadcast/test`, {}),
  broadcastStart: (campaign: "old" | "rest", confirm: number) =>
    apiPost<HwJob>(`${P}/broadcast/start`, { campaign, confirm }),
  /** Excluded from both draws; the pool only says which list to check the person against. */
  exclude: (pool: HwPool, tgId: string, note: string) => apiPost<{ ok: true }>(`${P}/exclude?pool=${pool}`, { tgId, note }),
  /** A customer whose purchases are older than the shop database: `who` = Telegram id or @username. */
  addManual: (who: string, spendUah: number, note: string) =>
    apiPost<{ tgId: string; name: string | null; username: string | null; shopMinor: number; manualMinor: number; oldSpendMinor: number }>(`${P}/manual`, { who, spendUah, note }),
  removeManual: (tgId: string) => apiPost<{ ok: true }>(`${P}/manual/remove`, { tgId }),
  include: (pool: HwPool, tgId: string) => apiPost<{ ok: true }>(`${P}/include?pool=${pool}`, { tgId }),
};
