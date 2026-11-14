package com.maxsolch.shop.delivery.app;

import java.util.List;
import java.util.regex.Pattern;

/**
 * Several seats (місця) of one waybill as the packer made them — a mat in stretch film and a mouse in a box. Their
 * label «2 места: Стрейч 49×42 см + Коробка S · 8 см» is what the waybill row keeps (no seat columns): the same label
 * again means the same seats, and a label of this shape tells the automatic update not to squash them into one.
 */
final class PackingPlaces {

    /** NP takes more, but a parcel of more seats is not packed at a branch counter by hand. */
    static final int MAX = 10;
    private static final int LABEL_MAX = 120;
    private static final Pattern MULTI = Pattern.compile("^[0-9]+ мест(а|о)?: .*", Pattern.DOTALL);

    private PackingPlaces() {
    }

    /** «2 места: A + B», cut to the column's 120 characters. */
    static String label(List<String> seats) {
        String text = seats.size() + " " + plural(seats.size()) + ": " + String.join(" + ", seats);
        return text.length() <= LABEL_MAX ? text : text.substring(0, LABEL_MAX - 1) + "…";
    }

    /** The waybill row was packed as several seats. */
    static boolean multi(String boxLabel) {
        return boxLabel != null && MULTI.matcher(boxLabel).matches();
    }

    private static String plural(int n) {
        int tens = n % 100;
        int last = n % 10;
        return tens >= 11 && tens <= 14 || last == 0 || last >= 5 ? "мест" : last == 1 ? "место" : "места";
    }
}
