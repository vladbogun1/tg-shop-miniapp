package com.maxsolch.shop.platform.tx;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** The single "after commit" contract: after commit only, never on rollback, immediately without a transaction. */
class DomainEventsTest {

    record Happened(String what) {
    }

    static class Listener {
        final List<String> seen = new ArrayList<>();

        @OnCommitted
        void on(Happened e) {
            seen.add(e.what());
        }
    }

    @Configuration
    @EnableTransactionManagement
    static class Config {
        @Bean
        PlatformTransactionManager tm() {
            return new AbstractPlatformTransactionManager() {
                @Override
                protected Object doGetTransaction() {
                    return new Object();
                }

                @Override
                protected void doBegin(Object transaction, org.springframework.transaction.TransactionDefinition d) {
                }

                @Override
                protected void doCommit(DefaultTransactionStatus status) {
                }

                @Override
                protected void doRollback(DefaultTransactionStatus status) {
                }
            };
        }

        @Bean
        Listener listener() {
            return new Listener();
        }

        @Bean
        DomainEvents events(org.springframework.context.ApplicationEventPublisher p) {
            return new DomainEvents(p);
        }
    }

    private AnnotationConfigApplicationContext ctx;
    private DomainEvents events;
    private Listener listener;
    private TransactionTemplate tx;

    @BeforeEach
    void start() {
        ctx = new AnnotationConfigApplicationContext(Config.class);
        events = ctx.getBean(DomainEvents.class);
        listener = ctx.getBean(Listener.class);
        tx = new TransactionTemplate(ctx.getBean(PlatformTransactionManager.class));
    }

    @AfterEach
    void stop() {
        ctx.close();
    }

    @Test
    void listenerRunsOnlyAfterCommit() {
        tx.executeWithoutResult(s -> {
            events.publish(new Happened("a"));
            assertThat(listener.seen).isEmpty();
        });
        assertThat(listener.seen).containsExactly("a");
    }

    @Test
    void listenerDoesNotRunOnRollback() {
        tx.executeWithoutResult(s -> {
            events.publish(new Happened("a"));
            s.setRollbackOnly();
        });
        assertThat(listener.seen).isEmpty();
    }

    @Test
    void listenerRunsImmediatelyOutsideTransaction() {
        events.publish(new Happened("a"));
        assertThat(listener.seen).containsExactly("a");
    }
}
