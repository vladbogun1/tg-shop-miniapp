package com.maxsolch.shop.platform.security;

import org.aopalliance.intercept.MethodInvocation;
import org.springframework.aop.Pointcut;
import org.springframework.aop.support.ComposablePointcut;
import org.springframework.aop.support.annotation.AnnotationMatchingPointcut;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.authorization.method.AuthorizationInterceptorsOrder;
import org.springframework.security.authorization.method.AuthorizationManagerBeforeMethodInterceptor;
import org.springframework.security.core.Authentication;

import java.util.function.Supplier;

/**
 * The check behind {@link RequiresFinance}: a method interceptor that runs right after {@code @PreAuthorize}
 * ({@link RequiredAdmin}). A caller who is not an ADMIN token is refused like by any admin rule (403, generic text); an admin
 * whose right is missing gets the finance text from {@link AdminAccess#requireFinance(long)}.
 */
@Configuration(proxyBeanMethods = false)
public class FinanceGuard {

    @Bean
    @org.springframework.context.annotation.Role(BeanDefinition.ROLE_INFRASTRUCTURE)
    static AuthorizationManagerBeforeMethodInterceptor requiresFinanceInterceptor(AdminAccess access) {
        Pointcut onMethod = new AnnotationMatchingPointcut(null, RequiresFinance.class, true);
        Pointcut onClass = new AnnotationMatchingPointcut(RequiresFinance.class, true);
        Pointcut either = new ComposablePointcut(onMethod).union(onClass);
        AuthorizationManager<MethodInvocation> manager = (Supplier<Authentication> auth, MethodInvocation call) -> {
            Authentication a = auth.get();
            if (a == null || !(a.getPrincipal() instanceof AuthPrincipal p) || p.role() != Role.ADMIN) {
                return new AuthorizationDecision(false);
            }
            access.requireFinance(p.telegramUserId());
            return new AuthorizationDecision(true);
        };
        AuthorizationManagerBeforeMethodInterceptor interceptor =
                new AuthorizationManagerBeforeMethodInterceptor(either, manager);
        interceptor.setOrder(AuthorizationInterceptorsOrder.PRE_AUTHORIZE.getOrder() + 1);
        return interceptor;
    }
}
