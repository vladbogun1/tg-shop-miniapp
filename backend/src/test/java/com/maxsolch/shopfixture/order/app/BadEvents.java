package com.maxsolch.shopfixture.order.app;

import com.github.benmanes.caffeine.cache.Caffeine;
import com.maxsolch.shopfixture.platform.tx.OnCommitted;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Breaks the event, thread and memo rules: T3 (raw publisher), T4 (raw listeners), T5 (event in app),
 * J2 (executor, thread), K2 (volatile data) and CA (Caffeine outside platform.cache).
 */
public class BadEvents {

    /** An event that lies in app instead of domain (T5, by its name). */
    public record OrderPlacedEvent(long id) {
    }

    private final ApplicationEventPublisher publisher;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile String memo;
    private volatile boolean running;
    private final Object cache = Caffeine.newBuilder().build();

    public BadEvents(ApplicationEventPublisher publisher) {
        this.publisher = publisher;
    }

    public void start() {
        publisher.publishEvent(new OrderPlacedEvent(1));
        new Thread(() -> memo = "x").start();
    }

    @TransactionalEventListener
    public void raw(OrderPlacedEvent e) {
    }

    @EventListener
    public void projectEvent(OrderPlacedEvent e) {
    }

    @OnCommitted
    public void wrongPlace(OrderPlacedEvent e) {
    }
}
