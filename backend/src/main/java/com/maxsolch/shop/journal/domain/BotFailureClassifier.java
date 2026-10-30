package com.maxsolch.shop.journal.domain;

import com.maxsolch.shop.journal.app.ActivityLog;

/**
 * Port of the journal: turns a failed bot call into a stable code + readable text. The journal (platform) must not
 * know the Telegram library, so the implementation lives in {@code notification}.
 */
public interface BotFailureClassifier {

    BotFailure classify(Throwable t);
}
