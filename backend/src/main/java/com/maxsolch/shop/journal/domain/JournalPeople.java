package com.maxsolch.shop.journal.domain;

import java.util.Collection;
import java.util.List;
import java.util.Map;

/** The journal asks the owner of users who the people in its rows are and which of them match a search. */
public interface JournalPeople {

    /** How a person is shown in the feed. */
    record Name(String firstName, String lastName, String username) {
    }

    /** Names of these users; ids without a user are absent from the result. */
    Map<Long, Name> namesOf(Collection<Long> telegramUserIds);

    /**
     * Telegram ids of users whose username, first or last name matches a SQL LIKE pattern
     * (backslash escapes {@code %} and {@code _}, as in MySQL).
     */
    List<Long> matching(String likePattern);
}
