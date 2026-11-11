package com.maxsolch.shop.delivery.domain;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/** The Nova Poshta directory API as the sync needs it. The HTTP client in {@code infra} implements it. */
public interface NovaPoshtaApi {

    /** An API address is configured (without one the sync has nothing to ask). */
    boolean isConfigured();

    /**
     * One page of the warehouse directory. An empty list means "nothing more": the last page, an answer that is
     * not a list, or a non-200 answer (the client logs the status).
     */
    List<ApiWarehouse> warehousesPage(int page, int limit) throws IOException, InterruptedException;

    /** The API answered, but not with data: the sync must report it as a failure, not as the end of the directory. */
    class ApiException extends IOException {
        public ApiException(String message) {
            super(message);
        }
    }

    /**
     * The branch types NP knows ({@code Address.getWarehouseTypes}): TypeOfWarehouse ref → its name.
     * Empty when NP has none to tell.
     */
    Map<String, String> warehouseTypes() throws IOException, InterruptedException;

    /**
     * One warehouse as the API describes it (all texts as sent; coordinates are not parsed yet).
     *
     * @param npCategory  NP's own {@code CategoryOfWarehouse} (Branch, Postomat, Store…)
     * @param status      {@code WarehouseStatus} (Working, NotWorking…)
     * @param maxLengthMm {@code ReceivingLimitationsOnDimensions} in mm, null = no limit given
     * @param maxWeightKg {@code PlaceMaxWeightAllowed}, null = none given
     */
    record ApiWarehouse(String ref, String cityRef, String cityName, String number, String description,
                        String type, String latitude, String longitude, String areaName, String npCategory,
                        String status, Integer maxLengthMm, Integer maxWidthMm, Integer maxHeightMm,
                        Integer maxWeightKg) {

        /** Only the fields of the directory before V98 (tests). */
        public ApiWarehouse(String ref, String cityRef, String cityName, String number, String description,
                            String type, String latitude, String longitude, String areaName) {
            this(ref, cityRef, cityName, number, description, type, latitude, longitude, areaName, null, null,
                    null, null, null, null);
        }
    }
}
