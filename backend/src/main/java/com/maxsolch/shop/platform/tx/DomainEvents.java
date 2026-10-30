package com.maxsolch.shop.platform.tx;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

/**
 * The one way to say "this happened" so that something irreversible follows only if it is really committed
 * (a Telegram message, a push, deleting a file, a cache reset, a call to an external service).
 *
 * <p>Publisher side: a use case calls {@link #publish(Object)} inside its transaction with a small immutable
 * event (a record in the module's {@code domain}). Listener side: a method annotated {@link OnCommitted}
 * runs after the commit; on rollback it never runs; with no transaction at all it runs immediately.
 * A listener that fails does not undo the commit, so it must be safe to lose or retry (log it, do not rethrow).
 *
 * <p>Do not use {@code TransactionSynchronizationManager} outside this package.
 */
@Component
public class DomainEvents {

    private final ApplicationEventPublisher publisher;

    public DomainEvents(ApplicationEventPublisher publisher) {
        this.publisher = publisher;
    }

    public void publish(Object event) {
        publisher.publishEvent(event);
    }
}
