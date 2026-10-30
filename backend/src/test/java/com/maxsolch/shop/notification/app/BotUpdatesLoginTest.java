package com.maxsolch.shop.notification.app;

import com.maxsolch.shop.customer.app.WebLoginNotifier;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** Parsing of the bot-login deep link and callback routing (plain /start must stay a greeting). */
class BotUpdatesLoginTest {

    @Test
    void loginPayloadIsRecognised() {
        String nonce = "7Zi7p3bQnOstF5jqeGf4GnTDa1ResHPBuiZ0rdNwF2M";
        assertThat(BotUpdates.loginNonce("/start login_" + nonce)).isEqualTo(nonce);
        assertThat(BotUpdates.loginNonce("/start@maxsolch_bot login_" + nonce)).isEqualTo(nonce);
    }

    @Test
    void ordinaryStartIsNotALogin() {
        assertThat(BotUpdates.loginNonce("/start")).isNull();
        assertThat(BotUpdates.loginNonce("/start promo2026")).isNull();
        assertThat(BotUpdates.loginNonce("/start login_")).isNull();
        assertThat(BotUpdates.loginNonce("/help")).isNull();
        assertThat(BotUpdates.loginNonce("login_abc")).isNull();
    }

    @Test
    void onlyOurCallbackPrefixesAreHandled() {
        assertThat(WebLoginNotifier.isLoginCallback("wl:1216ca51-af1e-4146-8ecb-70bf46fa339c:42")).isTrue();
        assertThat(WebLoginNotifier.isLoginCallback("ws:1216ca51-af1e-4146-8ecb-70bf46fa339c:end")).isTrue();
        assertThat(WebLoginNotifier.isLoginCallback("something-else")).isFalse();
        assertThat(WebLoginNotifier.isLoginCallback(null)).isFalse();
    }

    @Test
    void deviceLabelIsHtmlEscaped() {
        assertThat(com.maxsolch.shop.platform.util.Texts.escHtml("<b>Chrome</b> & co")).isEqualTo("&lt;b&gt;Chrome&lt;/b&gt; &amp; co");
    }
}
