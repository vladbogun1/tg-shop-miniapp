package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.jobs.Workers;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.metadata.IIOMetadata;
import javax.imageio.metadata.IIOMetadataNode;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * What the supply reader does with an upload before the model sees it: the kind comes from the bytes, big pictures are
 * cut down to 1600 px, a phone's rotation is applied and its metadata is gone, a PDF becomes one picture per page and
 * the eleventh page is a refusal.
 */
class AiImagePrepTest {

    private final Workers workers = new Workers();
    private final AiImagePrep prep = new AiImagePrep(workers);

    @AfterEach
    void stop() {
        workers.destroy();
    }

    private static BufferedImage canvas(int w, int h) {
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setPaint(Color.WHITE);
        g.fillRect(0, 0, w, h);
        g.setPaint(Color.RED);
        g.fillRect(0, 0, w / 4, h / 4); // the red corner shows where the top left went
        g.dispose();
        return img;
    }

    private static byte[] png(int w, int h) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(canvas(w, h), "png", out);
        return out.toByteArray();
    }

    /** A JPEG that carries an EXIF block with the given orientation and a recognisable marker text. */
    private static byte[] jpegWithExif(int w, int h, int orientation) throws IOException {
        ByteArrayOutputStream plain = new ByteArrayOutputStream();
        ImageIO.write(canvas(w, h), "jpg", plain);
        byte[] jpg = plain.toByteArray();
        byte[] tiff = {'I', 'I', 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, (byte) orientation, 0, 0, 0, 0, 0, 0, 0};
        byte[] marker = "SecretGpsMarker".getBytes(StandardCharsets.US_ASCII);
        int len = 2 + 6 + tiff.length + marker.length;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(jpg, 0, 2);
        out.write(0xFF);
        out.write(0xE1);
        out.write(len >> 8);
        out.write(len & 0xFF);
        out.write("Exif\0\0".getBytes(StandardCharsets.US_ASCII));
        out.write(tiff);
        out.write(marker);
        out.write(jpg, 2, jpg.length - 2);
        return out.toByteArray();
    }

    private static byte[] pdf(int pages) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < pages; i++) {
                PDPage page = new PDPage(PDRectangle.A4);
                doc.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.beginText();
                    cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 18);
                    cs.newLineAtOffset(60, 760);
                    cs.showText("Invoice page " + (i + 1));
                    cs.endText();
                }
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return out.toByteArray();
        }
    }

    private static BufferedImage read(byte[] bytes) throws IOException {
        return ImageIO.read(new ByteArrayInputStream(bytes));
    }

    @Test
    void aBigPngIsCutDownToTheLongSideOf1600() throws IOException {
        List<AiImagePrep.Image> out = prep.prepare(png(4000, 2500));
        assertThat(out).hasSize(1);
        AiImagePrep.Image img = out.get(0);
        assertThat(img.mime()).isEqualTo("image/png");
        assertThat(img.width()).isEqualTo(1600);
        assertThat(img.height()).isEqualTo(1000);
        assertThat(read(img.bytes()).getWidth()).isEqualTo(1600);
        assertThat(img.page()).isNull();
    }

    @Test
    void aSmallPictureKeepsItsSize() throws IOException {
        AiImagePrep.Image img = prep.prepare(png(800, 600)).get(0);
        assertThat(img.width()).isEqualTo(800);
        assertThat(img.height()).isEqualTo(600);
    }

    @Test
    void theKindIsReadFromTheBytesNotFromAName() throws IOException {
        // a text file is refused whatever it is called; a real PNG is accepted whatever its upload name was
        byte[] text = "<html>not a picture</html>".getBytes(StandardCharsets.UTF_8);
        assertThatThrownBy(() -> prep.prepare(text)).isInstanceOfSatisfying(DomainException.class,
                e -> assertThat(e.errorCode()).isEqualTo(AiError.FILE_TYPE));
        assertThat(AiImagePrep.sniff(png(10, 10))).isEqualTo(AiImagePrep.Kind.PNG);
        assertThat(AiImagePrep.sniff(pdf(1))).isEqualTo(AiImagePrep.Kind.PDF);
        assertThat(AiImagePrep.sniff(jpegWithExif(10, 10, 1))).isEqualTo(AiImagePrep.Kind.JPEG);
        // an executable with a picture name is not a picture
        assertThatThrownBy(() -> prep.prepare(new byte[]{(byte) 0x4D, (byte) 0x5A, (byte) 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, (byte) 0xFF, (byte) 0xFF}))
                .isInstanceOf(DomainException.class);
    }

    @Test
    void aWebpIsDecodedAndReEncodedAsPng() {
        // the smallest lossless webp: 1x1 pixel
        byte[] webp = Base64.getDecoder().decode("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==");
        assertThat(AiImagePrep.sniff(webp)).isEqualTo(AiImagePrep.Kind.WEBP);
        AiImagePrep.Image img = prep.prepare(webp).get(0);
        assertThat(img.mime()).isEqualTo("image/png");
        assertThat(img.width()).isEqualTo(1);
    }

    @Test
    void reEncodingDropsTheExifBlock() throws IOException {
        byte[] source = jpegWithExif(640, 480, 1);
        assertThat(new String(source, StandardCharsets.ISO_8859_1)).contains("SecretGpsMarker");
        AiImagePrep.Image img = prep.prepare(source).get(0);
        assertThat(img.mime()).isEqualTo("image/jpeg");
        String out = new String(img.bytes(), StandardCharsets.ISO_8859_1);
        assertThat(out).doesNotContain("SecretGpsMarker").doesNotContain("Exif");
    }

    @Test
    void aPhonePhotoTakenInPortraitIsStoodUp() throws IOException {
        // stored as 640x480 with orientation 6 (rotate 90 clockwise): the picture must come out 480x640
        AiImagePrep.Image img = prep.prepare(jpegWithExif(640, 480, 6)).get(0);
        assertThat(img.width()).isEqualTo(480);
        assertThat(img.height()).isEqualTo(640);
        // the red corner was top-left; after a clockwise quarter turn it is top-right
        BufferedImage out = read(img.bytes());
        assertThat(new Color(out.getRGB(470, 10)).getRed()).isGreaterThan(200);
        assertThat(new Color(out.getRGB(470, 10)).getGreen()).isLessThan(80);
    }

    @Test
    void aPdfBecomesOnePngPerPageInOrder() throws IOException {
        List<AiImagePrep.Image> out = prep.prepare(pdf(3));
        assertThat(out).hasSize(3);
        assertThat(out).extracting(AiImagePrep.Image::page).containsExactly(1, 2, 3);
        assertThat(out).allSatisfy(i -> {
            assertThat(i.mime()).isEqualTo("image/png");
            assertThat(Math.max(i.width(), i.height())).isEqualTo(AiImagePrep.MAX_SIDE);
        });
    }

    @Test
    void aPdfOfTenPagesPassesAndOfElevenIsRefusedWholly() throws IOException {
        assertThat(prep.prepare(pdf(AiImagePrep.MAX_PAGES))).hasSize(10);
        assertThatThrownBy(() -> prep.prepare(pdf(AiImagePrep.MAX_PAGES + 1))).isInstanceOfSatisfying(DomainException.class,
                e -> assertThat(e.errorCode()).isEqualTo(AiError.PDF_PAGES));
    }

    @Test
    void aFileOverTenMegabytesAndABrokenOneAreRefused() {
        byte[] huge = new byte[AiImagePrep.MAX_BYTES + 1];
        assertThatThrownBy(() -> prep.prepare(huge)).isInstanceOfSatisfying(DomainException.class,
                e -> assertThat(e.errorCode()).isEqualTo(AiError.FILE_TOO_BIG));
        byte[] brokenPng = {(byte) 0x89, 'P', 'N', 'G', 13, 10, 26, 10, 0, 0, 0, 0, 1, 2, 3};
        assertThatThrownBy(() -> prep.prepare(brokenPng)).isInstanceOfSatisfying(DomainException.class,
                e -> assertThat(e.errorCode()).isEqualTo(AiError.FILE_BROKEN));
        assertThatThrownBy(() -> prep.prepare(new byte[0])).isInstanceOf(DomainException.class);
    }

    @Test
    void transparentPixelsBecomeWhiteNotBlack() throws IOException {
        BufferedImage clear = new BufferedImage(20, 20, BufferedImage.TYPE_INT_ARGB);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(clear, "png", out);
        BufferedImage got = read(prep.prepare(out.toByteArray()).get(0).bytes());
        assertThat(new Color(got.getRGB(5, 5)).getRed()).isEqualTo(255);
    }

    // keeps the imports of the metadata classes honest when a writer-based fixture is added later
    @SuppressWarnings("unused")
    private static final Class<?>[] FIXTURE_TYPES = {IIOImage.class, ImageWriteParam.class, ImageWriter.class,
            IIOMetadata.class, IIOMetadataNode.class, MemoryCacheImageOutputStream.class};
}
