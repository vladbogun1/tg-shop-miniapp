package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.DeliveryMethod;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.ReplyTemplate;
import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.repository.ReplyTemplateRepository;
import com.maxsolch.shop.translation.ContentTranslation;
import com.maxsolch.shop.translation.ContentTranslationId;
import com.maxsolch.shop.translation.ContentTranslationRepository;
import com.maxsolch.shop.translation.TranslationEntityType;
import com.maxsolch.shop.translation.TranslationOrigin;
import com.maxsolch.shop.translation.TranslationService;
import com.maxsolch.shop.web.NotFoundException;
import com.maxsolch.shop.web.dto.ReplyTemplateDtos.RenderedTemplateDto;
import com.maxsolch.shop.web.dto.ReplyTemplateDtos.TemplateDto;
import com.maxsolch.shop.web.dto.ReplyTemplateDtos.TemplateUpsertRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static com.maxsolch.shop.common.Texts.trimToNull;

/**
 * Chat reply templates: CRUD for the admin and filling one in for an order.
 *
 * <p>Placeholders: {@code {name} {orderNo} {total} {cod} {ttn} {warehouse}}. The text
 * is taken in the customer's language ({@code users.locale}, then their Telegram language), falling
 * back to Ukrainian and then to the required Russian text. The result is only a draft — the admin
 * sees it in the input and can edit it before sending.
 *
 * <p>Russian is the source; Ukrainian and English are content translations (REPLY_TEMPLATE) — filled
 * in «Переводы» like product texts, or typed by hand in the template editor. A translation made for
 * an older Russian text is stale and is not used until it is updated.
 */
@Service
public class ReplyTemplateService {

    private static final Pattern PLACEHOLDER = Pattern.compile("\\{([a-zA-Z]+)}");

    private final ReplyTemplateRepository repository;
    private final OrderRepository orderRepository;
    private final Messages messages;
    private final ContentTranslationRepository translationRepository;
    private final TranslationService translationService;

    public ReplyTemplateService(ReplyTemplateRepository repository,
                                OrderRepository orderRepository,
                                Messages messages,
                                ContentTranslationRepository translationRepository,
                                TranslationService translationService) {
        this.repository = repository;
        this.orderRepository = orderRepository;
        this.messages = messages;
        this.translationRepository = translationRepository;
        this.translationService = translationService;
    }

    // ----- CRUD -----

    @Transactional(readOnly = true)
    public List<TemplateDto> list() {
        Map<String, ContentTranslation> rows = translations();
        return repository.findAllByOrderBySortAscIdAsc().stream().map(t -> toDto(t, rows)).toList();
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
        t = repository.save(t);
        writeTranslations(t, req);
        return toDto(t, translations());
    }

    @Transactional
    public TemplateDto update(long id, TemplateUpsertRequest req) {
        ReplyTemplate t = repository.findById(id).orElseThrow(() -> new NotFoundException("template not found"));
        apply(t, req);
        t = repository.save(t);
        writeTranslations(t, req);
        return toDto(t, translations());
    }

    @Transactional
    public String delete(long id) {
        ReplyTemplate t = repository.findById(id).orElseThrow(() -> new NotFoundException("template not found"));
        repository.delete(t);
        translationRepository.deleteForEntities(TranslationEntityType.REPLY_TEMPLATE,
                List.of(ReplyTemplate.translationId(t.getId())));
        translationService.invalidate();
        return t.getTitle();
    }

    private static void apply(ReplyTemplate t, TemplateUpsertRequest req) {
        t.setTitle(req.title().trim());
        t.setBodyRu(req.bodyRu().trim());
        if (req.sort() != null) {
            t.setSort(req.sort());
        }
    }

    /**
     * The uk/en texts from the editor. Blank removes the translation; a text that differs from the
     * stored one is the admin's own (MANUAL, made for the current Russian text); an unchanged one is
     * left alone — after a Russian edit it stays stale and shows up in «Переводы» to be redone.
     */
    private void writeTranslations(ReplyTemplate t, TemplateUpsertRequest req) {
        byte[] key = ReplyTemplate.translationId(t.getId());
        Map<String, ContentTranslation> rows = new HashMap<>();
        for (ContentTranslation row : translationRepository.findForEntity(TranslationEntityType.REPLY_TEMPLATE, key)) {
            rows.put(row.getId().getLocale(), row);
        }
        String hash = TranslationService.sha256Hex(t.getBodyRu());
        boolean changed = false;
        for (String locale : List.of("uk", "en")) {
            String wanted = trimToNull("uk".equals(locale) ? req.bodyUk() : req.bodyEn());
            ContentTranslation row = rows.get(locale);
            if (wanted == null) {
                if (row != null) {
                    translationRepository.delete(row);
                    changed = true;
                }
                continue;
            }
            if (row != null && wanted.equals(row.getText())) {
                continue;
            }
            if (row == null) {
                row = new ContentTranslation(new ContentTranslationId(TranslationEntityType.REPLY_TEMPLATE, key,
                        TranslationEntityType.BODY, locale));
            }
            row.setText(wanted);
            row.setSourceHash(hash);
            row.setOrigin(TranslationOrigin.MANUAL);
            translationRepository.save(row);
            changed = true;
        }
        if (changed) {
            translationService.invalidate();
        }
    }

    /** Every template translation, keyed {@code "<templateId>:<locale>"}. */
    private Map<String, ContentTranslation> translations() {
        Map<String, ContentTranslation> out = new HashMap<>();
        for (ContentTranslation row : translationRepository.findByType(TranslationEntityType.REPLY_TEMPLATE)) {
            Long id = ReplyTemplate.idOfTranslationId(row.getId().getEntityId());
            if (id != null) {
                out.put(id + ":" + row.getId().getLocale(), row);
            }
        }
        return out;
    }

    private static TemplateDto toDto(ReplyTemplate t, Map<String, ContentTranslation> rows) {
        String hash = TranslationService.sha256Hex(t.getBodyRu());
        ContentTranslation uk = rows.get(t.getId() + ":uk");
        ContentTranslation en = rows.get(t.getId() + ":en");
        return new TemplateDto(t.getId(), t.getTitle(), t.getBodyRu(),
                uk == null ? null : uk.getText(), en == null ? null : en.getText(), t.getSort(),
                uk != null && !hash.equals(uk.getSourceHash()), en != null && !hash.equals(en.getSourceHash()));
    }

    /** A translation's text if it was made for this Russian text, else null (stale or missing). */
    static String current(ContentTranslation row, String sourceHash) {
        return row != null && sourceHash.equals(row.getSourceHash()) ? row.getText() : null;
    }

    // ----- rendering -----

    /** Every template filled in for this order, in the customer's language. */
    @Transactional(readOnly = true)
    public List<RenderedTemplateDto> renderForOrder(byte[] orderId) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new NotFoundException("order not found"));
        Locale locale = messages.localeOf(order.getTgUserId());
        Map<String, String> vars = variables(order, locale);
        Map<String, ContentTranslation> rows = translations();
        List<RenderedTemplateDto> out = new ArrayList<>();
        for (ReplyTemplate t : repository.findAllByOrderBySortAscIdAsc()) {
            String hash = TranslationService.sha256Hex(t.getBodyRu());
            Picked picked = pick(t.getBodyRu(), current(rows.get(t.getId() + ":uk"), hash),
                    current(rows.get(t.getId() + ":en"), hash), locale.getLanguage());
            out.add(new RenderedTemplateDto(t.getId(), t.getTitle(), fill(picked.body(), vars), picked.lang()));
        }
        return out;
    }

    /** Text + the language it is actually in. */
    record Picked(String body, String lang) {
    }

    /** Customer's language → Ukrainian (the shop's fallback) → Russian (always present). */
    static Picked pick(String ru, String uk, String en, String lang) {
        String want = lang == null ? "uk" : lang;
        if ("en".equals(want) && notBlank(en)) {
            return new Picked(en, "en");
        }
        if ("ru".equals(want)) {
            return new Picked(ru, "ru");
        }
        if (notBlank(uk)) {
            return new Picked(uk, "uk");
        }
        return new Picked(ru, "ru");
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

    /** Hryvnias the way the cards print money — kopecks shown when there are any. */
    static String money(long minor) {
        return com.maxsolch.shop.common.MoneyFormat.uah(minor);
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }
}
