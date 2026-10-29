package com.maxsolch.shop.platform.tx;

import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a listener of a domain event published through {@link DomainEvents}: it runs after the publishing
 * transaction committed, never on rollback, and immediately when the event was published outside a transaction
 * (the same contract as the old {@link AfterCommit#run}).
 */
@Target({ElementType.METHOD, ElementType.ANNOTATION_TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
public @interface OnCommitted {
}
