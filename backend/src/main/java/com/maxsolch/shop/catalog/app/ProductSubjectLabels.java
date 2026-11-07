package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.ai.domain.SubjectLabels;
import com.maxsolch.shop.catalog.domain.ProductBrief;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;

/** Names the products of AI tasks for the task center; the ai module asks through its port and knows no catalog. */
@Component
public class ProductSubjectLabels implements SubjectLabels {

    private final ProductBriefs products;

    public ProductSubjectLabels(ProductBriefs products) {
        this.products = products;
    }

    @Override
    public String subjectType() {
        return CardAiJobs.SUBJECT;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, String> labels(Collection<String> subjectIds) {
        var ids = subjectIds.stream().map(ProductSubjectLabels::bytes).filter(b -> b != null).toList();
        Map<String, String> out = new HashMap<>();
        for (Map.Entry<String, ProductBrief> e : products.briefs(ids).entrySet()) {
            out.put(e.getKey(), e.getValue().title());
        }
        return out;
    }

    private static byte[] bytes(String id) {
        try {
            return UuidUtil.toBytes(id);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
