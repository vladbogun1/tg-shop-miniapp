package com.maxsolch.shop.platform.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.core.converter.ModelConverter;
import org.springdoc.core.customizers.OperationCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    private static final String BEARER_SCHEME = "bearer-jwt";

    @Bean
    public OpenAPI tgShopOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("tg-shop-v2 API")
                        .description("Telegram-shop v2 backend — catalog, auth and admin endpoints.")
                        .version("v1"))
                .components(new Components().addSecuritySchemes(BEARER_SCHEME,
                        new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")
                                .description("Telegram-issued JWT. Use POST /api/auth/telegram to obtain one.")));
    }

    /** Record components are required, `@Nullable` ones nullable: the TypeScript types are generated from this. */
    @Bean
    public ModelConverter recordSchemas() {
        return new OpenApiRecordSchemas();
    }

    /** A stable id per endpoint (springdoc numbers duplicates in scan order, which differs between machines). */
    @Bean
    public OperationCustomizer stableOperationIds() {
        return (operation, handler) -> {
            operation.setOperationId(handler.getBeanType().getSimpleName() + "_" + handler.getMethod().getName());
            return operation;
        };
    }
}
