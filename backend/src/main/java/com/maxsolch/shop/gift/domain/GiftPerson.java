package com.maxsolch.shop.gift.domain;

/** Who received a gift: the keys an order carries (a site account, a Telegram id, a phone). */
public record GiftPerson(Long userId, Long tgUserId, String phoneKey) {

    /** Last 9 digits of a phone (+380 67…, 067…, 67… are the same number); null when too short. */
    public static String phoneKey(String phone) {
        if (phone == null) {
            return null;
        }
        String digits = phone.replaceAll("\\D", "");
        return digits.length() < 9 ? null : digits.substring(digits.length() - 9);
    }
}
