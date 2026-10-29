package com.maxsolch.shopfixture.service;

import org.springframework.beans.factory.annotation.Value;

import java.time.Instant;
import java.time.ZoneId;

public class OldService {
    @Value("${x}")
    int x;

    public synchronized Object tick() {
        return new Object[]{Instant.now(), ZoneId.of("Europe/Kyiv")};
    }
}
