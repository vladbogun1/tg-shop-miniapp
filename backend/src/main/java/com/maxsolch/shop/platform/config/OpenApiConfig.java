package com.maxsolch.shop.platform.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.core.converter.ModelConverter;
import io.swagger.v3.core.jackson.ModelResolver;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springdoc.core.customizers.OperationCustomizer;
import org.springdoc.core.providers.ObjectMapperProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.core.annotation.Order;
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
    @Order(10)
    public ModelConverter recordSchemas() {
        return new OpenApiRecordSchemas();
    }

    /** Unique schema names (see {@link OpenApiTypeNames}); springdoc's own resolver backs off when there is one. */
    @Bean
    @Order(0)
    public ModelResolver modelResolver(ObjectMapperProvider objectMapperProvider) {
        return new ModelResolver(objectMapperProvider.jsonMapper(), new OpenApiTypeNames());
    }

    /** Applies the required / nullable facts of {@link OpenApiRecordSchemas} to the schemas of responses. */
    @Bean
    public OpenApiCustomizer responseSchemas() {
        return new OpenApiResponseSchemas();
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
