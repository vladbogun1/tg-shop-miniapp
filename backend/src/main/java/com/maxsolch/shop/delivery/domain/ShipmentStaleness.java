package com.maxsolch.shop.delivery.domain;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;

/**
 * «ТТН устарела»: the order changed after its waybill was made and NP still has the old weight, box, money or
 * address (owner, 2026-10-24: two gifts added after the label was printed, nothing showed it). The waybill keeps
 * fingerprints of the goods and of the recipient; a different fingerprint, money that differs from the order or a
 * failed automatic update make it stale — the admin sees it at once and on «К отправке», and its label is not
 * printed until it is made again. Pure: the caller hands in what the order has now.
 */
public final class ShipmentStaleness {

    private ShipmentStaleness() {
    }

    /** One line of the parcel: product, variant (null = none) and the units still in the order. */
    public record GoodsLine(String productId, String variantId, int quantity) {
    }

    /** What the order has now, for {@link #reasons}. */
    public record Current(String goodsKey, String recipientKey, long owedCodMinor) {
    }

    /** What makes the parcel: product, variant, quantity still in the order (returned ones are out). */
    public static String goodsKey(List<GoodsLine> lines) {
        List<String> out = new ArrayList<>();
        for (GoodsLine l : lines) {
            if (l.quantity() > 0) {
                out.add(l.productId() + ':' + l.variantId() + ':' + l.quantity());
            }
        }
        out.sort(null);
        return hash(String.join(",", out));
    }

    /**
     * Who and where, in this order: service, city, branch, street ref, street name, building, flat, phone, customer
     * name, last, first and middle name of the recipient (nulls allowed).
     */
    public static String recipientKey(String... parts) {
        List<String> out = new ArrayList<>(parts.length);
        for (String p : parts) {
            out.add(Objects.toString(p, ""));
        }
        return hash(String.join("|", out));
    }

    /** Only our waybills NP has no parcel for can be stale: later ones are what NP has, typed-in ones are not ours. */
    public static boolean applies(OrderShipment s) {
        return s != null && s.isActive() && OrderShipment.ORIGIN_API.equals(s.getOrigin())
                && (s.stageEnum() == ShipmentStage.CREATED || s.stageEnum() == ShipmentStage.NOT_FOUND);
    }

    /**
     * Why the waybill no longer matches its order (empty = it does). Older waybills without fingerprints are checked
     * by money only.
     */
    public static List<String> reasons(Current now, OrderShipment s) {
        List<String> out = new ArrayList<>();
        if (now == null || !applies(s)) {
            return out;
        }
        if (s.getGoodsKey() != null && !s.getGoodsKey().equals(now.goodsKey())) {
            out.add("Состав заказа изменился — в ТТН старые вес и коробка");
        }
        if (s.getRecipientKey() != null && !s.getRecipientKey().equals(now.recipientKey())) {
            out.add("Получатель или адрес доставки изменились");
        }
        long cod = now.owedCodMinor();
        if (s.collects() && s.getCodMinor() != cod) {
            out.add("Наложка в ТТН " + WaybillRequest.uah(s.getCodMinor()) + " ₴, а по заказу " + WaybillRequest.uah(cod) + " ₴");
        }
        if (s.getSyncError() != null && !s.getSyncError().isBlank() && out.isEmpty()) {
            out.add(s.getSyncError());
        }
        return out;
    }

    static String hash(String s) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(d, 0, 16);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
