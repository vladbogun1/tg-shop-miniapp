package com.maxsolch.shop.platform.tx;

import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks a listener of a domain event published through {@link DomainEvents} that must run when the publishing
 * transaction is over, <b>whatever the outcome</b>: after the commit and after the rollback. The counterpart of
 * {@link OnCommitted} for cleanup that is needed either way (for example dropping an in-memory copy of data that was
 * read inside the transaction before it was known whether the change stays). With no transaction at all the listener
 * does not run — there is nothing to wait for, so the publisher does its work directly.
 */
@Target({ElementType.METHOD, ElementType.ANNOTATION_TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMPLETION)
public @interface OnCompleted {
}
