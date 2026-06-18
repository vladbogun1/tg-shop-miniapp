package com.maxsolch.shop.web.dto;

/**
 * Body for the toggle endpoints: {active} and {archived}.
 */
public record BooleanFlagRequest(Boolean active, Boolean archived) {
}
