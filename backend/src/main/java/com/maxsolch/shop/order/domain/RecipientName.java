package com.maxsolch.shop.order.domain;

import com.maxsolch.shop.platform.util.CyrillicNames;

/**
 * The recipient's name split the way a Nova Poshta waybill needs it (V98). {@code customer_name} stays the one-line
 * «Прізвище Ім'я» everything else shows; these parts are null on orders placed with one name field. Latin letters
 * that look like Cyrillic ones inside a Cyrillic word are made Cyrillic on the way in ({@link CyrillicNames}): NP
 * refuses «Курзiн» with a Latin «i».
 */
public record RecipientName(String lastName, String firstName, String middleName) {

    public RecipientName {
        lastName = CyrillicNames.fixLookalikes(lastName);
        firstName = CyrillicNames.fixLookalikes(firstName);
        middleName = CyrillicNames.fixLookalikes(middleName);
    }

    /** «Прізвище Ім'я» from the parts (the middle name is not part of the one-line name). */
    public String oneLine() {
        return (lastName + " " + firstName).trim();
    }

    /** NP will refuse it: a Latin letter is left after the look-alikes were swapped. */
    public boolean latin() {
        return CyrillicNames.hasLatin(lastName) || CyrillicNames.hasLatin(firstName)
                || CyrillicNames.hasLatin(middleName);
    }
}
