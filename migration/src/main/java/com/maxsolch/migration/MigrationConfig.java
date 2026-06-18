package com.maxsolch.migration;

/**
 * All settings read from environment variables (per docs/SPEC.md).
 *
 * Source (OLD DB):  OLD_DB_URL / OLD_DB_USER / OLD_DB_PASSWORD
 * Target (NEW DB):  DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD
 *                   (or a full DB_URL override)
 * MinIO / S3:       S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET
 *                   plus S3_PUBLIC_ENDPOINT (informational only)
 */
public final class MigrationConfig {

    public final String oldDbUrl;
    public final String oldDbUser;
    public final String oldDbPassword;

    public final String newDbUrl;
    public final String newDbUser;
    public final String newDbPassword;

    public final String s3Endpoint;
    public final String s3AccessKey;
    public final String s3SecretKey;
    public final String s3Bucket;

    /** Number of media rows to skip uploading to S3 (debug). */
    public final boolean skipImages;

    private MigrationConfig(String oldDbUrl, String oldDbUser, String oldDbPassword,
                            String newDbUrl, String newDbUser, String newDbPassword,
                            String s3Endpoint, String s3AccessKey, String s3SecretKey, String s3Bucket,
                            boolean skipImages) {
        this.oldDbUrl = oldDbUrl;
        this.oldDbUser = oldDbUser;
        this.oldDbPassword = oldDbPassword;
        this.newDbUrl = newDbUrl;
        this.newDbUser = newDbUser;
        this.newDbPassword = newDbPassword;
        this.s3Endpoint = s3Endpoint;
        this.s3AccessKey = s3AccessKey;
        this.s3SecretKey = s3SecretKey;
        this.s3Bucket = s3Bucket;
        this.skipImages = skipImages;
    }

    public static MigrationConfig fromEnv(String[] args) {
        // --- OLD DB (source) ---
        String oldUrl = env("OLD_DB_URL", "jdbc:mysql://localhost:3330/tg_test");
        String oldUser = env("OLD_DB_USER", "root");
        String oldPass = env("OLD_DB_PASSWORD", "root");

        // --- NEW DB (target) --- allow either DB_URL or DB_HOST/PORT/NAME parts.
        String newUrl = System.getenv("DB_URL");
        if (isBlank(newUrl)) {
            String host = env("DB_HOST", "localhost");
            String port = env("DB_PORT", "3341"); // host-mapped port per SPEC
            String name = env("DB_NAME", "tgshop_v2");
            newUrl = "jdbc:mysql://" + host + ":" + port + "/" + name;
        }
        // sensible JDBC params if caller did not supply any
        if (!newUrl.contains("?")) {
            newUrl += "?useUnicode=true&characterEncoding=UTF-8&allowPublicKeyRetrieval=true&useSSL=false";
        }
        if (!oldUrl.contains("?")) {
            oldUrl += "?useUnicode=true&characterEncoding=UTF-8&allowPublicKeyRetrieval=true&useSSL=false";
        }
        String newUser = env("DB_USER", "tgshop");
        String newPass = env("DB_PASSWORD", "change_me");

        // --- MinIO / S3 ---
        String s3Endpoint = env("S3_ENDPOINT", "http://localhost:9000");
        String s3AccessKey = env("S3_ACCESS_KEY", "minioadmin");
        String s3SecretKey = env("S3_SECRET_KEY", "change_me_minio");
        String s3Bucket = env("S3_BUCKET", "product-images");

        boolean skipImages = hasFlag(args, "--skip-images")
                || "true".equalsIgnoreCase(System.getenv("MIGRATION_SKIP_IMAGES"));

        return new MigrationConfig(oldUrl, oldUser, oldPass,
                newUrl, newUser, newPass,
                s3Endpoint, s3AccessKey, s3SecretKey, s3Bucket, skipImages);
    }

    private static String env(String key, String def) {
        String v = System.getenv(key);
        return isBlank(v) ? def : v;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static boolean hasFlag(String[] args, String flag) {
        if (args == null) return false;
        for (String a : args) {
            if (flag.equalsIgnoreCase(a)) return true;
        }
        return false;
    }
}
