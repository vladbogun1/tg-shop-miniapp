export type Tone = "neutral" | "accent" | "ok" | "warn" | "danger" | "info";

export const SOURCE_TONE: Record<string, Tone> = {
  BOT: "accent",
  SITE: "info",
  MINIAPP: "info",
  PAYMENT: "ok",
  SYSTEM: "neutral",
};

export function resultTone(result: string): Tone {
  if (result === "OK") return "ok";
  if (result === "FAILED") return "danger";
  return "warn";
}
