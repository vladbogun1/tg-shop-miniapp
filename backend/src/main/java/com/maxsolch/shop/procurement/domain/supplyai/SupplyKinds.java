package com.maxsolch.shop.procurement.domain.supplyai;

import java.util.List;
import java.util.Locale;

/**
 * What kind of thing a line is, by the generic words of the invoice (Chinese, or the model's English translation),
 * against the generic words of our Russian titles: «mouse feet» / 脚贴 are our «Глайды», «anti-slip» / 防滑贴 are
 * «Грипсы». Without it a Chinese line and a Russian title share no word but the brand. Same list as
 * frontend-admin/features/supply/model/ai/kinds.ts.
 */
final class SupplyKinds {

    /** Invoice words (substrings of the lower-case line) → stems of our title words. */
    private record Kind(List<String> invoice, List<String> stems) {
    }

    private static final List<Kind> KINDS = List.of(
            new Kind(List.of("mouse feet", "mouse skate", "skates", "glides", "脚贴", "鼠标脚", "脚垫"), List.of("глайд")),
            new Kind(List.of("grip tape", "grips", "anti-slip", "anti slip", "防滑贴"), List.of("грипс")),
            new Kind(List.of("mouse pad", "mousepad", "desk mat", "鼠标垫", "桌垫"), List.of("коврик", "ковер", "стеклопад")),
            new Kind(List.of("keycap", "键帽"), List.of("кейкап", "кепки")),
            new Kind(List.of("switches", "switch", "轴体"), List.of("переключат", "свич")),
            new Kind(List.of("keyboard", "键盘"), List.of("клавиатур")),
            new Kind(List.of("headset", "headphone", "earphone", "耳机"), List.of("наушник")),
            new Kind(List.of("cable", "数据线"), List.of("кабел")),
            new Kind(List.of("sleeve", "袖套"), List.of("рукав")),
            new Kind(List.of("gaming mouse", "wireless mouse", "游戏鼠标", "无线鼠标"), List.of("мыш")),
            new Kind(List.of("usb fan", "cooling fan", "portable fan", "风扇"), List.of("дуйк", "вентилятор")));

    private SupplyKinds() {
    }

    /** True when the line names a kind whose stem starts one of the title words. */
    static boolean sameKind(SourceLine l, List<String> titleWords) {
        String text = String.join(" ", nz(l.text()), nz(l.en()), nz(l.variant())).toLowerCase(Locale.ROOT);
        for (Kind k : KINDS) {
            if (k.invoice().stream().anyMatch(text::contains)
                    && titleWords.stream().anyMatch(w -> k.stems().stream().anyMatch(w::startsWith))) {
                return true;
            }
        }
        return false;
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }
}
