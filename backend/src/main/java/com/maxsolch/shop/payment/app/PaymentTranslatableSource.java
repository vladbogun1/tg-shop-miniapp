package com.maxsolch.shop.payment.app;

import java.util.Collection;
import com.maxsolch.shop.payment.domain.PaymentOption;
import java.util.Collection;
import com.maxsolch.shop.payment.infra.PaymentOptionRepository;
import java.util.Collection;
import com.maxsolch.shop.platform.util.UuidUtil;
import java.util.Collection;
import com.maxsolch.shop.translation.app.TranslatableSource;
import java.util.Collection;
import com.maxsolch.shop.translation.app.TranslationService.Key;
import java.util.Collection;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import java.util.Collection;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.HashMap;
import java.util.Collection;
import java.util.Map;
import java.util.Collection;
import java.util.Set;

/** Payment method texts the translation module can translate. */
@Component
public class PaymentTranslatableSource implements TranslatableSource {

    private final PaymentOptionRepository repository;

    public PaymentTranslatableSource(PaymentOptionRepository repository) {
        this.repository = repository;
    }

    @Override
    public Set<TranslationEntityType> types() {
        return Set.of(TranslationEntityType.PAYMENT_OPTION);
    }

    @Override
    public Collection<byte[]> orphans(TranslationEntityType type, Collection<byte[]> ids) {
        return TranslatableSource.missing(ids, repository.existingIds(ids));
    }

    @Override
    public Map<Key, Field> fields() {
        Map<Key, Field> out = new HashMap<>();
        for (PaymentOption p : repository.findAll()) {
            String id = UuidUtil.toString(p.getId());
            out.put(new Key(TranslationEntityType.PAYMENT_OPTION, id, TranslationEntityType.TITLE),
                    new Field(p.getTitle(), p.isActive()));
            out.put(new Key(TranslationEntityType.PAYMENT_OPTION, id, TranslationEntityType.DESCRIPTION),
                    new Field(p.getDescription(), p.isActive()));
        }
        return out;
    }

    @Override
    public String applySource(SourceChange c) {
        PaymentOption o = repository.findById(c.entityId()).orElse(null);
        if (o == null) {
            return "NOT_FOUND";
        }
        boolean title = TranslationEntityType.TITLE.equals(c.field());
        if (!c.holds(title ? o.getTitle() : o.getDescription())) {
            return "STALE";
        }
        if (title) {
            o.setTitle(c.newSource());
        } else {
            o.setDescription(c.newSource());
        }
        return "OK";
    }

    @Override
    public Integer maxSourceChars(TranslationEntityType type, String field) {
        return TranslationEntityType.TITLE.equals(field) ? 255 : 1024;
    }
}
