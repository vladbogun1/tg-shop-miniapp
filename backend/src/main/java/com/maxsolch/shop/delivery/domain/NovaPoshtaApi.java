package com.maxsolch.shop.delivery.domain;

import java.io.IOException;
import java.util.List;

/** The Nova Poshta directory API as the sync needs it. The HTTP client in {@code infra} implements it. */
public interface NovaPoshtaApi {

    /** An API address is configured (without one the sync has nothing to ask). */
    boolean isConfigured();

    /**
     * One page of the warehouse directory. An empty list means "nothing more": the last page, an answer that is
     * not a list, or a non-200 answer (the client logs the status).
     */
    List<ApiWarehouse> warehousesPage(int page, int limit) throws IOException, InterruptedException;

    /** One warehouse as the API describes it (all texts as sent; coordinates are not parsed yet). */
    record ApiWarehouse(String ref, String cityRef, String cityName, String number, String description,
                        String type, String latitude, String longitude, String areaName) {
    }
}
