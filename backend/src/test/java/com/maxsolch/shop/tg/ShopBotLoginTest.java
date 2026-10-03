package com.maxsolch.shop.tg;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** Parsing of the bot-login deep link and callback routing (plain /start must stay a greeting). */
class ShopBotLoginTest {

    @Test
    void loginPayloadIsRecognised() {
        String nonce = "7Zi7p3bQnOstF5jqeGf4GnTDa1ResHPBuiZ0rdNwF2M";
        assertThat(ShopBot.loginNonce("/start login_" + nonce)).isEqualTo(nonce);
        assertThat(ShopBot.loginNonce("/start@maxsolch_bot login_" + nonce)).isEqualTo(nonce);
    }

    @Test
    void ordinaryStartIsNotALogin() {
        assertThat(ShopBot.loginNonce("/start")).isNull();
        assertThat(ShopBot.loginNonce("/start promo2026")).isNull();
        assertThat(ShopBot.loginNonce("/start login_")).isNull();
        assertThat(ShopBot.loginNonce("/help")).isNull();
        assertThat(ShopBot.loginNonce("login_abc")).isNull();
    }

    @Test
    void onlyOurCallbackPrefixesAreHandled() {
        assertThat(WebLoginBotHandler.handles("wl:1216ca51-af1e-4146-8ecb-70bf46fa339c:42")).isTrue();
        assertThat(WebLoginBotHandler.handles("ws:1216ca51-af1e-4146-8ecb-70bf46fa339c:end")).isTrue();
        assertThat(WebLoginBotHandler.handles("something-else")).isFalse();
        assertThat(WebLoginBotHandler.handles(null)).isFalse();
    }

    @Test
    void deviceLabelIsHtmlEscaped() {
        assertThat(WebLoginBotHandler.esc("<b>Chrome</b> & co")).isEqualTo("&lt;b&gt;Chrome&lt;/b&gt; &amp; co");
    }
}
