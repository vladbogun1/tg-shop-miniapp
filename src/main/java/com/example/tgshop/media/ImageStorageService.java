package com.example.tgshop.media;

import com.example.tgshop.common.UuidUtil;
import com.example.tgshop.config.AppProperties;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
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
  private final MediaImageRepository mediaImageRepository;
  private final HttpClient httpClient = HttpClient.newBuilder()
      .followRedirects(HttpClient.Redirect.NORMAL)
      .build();

  public List<String> downloadImages(UUID productId, List<String> urls) {
    return downloadImages(productId, urls, false);
  }

  public List<String> downloadImages(UUID productId, List<String> urls, boolean replaceExisting) {
    if (urls == null || urls.isEmpty()) return List.of();
    String prefix = normalizePrefix(props.getMedia().getUrlPrefix());
    String baseUrl = props.getMedia().getBaseUrl();
    boolean hasRemote = urls.stream().anyMatch(url -> url != null && !isLocalUrl(url, baseUrl, prefix));
    if (replaceExisting && hasRemote) {
      deleteImages(productId);
    }
    List<String> result = new ArrayList<>();
    for (int i = 0; i < urls.size(); i++) {
      String sourceUrl = urls.get(i);
      if (sourceUrl == null || sourceUrl.isBlank()) continue;
      if (isLocalUrl(sourceUrl, baseUrl, prefix)) {
        result.add(sourceUrl.trim());
        continue;
      }
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
        String contentType = response.headers().firstValue("Content-Type").orElse(null);
        String ext = resolveExtension(sourceUrl, contentType);
        String filename = productId + "_" + (i + 1) + ext;
        MediaImage image = new MediaImage();
        image.setProductId(UuidUtil.toBytes(productId));
        image.setFilename(filename);
        image.setContentType(resolveContentType(contentType, ext));
        image.setData(response.body());
        mediaImageRepository.save(image);
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
    mediaImageRepository.deleteByProductId(UuidUtil.toBytes(productId));
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

  private String resolveContentType(String headerContentType, String ext) {
    if (headerContentType != null && !headerContentType.isBlank()) {
      return headerContentType.split(";")[0].trim();
    }
    return switch (ext) {
      case ".png" -> "image/png";
      case ".webp" -> "image/webp";
      default -> "image/jpeg";
    };
  }

  private String normalizePrefix(String prefix) {
    if (prefix == null || prefix.isBlank()) return "/media";
    String normalized = prefix.startsWith("/") ? prefix : "/" + prefix;
    return normalized.endsWith("/") ? normalized.substring(0, normalized.length() - 1) : normalized;
  }

  private boolean isLocalUrl(String url, String baseUrl, String prefix) {
    String normalizedPrefix = normalizePrefix(prefix);
    String trimmed = url.trim();
    if (trimmed.startsWith(normalizedPrefix + "/")) return true;
    if (baseUrl == null || baseUrl.isBlank()) return false;
    String trimmedBase = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
    return trimmed.startsWith(trimmedBase + normalizedPrefix + "/");
  }
}
