package com.maxsolch.shop.media.app;

import com.maxsolch.shop.media.api.MediaController;
import com.maxsolch.shop.media.domain.ObjectStore;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import com.maxsolch.shop.platform.web.UploadedFile;

import java.io.IOException;
import java.io.InputStream;
import java.util.UUID;

/**
 * Stores uploaded files (product images, chat attachments) in MinIO/S3 and returns the
 * object key. The key (not a presigned URL) is persisted; the frontend builds a public URL
 * via imgproxy. Never exposes raw bytes.
 */
@Service
public class ImageStorageService {

    private final ObjectStore store;

    public ImageStorageService(ObjectStore store) {
        this.store = store;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void ensureBucket() {
        store.ensureBucket();
    }

    /**
     * Upload a stream under the given key. Returns the key.
     */
    public String putObject(InputStream stream, long size, String contentType, String key) {
        store.put(key, stream, size, contentType);
        return key;
    }

    /**
     * Upload an admin product image. Key layout: products/{uuid}/{filename}.
     */
    public String uploadProductImage(UploadedFile file) {
        String filename = sanitize(file.getOriginalFilename());
        String key = "products/" + UUID.randomUUID() + "/" + filename;
        return upload(file, key);
    }

    /**
     * Brand logos live under products/ on purpose: imgproxy only proxies that prefix
     * (IMGPROXY_ALLOWED_SOURCES), and logos are public like product photos.
     */
    public static final String BRAND_LOGO_PREFIX = "products/brands/";

    /** Upload a brand logo (PNG/WebP/SVG, checked by {@link UploadValidator#validateBrandLogo}). */
    public String uploadBrandLogo(UploadedFile file) {
        String filename = sanitize(file.getOriginalFilename());
        String key = BRAND_LOGO_PREFIX + UUID.randomUUID() + "/" + filename;
        return upload(file, key);
    }

    /**
     * Upload a chat attachment. Key layout: chat/{uuid}/{filename}.
     */
    public String uploadChatAttachment(UploadedFile file) {
        String filename = sanitize(file.getOriginalFilename());
        String key = "chat/" + UUID.randomUUID() + "/" + filename;
        return upload(file, key);
    }

    /**
     * Upload a customer's chat attachment under their own prefix: chat/u{userId}/{uuid}/{filename}.
     * The prefix is what lets a customer message reference only files that customer uploaded
     * (see {@link #isCustomerAttachmentKey}) — otherwise any known key, e.g. someone else's photo or
     * document, could be attached to one's own order and fetched back through a signed URL.
     */
    public String uploadCustomerChatAttachment(UploadedFile file, long userId) {
        String filename = sanitize(file.getOriginalFilename());
        String key = customerChatPrefix(userId) + UUID.randomUUID() + "/" + filename;
        return upload(file, key);
    }

    /**
     * A document of a batch expense (invoice, customs declaration): costing/b{batchId}/{uuid}/{filename}. Private —
     * imgproxy reads only products/, the admin API hands it out to «Финансы».
     */
    public String uploadCostingDocument(UploadedFile file, long batchId) {
        String key = "costing/b" + batchId + "/" + UUID.randomUUID() + "/" + sanitize(file.getOriginalFilename());
        return upload(file, key);
    }

    public static String customerChatPrefix(long userId) {
        return "chat/u" + userId + "/";
    }

    /** True if {@code key} is a plain object key inside this customer's own chat prefix. */
    public static boolean isCustomerAttachmentKey(String key, long userId) {
        return key != null && key.startsWith(customerChatPrefix(userId)) && !key.contains("..");
    }

    /** A stored object's bytes plus the content type it was uploaded with. */
    public record StoredObject(InputStream stream, String contentType) {
    }

    /**
     * Reads an object back out of storage. Used by {@link MediaController} to serve private chat
     * attachments, which is why the bucket no longer needs to be world-readable.
     *
     * @return the object, or null if it does not exist
     */
    public StoredObject get(String key) {
        if (key == null || key.isBlank()) {
            return null;
        }
        ObjectStore.Stored stored = store.get(key);
        return stored == null ? null : new StoredObject(stored.stream(), stored.contentType());
    }

    /**
     * Best-effort delete of a stored object. Used when an admin removes a picture from a product —
     * without it every replaced image stayed in the bucket forever.
     *
     * <p>Never throws: losing a byte-range in object storage must not fail the product save that
     * the user is actually performing. External http(s) urls (legacy/migrated images) are skipped.
     */
    public void deleteQuietly(String key) {
        if (key == null || key.isBlank() || key.startsWith("http://") || key.startsWith("https://")) {
            return;
        }
        store.removeQuietly(key.trim());
    }

    private String upload(UploadedFile file, String key) {
        try (InputStream in = file.getInputStream()) {
            return putObject(in, file.getSize(), file.getContentType(), key);
        } catch (IOException e) {
            throw new RuntimeException("Failed to read upload: " + e.getMessage(), e);
        }
    }

    private String sanitize(String name) {
        if (name == null || name.isBlank()) {
            return "file";
        }
        String base = name.replaceAll("[^A-Za-z0-9._-]", "_");
        return base.isBlank() ? "file" : base;
    }
}
