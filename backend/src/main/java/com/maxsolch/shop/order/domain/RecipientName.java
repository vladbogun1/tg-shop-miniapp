package com.maxsolch.shop.order.domain;

/**
 * The recipient's name split the way a Nova Poshta waybill needs it (V98). {@code customer_name} stays the one-line
 * «Прізвище Ім'я» everything else shows; these parts are null on orders placed with one name field.
 */
public record RecipientName(String lastName, String firstName, String middleName) {

    /** «Прізвище Ім'я» from the parts (the middle name is not part of the one-line name). */
    public String oneLine() {
        return (lastName + " " + firstName).trim();
    }
}
