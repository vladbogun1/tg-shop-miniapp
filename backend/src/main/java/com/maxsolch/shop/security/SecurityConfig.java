package com.maxsolch.shop.security;

import com.maxsolch.shop.config.AppProperties;
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

import java.util.ArrayList;
import java.util.List;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;
    private final AppProperties props;

    public SecurityConfig(JwtAuthFilter jwtAuthFilter, AppProperties props) {
        this.jwtAuthFilter = jwtAuthFilter;
        this.props = props;
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
                        // Actuator (health/info public; others ADMIN later)
                        .requestMatchers("/actuator/health", "/actuator/health/**", "/actuator/info").permitAll()
                        // OpenAPI / Swagger
                        .requestMatchers("/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs/**").permitAll()
                        // Public API
                        .requestMatchers("/api/app-info").permitAll()
                        .requestMatchers("/api/auth/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/products/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/tags").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/payment-options").permitAll()
                        .requestMatchers("/api/np/**").permitAll()
                        // WebSocket handshake (STOMP auth happens in the ChannelInterceptor)
                        .requestMatchers("/ws/**").permitAll()
                        // Customer endpoints
                        .requestMatchers(HttpMethod.POST, "/api/orders").hasRole("CUSTOMER")
                        .requestMatchers("/api/me/**").hasRole("CUSTOMER")
                        // Admin endpoints are additionally guarded by @RequiredAdmin
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        // Everything else requires authentication; admin routes use @RequiredAdmin
                        .anyRequest().authenticated())
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    /**
     * CORS for the separately-deployed frontend (Mini App / admin web).
     * Allows configured origins plus any localhost port for local dev.
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration cfg = new CorsConfiguration();
        List<String> patterns = new ArrayList<>();
        patterns.add("http://localhost:*");
        patterns.add("http://127.0.0.1:*");
        patterns.add("https://*.ngrok-free.app");
        patterns.add("https://*.ngrok-free.dev");
        if (props.getWebappBaseUrl() != null && !props.getWebappBaseUrl().isBlank()) {
            patterns.add(props.getWebappBaseUrl());
        }
        if (props.getAdminBaseUrl() != null && !props.getAdminBaseUrl().isBlank()) {
            patterns.add(props.getAdminBaseUrl());
        }
        cfg.setAllowedOriginPatterns(patterns);
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
