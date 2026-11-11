package com.maxsolch.shop.delivery.app;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

/**
 * {@code NP_DRY_RUN}: waybill numbers start with {@link #DRY_PREFIX} and their labels are a local stub PDF, so the demo
 * stand and tests go through every screen without a real waybill at Nova Poshta.
 */
public final class DryRunLabels {

    public static final String DRY_PREFIX = "DRY";

    private DryRunLabels() {
    }

    public static boolean isDry(String ttn) {
        return ttn != null && ttn.startsWith(DRY_PREFIX);
    }

    /** A made-up waybill number of the dry run. */
    static String fakeNumber() {
        return DRY_PREFIX + ThreadLocalRandom.current().nextLong(10_000_000_000L, 99_999_999_999L);
    }

    static String fakeRef() {
        return "dry-" + UUID.randomUUID();
    }

    /** A stand-in label: one 100×100 mm page per number, plain ASCII. */
    static byte[] pdf(List<String> ttns) {
        List<String> objects = new ArrayList<>();
        int pages = ttns.size();
        // 1 catalog, 2 pages, 3 font, then per page: page object + content stream.
        StringBuilder kids = new StringBuilder();
        for (int i = 0; i < pages; i++) {
            kids.append(4 + i * 2).append(" 0 R ");
        }
        objects.add("<< /Type /Catalog /Pages 2 0 R >>");
        objects.add("<< /Type /Pages /Kids [" + kids.toString().trim() + "] /Count " + pages + " >>");
        objects.add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
        for (int i = 0; i < pages; i++) {
            String ttn = ttns.get(i).replaceAll("[^A-Za-z0-9-]", "");
            String text = "BT /F1 14 Tf 20 230 Td (DRY RUN - TEST LABEL) Tj 0 -40 Td /F1 20 Tf (" + ttn
                    + ") Tj 0 -40 Td /F1 10 Tf (Not a real Nova Poshta waybill) Tj ET";
            objects.add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 283 283] /Resources << /Font << /F1 3 0 R >> >>"
                    + " /Contents " + (5 + i * 2) + " 0 R >>");
            objects.add("<< /Length " + text.length() + " >>\nstream\n" + text + "\nendstream");
        }
        StringBuilder pdf = new StringBuilder("%PDF-1.4\n");
        List<Integer> offsets = new ArrayList<>();
        for (int i = 0; i < objects.size(); i++) {
            offsets.add(pdf.length());
            pdf.append(i + 1).append(" 0 obj\n").append(objects.get(i)).append("\nendobj\n");
        }
        int xref = pdf.length();
        pdf.append("xref\n0 ").append(objects.size() + 1).append("\n0000000000 65535 f \n");
        for (int off : offsets) {
            pdf.append(String.format("%010d 00000 n \n", off));
        }
        pdf.append("trailer\n<< /Size ").append(objects.size() + 1).append(" /Root 1 0 R >>\nstartxref\n")
                .append(xref).append("\n%%EOF\n");
        return pdf.toString().getBytes(StandardCharsets.US_ASCII);
    }
}
