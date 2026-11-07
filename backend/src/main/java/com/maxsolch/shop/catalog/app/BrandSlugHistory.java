package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.domain.BrandSlugRedirect;
import com.maxsolch.shop.catalog.infra.BrandSlugRedirectRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Old addresses of brands (V85): a renamed slug keeps answering with a 301 to the new one. Written
 * inside the brand's own transaction, read by the public endpoint the site's middleware asks.
 */
@Service
public class BrandSlugHistory {

    /** More than a handful of brand slugs in one URL is not a real link. */
    static final int MAX_LOOKUP = 20;

    private final BrandSlugRedirectRepository repository;

    public BrandSlugHistory(BrandSlugRedirectRepository repository) {
        this.repository = repository;
    }

    /** The brand's slug changed: the old one redirects, and the new one stops being a redirect. */
    @Transactional
    public void slugChanged(byte[] brandId, String oldSlug, String newSlug) {
        if (oldSlug == null || oldSlug.equals(newSlug)) {
            return;
        }
        repository.deleteById(newSlug);
        repository.save(new BrandSlugRedirect(oldSlug, brandId));
    }

    /** {@code source} was merged into {@code target}: its slug and every slug it had lead to the target. */
    @Transactional
    public void merged(byte[] sourceId, String sourceSlug, byte[] targetId, String targetSlug) {
        repository.repoint(sourceId, targetId);
        slugChanged(targetId, sourceSlug, targetSlug);
    }

    /** Old slug → current slug, only for the slugs that really are old ones. */
    @Transactional(readOnly = true)
    public Map<String, String> resolve(Collection<String> slugs) {
        Map<String, String> out = new LinkedHashMap<>();
        if (slugs == null) {
            return out;
        }
        var wanted = slugs.stream().filter(s -> s != null && !s.isBlank())
                .map(s -> s.trim().toLowerCase(Locale.ROOT)).distinct().limit(MAX_LOOKUP).toList();
        if (wanted.isEmpty()) {
            return out;
        }
        for (Object[] row : repository.resolve(wanted)) {
            out.put((String) row[0], (String) row[1]);
        }
        return out;
    }
}
