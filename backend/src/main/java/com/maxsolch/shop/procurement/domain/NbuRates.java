package com.maxsolch.shop.procurement.domain;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * The official NBU rate for a date: a hint for the rate fields of a batch and an expense. The bank's API is behind
 * this port ({@code procurement.infra.NbuRateClient}); when the rate cannot be had the answer is a 400 asking
 * for a manual rate.
 */
public interface NbuRates {

    BigDecimal rate(String currency, LocalDate date);
}
