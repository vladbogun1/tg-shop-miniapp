package com.maxsolch.shop.web.dto;

public record NpWarehouseDto(
        String ref,
        String number,
        String description,
        String type,
        /** Friendly category derived from the NP type ref: POSTOMAT | BRANCH | POINT | OTHER. */
        String category,
        String cityRef,
        String cityName,
        Double lat,
        Double lng) {
}
