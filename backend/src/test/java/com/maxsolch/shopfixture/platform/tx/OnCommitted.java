package com.maxsolch.shopfixture.platform.tx;

import org.springframework.transaction.event.TransactionalEventListener;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** The fixture's copy of the platform annotation (the rules look it up by its name under the root). */
@Target({ElementType.METHOD, ElementType.ANNOTATION_TYPE})
@Retention(RetentionPolicy.RUNTIME)
@TransactionalEventListener
public @interface OnCommitted {
}
