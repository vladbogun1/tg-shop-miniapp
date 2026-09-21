package com.maxsolch.shop.media;

import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.web.ForbiddenException;
import com.maxsolch.shop.web.NotFoundException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.InputStream;
import java.time.Duration;

/**
 * Serves private objects (chat attachments) through a signed, expiring link.
 *
 * <p>Deliberately not behind the JWT filter: the signature in the query string is the
 * authorisation, because an {@code <img>} tag cannot send an Authorization header. The signature is
 * bound to one object key and an expiry, so it grants nothing else and not for long — see
 * {@link MediaSigner}. Links are handed out by the API only to callers who were already allowed to
 * read that order's chat.
 */
@Slf4j
@RestController
@RequestMapping("/api/media")
@Tag(name = "Media", description = "Signed access to private chat attachments")
public class MediaController {

    /** Only these prefixes are ever served here; product images go through imgproxy. */
    private static final String ALLOWED_PREFIX = "chat/";

    private final ImageStorageService storage;
    private final MediaSigner signer;
    private final MediaThumbnailer thumbnailer;
    private final Messages messages;

    public MediaController(ImageStorageService storage,
                           MediaSigner signer,
                           MediaThumbnailer thumbnailer,
                           Messages messages) {
        this.storage = storage;
        this.signer = signer;
        this.thumbnailer = thumbnailer;
        this.messages = messages;
    }

    /**
     * @param w optional render width. Chat bubbles ask for a small variant instead of the stored
     *          original — a phone screenshot is megabytes and was being downloaded in full for a
     *          260px bubble. Only {@link MediaThumbnailer} widths are honoured; anything else
     *          falls back to the original rather than failing the request.
     */
    @GetMapping
    @Operation(summary = "Fetch a private attachment using a signed link")
    public ResponseEntity<InputStreamResource> get(@RequestParam("key") String key,
                                                   @RequestParam("exp") long exp,
                                                   @RequestParam("sig") String sig,
                                                   @RequestParam(value = "w", required = false) Integer w) {
        if (key == null || !key.startsWith(ALLOWED_PREFIX)) {
            // Never let a signed link be pointed at, say, a product image or another prefix.
            throw new ForbiddenException(messages.current("api.media.forbidden"));
        }
        if (!signer.isValid(key, exp, sig)) {
            throw new ForbiddenException(messages.current("api.media.expired"));
        }

        if (MediaThumbnailer.isAllowedWidth(w)) {
            MediaThumbnailer.Variant variant = thumbnailer.render(key, w);
            if (variant != null) {
                return body(variant.stream(), parseType(variant.contentType()));
            }
        }

        ImageStorageService.StoredObject object = storage.get(key);
        if (object == null) {
            throw new NotFoundException(messages.current("api.media.notFound"));
        }
        return body(object.stream(), parseType(object.contentType()));
    }

    private static ResponseEntity<InputStreamResource> body(InputStream stream, MediaType contentType) {
        return ResponseEntity.ok()
                .contentType(contentType)
                // Private: the link is per-viewer, so no shared cache may keep it. The URL itself is
                // stable for the signing window (see MediaSigner), so the browser's own cache is
                // what actually saves the re-download — hence a max-age on that same scale.
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(30)).cachePrivate())
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline")
                // Stored files are user uploads: never let a browser sniff one into something
                // executable.
                .header("X-Content-Type-Options", "nosniff")
                .body(new InputStreamResource(stream));
    }

    private static MediaType parseType(String raw) {
        if (raw == null || raw.isBlank()) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
        try {
            return MediaType.parseMediaType(raw);
        } catch (Exception e) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }
}
