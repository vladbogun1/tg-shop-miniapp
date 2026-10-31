import { Bot, Cog, CreditCard, Globe, Smartphone, type LucideIcon } from "lucide-react";

export const SOURCE_ICON: Record<string, LucideIcon> = {
  BOT: Bot,
  SITE: Globe,
  MINIAPP: Smartphone,
  PAYMENT: CreditCard,
  SYSTEM: Cog,
};

export function sourceIcon(source: string): LucideIcon {
  return SOURCE_ICON[source] ?? Cog;
}
