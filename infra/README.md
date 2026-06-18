# tg-shop-v2 — Infrastructure

Self-hosted Docker stack for a single Linux server. No cloud services — MySQL,
MinIO, imgproxy and Nginx all run as containers.

## Services & ports

| Service     | Image             | Internal | Host  | Notes |
|-------------|-------------------|----------|-------|-------|
| backend     | `build ./backend` | 8080     | 8080  | Spring Boot API |
| frontend    | `build ./frontend`| 3000     | 3000  | Next.js |
| mysql       | mysql:8.4         | 3306     | 3341  | db `tgshop_v2`, utf8mb4 |
| minio       | minio/minio       | 9000/9001| 9000/9001 | S3 API + console |
| minio-init  | minio/mc          | —        | —     | one-shot bucket setup, then exits |
| imgproxy    | darthsim/imgproxy | 8080     | —     | internal only |
| nginx       | nginx:alpine      | 80       | 8082  | image disk cache |

## Bring it up

```bash
cp .env.example .env          # then edit secrets (DB pw, JWT, BOT_TOKEN, S3 keys)

# generate imgproxy key + salt and paste into .env
openssl rand -hex 32          # IMGPROXY_KEY
openssl rand -hex 32          # IMGPROXY_SALT

docker compose up -d --build
```

`minio-init` runs once to create the `product-images` bucket with a public-read
(download) policy, then exits — that exited container is expected, not a failure.

Check status / logs:

```bash
docker compose ps
docker compose logs -f backend
docker compose down            # add -v to also wipe the named volumes
```

## URLs

- Frontend (Mini App / admin): http://localhost:3000
- Backend API: http://localhost:8080/api
- Swagger UI: http://localhost:8080/swagger-ui.html
- Backend home (Thymeleaf) / health: http://localhost:8080/ , http://localhost:8080/actuator/health
- MinIO console: http://localhost:9001  (login = `S3_ACCESS_KEY` / `S3_SECRET_KEY`)
- MinIO S3 API: http://localhost:9000
- Images: http://localhost:8082/img/<signature>/<processing>/plain/s3://product-images/<key>@webp

## How the image pipeline works

```
browser ──> nginx (disk cache, :8082) ──> imgproxy (:8080, resize/WebP/AVIF) ──> minio (originals)
```

1. The backend uploads original images into the MinIO bucket `product-images`
   via the S3 SDK (key = content hash).
2. The frontend builds signed imgproxy URLs against `IMAGE_BASE_URL`
   (`http://localhost:8082/img`). imgproxy resizes/converts on the fly and
   detects WebP/AVIF support per request.
3. Nginx caches the processed result on disk (`imgcache` zone, up to 2 GB,
   30-day inactive) keyed by request URI. Cache hits are served instantly;
   misses go to imgproxy. The `X-Cache-Status` response header shows
   `HIT`/`MISS`. Responses carry `Cache-Control: public, max-age=31536000,
   immutable` — safe because image URLs are content-addressed, so a changed
   image produces a new URL.

Because originals live in MinIO (not MySQL LONGBLOBs), the DB stays small and
image delivery never touches the app.

## Running the migration tool

The migration tool (`com.maxsolch.migration`, in `../migration`) is a one-off
job run **after** the stack is up — it reads the old DB, pushes image blobs into
MinIO and rewrites `product_images.url`. It is not part of `docker compose`.

1. Make sure `mysql` and `minio` are healthy (`docker compose ps`).
2. Point it at:
   - Old DB via `OLD_DB_URL` / `OLD_DB_USER` / `OLD_DB_PASSWORD` (see `.env.example`).
   - New DB on host port **3341** (`jdbc:mysql://localhost:3341/tgshop_v2`).
   - MinIO via `S3_PUBLIC_ENDPOINT` (`http://localhost:9000`) + `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET`.
3. Run it from the `migration` module (e.g. `mvn -pl migration spring-boot:run`
   or the produced jar) and verify rewritten URLs resolve through
   `http://localhost:8082/img/...`.
```
