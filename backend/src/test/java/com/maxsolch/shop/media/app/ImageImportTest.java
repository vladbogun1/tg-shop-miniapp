package com.maxsolch.shop.media.app;

import com.maxsolch.shop.media.domain.FakeImgproxy;
import com.maxsolch.shop.media.domain.Imgproxy;
import com.maxsolch.shop.media.domain.InMemoryObjectStore;
import com.maxsolch.shop.media.domain.MediaError;
import com.maxsolch.shop.media.domain.RemoteImages;
import com.maxsolch.shop.platform.error.DomainException;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** A found photo ends up as one square WebP in products/, the original is not left behind. */
class ImageImportTest {

    private static final UUID ID = UUID.fromString("11111111-2222-3333-4444-555555555555");

    /** Serves fixed bodies per URL, like a tiny internet. */
    private static final class FakeRemote implements RemoteImages {
        final Map<String, Fetched> bodies = new HashMap<>();

        FakeRemote with(String url, byte[] body, String type) {
            bodies.put(url, new Fetched(body, type, URI.create(url)));
            return this;
        }

        @Override
        public Fetched fetch(URI url, long maxBytes) {
            Fetched f = bodies.get(url.toString());
            if (f == null) {
                throw new DomainException.BadRequest(MediaError.IMAGE_FETCH_FAILED, "HTTP 404");
            }
            return f;
        }

        /** The site answers this URL from another one (a redirect the real client followed). */
        FakeRemote redirect(String url, String landed, byte[] body, String type) {
            bodies.put(url, new Fetched(body, type, URI.create(landed)));
            return this;
        }
    }

    static byte[] png(int w, int h, Color bg, Color product) throws IOException {
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        g.setColor(bg);
        g.fillRect(0, 0, w, h);
        if (product != null) {
            g.setColor(product);
            g.fillRect(w / 4, h / 4, w / 2, h / 2);
        }
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return out.toByteArray();
    }

    private final InMemoryObjectStore store = new InMemoryObjectStore();

    @Test
    void squaresAPhotoOnTheColourOfItsEdges() throws IOException {
        FakeRemote remote = new FakeRemote().with("https://brand.example.com/m.png", png(800, 600, Color.WHITE, Color.BLACK), "image/png");
        FakeImgproxy imgproxy = new FakeImgproxy(true).withPreview(png(64, 48, new Color(240, 238, 236), Color.BLACK));

        ImageImport.Imported got = new ImageImport(remote, store, imgproxy, () -> ID).importFrom("https://brand.example.com/m.png");

        assertThat(got.key()).isEqualTo("products/" + ID + "/photo.webp");
        assertThat(store.contains(got.key())).isTrue();
        assertThat(store.contains("products/_import/" + ID + "/source.png")).as("original removed").isFalse();
        assertThat(imgproxy.asked()).contains("square:products/_import/" + ID + "/source.png@1600/80/240,238,236");
    }

    @Test
    void takesOgImageWhenTheLinkIsAProductPage() throws IOException {
        String html = "<!doctype html><html><head><meta property=\"og:image\" content=\"//cdn.example.com/p/1.jpg?v=2&amp;w=1200\">";
        FakeRemote remote = new FakeRemote()
                .with("https://shop.example.com/products/mouse", html.getBytes(StandardCharsets.UTF_8), "text/html; charset=utf-8")
                .with("https://cdn.example.com/p/1.jpg?v=2&w=1200", png(1200, 1200, Color.WHITE, Color.RED), "image/jpeg");
        FakeImgproxy imgproxy = new FakeImgproxy(true).withPreview(png(64, 64, Color.WHITE, null));

        ImageImport.Imported got = new ImageImport(remote, store, imgproxy, () -> ID).importFrom("https://shop.example.com/products/mouse");

        assertThat(got.source()).isEqualTo("https://cdn.example.com/p/1.jpg?v=2&w=1200");
        // the real type comes from the bytes, not the site's Content-Type
        assertThat(imgproxy.asked()).anyMatch(s -> s.startsWith("square:products/_import/" + ID + "/source.png@"));
    }

    @Test
    void refusesTinyPictures() throws IOException {
        FakeRemote remote = new FakeRemote().with("https://x.example.com/t.png", png(300, 200, Color.WHITE, Color.BLACK), "image/png");

        assertThatThrownBy(() -> new ImageImport(remote, store, new FakeImgproxy(true), () -> ID).importFrom("https://x.example.com/t.png"))
                .isInstanceOfSatisfying(DomainException.BadRequest.class,
                        e -> assertThat(e.errorCode()).isEqualTo(MediaError.IMAGE_TOO_SMALL));
        assertThat(store.size()).isZero();
    }

    @Test
    void refusesWhatIsNotAPicture() {
        FakeRemote remote = new FakeRemote().with("https://x.example.com/a.svg",
                "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>".getBytes(StandardCharsets.UTF_8), "image/svg+xml");

        assertThatThrownBy(() -> new ImageImport(remote, store, new FakeImgproxy(true), () -> ID).importFrom("https://x.example.com/a.svg"))
                .isInstanceOfSatisfying(DomainException.BadRequest.class,
                        e -> assertThat(e.errorCode()).isEqualTo(MediaError.BAD_FILE_TYPE));
    }

    @Test
    void aPageWithoutAPictureSaysSo() {
        FakeRemote remote = new FakeRemote().with("https://x.example.com/p",
                "<html><head><title>x</title></head></html>".getBytes(StandardCharsets.UTF_8), "text/html");

        assertThatThrownBy(() -> new ImageImport(remote, store, new FakeImgproxy(true), () -> ID).importFrom("https://x.example.com/p"))
                .isInstanceOfSatisfying(DomainException.BadRequest.class,
                        e -> assertThat(e.errorCode()).isEqualTo(MediaError.IMAGE_NOT_ON_PAGE));
    }

    @Test
    void aProductPageThatRedirectedToTheHomePageGivesNoPicture() {
        // a removed product (or a site that dislikes the client) sends us to "/": its og:image is the shop's logo
        String home = "<html><head><meta property=\"og:image\" content=\"https://x.example.com/LOGO.jpg\">";
        FakeRemote remote = new FakeRemote().redirect("https://x.example.com/products/gone", "https://x.example.com/",
                home.getBytes(StandardCharsets.UTF_8), "text/html");

        assertThatThrownBy(() -> new ImageImport(remote, store, new FakeImgproxy(true), () -> ID).importFrom("https://x.example.com/products/gone"))
                .isInstanceOfSatisfying(DomainException.BadRequest.class,
                        e -> assertThat(e.errorCode()).isEqualTo(MediaError.IMAGE_NOT_ON_PAGE));
    }

    @Test
    void whenImgproxyFailsNothingStaysInStorage() throws IOException {
        FakeRemote remote = new FakeRemote().with("https://x.example.com/m.png", png(800, 800, Color.WHITE, Color.BLACK), "image/png");

        assertThatThrownBy(() -> new ImageImport(remote, store, new FakeImgproxy(false), () -> ID).importFrom("https://x.example.com/m.png"))
                .isInstanceOfSatisfying(DomainException.BadRequest.class,
                        e -> assertThat(e.errorCode()).isEqualTo(MediaError.IMAGE_PROCESSING_FAILED));
        assertThat(store.size()).isZero();
    }

    @Test
    void edgeColourIgnoresAProductTouchingOneSideAndCutOutsGetWhite() throws IOException {
        BufferedImage img = new BufferedImage(64, 64, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        g.setColor(new Color(30, 30, 30));
        g.fillRect(0, 0, 64, 64);
        g.setColor(Color.ORANGE);
        g.fillRect(0, 10, 20, 40); // touches the left edge
        g.dispose();
        assertThat(EdgeColor.of(img)).isEqualTo(new Imgproxy.Rgb(30, 30, 30));

        BufferedImage cutOut = new BufferedImage(64, 64, BufferedImage.TYPE_INT_ARGB);
        assertThat(EdgeColor.of(cutOut)).isEqualTo(EdgeColor.WHITE);
        assertThat(EdgeColor.ofPng(null)).isEqualTo(EdgeColor.WHITE);
    }

    @Test
    void headerReadsTypeAndSizeFromTheBytes() throws IOException {
        ImageHeader png = ImageHeader.of(png(1234, 567, Color.WHITE, null));
        assertThat(png).isEqualTo(new ImageHeader("image/png", "png", 1234, 567));

        BufferedImage img = new BufferedImage(640, 480, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream jpg = new ByteArrayOutputStream();
        ImageIO.write(img, "jpg", jpg);
        assertThat(ImageHeader.of(jpg.toByteArray())).isEqualTo(new ImageHeader("image/jpeg", "jpg", 640, 480));

        assertThat(ImageHeader.of("<html>hello</html>".getBytes(StandardCharsets.UTF_8))).isNull();
    }

    @Test
    void pageImagesFallsBackToJsonLd() {
        String html = "<html><script type=\"application/ld+json\">{\"@type\":\"Product\",\"image\":[\"https:\\/\\/cdn.example.com\\/a.webp\"]}</script>";
        assertThat(PageImages.find(html, URI.create("https://shop.example.com/p")))
                .isEqualTo(URI.create("https://cdn.example.com/a.webp"));
        String relative = "<meta content='/img/b.jpg' name='twitter:image'>";
        assertThat(PageImages.find(relative, URI.create("https://shop.example.com/p/x")))
                .isEqualTo(URI.create("https://shop.example.com/img/b.jpg"));
    }
}
