package com.maxsolch.shop.customer.api;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** The filter runs only inside the security chain; the servlet container must not add it a second time. */
@Configuration
class VisitorLocationFilterConfig {

    @Bean
    FilterRegistrationBean<VisitorLocationFilter> visitorLocationFilterRegistration(VisitorLocationFilter filter) {
        FilterRegistrationBean<VisitorLocationFilter> registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }
}
