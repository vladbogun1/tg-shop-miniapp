package com.maxsolch.shop.platform.time;

import com.maxsolch.shop.platform.config.AppProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

/** The two time beans every module uses; tests replace {@link Clock} with a fixed one. */
@Configuration
public class TimeConfig {

    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    public ShopZone shopZone(AppProperties props) {
        return ShopZone.of(props.getTimezone());
    }
}
