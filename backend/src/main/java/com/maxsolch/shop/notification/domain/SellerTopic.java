package com.maxsolch.shop.notification.domain;

/** The forum topics of the seller's group; the ids come from the settings, 0 = not configured (no topic). */
public enum SellerTopic {
    NEW, PROCESSING, SHIPPED, CLOSED, REJECTED, CHAT, DISPATCH
}
