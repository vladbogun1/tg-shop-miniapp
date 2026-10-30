package com.maxsolch.shop.support.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.support.domain.SupportError;
import com.maxsolch.shop.support.domain.SupportThread;
import com.maxsolch.shop.support.infra.SupportThreadRepository;
import org.springframework.stereotype.Component;

/** A support thread by its id from the URL: not found, or not the caller's (→ 403). */
@Component
class SupportThreadLookup {

    private final SupportThreadRepository threads;

    SupportThreadLookup(SupportThreadRepository threads) {
        this.threads = threads;
    }

    SupportThread owned(long userId, String threadId) {
        SupportThread t = load(threadId);
        requireOwner(t, userId);
        return t;
    }

    SupportThread ownedForUpdate(long userId, String threadId) {
        SupportThread t = threads.findForUpdate(parseId(threadId))
                .orElseThrow(() -> new DomainException.NotFound(SupportError.THREAD_NOT_FOUND));
        requireOwner(t, userId);
        return t;
    }

    void requireOwner(SupportThread t, long userId) {
        if (t.getUserId() == null || t.getUserId() != userId) {
            throw new DomainException.Forbidden(SupportError.NOT_YOUR_THREAD);
        }
    }

    SupportThread load(String threadId) {
        return threads.findById(parseId(threadId))
                .orElseThrow(() -> new DomainException.NotFound(SupportError.THREAD_NOT_FOUND));
    }

    byte[] parseId(String threadId) {
        try {
            return UuidUtil.toBytes(threadId);
        } catch (RuntimeException e) {
            throw new DomainException.NotFound(SupportError.THREAD_NOT_FOUND);
        }
    }
}
