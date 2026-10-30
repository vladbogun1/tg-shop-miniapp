package com.maxsolch.shop.inbox.app;

import com.maxsolch.shop.inbox.domain.InboxChatRow;
import com.maxsolch.shop.inbox.domain.InboxOrderRow;
import com.maxsolch.shop.inbox.infra.InboxStore;

import com.maxsolch.shop.analytics.app.MetricsDtos.ReorderRow;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.site.app.SiteRevalidator;

import java.time.Instant;
import java.util.List;

/**
 * Everything the inbox is computed from, loaded in a handful of grouped queries (see
 * {@link InboxStore}) and handed to the pure {@link InboxRules}.
 *
 * @param orders     candidate orders (pre-narrowed in SQL; the rules re-check every condition)
 * @param chats      orders with unread customer messages, one row per order
 * @param runningOut the «Заканчиваются» rows of the metrics
 * @param site       last outcome of the public-site rebuild; null = unknown
 */
public record InboxFacts(Instant now, List<InboxOrderRow> orders, List<InboxChatRow> chats, List<ReorderRow> runningOut,
                         SiteRevalidator.Status site) {
}
