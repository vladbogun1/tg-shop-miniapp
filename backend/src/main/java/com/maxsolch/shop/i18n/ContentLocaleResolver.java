package com.maxsolch.shop.i18n;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.servlet.i18n.AcceptHeaderLocaleResolver;

import java.util.List;
import java.util.Locale;

/**
 * {@code Accept-Language} (see {@link LocaleConfig}) plus an explicit {@code ?lang=} on the public
 * catalog endpoints, which wins over the header.
 *
 * <p>The website renders catalog pages on the server and caches the backend responses in Next's
 * fetch cache, which keys on the URL only — not on request headers. With the language in the URL a
 * Ukrainian page can never be served a cached Russian response (or vice versa).
 */
public class ContentLocaleResolver extends AcceptHeaderLocaleResolver {

    /** Paths where {@code lang} is honoured (prefix match on the path within the context). */
    static final List<String> LANG_PARAM_PATHS = List.of(
            "/api/public/", "/api/products", "/api/catalog/", "/api/payment-options");

    @Override
    public Locale resolveLocale(HttpServletRequest request) {
        Locale explicit = explicitLang(request);
        return explicit != null ? explicit : super.resolveLocale(request);
    }

    private Locale explicitLang(HttpServletRequest request) {
        String lang = request.getParameter("lang");
        if (lang == null || lang.isBlank() || !acceptsLangParam(request)) {
            return null;
        }
        String language = Locale.forLanguageTag(lang.trim().replace('_', '-')).getLanguage();
        for (Locale supported : getSupportedLocales()) {
            if (supported.getLanguage().equals(language)) {
                return supported;
            }
        }
        return null;
    }

    static boolean acceptsLangParam(HttpServletRequest request) {
        String path = request.getRequestURI();
        String context = request.getContextPath();
        if (path == null) {
            return false;
        }
        if (context != null && !context.isEmpty() && path.startsWith(context)) {
            path = path.substring(context.length());
        }
        for (String prefix : LANG_PARAM_PATHS) {
            if (path.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }
}
