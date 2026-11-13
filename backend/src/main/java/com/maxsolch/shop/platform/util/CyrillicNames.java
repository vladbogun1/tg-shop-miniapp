package com.maxsolch.shop.platform.util;

import java.util.regex.Pattern;

/**
 * People's names for Nova Poshta, which takes only Cyrillic («LastName has invalid characters», order #e6e83c17,
 * 13.11.2026: «Курзiн» typed with a Latin «i»). A Latin letter that looks like a Cyrillic one inside a word that
 * already has Cyrillic is swapped for its twin; a word with no Cyrillic at all is left alone — it is not a typo,
 * and {@link #hasLatin} then says the name still needs a person to rewrite it.
 */
public final class CyrillicNames {

    private static final String LATIN_TWINS = "aceiopxykABCEHIKMOPTXY";
    private static final String CYRILLIC_TWINS = "асеіорхукАВСЕНІКМОРТХУ";
    private static final Pattern LATIN = Pattern.compile("[A-Za-z]");
    private static final Pattern WORD = Pattern.compile("[^\\s\\-'ʼ’`]+");

    private CyrillicNames() {
    }

    /** The name with look-alike Latin letters made Cyrillic in every mixed word; null stays null. */
    public static String fixLookalikes(String name) {
        if (name == null || !LATIN.matcher(name).find()) {
            return name;
        }
        StringBuilder out = new StringBuilder(name.length());
        var m = WORD.matcher(name);
        int last = 0;
        while (m.find()) {
            out.append(name, last, m.start()).append(fixWord(m.group()));
            last = m.end();
        }
        return out.append(name.substring(last)).toString();
    }

    /** Whether any Latin letter is left (NP will refuse the name). */
    public static boolean hasLatin(String name) {
        return name != null && LATIN.matcher(name).find();
    }

    private static String fixWord(String word) {
        if (!hasCyrillic(word)) {
            return word;
        }
        char[] cs = word.toCharArray();
        for (int i = 0; i < cs.length; i++) {
            int k = LATIN_TWINS.indexOf(cs[i]);
            if (k >= 0) {
                cs[i] = CYRILLIC_TWINS.charAt(k);
            }
        }
        return new String(cs);
    }

    private static boolean hasCyrillic(String word) {
        for (int i = 0; i < word.length(); i++) {
            if (Character.UnicodeBlock.of(word.charAt(i)) == Character.UnicodeBlock.CYRILLIC) {
                return true;
            }
        }
        return false;
    }
}
