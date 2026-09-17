package com.maxsolch.shop.security;

import com.maxsolch.shop.config.AllowedOrigins;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;
    private final RateLimitFilter rateLimitFilter;
    private final AllowedOrigins allowedOrigins;

    public SecurityConfig(JwtAuthFilter jwtAuthFilter,
                          RateLimitFilter rateLimitFilter,
                          AllowedOrigins allowedOrigins) {
        this.jwtAuthFilter = jwtAuthFilter;
        this.rateLimitFilter = rateLimitFilter;
        this.allowedOrigins = allowedOrigins;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // Home / Thymeleaf + static
                        .requestMatchers("/", "/index.html", "/favicon.ico").permitAll()
                        .requestMatchers("/css/**", "/js/**", "/images/**", "/webjars/**", "/static/**").permitAll()
                        // Actuator: health/info are public (docker healthchecks / uptime probes);
                        // everything else (caches, metrics, env...) is ADMIN-only. Previously the
                        // rest fell through to anyRequest().authenticated(), so any CUSTOMER token
                        // could read them.
                        .requestMatchers("/actuator/health", "/actuator/health/**", "/actuator/info").permitAll()
                        .requestMatchers("/actuator/**").hasRole("ADMIN")
                        // OpenAPI / Swagger
                        .requestMatchers("/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs/**").permitAll()
                        // Public API
                        .requestMatchers("/api/app-info").permitAll()
                        .requestMatchers("/api/auth/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/products/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/tags").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/payment-options").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/promo-codes/preview").permitAll()
                        .requestMatchers("/api/np/**").permitAll()
                        // Private attachments: the signed, expiring link in the query string IS the
                        // authorisation (an <img> tag cannot send a bearer token). See MediaSigner.
                        .requestMatchers(HttpMethod.GET, "/api/media").permitAll()
                        // WebSocket handshake (STOMP auth happens in the ChannelInterceptor)
                        .requestMatchers("/ws/**").permitAll()
                        // Customer endpoints
                        .requestMatchers(HttpMethod.POST, "/api/orders").hasRole("CUSTOMER")
                        .requestMatchers("/api/me/**").hasRole("CUSTOMER")
                        // Admin endpoints are additionally guarded by @RequiredAdmin
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        // Everything else requires authentication; admin routes use @RequiredAdmin
                        .anyRequest().authenticated())
                .addFilterBefore(rateLimitFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    /**
     * Both filters are {@code @Component}s, which makes Spring Boot auto-register them in the
     * plain servlet chain on top of the security chain — they would run twice per request (and the
     * rate limiter would count every request twice). These beans opt them out of auto-registration;
     * the security chain above is the only place they run.
     */
    @Bean
    public FilterRegistrationBean<JwtAuthFilter> jwtAuthFilterRegistration(JwtAuthFilter filter) {
        FilterRegistrationBean<JwtAuthFilter> registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }

    @Bean
    public FilterRegistrationBean<RateLimitFilter> rateLimitFilterRegistration(RateLimitFilter filter) {
        FilterRegistrationBean<RateLimitFilter> registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }

    /**
     * CORS for the separately-deployed frontend (Mini App / admin web).
     * The origin list lives in {@link AllowedOrigins} so the WebSocket handshake uses the same one;
     * localhost/tunnel wildcards are added only under the dev profile.
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration cfg = new CorsConfiguration();
        cfg.setAllowedOriginPatterns(allowedOrigins.patterns());
        cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cfg.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept", "ngrok-skip-browser-warning"));
        cfg.setExposedHeaders(List.of("Authorization"));
        cfg.setAllowCredentials(true);
        cfg.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cfg);
        return source;
    }
}
