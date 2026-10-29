package com.maxsolch.shop.preorder.app;

import com.maxsolch.shop.platform.journal.ActivityLog;
import com.maxsolch.shop.tg.SellerChannel;
import org.springframework.stereotype.Component;

/**
 * Delivery of the daily «Чего ждут» digest into the admins' chat (the Telegram side of
 * {@link PreorderDigestJob}, which decides when and what). Best-effort: a failure is logged, never thrown.
 */
@Component
public class PreorderDigestNotifier {

    private final SellerChannel seller;

    public PreorderDigestNotifier(SellerChannel seller) {
        this.seller = seller;
    }

    public void deliver(String chatId, String text) {
        seller.postChatTopicNote("Preorder digest not delivered",
                ActivityLog.Entry.bot("ADMIN_PREORDER_DIGEST").text(text), chatId, text);
    }
}
