package com.example.tgshop.config;

import java.nio.file.Path;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
public class MediaConfig implements WebMvcConfigurer {

  private final AppProperties props;

  @Override
  public void addResourceHandlers(ResourceHandlerRegistry registry) {
    String prefix = normalizePrefix(props.getMedia().getUrlPrefix());
    String storagePath = props.getMedia().getStoragePath();
    if (storagePath == null || storagePath.isBlank()) return;
    String location = Path.of(storagePath).toAbsolutePath().normalize().toUri().toString();
    registry.addResourceHandler(prefix + "/**")
        .addResourceLocations(location);
  }

  private String normalizePrefix(String prefix) {
    if (prefix == null || prefix.isBlank()) return "/media";
    String normalized = prefix.startsWith("/") ? prefix : "/" + prefix;
    return normalized.endsWith("/") ? normalized.substring(0, normalized.length() - 1) : normalized;
  }
}
