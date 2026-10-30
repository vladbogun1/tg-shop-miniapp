package com.maxsolch.shop.platform.openapi;

import com.fasterxml.jackson.core.util.DefaultIndenter;
import com.fasterxml.jackson.core.util.DefaultPrettyPrinter;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.maxsolch.shop.platform.config.OpenApiConfig;
import com.maxsolch.shop.platform.error.ErrorCode;
import org.mockito.Mockito;
import org.springdoc.core.configuration.SpringDocConfiguration;
import org.springdoc.core.properties.SpringDocConfigProperties;
import org.springdoc.webmvc.core.configuration.MultipleOpenApiSupportConfiguration;
import org.springdoc.webmvc.core.configuration.SpringDocWebMvcConfiguration;
import org.springframework.beans.BeansException;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.beans.factory.support.BeanDefinitionRegistryPostProcessor;
import org.springframework.beans.factory.support.RootBeanDefinition;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.http.HttpMessageConvertersAutoConfiguration;
import org.springframework.boot.autoconfigure.jackson.JacksonAutoConfiguration;
import org.springframework.boot.autoconfigure.web.servlet.WebMvcAutoConfiguration;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.core.type.filter.AssignableTypeFilter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.WebApplicationContext;

import java.lang.reflect.Constructor;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.concurrent.atomic.AtomicReference;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * Builds {@code /v3/api-docs} of the real controllers without a database: a web context holding all
 * {@code @RestController}s, whose services are Mockito mocks (springdoc reads only signatures), plus the
 * application's own {@link OpenApiConfig}.
 */
final class OpenApiDocs {

    /** Schemas whose keys are omitted when null on purpose ({@code @JsonInclude(NON_NULL)}), or {@code Schema.property}. */
    static final Set<String> OPTIONAL_ON_PURPOSE = new HashSet<>(List.of("AdminLoginResponse", "InviteAcceptResponse", "InviteCreated"));

    private static final String BASE = "com.maxsolch.shop";

    /** Codes sent by the security filter, not by an {@code ErrorCode} enum ({@code JwtAuthFilter.forbid}). */
    static final List<String> FILTER_CODES = List.of("ORIGIN_NOT_ALLOWED", "TWO_FACTOR_REQUIRED");

    private OpenApiDocs() {
    }

    static JsonNode fetch() throws Exception {
        AtomicReference<String> body = new AtomicReference<>();
        new WebApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(JacksonAutoConfiguration.class, HttpMessageConvertersAutoConfiguration.class,
                        WebMvcAutoConfiguration.class, SpringDocConfiguration.class, SpringDocConfigProperties.class,
                        SpringDocWebMvcConfiguration.class, MultipleOpenApiSupportConfiguration.class))
                .withUserConfiguration(ControllersWithMockedServices.class, OpenApiConfig.class)
                .withPropertyValues("springdoc.api-docs.version=openapi_3_0", "springdoc.writer-with-order-by-keys=true")
                .run(ctx -> {
                    org.assertj.core.api.Assertions.assertThat(ctx).hasNotFailed();
                    MockMvc mvc = MockMvcBuilders.webAppContextSetup((WebApplicationContext) ctx).build();
                    body.set(mvc.perform(get("/v3/api-docs")).andReturn().getResponse().getContentAsString());
                });
        return new ObjectMapper().readTree(body.get());
    }

    /** All wire codes (the {@code code} field of an error body) and per enum constant. */
    static JsonNode errorCodes() throws Exception {
        ObjectMapper m = new ObjectMapper();
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AssignableTypeFilter(ErrorCode.class));
        Map<String, Object> byEnum = new TreeMap<>();
        Set<String> all = new TreeSet<>(FILTER_CODES);
        for (BeanDefinition d : scanner.findCandidateComponents(BASE)) {
            Class<?> type = Class.forName(d.getBeanClassName());
            if (!type.isEnum() || type.getName().contains("Test")) {
                continue;
            }
            Map<String, String> codes = new TreeMap<>();
            for (Object c : type.getEnumConstants()) {
                String code = ((ErrorCode) c).code();
                if (code != null) {
                    codes.put(((ErrorCode) c).name(), code);
                    all.add(code);
                }
            }
            byEnum.put(type.getSimpleName(), codes);
        }
        ObjectNode root = m.createObjectNode();
        ArrayNode list = root.putArray("codes");
        all.forEach(list::add);
        root.set("byEnum", m.valueToTree(byEnum));
        return root;
    }

    /** Stable text: keys sorted, 2-space indent, LF, trailing newline. */
    static String render(JsonNode node) throws Exception {
        DefaultPrettyPrinter pp = new DefaultPrettyPrinter();
        DefaultIndenter indenter = new DefaultIndenter("  ", "\n");
        pp.indentArraysWith(indenter);
        pp.indentObjectsWith(indenter);
        return new ObjectMapper().writer(pp).writeValueAsString(sorted(node)) + "\n";
    }

    private static JsonNode sorted(JsonNode n) {
        if (n.isObject()) {
            ObjectNode out = JsonNodeFactory.instance.objectNode();
            List<String> names = new ArrayList<>();
            n.fieldNames().forEachRemaining(names::add);
            names.sort(Comparator.naturalOrder());
            names.forEach(k -> out.set(k, sorted(n.get(k))));
            return out;
        }
        if (n.isArray()) {
            ArrayNode out = JsonNodeFactory.instance.arrayNode();
            n.forEach(e -> out.add(sorted(e)));
            return out;
        }
        return n;
    }

    /**
     * Registers every {@code @RestController} of the app; each constructor dependency becomes a Mockito mock.
     * Deliberately NOT a {@code @Configuration}: the integration tests scan the test classpath and would pick up the mocks.
     */
    static class ControllersWithMockedServices implements BeanDefinitionRegistryPostProcessor {

        @Override
        public void postProcessBeanDefinitionRegistry(BeanDefinitionRegistry registry) throws BeansException {
            ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false);
            scanner.addIncludeFilter(new AnnotationTypeFilter(RestController.class));
            Set<Class<?>> mocks = new HashSet<>();
            for (BeanDefinition d : scanner.findCandidateComponents(BASE)) {
                Class<?> controller;
                try {
                    controller = Class.forName(d.getBeanClassName());
                } catch (ClassNotFoundException e) {
                    throw new IllegalStateException(e);
                }
                registry.registerBeanDefinition(controller.getName(), new RootBeanDefinition(controller));
                for (Constructor<?> c : controller.getDeclaredConstructors()) {
                    mocks.addAll(List.of(c.getParameterTypes()));
                }
            }
            for (Class<?> type : mocks) {
                registry.registerBeanDefinition("mock:" + type.getName(), mockDefinition(type));
            }
        }

        @SuppressWarnings({"unchecked", "rawtypes"})
        private static RootBeanDefinition mockDefinition(Class type) {
            return new RootBeanDefinition(type, () -> Mockito.mock(type));
        }

        @Override
        public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException {
        }
    }
}
