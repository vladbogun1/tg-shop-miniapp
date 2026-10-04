package shop.maxsolch.invitebot.config;

import java.util.ArrayList;
import java.util.List;
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
    /** Caption under the landing photo. */
    private String caption;
    /** URL buttons, one per row, in this order. */
    private List<Button> buttons = new ArrayList<>();
  }

  @Getter
  @Setter
  public static class Button {
    private String text;
    private String url;
  }
}
