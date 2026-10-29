package com.maxsolch.shop.architecture;

import com.tngtech.archunit.library.freeze.ViolationLineMatcher;

import java.util.regex.Pattern;

/**
 * Decides whether a violation found now is one of the frozen ones.
 *
 * <p>Ignores what changes without adding debt: source line numbers, compiler-generated {@code $1} suffixes
 * (both like ArchUnit's default matcher) and parameter lists. ArchUnit writes violations as
 * {@code Method <OrderService.approve([B)> calls ...}; without the last rule, adding a parameter to a frozen method
 * or a new dependency to a frozen controller's constructor would look like a new violation and push people to
 * re-freeze everything, which also lets real new debt in. Identity stays "class + member name + what it touches".
 */
class SignatureInsensitiveMatcher implements ViolationLineMatcher {

    private static final Pattern PARAMETERS = Pattern.compile("\\([^()]*\\)>");
    private static final Pattern LINE_NUMBER = Pattern.compile(":\\d+\\)");
    private static final Pattern SYNTHETIC_SUFFIX = Pattern.compile("\\$\\d+");

    @Override
    public boolean matches(String actual, String stored) {
        return normalize(actual).equals(normalize(stored));
    }

    private static String normalize(String violation) {
        String text = PARAMETERS.matcher(violation).replaceAll("()>");
        text = LINE_NUMBER.matcher(text).replaceAll(":0)");
        return SYNTHETIC_SUFFIX.matcher(text).replaceAll("\\$0");
    }
}
