package com.maxsolch.shop.media;

import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.web.BadRequestException;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.util.Locale;
import java.util.Set;

/**
 * Gatekeeper for everything that lands in object storage.
 *
 * <p>Uploads used to be accepted with no checks at all: any content type, any extension, any size
 * the servlet container let through. Product images are re-encoded by imgproxy so they are fairly
 * inert, but chat attachments are user-supplied files that an admin will click on — an
 * {@code .html} or {@code .svg} among them is stored XSS against the panel.
 *
 * <p>Both the declared content type and the file extension must be in the whitelist, because the
 * browser-declared type is trivially spoofed and the extension is what a downstream viewer trusts.
 */
@Component
public class UploadValidator {

    /** Kept in step with spring.servlet.multipart.max-file-size (15MB). */
    private static final long MAX_BYTES = 15L * 1024 * 1024;

    private static final Set<String> IMAGE_TYPES =
            Set.of("image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/heic");

    private static final Set<String> IMAGE_EXTENSIONS =
            Set.of("jpg", "jpeg", "png", "webp", "gif", "avif", "heic", "heif");

    /** Extra types allowed as a chat attachment (a receipt is often a PDF). */
    private static final Set<String> DOCUMENT_TYPES = Set.of("application/pdf");
    private static final Set<String> DOCUMENT_EXTENSIONS = Set.of("pdf");

    /**
     * Brand logos: raster PNG/WebP or a vector SVG. An SVG is never shown directly — imgproxy renders
     * it to WebP (and sanitises SVG itself) — but it is still refused if it carries anything active.
     */
    private static final Set<String> LOGO_TYPES = Set.of("image/png", "image/webp", "image/svg+xml");
    private static final Set<String> LOGO_EXTENSIONS = Set.of("png", "webp", "svg");
    private static final long LOGO_MAX_BYTES = 2L * 1024 * 1024;
    private static final java.util.regex.Pattern SVG_ACTIVE = java.util.regex.Pattern.compile(
            "<script|<foreignobject|<!entity|<iframe|<embed|<object|javascript:|\son[a-z]+\s*=",
            java.util.regex.Pattern.CASE_INSENSITIVE);

    private final Messages messages;

    public UploadValidator(Messages messages) {
        this.messages = messages;
    }

    /** Product images: pictures only. */
    public void validateImage(MultipartFile file) {
        validate(file, IMAGE_TYPES, IMAGE_EXTENSIONS, messages.current("api.upload.kind.image"));
    }

    /** Chat attachments: pictures plus PDF receipts. */
    public void validateAttachment(MultipartFile file) {
        Set<String> types = union(IMAGE_TYPES, DOCUMENT_TYPES);
        Set<String> extensions = union(IMAGE_EXTENSIONS, DOCUMENT_EXTENSIONS);
        validate(file, types, extensions, messages.current("api.upload.kind.imageOrPdf"));
    }

    /** Brand logo: PNG, WebP or a passive SVG, at most 2 MB. */
    public void validateBrandLogo(MultipartFile file) {
        String kind = messages.current("api.upload.kind.logo");
        validate(file, LOGO_TYPES, LOGO_EXTENSIONS, kind);
        if (file.getSize() > LOGO_MAX_BYTES) {
            throw new BadRequestException(messages.current("api.upload.tooBig", LOGO_MAX_BYTES / 1024 / 1024));
        }
        if ("svg".equals(extensionOf(file.getOriginalFilename()))) {
            String text;
            try {
                text = new String(file.getBytes(), java.nio.charset.StandardCharsets.UTF_8);
            } catch (java.io.IOException e) {
                throw new BadRequestException(messages.current("api.upload.badType", kind));
            }
            if (!text.toLowerCase(Locale.ROOT).contains("<svg") || SVG_ACTIVE.matcher(text).find()) {
                throw new BadRequestException(messages.current("api.upload.badType", kind));
            }
        }
    }

    private void validate(MultipartFile file, Set<String> allowedTypes,
                          Set<String> allowedExtensions, String humanList) {
        if (file == null || file.isEmpty()) {
            throw new BadRequestException(messages.current("api.upload.noFile"));
        }
        if (file.getSize() > MAX_BYTES) {
            throw new BadRequestException(messages.current("api.upload.tooBig", MAX_BYTES / 1024 / 1024));
        }
        String contentType = file.getContentType() == null
                ? "" : file.getContentType().toLowerCase(Locale.ROOT).trim();
        // Strip any "; charset=..." the client tacked on.
        int semicolon = contentType.indexOf(';');
        if (semicolon > 0) {
            contentType = contentType.substring(0, semicolon).trim();
        }
        if (!allowedTypes.contains(contentType)) {
            throw new BadRequestException(messages.current("api.upload.badType", humanList));
        }
        String extension = extensionOf(file.getOriginalFilename());
        if (!allowedExtensions.contains(extension)) {
            throw new BadRequestException(messages.current("api.upload.badExtension", humanList));
        }
    }

    private static String extensionOf(String filename) {
        if (filename == null) {
            return "";
        }
        int dot = filename.lastIndexOf('.');
        if (dot < 0 || dot == filename.length() - 1) {
            return "";
        }
        return filename.substring(dot + 1).toLowerCase(Locale.ROOT).trim();
    }

    private static Set<String> union(Set<String> a, Set<String> b) {
        java.util.Set<String> out = new java.util.HashSet<>(a);
        out.addAll(b);
        return out;
    }
}
