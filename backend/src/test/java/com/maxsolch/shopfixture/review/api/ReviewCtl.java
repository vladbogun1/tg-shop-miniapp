package com.maxsolch.shopfixture.review.api;

import com.maxsolch.shopfixture.platform.journal.ActivityLog;
import com.maxsolch.shopfixture.platform.security.AdminAccess;

/** A controller that writes the journal itself and checks a right by hand: A2 and A3. */
public class ReviewCtl {
    ActivityLog activity = new ActivityLog();

    void delete() {
        new AdminAccess().requireSuperAdmin(1L, "delete");
    }
}
