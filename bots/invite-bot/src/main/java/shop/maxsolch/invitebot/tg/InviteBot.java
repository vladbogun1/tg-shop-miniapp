package shop.maxsolch.invitebot.tg;

import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.telegram.telegrambots.bots.TelegramLongPollingBot;
import org.telegram.telegrambots.meta.api.methods.send.SendPhoto;
import org.telegram.telegrambots.meta.api.objects.InputFile;
import org.telegram.telegrambots.meta.api.objects.Update;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup;
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton;
import shop.maxsolch.invitebot.config.AppProperties;

@Slf4j
@Component
public class InviteBot extends TelegramLongPollingBot {

    private final AppProperties props;

    public InviteBot(AppProperties props) {
        super(props.getTelegram().getBotToken());
        this.props = props;
    }

    @Override
    public String getBotUsername() {
        return props.getTelegram().getBotUsername();
    }

    @Override
    public void onUpdateReceived(Update update) {
        if (update == null || !update.hasMessage() || !update.getMessage().hasText()) {
            return;
        }

        String text = update.getMessage().getText().trim();
        if (!text.startsWith("/start")) {
            return;
        }

        long chatId = update.getMessage().getChatId();
        sendLanding(chatId);
    }

    private void sendLanding(long chatId) {
        SendPhoto photo = landing(chatId, props.getInvite());
        try {
            execute(photo);
        } catch (Exception e) {
            // Not rethrown: one failed reply must not break the polling loop. But it is logged —
            // a broken image URL or a blocked chat should be visible in `docker logs`.
            log.warn("Failed to send landing to chat {}: {}", chatId, e.getMessage(), e);
        }
    }

    /** The /start reply: landing photo, caption and one URL button per row. */
    static SendPhoto landing(long chatId, AppProperties.Invite invite) {
        return SendPhoto.builder()
            .chatId(chatId)
            .photo(new InputFile(invite.getLandingImageUrl()))
            .caption(invite.getCaption())
            .replyMarkup(keyboard(invite.getButtons()))
            .build();
    }

    static InlineKeyboardMarkup keyboard(List<AppProperties.Button> buttons) {
        var builder = InlineKeyboardMarkup.builder();
        for (AppProperties.Button b : buttons) {
            builder.keyboardRow(List.of(InlineKeyboardButton.builder()
                .text(b.getText())
                .url(b.getUrl())
                .build()));
        }
        return builder.build();
    }
}
