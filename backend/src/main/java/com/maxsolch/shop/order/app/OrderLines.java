package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.infra.OrderItemRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

/** Order lines by id, for modules that point at a line (a review is about one line of a delivered order). */
@Service
public class OrderLines {

    private final OrderItemRepository repository;

    public OrderLines(OrderItemRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public Optional<OrderItem> find(long id) {
        return repository.findById(id);
    }

    @Transactional(readOnly = true)
    public List<OrderItem> findAll(Collection<Long> ids) {
        return repository.findAllById(ids);
    }
}
