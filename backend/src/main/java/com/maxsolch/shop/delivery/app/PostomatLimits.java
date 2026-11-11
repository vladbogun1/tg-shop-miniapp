package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.NovaPoshtaWarehouse;
import com.maxsolch.shop.delivery.domain.Parcel;
import com.maxsolch.shop.settings.app.SettingsService;

import java.util.Arrays;

/**
 * What a parcel locker takes: the locker's own limits from the directory (V98: max weight and cell from
 * {@code ReceivingLimitationsOnDimensions}), else the settings, else NP's standard cell (20 kg, 60×40×30 cm). Sides are
 * compared smallest to smallest, so a box on its side still counts.
 */
public final class PostomatLimits {

    static final int DEFAULT_MAX_KG = 20;
    static final int[] DEFAULT_BOX_MM = {300, 400, 600};

    private PostomatLimits() {
    }

    /** The locker's own limit from the directory, else the setting, else 20 kg. */
    public static int maxKg(NovaPoshtaWarehouse w, SettingsService settings) {
        if (w != null && w.getMaxWeightKg() != null && w.getMaxWeightKg() > 0) {
            return w.getMaxWeightKg();
        }
        int s = settings == null ? 0 : settings.getInt(DeliverySettings.NP_POSTOMAT_MAX_KG);
        return s > 0 ? s : DEFAULT_MAX_KG;
    }

    /** The locker's cell from the directory, else the setting, sorted ascending (mm). */
    public static int[] box(NovaPoshtaWarehouse w, SettingsService settings) {
        if (w != null && positive(w.getMaxLengthMm()) && positive(w.getMaxWidthMm()) && positive(w.getMaxHeightMm())) {
            int[] d = {w.getMaxLengthMm(), w.getMaxWidthMm(), w.getMaxHeightMm()};
            Arrays.sort(d);
            return d;
        }
        return parseBox(settings == null ? null : settings.getString(DeliverySettings.NP_POSTOMAT_MAX_BOX));
    }

    /** Whether the parcel goes into this locker (weight and cell). */
    public static boolean takes(NovaPoshtaWarehouse w, Parcel p, SettingsService settings) {
        return p.weightG() <= maxKg(w, settings) * 1000 && fits(p, box(w, settings));
    }

    /** {@code box}: the cell's sides in mm sorted ascending. */
    static boolean fits(Parcel p, int[] box) {
        int[] d = {p.lengthMm(), p.widthMm(), p.heightMm()};
        Arrays.sort(d);
        return d[0] <= box[0] && d[1] <= box[1] && d[2] <= box[2];
    }

    /** «600×400×300» (mm) sorted ascending; anything else = NP's standard cell. */
    static int[] parseBox(String raw) {
        if (raw != null) {
            String[] parts = raw.trim().split("\\s*[x×хX*]\\s*");
            if (parts.length == 3) {
                try {
                    int[] d = {Integer.parseInt(parts[0].trim()), Integer.parseInt(parts[1].trim()),
                            Integer.parseInt(parts[2].trim())};
                    if (d[0] > 0 && d[1] > 0 && d[2] > 0) {
                        Arrays.sort(d);
                        return d;
                    }
                } catch (NumberFormatException ignored) {
                    // fall through to the standard cell
                }
            }
        }
        return DEFAULT_BOX_MM.clone();
    }

    private static boolean positive(Integer v) {
        return v != null && v > 0;
    }
}
