package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.procurement.app.BatchDtos.SupplierDto;
import com.maxsolch.shop.procurement.app.SupplierAliases.AliasDto;
import com.maxsolch.shop.procurement.domain.NbuRates;
import com.maxsolch.shop.procurement.domain.supplyai.CatalogItem;
import com.maxsolch.shop.procurement.domain.supplyai.DraftState;
import com.maxsolch.shop.procurement.domain.supplyai.ExtractedDoc;
import com.maxsolch.shop.procurement.domain.supplyai.SupplyExtract;
import com.maxsolch.shop.procurement.domain.supplyai.SupplierAlias;
import com.maxsolch.shop.procurement.domain.supplyai.SupplierMatch;
import com.maxsolch.shop.procurement.domain.supplyai.SupplyChecks;
import com.maxsolch.shop.procurement.domain.supplyai.SupplyMatcher;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * The first look at a read invoice, without the model: who the supplier is (by name, among the known ones), the
 * rate of the day (NBU), what the supplier's memory already knows (lines matched in earlier batches) and what the
 * search over the catalog finds with confidence. What stays open goes to the model in the next step. The same
 * order as on the admin screen of the manual path, so both paths decide the same lines the same way.
 */
@Slf4j
@Component
class SupplyDraftMatching {

    private final SupplierService suppliers;
    private final SupplierAliases aliases;
    private final NbuRates rates;
    private final SupplyDraftCatalog catalog;
    private final Clock clock;
    private final ShopZone zone;

    SupplyDraftMatching(SupplierService suppliers, SupplierAliases aliases, NbuRates rates, SupplyDraftCatalog catalog,
                        Clock clock, ShopZone zone) {
        this.suppliers = suppliers;
        this.aliases = aliases;
        this.rates = rates;
        this.catalog = catalog;
        this.clock = clock;
        this.zone = zone;
    }

    void seed(DraftState s, SupplyExtract.Parsed read) {
        ExtractedDoc doc = read.doc();
        s.setDoc(doc);
        s.setDocNotes(notes(read));
        s.setTitle(Stream.of(doc.supplier(), doc.docNo()).filter(v -> v != null && !v.isBlank())
                .collect(Collectors.joining(" · ")));
        s.setCurrency(PreorderBatchService.CURRENCIES.contains(doc.currency()) ? doc.currency() : null);
        if (s.getCurrency() == null) {
            s.warn("Валюту документа ИИ не понял — выберите её");
        }
        supplier(s, doc.supplier());
        rate(s);
        List<CatalogItem> items = catalog.items();
        s.setRows(SupplyMatcher.autoMatch(doc.lines(), items, memory(s.getSupplierId())));
    }

    private static List<String> notes(SupplyExtract.Parsed read) {
        ExtractedDoc doc = read.doc();
        List<String> out = new ArrayList<>(read.errors());
        if (read.docNotes() != null && !read.docNotes().isBlank()) {
            out.add(read.docNotes());
        }
        doc.lines().forEach(l -> {
            String p = SupplyChecks.lineProblem(l);
            if (p != null) {
                out.add(l.id() + ": " + p);
            }
        });
        String total = SupplyChecks.totalProblem(doc);
        if (total != null) {
            out.add(total);
        }
        return out;
    }

    private void supplier(DraftState s, String name) {
        if (name == null || name.isBlank()) {
            return;
        }
        List<SupplierDto> known = suppliers.suppliers();
        String id = SupplierMatch.byName(name, known.stream()
                .map(k -> new SupplierMatch.Named(String.valueOf(k.id()), k.name())).toList());
        if (id != null) {
            s.setSupplierId(Long.valueOf(id));
            s.setSupplierName(known.stream().filter(k -> String.valueOf(k.id()).equals(id)).map(SupplierDto::name)
                    .findFirst().orElse(name));
        } else {
            s.setSupplierName(name.trim());
        }
    }

    private void rate(DraftState s) {
        String currency = s.getCurrency();
        if (currency == null) {
            return;
        }
        if ("UAH".equals(currency)) {
            s.setFxRate(BigDecimal.ONE);
            return;
        }
        try {
            s.setFxRate(rates.rate(currency, zone.today(clock)));
        } catch (RuntimeException e) {
            log.info("supply draft: NBU rate for {} unavailable: {}", currency, e.getMessage());
            s.warn("Курс НБУ сейчас не получить — введите курс вручную");
        }
    }

    private List<SupplierAlias> memory(Long supplierId) {
        if (supplierId == null) {
            return List.of();
        }
        return aliases.of(supplierId).stream()
                .map((AliasDto a) -> new SupplierAlias(a.sourceKey(), a.productId(), a.variantId())).toList();
    }
}
