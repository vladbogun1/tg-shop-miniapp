package com.example.tgshop.media;

import com.example.tgshop.config.AppProperties;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class ImageStorageService {

  private static final Duration TIMEOUT = Duration.ofSeconds(20);
  private static final String USER_AGENT =
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  private final AppProperties props;
  private final HttpClient httpClient = HttpClient.newBuilder()
      .followRedirects(HttpClient.Redirect.NORMAL)
      .build();

  public List<String> downloadImages(UUID productId, List<String> urls) {
    if (urls == null || urls.isEmpty()) return List.of();
    Path storageDir = prepareStorageDir();
    String prefix = normalizePrefix(props.getMedia().getUrlPrefix());
    String baseUrl = props.getMedia().getBaseUrl();
    List<String> result = new ArrayList<>();
    for (int i = 0; i < urls.size(); i++) {
      String sourceUrl = urls.get(i);
      try {
        HttpRequest request = HttpRequest.newBuilder(URI.create(sourceUrl))
            .timeout(TIMEOUT)
            .header("User-Agent", USER_AGENT)
            .GET()
            .build();
        HttpResponse<byte[]> response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
          throw new IllegalStateException("Bad response: " + response.statusCode());
        }
        String ext = resolveExtension(sourceUrl, response.headers().firstValue("Content-Type").orElse(null));
        String filename = productId + "_" + (i + 1) + ext;
        Path target = storageDir.resolve(filename);
        Files.write(target, response.body());
        result.add(buildPublicUrl(baseUrl, prefix, filename));
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        log.error("🖼️ Failed to download image url={} productId={}", sourceUrl, productId, e);
        throw new IllegalStateException("Failed to download image: " + sourceUrl, e);
      } catch (IOException e) {
        log.error("🖼️ Failed to download image url={} productId={}", sourceUrl, productId, e);
        throw new IllegalStateException("Failed to download image: " + sourceUrl, e);
      }
    }
    return result;
  }

  public void deleteImages(UUID productId) {
    Path storageDir = prepareStorageDir();
    String prefix = productId + "_";
    try (DirectoryStream<Path> stream = Files.newDirectoryStream(storageDir, prefix + "*")) {
      for (Path path : stream) {
        Files.deleteIfExists(path);
      }
    } catch (IOException e) {
      log.warn("🖼️ Failed to delete images for productId={}", productId, e);
    }
  }

  private Path prepareStorageDir() {
    String storagePath = props.getMedia().getStoragePath();
    if (storagePath == null || storagePath.isBlank()) {
      throw new IllegalStateException("Media storage path is not configured");
    }
    Path dir = Path.of(storagePath).toAbsolutePath().normalize();
    try {
      Files.createDirectories(dir);
    } catch (IOException e) {
      throw new IllegalStateException("Failed to create media directory: " + dir, e);
    }
    return dir;
  }

  private String buildPublicUrl(String baseUrl, String prefix, String filename) {
    String normalizedPrefix = normalizePrefix(prefix);
    String path = normalizedPrefix + "/" + filename;
    if (baseUrl == null || baseUrl.isBlank()) {
      return path;
    }
    String trimmedBase = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
    return trimmedBase + path;
  }

  private String resolveExtension(String url, String contentType) {
    String lowerUrl = url.toLowerCase(Locale.ROOT);
    for (String ext : List.of(".jpg", ".jpeg", ".png", ".webp")) {
      if (lowerUrl.contains(ext)) {
        return ext;
      }
    }
    if (contentType != null) {
      String ct = contentType.toLowerCase(Locale.ROOT);
      if (ct.contains("png")) return ".png";
      if (ct.contains("webp")) return ".webp";
      if (ct.contains("jpeg") || ct.contains("jpg")) return ".jpg";
    }
    return ".jpg";
  }

  private String normalizePrefix(String prefix) {
    if (prefix == null || prefix.isBlank()) return "/media";
    String normalized = prefix.startsWith("/") ? prefix : "/" + prefix;
    return normalized.endsWith("/") ? normalized.substring(0, normalized.length() - 1) : normalized;
  }
}
