package com.maxsolch.shop.ai.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PageTextTest {

    @Test
    void htmlLosesScriptsAndMenusButKeepsTitlePictureAndText() {
        PageText.WebPage p = PageText.fromHtml("""
                <html><head><title>Viper V3 Pro &amp; Co</title>
                <meta property="og:image" content="https://cdn.razer.com/v3.png">
                <script>var x = "secret";</script><style>.a{}</style></head>
                <body><nav>Home Shop</nav><h1>Viper V3 Pro</h1><table><tr><td>Weight</td><td>54&nbsp;g</td></tr></table>
                <footer>© Razer</footer></body></html>""");

        assertThat(p.title()).isEqualTo("Viper V3 Pro & Co");
        assertThat(p.ogImage()).isEqualTo("https://cdn.razer.com/v3.png");
        assertThat(p.text()).contains("Viper V3 Pro").contains("Weight").contains("54 g")
                .doesNotContain("secret").doesNotContain("Home Shop").doesNotContain("Razer");
    }

    @Test
    void ogImageIsFoundWhateverTheAttributeOrder() {
        assertThat(PageText.fromHtml("<meta content=\"https://x/y.jpg\" property=\"og:image\">").ogImage())
                .isEqualTo("https://x/y.jpg");
    }

    @Test
    void readerAnswerGivesTitleFirstPictureAndMarkdown() {
        PageText.WebPage p = PageText.fromReader("""
                Title: Lamzu Maya X
                URL Source: https://lamzu.com/maya-x
                Markdown Content:
                ![logo](https://lamzu.com/logo.svg)
                ![mouse](https://cdn.lamzu.com/maya-x.webp)
                Weight 47 g""");

        assertThat(p.title()).isEqualTo("Lamzu Maya X");
        assertThat(p.ogImage()).isEqualTo("https://cdn.lamzu.com/maya-x.webp");
        assertThat(p.text()).startsWith("![logo]").endsWith("Weight 47 g");
    }

    @Test
    void longPageKeepsTheSpecWindowAndDropsRepeatedMenuLines() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 400; i++) {
            sb.append("Menu item number ").append(i).append('\n').append("Cart\n");
        }
        sb.append("Specifications\nWeight: 54 g\nSensor: Focus Pro 35K\n");
        String out = PageText.compact(sb.toString(), 2000);

        assertThat(out.length()).isLessThanOrEqualTo(2000);
        assertThat(out).contains("Specifications").contains("Sensor: Focus Pro 35K");
        assertThat(out.split("Cart", -1)).hasSize(2);
    }

    @Test
    void costIsRoundedUpSoTinyCallsNeverSumToZero() {
        assertThat(new TokenUsage(1, 0, 0).costMicroUsd(150_000, 15_000, 600_000)).isEqualTo(1);
        assertThat(new TokenUsage(10_000, 20_000, 5_000).costMicroUsd(150_000, 15_000, 600_000))
                .isEqualTo(1500 + 300 + 3000);
    }
}
