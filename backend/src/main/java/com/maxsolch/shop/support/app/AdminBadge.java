package com.maxsolch.shop.support.app;

/**
 * The number the admin app shows on its icon: how many things wait for the owner. Support only asks for it when it
 * pushes a new message; the module that knows the number (inbox, which stands above support) answers.
 */
public interface AdminBadge {

    /** Current number of rows waiting for the owner. */
    int total();
}
