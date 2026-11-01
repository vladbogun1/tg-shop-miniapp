package com.maxsolch.shop.inbox.app;

import com.maxsolch.shop.inbox.infra.InboxStore;
import com.maxsolch.shop.staff.domain.AdminTraces;
import org.springframework.stereotype.Service;

/** Implements staff's {@link AdminTraces}: the admin's «Отложить» / «Скрыть» marks in the inbox. */
@Service
public class InboxMarkTraces implements AdminTraces {

    private final InboxStore store;

    public InboxMarkTraces(InboxStore store) {
        this.store = store;
    }

    @Override
    public String label() {
        return "отметок в «Внимание»";
    }

    @Override
    public long countBy(long adminId) {
        return store.countMarksBy(adminId);
    }
}
