package com.maxsolch.migration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.Connection;
import java.sql.DriverManager;

/**
 * Standalone entry point. Reads connection settings from env (per SPEC),
 * opens plain-JDBC connections to the OLD (source) and NEW (target) MySQL
 * databases, prepares the MinIO client, and runs the migration.
 *
 * <p>The NEW schema must already exist — run the v2 backend once (Flyway) so
 * V1__init.sql has been applied before this tool is started.
 *
 * <p>Run: {@code java -jar migration.jar} (env-driven). Optional flag
 * {@code --skip-images} skips S3 uploads (still rewrites product_images urls).
 */
public final class MigrationApp {

    private static final Logger log = LoggerFactory.getLogger(MigrationApp.class);

    public static void main(String[] args) {
        long t0 = System.currentTimeMillis();
        MigrationConfig cfg = MigrationConfig.fromEnv(args);

        log.info("tg-shop-v2 migration starting");
        log.info("  OLD DB : {} (user {})", redactUrl(cfg.oldDbUrl), cfg.oldDbUser);
        log.info("  NEW DB : {} (user {})", redactUrl(cfg.newDbUrl), cfg.newDbUser);
        log.info("  S3     : {} bucket '{}'", cfg.s3Endpoint, cfg.s3Bucket);
        if (cfg.skipImages) log.warn("  --skip-images enabled (no S3 uploads)");

        int exit = 0;
        try (Connection oldDb = open(cfg.oldDbUrl, cfg.oldDbUser, cfg.oldDbPassword);
             Connection newDb = open(cfg.newDbUrl, cfg.newDbUser, cfg.newDbPassword)) {

            oldDb.setReadOnly(true);
            newDb.setAutoCommit(false); // commit per step

            ImageStore images = new ImageStore(cfg);
            Migrator migrator = new Migrator(oldDb, newDb, images, cfg.skipImages);
            migrator.run();

        } catch (Exception e) {
            log.error("FATAL: migration could not start/complete: {}", e.toString(), e);
            exit = 1;
        }

        log.info("Done in {} ms", System.currentTimeMillis() - t0);
        if (exit != 0) System.exit(exit);
    }

    private static Connection open(String url, String user, String password) throws Exception {
        // mysql-connector-j 8+ auto-registers via SPI; explicit load is harmless.
        Class.forName("com.mysql.cj.jdbc.Driver");
        return DriverManager.getConnection(url, user, password);
    }

    private static String redactUrl(String url) {
        // Strip any inline credentials just in case.
        return url == null ? "" : url.replaceAll("password=[^&]*", "password=***");
    }
}
