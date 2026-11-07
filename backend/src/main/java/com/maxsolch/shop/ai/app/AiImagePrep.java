package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.jobs.Workers;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.springframework.stereotype.Service;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import javax.imageio.stream.MemoryCacheImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * Turns an uploaded document into what the model is shown: JPEG, PNG, WEBP or PDF in, one or more pictures out, each
 * at most {@value #MAX_SIDE} px on the long side, rotated as the photo says, flattened onto white and re-encoded
 * (so no EXIF, no location, no embedded thumbnails leave the server). The kind is read from the first bytes — a name or
 * a declared type is never believed. A PDF becomes one PNG per page (at most {@value #MAX_PAGES}; the eleventh is a
 * refusal, not a silent cut: a missing page is a missing invoice line).
 *
 * <p>Decoding and PDF rendering are the heavy part of the whole feature (a page rendered at 1600 px is several MB of
 * heap), so everything runs on one worker thread, one document at a time; a queue of a few documents waits behind it
 * and a fuller one answers «busy». A picture whose header promises more than {@value #MAX_PIXELS} px is refused before
 * it is decoded, and a big one is decoded sub-sampled instead of whole.
 */
@Service
public class AiImagePrep {

    public static final int MAX_SIDE = 1600;
    public static final int MAX_PAGES = 10;
    public static final int MAX_BYTES = 10 * 1024 * 1024;
    static final long MAX_PIXELS = 100_000_000L;
    private static final Duration LIMIT = Duration.ofSeconds(90);
    private static final float JPEG_QUALITY = 0.88f;

    /** One picture for the model. {@code page} is the number of a PDF page, null for a photo. */
    public record Image(byte[] bytes, String mime, int width, int height, Integer page) {
    }

    enum Kind { JPEG, PNG, WEBP, PDF }

    static {
        System.setProperty("java.awt.headless", "true");
        // PDFBox keeps a font cache in the home directory; a container may not allow writing there
        if (System.getProperty("pdfbox.fontcache") == null) {
            System.setProperty("pdfbox.fontcache", System.getProperty("java.io.tmpdir"));
        }
    }

    private final ExecutorService worker;

    public AiImagePrep(Workers workers) {
        this.worker = workers.bounded("ai-render", 4, new ThreadPoolExecutor.AbortPolicy(), Duration.ofSeconds(5));
    }

    /** The pictures of one uploaded file, in page order. */
    public List<Image> prepare(byte[] content) {
        if (content == null || content.length == 0) {
            throw new DomainException.BadRequest(AiError.FILE_BROKEN);
        }
        if (content.length > MAX_BYTES) {
            throw new DomainException.BadRequest(AiError.FILE_TOO_BIG);
        }
        Kind kind = sniff(content);
        Future<List<Image>> done;
        try {
            done = worker.submit(() -> kind == Kind.PDF ? pages(content) : List.of(photo(content, kind)));
        } catch (RejectedExecutionException e) {
            throw new DomainException.TooManyRequests(AiError.BUSY, 5);
        }
        try {
            return done.get(LIMIT.toSeconds(), TimeUnit.SECONDS);
        } catch (TimeoutException e) {
            done.cancel(true);
            throw new DomainException.BadRequest(AiError.FILE_BROKEN);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new DomainException.BadRequest(AiError.FILE_BROKEN);
        } catch (ExecutionException e) {
            if (e.getCause() instanceof DomainException d) {
                throw d;
            }
            throw new DomainException.BadRequest(AiError.FILE_BROKEN);
        }
    }

    static Kind sniff(byte[] b) {
        if (b.length >= 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF) {
            return Kind.JPEG;
        }
        if (b.length >= 8 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') {
            return Kind.PNG;
        }
        if (b.length >= 12 && ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP")) {
            return Kind.WEBP;
        }
        for (int i = 0; i + 5 <= Math.min(b.length, 1024); i++) {
            if (ascii(b, i, "%PDF-")) {
                return Kind.PDF;
            }
        }
        throw new DomainException.BadRequest(AiError.FILE_TYPE);
    }

    private static boolean ascii(byte[] b, int at, String s) {
        for (int i = 0; i < s.length(); i++) {
            if (b[at + i] != s.charAt(i)) {
                return false;
            }
        }
        return true;
    }

    private Image photo(byte[] content, Kind kind) throws IOException {
        BufferedImage decoded = decode(content);
        int turns = kind == Kind.JPEG ? ExifOrientation.quarterTurns(content) : 0;
        BufferedImage fitted = fit(turn(decoded, turns));
        boolean jpeg = kind == Kind.JPEG;
        return new Image(encode(fitted, jpeg), jpeg ? "image/jpeg" : "image/png", fitted.getWidth(), fitted.getHeight(), null);
    }

    private List<Image> pages(byte[] content) throws IOException {
        try (PDDocument doc = Loader.loadPDF(content)) {
            int n = doc.getNumberOfPages();
            if (n == 0) {
                throw new DomainException.BadRequest(AiError.FILE_BROKEN);
            }
            if (n > MAX_PAGES) {
                throw new DomainException.BadRequest(AiError.PDF_PAGES, MAX_PAGES);
            }
            PDFRenderer renderer = new PDFRenderer(doc);
            List<Image> out = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                BufferedImage page = renderer.renderImage(i, scaleOf(doc.getPage(i)), ImageType.RGB);
                BufferedImage fitted = fit(page);
                out.add(new Image(encode(fitted, false), "image/png", fitted.getWidth(), fitted.getHeight(), i + 1));
            }
            return out;
        }
    }

    /** Renders at the final size at once, instead of at 72 dpi and scaling a large bitmap down afterwards. */
    private static float scaleOf(PDPage page) {
        PDRectangle box = page.getCropBox();
        float longSide = Math.max(box.getWidth(), box.getHeight());
        return longSide <= 0 ? 1f : Math.min(4f, MAX_SIDE / longSide);
    }

    private static BufferedImage decode(byte[] content) throws IOException {
        try (MemoryCacheImageInputStream in = new MemoryCacheImageInputStream(new ByteArrayInputStream(content))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
            if (!readers.hasNext()) {
                throw new DomainException.BadRequest(AiError.FILE_BROKEN);
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(in, true, true);
                int w = reader.getWidth(0);
                int h = reader.getHeight(0);
                if (w <= 0 || h <= 0 || (long) w * h > MAX_PIXELS) {
                    throw new DomainException.BadRequest(AiError.FILE_BROKEN);
                }
                ImageReadParam param = reader.getDefaultReadParam();
                int step = Math.max(1, Math.max(w, h) / (2 * MAX_SIDE));
                if (step > 1) {
                    param.setSourceSubsampling(step, step, 0, 0);
                }
                BufferedImage img = reader.read(0, param);
                if (img == null) {
                    throw new DomainException.BadRequest(AiError.FILE_BROKEN);
                }
                return img;
            } finally {
                reader.dispose();
            }
        } catch (DomainException e) {
            throw e;
        } catch (RuntimeException e) {
            // the decoders throw unchecked exceptions on broken data (an OutOfMemoryError is not caught on purpose)
            throw new DomainException.BadRequest(AiError.FILE_BROKEN);
        }
    }

    private static BufferedImage turn(BufferedImage img, int quarterTurns) {
        if (quarterTurns == 0) {
            return img;
        }
        int w = img.getWidth();
        int h = img.getHeight();
        boolean swap = quarterTurns != 2;
        BufferedImage out = new BufferedImage(swap ? h : w, swap ? w : h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        g.setPaint(Color.WHITE);
        g.fillRect(0, 0, out.getWidth(), out.getHeight());
        g.translate(out.getWidth() / 2.0, out.getHeight() / 2.0);
        g.rotate(Math.PI / 2 * quarterTurns);
        g.translate(-w / 2.0, -h / 2.0);
        g.drawImage(img, 0, 0, null);
        g.dispose();
        return out;
    }

    /** At most {@value #MAX_SIDE} px on the long side, always opaque RGB on white (transparent pixels would read as black). */
    private static BufferedImage fit(BufferedImage img) {
        int w = img.getWidth();
        int h = img.getHeight();
        double k = Math.min(1.0, (double) MAX_SIDE / Math.max(w, h));
        if (k == 1.0 && img.getType() == BufferedImage.TYPE_INT_RGB) {
            return img;
        }
        int tw = Math.max(1, (int) Math.round(w * k));
        int th = Math.max(1, (int) Math.round(h * k));
        BufferedImage out = new BufferedImage(tw, th, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        g.setPaint(Color.WHITE);
        g.fillRect(0, 0, tw, th);
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.drawImage(img, 0, 0, tw, th, null);
        g.dispose();
        return out;
    }

    /** A fresh encode: the writers put only the image itself into the file, none of the source's metadata. */
    private static byte[] encode(BufferedImage img, boolean jpeg) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        ImageWriter writer = ImageIO.getImageWritersByFormatName(jpeg ? "jpeg" : "png").next();
        try (ImageOutputStream out = new MemoryCacheImageOutputStream(bytes)) {
            writer.setOutput(out);
            ImageWriteParam param = writer.getDefaultWriteParam();
            if (jpeg) {
                param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
                param.setCompressionQuality(JPEG_QUALITY);
            }
            writer.write(null, new IIOImage(img, null, null), param);
        } finally {
            writer.dispose();
        }
        return bytes.toByteArray();
    }
}
