import { useInbox } from "@/features/inbox";
import { useSupportUnread } from "@/features/support";
import { pendingCount, useTranslationStats } from "@/features/translation";
import { useAiSummary } from "@/features/ai";
import { pendingCards, useCardStats } from "@/features/cards";
import { useReviewsPending } from "@/features/review";
import { useIsSuperAdmin } from "@/features/staff";
import { itemBadgeKeys, type BadgeKey, type NavItem } from "./nav-config";

export interface BadgeInfo {
  count: number;
  label: string;
  title?: string;
  /** Orange (someone waits for an answer) vs muted (backlog). */
  strong: boolean;
}

/** Live counters of the menu, by badge key. */
export function useNavBadges(): Record<BadgeKey, BadgeInfo> {
  // Texts that need a translation («Нужно перевести» + «Устарели»), every 2 min and after imports.
  // Only the main admin sees «Переводы» (the rest is translated automatically), so only the main admin's menu asks.
  const superAdmin = useIsSuperAdmin();
  const { data: trStats } = useTranslationStats(superAdmin === true);
  const trPending = pendingCount(trStats);
  // Cards waiting: «Оформить» + «Проверить» of «Карточки», every 2 min.
  const { data: cardStats } = useCardStats();
  const cardsPending = pendingCards(cardStats);
  // ИИ-задачи: ждут проверки + сбои за сутки (тот же /summary, что у чипа ✦ в шапке).
  const { data: ai } = useAiSummary();
  const aiWaiting = (ai?.review ?? 0) + (ai?.problems ?? 0);
  // Rows waiting on «Внимание» (same query as the bell, polled every 30 s).
  const { data: inbox } = useInbox();
  const inboxTotal = inbox?.total ?? 0;
  // Reviews waiting for moderation — the page's «На модерации» tab (snoozed ones included).
  const { data: reviewsPendingData } = useReviewsPending();
  const reviewsPending = reviewsPendingData ?? 0;
  // Support questions waiting for an answer (GET /api/admin/support/unread-count, every 30 s).
  const { data: supportUnread } = useSupportUnread();
  const supportWaiting = supportUnread?.count ?? 0;
  return {
    inbox: {
      count: inboxTotal,
      label: `Требует внимания: ${inboxTotal}`,
      strong: true,
    },
    support: {
      count: supportWaiting,
      label: `Ждут ответа в поддержке: ${supportWaiting}`,
      strong: true,
    },
    reviews: {
      count: reviewsPending,
      label: `Отзывов на модерации: ${reviewsPending}`,
      strong: false,
    },
    translations: {
      count: trPending,
      label: `Нужно перевести: ${trPending}`,
      title: "Тексты без актуального перевода: «Нужно перевести» + «Устарели»",
      strong: false,
    },
    cards: {
      count: cardsPending,
      label: `Карточек ждут оформления или проверки: ${cardsPending}`,
      title: "Карточки: «Оформить» + «Проверить»",
      strong: false,
    },
    ai: {
      count: aiWaiting,
      label: `ИИ-задач ждут проверки или со сбоем: ${aiWaiting}`,
      title: "ИИ-задачи: «Проверить» + «Проблемы»",
      strong: false,
    },
  };
}

export const fmtCount = (n: number) => (n > 999 ? "999+" : String(n));

/**
 * Бейдж пункта меню: свой счётчик или сумма счётчиков его вкладок («Карточки» = карточки + ИИ-задачи).
 * Один ключ — его подпись как есть; несколько — общая подпись с названием пункта.
 */
export function itemBadge(item: NavItem, badges: Record<BadgeKey, BadgeInfo>, superAdmin: boolean | undefined): BadgeInfo | undefined {
  const keys = itemBadgeKeys(item, superAdmin);
  if (keys.length === 0) return undefined;
  if (keys.length === 1) return badges[keys[0]];
  const parts = keys.map((k) => badges[k]);
  const count = parts.reduce((n, b) => n + b.count, 0);
  return {
    count,
    label: `Ждут в разделе «${item.label}»: ${count}`,
    title: parts.map((b) => b.label).join("\n"),
    strong: parts.some((b) => b.strong && b.count > 0),
  };
}

/** Сумма счётчиков блока меню (рядом со свёрнутым заголовком и точкой на свёрнутой полосе). */
export function sectionPending(items: NavItem[], badgeOf: (item: NavItem) => BadgeInfo | undefined): { pending: number; strong: boolean } {
  const all = items.map(badgeOf).filter((b): b is BadgeInfo => !!b);
  return { pending: all.reduce((n, b) => n + b.count, 0), strong: all.some((b) => b.strong && b.count > 0) };
}
