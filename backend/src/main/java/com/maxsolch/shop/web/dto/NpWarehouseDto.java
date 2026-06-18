package com.maxsolch.shop.web.dto;

public record NpWarehouseDto(
        String ref,
        String number,
        String description,
        String type,
        Double lat,
        Double lng) {
}
