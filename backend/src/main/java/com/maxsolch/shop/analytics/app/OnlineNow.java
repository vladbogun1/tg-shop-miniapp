package com.maxsolch.shop.analytics.app;

import com.maxsolch.shop.analytics.infra.OnlineQueries;
import com.maxsolch.shop.customer.app.OnlineVisitors;
import org.springframework.stereotype.Service;

/** Implements customer's {@link OnlineVisitors}: the users map shows who is online from the client events journal. */
@Service
public class OnlineNow implements OnlineVisitors {

    private final OnlineQueries queries;

    public OnlineNow(OnlineQueries queries) {
        this.queries = queries;
    }

    @Override
    public Counts within(int windowMinutes) {
        var c = queries.within(windowMinutes);
        return new Counts(c.miniapp(), c.web(), c.total());
    }
}
