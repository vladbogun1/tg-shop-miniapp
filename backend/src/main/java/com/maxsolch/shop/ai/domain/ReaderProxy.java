package com.maxsolch.shop.ai.domain;

/**
 * A page read by an outside reader service (r.jina.ai) — for shops that answer our server 403/429 or render
 * everything with JavaScript. The reader fetches from its own network, so our internal addresses are not at risk.
 */
public interface ReaderProxy {

    boolean enabled();

    /** The page or null when the reader failed; never throws. */
    PageText.WebPage read(String url);
}
