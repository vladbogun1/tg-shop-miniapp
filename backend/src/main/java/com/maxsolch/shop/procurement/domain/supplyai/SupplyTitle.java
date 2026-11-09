package com.maxsolch.shop.procurement.domain.supplyai;

import java.util.regex.Pattern;

/**
 * The name of a supply as the admin reads it in the list: platform · shop — what is inside («Taobao · X-Raypad —
 * коврики и глайды»). The AI proposes it; this keeps hieroglyphs out of it whatever the model wrote: a bracket
 * holding them goes («XrayPad Guangdong Store (XrayPad广东店)» → «XrayPad Guangdong Store»), the rest of them too.
 * No readable name left — the shop name, cleaned the same way; nothing — null (the draft is named by its number).
 */
public final class SupplyTitle {

    private static final String CJK = "\\p{IsHan}\\p{IsHiragana}\\p{IsKatakana}\\p{IsHangul}\\u3000-\\u303F\\uFF00-\\uFFEF";
    private static final Pattern CJK_BRACKET = Pattern.compile("[(\\[（【][^)\\]）】]*[" + CJK + "][^)\\]）】]*[)\\]）】]");
    private static final Pattern CJK_RUN = Pattern.compile("[" + CJK + "]+");
    private static final Pattern SPACES = Pattern.compile("\\s+");
    /** Separators left hanging at an end or doubled after the hieroglyphs are gone. */
    private static final Pattern EDGE = Pattern.compile("^[\\s·—–\\-,:;|]+|[\\s·—–\\-,:;|]+$");
    private static final Pattern DOUBLE = Pattern.compile("\\s*([·—–|])\\s*(?:[·—–|]\\s*)+");
    private static final int MAX = 120;

    private SupplyTitle() {
    }

    /** The AI's name of the supply, else the shop's; null when neither has a readable word. */
    public static String of(String aiTitle, String supplier) {
        String title = clean(aiTitle);
        return title != null ? title : clean(supplier);
    }

    /** The text without hieroglyphs and the brackets that held them; null when no letter of another script is left. */
    public static String clean(String raw) {
        if (raw == null) {
            return null;
        }
        String s = CJK_BRACKET.matcher(raw).replaceAll(" ");
        s = CJK_RUN.matcher(s).replaceAll(" ");
        s = DOUBLE.matcher(s).replaceAll(" $1 ");
        s = SPACES.matcher(s).replaceAll(" ");
        s = EDGE.matcher(s).replaceAll("");
        if (s.codePoints().noneMatch(Character::isLetter)) {
            return null;
        }
        return s.length() <= MAX ? s : s.substring(0, MAX).trim();
    }
}
