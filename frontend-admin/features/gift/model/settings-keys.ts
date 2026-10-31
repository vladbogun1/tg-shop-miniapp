/** Ключи настроек группы `gift`, которые правит экран «Кейс» (сами настройки — features/settings). */
export const GIFT_SETTING = {
  giftEnabled: "gift.enabled",
  giftThreshold: "gift.thresholdUah",
  giftProduct: "gift.productId",
  giftCase: "gift.caseEnabled",
  promoReminder: "gift.promoReminderDays",
  margin: "gift.marginPercent",
  monthlyLimit: "gift.monthlyLimitUah",
} as const;
