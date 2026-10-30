package com.maxsolch.shopfixture.order.app;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.util.Date;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Breaks the "one way" rules the fixture project checks: W1, K1 (by created type), E1, C1, A1. */
public class BadPractices {

    @PersistenceContext
    EntityManager em;

    /** Declared as a plain Map, created as a ConcurrentHashMap: K1 must look at what is created. */
    private final Map<String, String> memo = new ConcurrentHashMap<>();

    /** A business error that is not a DomainException. */
    public static class MyFailure extends RuntimeException {
    }

    /** An error reason that is not an enum constant: E2. */
    public static class AdHocError implements com.maxsolch.shopfixture.platform.error.ErrorCode {
        @Override
        public String code() {
            return "AD_HOC";
        }
    }

    /** A setter of a guarded entity called from app: O2. */
    public void overwriteTotal(com.maxsolch.shopfixture.order.domain.Order order) {
        order.setTotalMinor(1);
    }

    public Object tick() {
        Object who = SecurityContextHolder.getContext();
        if (memo.isEmpty()) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT, "no");
        }
        return new Object[]{System.currentTimeMillis(), new Date(), who};
    }
}
