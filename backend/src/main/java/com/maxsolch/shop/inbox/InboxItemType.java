package com.maxsolch.shop.inbox;

/**
 * Kinds of rows on the admin «Внимание» screen. One kind = one group; the declaration order IS the
 * order of urgency the groups are shown in (money first, the site last).
 */
public enum InboxItemType {

    /** «Я оплатил» claim the admin has not confirmed yet. */
    PAYMENT("Подтвердить оплату", "Покупатель прислал подтверждение перевода — проверьте поступление.", "ORDER", false),
    /** Unread customer messages in an order chat. */
    CHAT("Непрочитанные чаты", "Покупатели ждут ответа в чате заказа.", "ORDER", false),
    /** NEW order nobody approved within {@code inbox.newStaleHours}. */
    NEW_STALE("Новые без одобрения", "Заказ ждёт одобрения дольше порога из «Настроек».", "ORDER", false),
    /** APPROVED order not shipped within {@code inbox.approvedStaleHours}. */
    APPROVED_STALE("Одобрены, не отправлены", "Заказ одобрен, но не отправлен дольше порога из «Настроек».", "ORDER", false),
    /** Refused at the post office after shipping, or a registered return (last 14 days). */
    RETURN("Отказы и возвраты", "Отказ после отправки или зарегистрированный возврат за 14 дней — проверьте посылку и деньги.", "ORDER", true),
    /** Runs out within {@code metrics.lowStockDays} at the current pace. */
    LOW_STOCK("Заканчиваются", "Запаса хватит меньше чем на порог из «Настроек» — пора дозаказать.", "PRODUCT", true),
    /** The last public-site rebuild failed. */
    SITE_ERROR("Сайт не обновился", "Последнее обновление сайта завершилось ошибкой — изменения могут не отображаться.", "SITE", true);

    private final String title;
    private final String hint;
    private final String auditEntityType;
    private final boolean dismissible;

    InboxItemType(String title, String hint, String auditEntityType, boolean dismissible) {
        this.title = title;
        this.hint = hint;
        this.auditEntityType = auditEntityType;
        this.dismissible = dismissible;
    }

    /** Russian group title. */
    public String title() {
        return title;
    }

    /** Russian one-line explanation under the group title. */
    public String hint() {
        return hint;
    }

    /** {@code admin_audit_log.entity_type} for «Разобрано». */
    public String auditEntityType() {
        return auditEntityType;
    }

    /**
     * Informational rows may be marked «Разобрано». The others disappear only once acted upon
     * (payment confirmed, chat read, order moved on) — they can merely be snoozed.
     */
    public boolean dismissible() {
        return dismissible;
    }

    /** Lenient parse for request bodies; null when unknown. */
    public static InboxItemType parse(String raw) {
        if (raw == null) {
            return null;
        }
        try {
            return valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
