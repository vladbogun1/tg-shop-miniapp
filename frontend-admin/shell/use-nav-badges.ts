import { useInbox } from "@/lib/inbox";
import { useSupportUnread } from "@/lib/support-api";
import { pendingCount, useTranslationStats } from "@/lib/translations";
import { pendingCards, useCardStats } from "@/lib/cards";
import { useReviewsPending } from "@/lib/reviews";
import type { BadgeKey } from "./nav-config";

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
  const { data: trStats } = useTranslationStats();
  const trPending = pendingCount(trStats);
  // Cards waiting: «Оформить» + «Проверить» of «Карточки», every 2 min.
  const { data: cardStats } = useCardStats();
  const cardsPending = pendingCards(cardStats);
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
  };
}

export const fmtCount = (n: number) => (n > 999 ? "999+" : String(n));
