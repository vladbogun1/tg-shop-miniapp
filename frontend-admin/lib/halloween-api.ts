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

// ---------- the stream draw (page /halloween/pult) ----------

/** One person on the draw screen: public id and masked name, the same the OBS scene shows. */
export interface HwScreenParticipant {
  id: string;
  name: string;
  handle: string | null;
  tickets: number;
  won: boolean;
}

export interface HwScreen {
  pool: HwPool;
  rounds: number;
  locked: boolean;
  seedHash: string;
  participants: HwScreenParticipant[];
  /** Live (not voided) draws in the order they were made. */
  winners: { round: number; participantId: string }[];
  test?: boolean;
}

/** A prize pack: `images` are product photo keys (`products/…`) or https links. */
export interface HwPrize {
  id: number;
  name: string;
  items: string[];
  images: string[];
}

export interface HwPrizes {
  pool: HwPool;
  prizes: HwPrize[];
  /** round → prize id, per draw */
  rounds: Record<string, number>;
  template: string;
}

/** The live show state the OBS scene follows (events/halloween show.js). */
export interface HwShow {
  pool: HwPool;
  test: boolean;
  visual: string;
  avatars: boolean;
  sound: boolean;
  blackout: boolean;
  /** The scene is transparent: OBS shows the stream under it. */
  hidden: boolean;
  /** The between-rounds screen is on. */
  pause: boolean;
  rev: number;
  roll: { id: number; pool: HwPool; test: boolean; round: number; attempt: number; winnerId: string; totalTickets: number; at: number; revealedAt: number } | null;
  /** OBS scenes connected right now */
  stages: number;
  now: number;
}

export interface HwContactPreview {
  round: number;
  to: { name: string | null; username: string | null };
  prize: { name: string; items: string[] } | null;
  text: string;
  sent: { threadId: string | null; sentAt: string } | null;
  test: boolean;
}

/** Visuals of the stream screen (events/halloween/draw/visuals/registry.js), in its order. */
export const HW_VISUALS = [
  { value: "roulette", label: "Кейс-рулетка" },
  { value: "cauldron", label: "Котёл" },
  { value: "graveyard", label: "Кладбище" },
  { value: "wild-1-royale", label: "Королевская битва" },
  { value: "wild-2-swarm", label: "Рой" },
  { value: "wild-3-royale3d", label: "Рыцари 3D" },
] as const;
export type HwVisual = (typeof HW_VISUALS)[number]["value"];
/** The super prize always plays the knights. */
export const HW_SUPER_VISUAL: HwVisual = "wild-3-royale3d";

const q = (pool: HwPool) => `?pool=${pool}`;
const T = (test: boolean) => (test ? "/test" : "");

export const hwDraw = {
  screen: (pool: HwPool, test: boolean) => apiGet<HwScreen>(`${P}${T(test)}/participants${q(pool)}`),
  prizes: (pool: HwPool) => apiGet<HwPrizes>(`${P}/prizes${q(pool)}`),
  lock: (pool: HwPool, test: boolean) => apiPost<{ seedHash: string }>(`${P}${T(test)}/lock${q(pool)}`, {}),
  draw: (pool: HwPool, test: boolean, round: number, visual: string) =>
    apiPost<{ round: number; attempt: number; winner: string }>(`${P}${T(test)}/draw${q(pool)}`, { round, visual }),
  /** Voids the pool's last live draw and draws its round again. */
  reroll: (pool: HwPool, test: boolean, visual: string) =>
    apiPost<{ round: number; attempt: number; winner: string }>(`${P}${T(test)}/reroll${q(pool)}`, { visual }),
  /** Every round of the pool is free again; the winners go back to the pool (the proof keeps the old draws). */
  resetRounds: (pool: HwPool, test: boolean) => apiPost<unknown>(`${P}${T(test)}/rounds/reset${q(pool)}`, {}),
  /** Rehearsal only: a fresh random list of customers. */
  testReset: (pool: HwPool) => apiPost<HwScreen>(`${P}/test/reset${q(pool)}`, {}),
  show: () => apiGet<HwShow & { key: string }>(`${P}/show`),
  setShow: (patch: Partial<Pick<HwShow, "test" | "visual" | "avatars" | "sound" | "blackout" | "hidden" | "pause">>) => apiPost<HwShow>(`${P}/show`, patch),
  savePrize: (p: { id?: number; name: string; items: string[]; images: string[] }) => apiPost<HwPrizes>(`${P}/prizes${q("pumpkins")}`, p),
  deletePrize: (id: number) => apiPost<HwPrizes>(`${P}/prizes/delete${q("pumpkins")}`, { id }),
  assign: (pool: HwPool, round: number, prizeId: number | null) => apiPost<HwPrizes>(`${P}/prizes/assign${q(pool)}`, { round, prizeId }),
  setTemplate: (text: string) => apiPost<HwPrizes>(`${P}/prizes/template${q("pumpkins")}`, { text }),
  contactPreview: (pool: HwPool, round: number, test: boolean) => apiPost<HwContactPreview>(`${P}/contact/preview${q(pool)}`, { round, test }),
  contactSend: (pool: HwPool, round: number, test: boolean, text: string) =>
    apiPost<{ ok: true; threadId: string | null; to: "you" | "winner" }>(`${P}/contact/send${q(pool)}`, { round, test, text }),
};

/** The OBS scene link (no admin token in it: the key opens only what the stream shows). */
export const hwStageUrl = (key: string) => `${typeof location === "undefined" ? "" : location.origin}/hw/draw/stage.html?k=${key}`;
