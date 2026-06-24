package com.maxsolch.shop.web.dto;

import java.util.List;

/** Aggregated metrics about bot users for the admin dashboard. */
public record UserMetricsDto(
        String range,
        String currency,
        long totalUsers,
        long newUsersInRange,
        long activeUsers,      // have at least one order (all-time)
        long inactiveUsers,    // totalUsers - activeUsers
        long blockedUsers,     // blocked the bot (DM/broadcast hit 403)
        long premiumUsers,
        List<CountByDay> newUsersByDay,
        List<LanguageCount> languages,
        List<TopCustomer> topCustomers) {

    public record CountByDay(String date, long count) {}

    public record LanguageCount(String language, long count) {}

    public record TopCustomer(long telegramUserId, String name, long ordersCount, long totalSpentMinor) {}
}
