package com.maxsolch.shop.staff.domain;

import java.time.Instant;

/** One row of an admin's sign-in history (V37), as shown in «Мой аккаунт». */
public record LoginLogEntry(long id, Instant at, String method, String result, String secondFactor, String ip,
                            String country, String city, String device, boolean newDevice, boolean newCity) {
}
