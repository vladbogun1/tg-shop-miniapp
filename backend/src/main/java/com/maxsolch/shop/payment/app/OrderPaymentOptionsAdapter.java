package com.maxsolch.shop.payment.app;

import com.maxsolch.shop.order.app.OrderPaymentOptions;
import com.maxsolch.shop.payment.domain.PaymentOption;
import com.maxsolch.shop.payment.infra.PaymentOptionRepository;
import org.springframework.stereotype.Component;

import java.util.Optional;

/** Payment's side of {@link OrderPaymentOptions}: the options the checkout snapshots into an order. */
@Component
public class OrderPaymentOptionsAdapter implements OrderPaymentOptions {

    private final PaymentOptionRepository repository;

    public OrderPaymentOptionsAdapter(PaymentOptionRepository repository) {
        this.repository = repository;
    }

    @Override
    public Optional<Option> findActive(byte[] id) {
        return repository.findById(id).filter(PaymentOption::isActive).map(OrderPaymentOptionsAdapter::toOption);
    }

    @Override
    public Optional<Option> firstActive() {
        return repository.findByActiveTrueOrderBySortOrderAsc().stream().findFirst()
                .map(OrderPaymentOptionsAdapter::toOption);
    }

    private static Option toOption(PaymentOption po) {
        return new Option(po.getId(), po.getTitle(), po.isRequiresPrepayment(), po.getPrepaymentMinor());
    }
}
