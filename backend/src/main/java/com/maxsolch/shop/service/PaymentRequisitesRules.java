package com.maxsolch.shop.service;

import com.maxsolch.shop.web.dto.PaymentRequisitesDto;

import java.math.BigInteger;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

/**
 * Checks and audit wording for the shop's payment requisites (A11 / R10).
 *
 * <p>A typo in the card number or IBAN sends customers' money to an account that does not exist,
 * and a silently swapped number is the main way to divert payments with a stolen admin token. So
 * the numbers are validated (Luhn, UA IBAN with its mod-97 checksum) and every change is written to
 * the audit log as a MASKED diff — enough to notice a swap, never the full number.
 */
public final class PaymentRequisitesRules {

    private PaymentRequisitesRules() {
    }

    // ------------------------------------------------------------------ validation

    /** Digits only (spaces/dashes a human typed are fine). */
    static String digits(String s) {
        return s == null ? "" : s.replaceAll("[\\s-]", "");
    }

    /** Card: 13–19 digits passing the Luhn check. Blank = "no card" and is allowed. */
    public static boolean validCard(String card) {
        String d = digits(card);
        if (d.isEmpty()) {
            return true;
        }
        if (!d.matches("\\d{13,19}")) {
            return false;
        }
        int sum = 0;
        boolean dbl = false;
        for (int i = d.length() - 1; i >= 0; i--) {
            int n = d.charAt(i) - '0';
            if (dbl) {
                n *= 2;
                if (n > 9) {
                    n -= 9;
                }
            }
            sum += n;
            dbl = !dbl;
        }
        return sum % 10 == 0;
    }

    /** Ukrainian IBAN: "UA" + 27 digits with a valid ISO 13616 mod-97 checksum. Blank allowed. */
    public static boolean validIban(String iban) {
        String s = iban == null ? "" : iban.replaceAll("\\s", "").toUpperCase(Locale.ROOT);
        if (s.isEmpty()) {
            return true;
        }
        if (!s.matches("UA\\d{27}")) {
            return false;
        }
        String rearranged = s.substring(4) + s.substring(0, 4);
        StringBuilder numeric = new StringBuilder();
        for (char c : rearranged.toCharArray()) {
            numeric.append(Character.isLetter(c) ? String.valueOf(c - 'A' + 10) : String.valueOf(c));
        }
        return new BigInteger(numeric.toString()).mod(BigInteger.valueOf(97)).intValue() == 1;
    }

    /**
     * null when acceptable, else the reason in Russian (shown to the admin). Only fields that
     * CHANGE are checked, so a legacy value that predates the rule never blocks an unrelated edit.
     */
    public static String problem(PaymentRequisitesDto before, PaymentRequisitesDto after) {
        if (changed(before == null ? null : before.cardNumber(), after.cardNumber()) && !validCard(after.cardNumber())) {
            return "Номер карты не прошёл проверку (Luhn) — проверьте цифры";
        }
        if (changed(before == null ? null : before.iban(), after.iban()) && !validIban(after.iban())) {
            return "IBAN должен быть UA + 27 цифр с верной контрольной суммой — проверьте";
        }
        return null;
    }

    // ------------------------------------------------------------------ masked diff

    /** "****1234" — last four digits only. */
    public static String maskCard(String card) {
        String d = digits(card);
        if (d.isEmpty()) {
            return "—";
        }
        return "****" + d.substring(Math.max(0, d.length() - 4));
    }

    /** "UA…1234" — country and the last four characters only. */
    public static String maskIban(String iban) {
        String s = iban == null ? "" : iban.replaceAll("\\s", "").toUpperCase(Locale.ROOT);
        if (s.isEmpty()) {
            return "—";
        }
        String head = s.length() >= 2 ? s.substring(0, 2) : "";
        return head + "…" + s.substring(Math.max(0, s.length() - 4));
    }

    /**
     * Human-readable list of what changed, safe for the audit log and the seller's Telegram topic:
     * card/IBAN masked, recipient/EDRPOU in full (public anyway), long texts as "изменено".
     */
    public static List<String> diff(PaymentRequisitesDto before, PaymentRequisitesDto after) {
        PaymentRequisitesDto b = before == null ? new PaymentRequisitesDto(null, null, null, null, null, null) : before;
        List<String> out = new ArrayList<>();
        if (changed(b.cardNumber(), after.cardNumber())) {
            out.add("карта " + maskCard(b.cardNumber()) + " → " + maskCard(after.cardNumber()));
        }
        if (changed(b.iban(), after.iban())) {
            out.add("IBAN " + maskIban(b.iban()) + " → " + maskIban(after.iban()));
        }
        if (changed(b.recipient(), after.recipient())) {
            out.add("получатель «" + nz(b.recipient()) + "» → «" + nz(after.recipient()) + "»");
        }
        if (changed(b.edrpou(), after.edrpou())) {
            out.add("ЕДРПОУ " + nz(b.edrpou()) + " → " + nz(after.edrpou()));
        }
        if (changed(b.purpose(), after.purpose())) {
            out.add("назначение платежа изменено");
        }
        if (changed(b.note(), after.note())) {
            out.add("примечание изменено");
        }
        return out;
    }

    /** Card or IBAN changed — the money-critical part that deserves a Telegram ping. */
    public static boolean moneyCritical(PaymentRequisitesDto before, PaymentRequisitesDto after) {
        PaymentRequisitesDto b = before == null ? new PaymentRequisitesDto(null, null, null, null, null, null) : before;
        return changed(b.cardNumber(), after.cardNumber()) || changed(b.iban(), after.iban())
                || changed(b.recipient(), after.recipient()) || changed(b.edrpou(), after.edrpou());
    }

    static boolean changed(String a, String b) {
        return !Objects.equals(norm(a), norm(b));
    }

    private static String norm(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static String nz(String s) {
        return s == null || s.isBlank() ? "—" : s.trim();
    }
}
