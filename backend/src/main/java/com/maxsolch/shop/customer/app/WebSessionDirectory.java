package com.maxsolch.shop.customer.app;

import com.maxsolch.shop.customer.infra.WebSessionRepository;
import com.maxsolch.shop.platform.security.WebSessionLookup;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.stereotype.Component;

import java.time.Instant;

/** The site sessions as the token check sees them: a row that is neither revoked nor expired. */
@Component
public class WebSessionDirectory implements WebSessionLookup {

    private final WebSessionRepository repository;

    public WebSessionDirectory(WebSessionRepository repository) {
        this.repository = repository;
    }

    @Override
    public boolean isLive(String sessionId, Instant now) {
        try {
            return repository.findById(UuidUtil.toBytes(sessionId))
                    .map(s -> s.isActive(now))
                    .orElse(false);
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
