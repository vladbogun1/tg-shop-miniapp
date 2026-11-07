package com.maxsolch.shop.customer.app;

import com.maxsolch.shop.customer.infra.UserLookupQueries;
import org.springframework.stereotype.Service;

import java.util.List;

/** Finding customers by name for the screens of other modules (the review search): ids only, nothing else leaves. */
@Service
public class CustomerSearch {

    private final UserLookupQueries users;

    public CustomerSearch(UserLookupQueries users) {
        this.users = users;
    }

    /** Telegram ids of customers whose username, first or last name matches the LIKE pattern (backslash escape). */
    public List<Long> idsByName(String like) {
        return users.matchingName(like);
    }
}
