package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.DeliveryMethod;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.ReplyTemplate;
import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.repository.ReplyTemplateRepository;
import com.maxsolch.shop.web.NotFoundException;
import com.maxsolch.shop.web.dto.ReplyTemplateDtos.RenderedTemplateDto;
import com.maxsolch.shop.web.dto.ReplyTemplateDtos.TemplateDto;
import com.maxsolch.shop.web.dto.ReplyTemplateDtos.TemplateUpsertRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Chat reply templates: CRUD for the admin and filling one in for an order.
 *
 * <p>Placeholders: {@code {name} {orderNo} {total} {cod} {ttn} {warehouse}}. The text
 * is taken in the customer's language ({@code users.locale}, then their Telegram language), falling
 * back to Ukrainian and then to the required Russian text. The result is only a draft — the admin
 * sees it in the input and can edit it before sending.
 */
@Service
public class ReplyTemplateService {

    private static final Pattern PLACEHOLDER = Pattern.compile("\\{([a-zA-Z]+)}");

    private final ReplyTemplateRepository repository;
    private final OrderRepository orderRepository;
    private final Messages messages;

    public ReplyTemplateService(ReplyTemplateRepository repository,
                                OrderRepository orderRepository,
                                Messages messages) {
        this.repository = repository;
        this.orderRepository = orderRepository;
        this.messages = messages;
    }

    // ----- CRUD -----

    @Transactional(readOnly = true)
    public List<TemplateDto> list() {
        return repository.findAllByOrderBySortAscIdAsc().stream().map(ReplyTemplateService::toDto).toList();
    }

    @Transactional
    public TemplateDto create(TemplateUpsertRequest req) {
        ReplyTemplate t = new ReplyTemplate();
        apply(t, req);
        if (req.sort() == null) {
            // New templates go to the end of the list.
            t.setSort(repository.findAllByOrderBySortAscIdAsc().stream()
                    .mapToInt(ReplyTemplate::getSort).max().orElse(0) + 10);
        }
        return toDto(repository.save(t));
    }

    @Transactional
    public TemplateDto update(long id, TemplateUpsertRequest req) {
        ReplyTemplate t = repository.findById(id).orElseThrow(() -> new NotFoundException("template not found"));
        apply(t, req);
        return toDto(repository.save(t));
    }

    @Transactional
    public String delete(long id) {
        ReplyTemplate t = repository.findById(id).orElseThrow(() -> new NotFoundException("template not found"));
        repository.delete(t);
        return t.getTitle();
    }

    private static void apply(ReplyTemplate t, TemplateUpsertRequest req) {
        t.setTitle(req.title().trim());
        t.setBodyRu(req.bodyRu().trim());
        t.setBodyUk(blankToNull(req.bodyUk()));
        t.setBodyEn(blankToNull(req.bodyEn()));
        if (req.sort() != null) {
            t.setSort(req.sort());
        }
    }

    private static TemplateDto toDto(ReplyTemplate t) {
        return new TemplateDto(t.getId(), t.getTitle(), t.getBodyRu(), t.getBodyUk(), t.getBodyEn(), t.getSort());
    }

    // ----- rendering -----

    /** Every template filled in for this order, in the customer's language. */
    @Transactional(readOnly = true)
    public List<RenderedTemplateDto> renderForOrder(byte[] orderId) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new NotFoundException("order not found"));
        Locale locale = messages.localeOf(order.getTgUserId());
        Map<String, String> vars = variables(order, locale);
        List<RenderedTemplateDto> out = new ArrayList<>();
        for (ReplyTemplate t : repository.findAllByOrderBySortAscIdAsc()) {
            Picked picked = pick(t, locale.getLanguage());
            out.add(new RenderedTemplateDto(t.getId(), t.getTitle(), fill(picked.body(), vars), picked.lang()));
        }
        return out;
    }

    /** Text + the language it is actually in. */
    record Picked(String body, String lang) {
    }

    /** Customer's language → Ukrainian (the shop's fallback) → Russian (always present). */
    static Picked pick(ReplyTemplate t, String lang) {
        String want = lang == null ? "uk" : lang;
        if ("en".equals(want) && notBlank(t.getBodyEn())) {
            return new Picked(t.getBodyEn(), "en");
        }
        if ("ru".equals(want)) {
            return new Picked(t.getBodyRu(), "ru");
        }
        if (notBlank(t.getBodyUk())) {
            return new Picked(t.getBodyUk(), "uk");
        }
        return new Picked(t.getBodyRu(), "ru");
    }

    Map<String, String> variables(Order order, Locale locale) {
        Map<String, String> v = new LinkedHashMap<>();
        v.put("name", firstName(order.getCustomerName()));
        String id = UuidUtil.toString(order.getId());
        v.put("orderNo", id == null ? "" : id.substring(0, Math.min(8, id.length())));
        v.put("total", money(order.getTotalMinor()));
        v.put("cod", money(OrderQueryService.codMinor(order)));
        v.put("ttn", order.getTrackingNumber() == null || order.getTrackingNumber().isBlank()
                ? "—" : order.getTrackingNumber());
        if (order.getDeliveryMethod() == DeliveryMethod.PICKUP) {
            v.put("warehouse", messages.get(locale, "reply.pickup"));
        } else {
            String city = order.getNpCityName() == null ? "" : order.getNpCityName();
            String wh = order.getNpWarehouseName() == null ? "" : order.getNpWarehouseName();
            v.put("warehouse", (city + (city.isEmpty() || wh.isEmpty() ? "" : ", ") + wh).trim());
        }
        return v;
    }

    /**
     * Replaces known {@code {placeholders}}; unknown ones are left as typed so a typo in a template
     * is visible in the draft instead of silently disappearing.
     */
    static String fill(String body, Map<String, String> vars) {
        if (body == null) {
            return "";
        }
        Matcher m = PLACEHOLDER.matcher(body);
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            String value = vars.get(m.group(1));
            m.appendReplacement(sb, Matcher.quoteReplacement(value != null ? value : m.group(0)));
        }
        m.appendTail(sb);
        return sb.toString();
    }

    /** "Іваненко Іван" stays as typed — the shop greets by the name the customer gave. */
    private static String firstName(String full) {
        return full == null ? "" : full.trim();
    }

    /** Whole hryvnias with a thin-space thousands separator, the way the cards print money. */
    static String money(long minor) {
        long whole = Math.round(minor / 100.0);
        return String.format(Locale.ROOT, "%,d", whole).replace(',', ' ') + " ₴";
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    private static String blankToNull(String s) {
        return notBlank(s) ? s.trim() : null;
    }
}
