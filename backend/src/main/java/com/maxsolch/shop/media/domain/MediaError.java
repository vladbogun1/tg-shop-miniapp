package com.maxsolch.shop.media.domain;

import com.maxsolch.shop.platform.error.ErrorCode;

/** Reasons of the {@code media} module's errors; the text of each is {@code error.media.<NAME>} in the i18n bundles. */
public enum MediaError implements ErrorCode {

    MEDIA_FORBIDDEN,
    LINK_EXPIRED,
    FILE_NOT_FOUND,
    FILE_TOO_BIG,
    BAD_FILE_TYPE,
    NO_FILE,
    BAD_EXTENSION,
    /** Import by link: not an http(s) address on the standard port. */
    IMAGE_URL_BAD,
    /** Import by link: the address is internal (loopback, private network, metadata). */
    IMAGE_URL_BLOCKED,
    /** Import by link: the site did not give the file ({0} = status or reason). */
    IMAGE_FETCH_FAILED,
    /** Import by link: a page without a picture in og:image / ld+json. */
    IMAGE_NOT_ON_PAGE,
    /** Import by link: the picture is smaller than {0} px on its longer side. */
    IMAGE_TOO_SMALL,
    /** Import by link: imgproxy could not render the square. */
    IMAGE_PROCESSING_FAILED;

    private final String code;

    MediaError() {
        this(null);
    }

    MediaError(String code) {
        this.code = code;
    }

    @Override
    public String code() {
        return code;
    }
}
