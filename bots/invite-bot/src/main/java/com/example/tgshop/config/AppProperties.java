package com.example.tgshop.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "app")
public class AppProperties {

  private Telegram telegram = new Telegram();
  private Invite invite = new Invite();

  @Getter
  @Setter
  public static class Telegram {
    private String botToken;
    private String botUsername;
  }

  @Getter
  @Setter
  public static class Invite {
    private String landingImageUrl;
  }
}
