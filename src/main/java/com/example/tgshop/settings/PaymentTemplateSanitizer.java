package com.example.tgshop.settings;

public final class PaymentTemplateSanitizer {

  private PaymentTemplateSanitizer() {}

  public static String sanitize(String rawHtml) {
    if (rawHtml == null) {
      return "";
    }
    String html = rawHtml.replace("\r\n", "\n").trim();
    html = html
        .replace("&nbsp;", " ")
        .replace("&#160;", " ")
        .replace("\u00a0", " ");
    html = html.replaceAll("(?i)<br\\s*/?>", "\n");
    html = html.replaceAll("(?i)</(div|p)>", "\n");
    html = html.replaceAll("(?i)<(div|p)(\\s[^>]*)?>", "");
    html = html.replaceAll("(?i)<a\\s+[^>]*href=['\"]([^'\"]+)['\"][^>]*>", "<a href=\"$1\">");
    html = html.replaceAll("(?i)<(b|strong|i|em|u|ins|s|del|code|pre|blockquote)\\b[^>]*>", "<$1>");
    html = html.replaceAll(
        "(?i)<(?!/?(b|strong|i|em|u|ins|s|del|code|pre|blockquote|a)(\\s|>|/))[^>]*>",
        ""
    );
    html = html.replaceAll("\\n{3,}", "\n\n");
    return html.trim();
  }
}
