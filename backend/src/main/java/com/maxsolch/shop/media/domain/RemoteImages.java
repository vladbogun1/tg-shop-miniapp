package com.maxsolch.shop.media.domain;

import java.net.URI;

/**
 * Files from the open internet (product photos the AI found on a brand's site or a shop). The adapter refuses internal
 * addresses and follows redirects itself, checking each hop; it never returns more than {@code maxBytes}.
 */
public interface RemoteImages {

    /** The downloaded body, its declared content type and the address it finally came from (after redirects). */
    record Fetched(byte[] bytes, String contentType, URI finalUrl) {
    }

    /**
     * Downloads {@code url}.
     *
     * @throws com.maxsolch.shop.platform.error.DomainException.BadRequest with {@link MediaError#IMAGE_URL_BAD},
     *         {@link MediaError#IMAGE_URL_BLOCKED}, {@link MediaError#IMAGE_FETCH_FAILED} or {@link MediaError#FILE_TOO_BIG}
     */
    Fetched fetch(URI url, long maxBytes);
}
