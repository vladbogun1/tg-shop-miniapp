package com.maxsolch.shop.payment.app;

import com.maxsolch.shop.platform.cache.CacheSpec;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

/**
 * The public key of monobank webhooks, in the shared Spring {@code CacheManager}. It used to live in a field for the
 * whole life of the process; now it expires after a day, which only costs one extra GET of the key (a rotated key is
 * picked up by the verifier itself, see {@link MonobankSignatureVerifier}).
 */
@Configuration
class PaymentCaches {

    static final CacheSpec MONOBANK_PUBKEY = new CacheSpec("monobankPubkey", 1, Duration.ofDays(1));

    @Bean
    CacheSpec monobankPubkeyCache() {
        return MONOBANK_PUBKEY;
    }
}
