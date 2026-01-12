package com.example.tgshop.config;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "app")
public class AppProperties {

  private Webapp webapp = new Webapp();
  private Telegram telegram = new Telegram();
  private Security security = new Security();
  private Media media = new Media();

  @Getter @Setter
  public static class Webapp {
    private String baseUrl;
  }

  @Getter @Setter
  public static class Telegram {
    private String botToken;
    private String botUsername;
    private String defaultAdminChatId;
    private String adminUserIds;

    public Set<Long> adminUserIdSet() {
      if (adminUserIds == null || adminUserIds.isBlank()) return Set.of();
      return Arrays.stream(adminUserIds.split(","))
          .map(String::trim)
          .filter(s -> !s.isEmpty())
          .map(Long::parseLong)
          .collect(Collectors.toSet());
    }
  }

  @Getter @Setter
  public static class Security {
    private boolean allowUnsignedInitData;
    private String adminPassword;
  }

  @Getter @Setter
  public static class Media {
    private String baseUrl;
    private String urlPrefix = "/media";
  }
}
