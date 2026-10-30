package com.maxsolch.shop.payment.infra;

import com.maxsolch.shop.platform.config.StartupCheck;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Payment is online-only: without a monobank token orders can be placed but never paid (and they are cancelled
 * automatically once the payment deadline passes).
 */
@Slf4j
@Component
class PaymentStartupCheck implements StartupCheck {

    private final PaymentProperties props;

    PaymentStartupCheck(PaymentProperties props) {
        this.props = props;
    }

    @Override
    public void check(boolean dev, List<String> fatal) {
        if (!dev && !props.getPayment().getMonobank().isEnabled()) {
            log.warn("MONOBANK_TOKEN не задан — online payment disabled — customers cannot pay. "
                    + "Заказы будут создаваться и через {} ч отменяться как неоплаченные.",
                    props.getPayment().getDueHours());
        }
    }
}
