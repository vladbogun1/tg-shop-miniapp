package com.maxsolch.shop.media;

import com.maxsolch.shop.web.BadRequestException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Uploads used to be accepted with no checks at all. A chat attachment is a file an admin will
 * click on, so an .html or .svg among them is stored XSS — hence both the declared content type
 * and the extension have to be on the whitelist.
 */
class UploadValidatorTest {

    private final UploadValidator validator = new UploadValidator();

    private MockMultipartFile file(String name, String contentType, int bytes) {
        return new MockMultipartFile("file", name, contentType, new byte[bytes]);
    }

    @Test
    void acceptsAnOrdinaryPhoto() {
        assertThatCode(() -> validator.validateImage(file("photo.jpg", "image/jpeg", 1024)))
                .doesNotThrowAnyException();
    }

    @Test
    void rejectsHtmlDisguisedAsAnImage() {
        // Content type says image, extension says otherwise: this is the stored-XSS shape.
        assertThatThrownBy(() -> validator.validateImage(file("evil.html", "image/png", 128)))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("расширение");
    }

    @Test
    void rejectsSvgEvenWithAnImageContentType() {
        assertThatThrownBy(() -> validator.validateImage(file("logo.svg", "image/svg+xml", 128)))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void rejectsAnExecutableContentType() {
        assertThatThrownBy(() -> validator.validateImage(file("x.jpg", "application/x-msdownload", 128)))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("тип файла");
    }

    @Test
    void ignoresACharsetSuffixOnTheContentType() {
        assertThatCode(() -> validator.validateImage(file("a.png", "image/png; charset=binary", 64)))
                .doesNotThrowAnyException();
    }

    @Test
    void rejectsFilesOverFifteenMegabytes() {
        assertThatThrownBy(() -> validator.validateImage(
                file("huge.jpg", "image/jpeg", 16 * 1024 * 1024)))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("большой");
    }

    @Test
    void rejectsAnEmptyUpload() {
        assertThatThrownBy(() -> validator.validateImage(file("a.jpg", "image/jpeg", 0)))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void chatAttachmentsAlsoAllowPdfReceipts() {
        assertThatCode(() -> validator.validateAttachment(file("receipt.pdf", "application/pdf", 2048)))
                .doesNotThrowAnyException();
        // ...but a PDF is not a product image.
        assertThatThrownBy(() -> validator.validateImage(file("receipt.pdf", "application/pdf", 2048)))
                .isInstanceOf(BadRequestException.class);
    }
}
