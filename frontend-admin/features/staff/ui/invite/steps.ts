import type { InviteInfo, TwoFactorSetup } from "../../api";

export type InviteStep =
  | { kind: "dead"; message: string }
  | { kind: "form"; info: InviteInfo }
  | { kind: "setup"; info: InviteInfo; setup: TwoFactorSetup }
  | { kind: "verify"; info: InviteInfo };

/** Разбор ошибки шага: мёртвая ссылка закрывает поток, истёкший первый шаг — назад к форме; иначе текст. */
export type InviteFail = (e: unknown, info: InviteInfo) => string | null;
