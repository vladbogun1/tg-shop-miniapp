# tg-shop-v2 migration tool

Standalone, one-shot data importer that copies the **OLD** `tg-shop` database into
the **NEW** `tg-shop-v2` schema and moves product images out of the old
`media_images` LONGBLOB table into **MinIO (S3)**.

- Plain JDBC (`mysql-connector-j`) for both source and target — **no** dependency
  on the backend module / JPA.
- MinIO Java SDK 8.5.x for object uploads.
- Java 21, Maven, fat jar via the shade plugin (`finalName = migration`).
- Package: `com.maxsolch.migration`. Main class: `MigrationApp`.

## Prerequisite: the NEW schema must already exist

This tool **only inserts data**; it does not create tables. Run the v2 backend
once so Flyway applies `backend/src/main/resources/db/migration/V1__init.sql`
into the target DB (`tgshop_v2`), then run this tool.

## What it does (idempotent steps)

Each step is wrapped in its own try/catch and committed independently, so one
failure does not abort the rest. Inserts use `INSERT ... ON DUPLICATE KEY UPDATE`.

1. `tags`
2. `products` (`updated_at` := `created_at`)
3. `product_variants`
4. `product_tags`
5. `promo_codes` (incl. `discount_amount_minor`)
6. **Images** — every `media_images` row is streamed to MinIO under
   `products/{productUuid}/{filename}` (bucket auto-created, content-type set).
7. `product_images` — `url` is rewritten to the S3 object key
   `products/{uuid}/{filename}` (the frontend wraps it via imgproxy). Catalog
   order is preserved via `sort_order`. External/non-media URLs are kept as-is.
8. `users` — derived from distinct `(tg_user_id, tg_username)` in old orders
   (`first_name`/`last_name` = NULL; `tg_user_id <= 0` skipped).
9. `orders` — fields mapped; status string → ENUM (uppercased, default `NEW`);
   `delivery_method` = `NOVA_POSHTA`; NP fields = NULL; old free-text `address`
   folded into `comment` (prefixed `Адрес: ...`); payment fields = NULL;
   `user_id` set only when a matching `users` row exists; `tg_user_id`/`tg_username`
   carried.
10. `order_items` (snapshots + variant fields)
11. `order_messages` — `direction` (USER/ADMIN/SYSTEM) → `sender_type`
    (CUSTOMER/ADMIN/SYSTEM); `message_type` (TEXT/PHOTO/SYSTEM kept,
    DOCUMENT/VIDEO/AUDIO/VOICE/ANIMATION/STICKER → FILE); `attachment_url` = NULL
    (old stored Telegram `file_id` only, no real files).
12. `settings` (key/value copied verbatim, incl. `PAYMENT_TEMPLATE_HTML` and
    `ADMIN_ORDER_BOARD_*`).
13. **`status_timestamps` (backfill)** — the old `orders` table has **no**
    status-change date columns (only `created_at`), so `approved_at` / `shipped_at`
    / `delivered_at` / `rejected_at` are reconstructed from the SYSTEM chat cards
    (`MIN(created_at)` of the card whose text contains ОДОБРЕНО / ВЫСЛАНО /
    ДОСТАВЛЕНО / ОТКЛОНЕНО). Chronology is kept monotonic. Coverage is bounded by
    which cards actually exist in the old chat (e.g. not every delivered order has
    a ДОСТАВЛЕНО card) — this is the maximum recoverable from the source.
14. **`reject_reasons` (backfill)** — `reject_reason` is extracted from the
    "❌ Причина: <text>" SYSTEM card for `REJECTED` orders that lack one.

Steps 13–14 run **automatically** as part of the migration (only filling NULLs,
so they are safe to re-run). A per-table row-count summary is printed at the end.

## Configuration (environment variables, per `docs/SPEC.md`)

| var | meaning | default |
|---|---|---|
| `OLD_DB_URL` | source JDBC URL | `jdbc:mysql://localhost:3330/tg_test` |
| `OLD_DB_USER` / `OLD_DB_PASSWORD` | source creds | `root` / `root` |
| `DB_HOST` / `DB_PORT` / `DB_NAME` | target parts | `localhost` / `3341` / `tgshop_v2` |
| `DB_URL` | full target URL (overrides the parts above) | — |
| `DB_USER` / `DB_PASSWORD` | target creds | `tgshop` / `change_me` |
| `S3_ENDPOINT` | MinIO endpoint | `http://localhost:9000` |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | MinIO creds | `minioadmin` / `change_me_minio` |
| `S3_BUCKET` | target bucket | `product-images` |
| `MIGRATION_SKIP_IMAGES` | `true` to skip S3 uploads | — |

CLI flag: `--skip-images` (same as `MIGRATION_SKIP_IMAGES=true`) — still rewrites
`product_images.url` to the expected keys, just does not push bytes to S3.

> Note: the SPEC default for `S3_BUCKET` is `product-images`. When running the
> backend behind imgproxy, ensure the bucket here matches the backend's bucket.

## Build

```bash
mvn -f tg-shop-v2/migration/pom.xml clean package
# -> tg-shop-v2/migration/target/migration.jar
```

## Run (local jar)

```bash
export OLD_DB_URL="jdbc:mysql://localhost:3330/tg_test"
export OLD_DB_USER=root
export OLD_DB_PASSWORD=root

export DB_HOST=localhost DB_PORT=3341 DB_NAME=tgshop_v2
export DB_USER=tgshop DB_PASSWORD=change_me

export S3_ENDPOINT=http://localhost:9000
export S3_ACCESS_KEY=minioadmin
export S3_SECRET_KEY=change_me_minio
export S3_BUCKET=product-images

java -jar tg-shop-v2/migration/target/migration.jar
```

## Run (Docker)

```bash
docker build -t tg-shop-migration tg-shop-v2/migration

docker run --rm \
  -e OLD_DB_URL="jdbc:mysql://host.docker.internal:3330/tg_test" \
  -e OLD_DB_USER=root -e OLD_DB_PASSWORD=root \
  -e DB_HOST=mysql -e DB_PORT=3306 -e DB_NAME=tgshop_v2 \
  -e DB_USER=tgshop -e DB_PASSWORD=change_me \
  -e S3_ENDPOINT=http://minio:9000 \
  -e S3_ACCESS_KEY=minioadmin -e S3_SECRET_KEY=change_me_minio \
  -e S3_BUCKET=product-images \
  --network <your-compose-network> \
  tg-shop-migration
```

(When the migration container joins the v2 docker network it can reach `mysql`
and `minio` by service name; the old DB is typically reached via
`host.docker.internal` or its own host:port.)

## Notes & assumptions

- UUIDs are `BINARY(16)`, **MSB-first**, and are copied verbatim old → new, so
  every product/order/tag keeps the same id.
- Re-running is safe: every insert is `ON DUPLICATE KEY UPDATE` (or carries the
  old PK), and S3 uploads overwrite by key.
- Image blobs are streamed one row at a time (forward-only `ResultSet`,
  `fetchSize=50`) to avoid OOM on ~1196 images / ~110 MB.
- Old order `address` has no home in the new schema (which uses Nova Poshta
  `np_*` ref fields). It is preserved in `comment` (prefixed `Адрес:`), not in
  `np_warehouse_name`.
- `order_messages.attachment_url` is left NULL because the old rows only store
  Telegram `file_id`s, not retrievable URLs.

## Post-import: backfill (now automatic)

Reconstruction of status timestamps (`approved_at` / `shipped_at` / `delivered_at` /
`rejected_at`) and `reject_reason` from the old SYSTEM chat cards is now **built into
the tool** (steps 13–14 above) and runs on every migration. The standalone SQL
scripts in `infra/` (`backfill_status_times.sql`, `backfill_reject_reason.sql`) are
kept only as a reference / manual fallback — you no longer need to run them.

Both are idempotent (only fill NULLs; never overwrite real timestamps of new orders).
