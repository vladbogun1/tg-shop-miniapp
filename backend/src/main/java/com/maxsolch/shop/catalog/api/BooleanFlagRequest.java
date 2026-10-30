package com.maxsolch.shop.catalog.api;

/**
 * Body for the toggle endpoints: {active} and {archived}.
 */
public record BooleanFlagRequest(Boolean active, Boolean archived) {
}
