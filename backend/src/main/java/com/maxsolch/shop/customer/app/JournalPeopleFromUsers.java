package com.maxsolch.shop.customer.app;

import com.maxsolch.shop.customer.infra.UserLookupQueries;
import com.maxsolch.shop.journal.domain.JournalPeople;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Implements the journal's {@link JournalPeople}: who the people in the activity feed are. */
@Service
public class JournalPeopleFromUsers implements JournalPeople {

    private final UserLookupQueries users;

    public JournalPeopleFromUsers(UserLookupQueries users) {
        this.users = users;
    }

    @Override
    public Map<Long, Name> namesOf(Collection<Long> telegramUserIds) {
        Map<Long, Name> out = new HashMap<>();
        users.namesOf(telegramUserIds).forEach(n ->
                out.put(n.telegramUserId(), new Name(n.firstName(), n.lastName(), n.username())));
        return out;
    }

    @Override
    public List<Long> matching(String likePattern) {
        return users.matchingName(likePattern);
    }
}
