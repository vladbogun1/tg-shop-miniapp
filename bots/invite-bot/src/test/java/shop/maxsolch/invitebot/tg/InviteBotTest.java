package shop.maxsolch.invitebot.tg;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.PropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.boot.context.properties.source.ConfigurationPropertySources;
import org.telegram.telegrambots.meta.api.methods.send.SendPhoto;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;
import shop.maxsolch.invitebot.config.AppProperties;

/** No Spring context here: starting it would try to register the bot against Telegram. */
class InviteBotTest {

    @Test
    void defaultsFromApplicationYmlMatchTheOriginalHardcodedLanding() throws Exception {
        AppProperties props = bind(Map.of());

        SendPhoto photo = InviteBot.landing(42L, props.getInvite());

        assertThat(photo.getChatId()).isEqualTo("42");
        assertThat(photo.getPhoto().getAttachName()).isEqualTo("https://ru.files.fm/f/evk8czqqdj");
        assertThat(photo.getCaption()).isEqualTo("Добро пожаловать! Выбирай нужный раздел ниже 👇");
        assertThat(rows(photo)).containsExactly(
            List.of("🛍️ Магазин", "https://t.me/ChiSetup"),
            List.of("⭐ Отзывы", "https://t.me/ChiSetup_Comments"),
            List.of("📣 Основной канал", "https://t.me/maxsolch"));
    }

    @Test
    void envOverridesButtonsAndCaption() throws Exception {
        AppProperties props = bind(Map.of(
            "INVITE_SHOP_URL", "https://t.me/OtherShop",
            "INVITE_CHANNEL_TEXT", "Канал",
            "INVITE_CAPTION", "Привет"));

        SendPhoto photo = InviteBot.landing(1L, props.getInvite());

        assertThat(photo.getCaption()).isEqualTo("Привет");
        assertThat(rows(photo)).containsExactly(
            List.of("🛍️ Магазин", "https://t.me/OtherShop"),
            List.of("⭐ Отзывы", "https://t.me/ChiSetup_Comments"),
            List.of("Канал", "https://t.me/maxsolch"));
    }

    @Test
    void keyboardHasOneButtonPerRow() {
        AppProperties.Button a = new AppProperties.Button();
        a.setText("A");
        a.setUrl("https://a");
        AppProperties.Button b = new AppProperties.Button();
        b.setText("B");
        b.setUrl("https://b");

        InlineKeyboardMarkup kb = InviteBot.keyboard(List.of(a, b));

        assertThat(kb.getKeyboard()).hasSize(2).allSatisfy(row -> assertThat(row).hasSize(1));
    }

    private static List<List<String>> rows(SendPhoto photo) {
        InlineKeyboardMarkup kb = (InlineKeyboardMarkup) photo.getReplyMarkup();
        return kb.getKeyboard().stream()
            .map(row -> {
                InlineKeyboardButton btn = row.get(0);
                return List.of(btn.getText(), btn.getUrl());
            })
            .toList();
    }

    /** Binds application.yml the way Spring Boot does, with {@code env} standing in for ENV vars. */
    private static AppProperties bind(Map<String, Object> env) throws Exception {
        StandardEnvironment environment = new StandardEnvironment();
        environment.getPropertySources().remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
        environment.getPropertySources().addFirst(new MapPropertySource("env", env));
        for (PropertySource<?> ps : new YamlPropertySourceLoader()
            .load("application.yml", new ClassPathResource("application.yml"))) {
            environment.getPropertySources().addLast(ps);
        }
        ConfigurationPropertySources.attach(environment);
        return Binder.get(environment).bind("app", AppProperties.class).get();
    }
}
