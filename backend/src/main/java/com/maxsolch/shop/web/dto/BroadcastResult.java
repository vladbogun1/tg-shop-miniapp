package com.maxsolch.shop.web.dto;

/** Result of a single test send. */
public record BroadcastResult(boolean ok, String detail) {
}
