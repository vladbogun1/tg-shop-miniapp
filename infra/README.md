# tg-shop-v2 — Infrastructure

Self-hosted Docker stack for a single Linux server. No cloud services — MySQL,
MinIO, imgproxy and Nginx all run as containers.

## Services & ports

| Service     | Image             | Internal | Host  | Notes |
|-------------|-------------------|----------|-------|-------|
| backend     | `build ./backend` | 8080     | 8080  | Spring Boot API |
| frontend    | `build ./frontend`| 3000     | 3000  | Next.js — Mini App |
| frontend-admin | `build ./frontend-admin` | 3001 | 3001 | Next.js — admin |
| site        | `build ./site`    | 3000     | 3007  | Next.js — website |
| mysql       | mysql:8.4         | 3306     | 3341  | db `tgshop_v2`, utf8mb4 |
| minio       | minio/minio       | 9000/9001| 9002/9003 | S3 API + console |
| minio-init  | minio/mc          | —        | —     | one-shot bucket setup, then exits |
| imgproxy    | darthsim/imgproxy | 8080     | —     | internal only |
| nginx       | nginx:alpine      | 80       | 8082  | image disk cache |

## Bring it up

```bash
cp .env.example .env          # then edit secrets (DB pw, JWT, BOT_TOKEN, S3 keys)

# optional: signed imgproxy URLs — generate key + salt and paste into .env
# (IMGPROXY_KEY / IMGPROXY_SALT are empty by default = unsigned URLs, fine locally)
openssl rand -hex 32          # IMGPROXY_KEY
openssl rand -hex 32          # IMGPROXY_SALT

docker compose up -d --build
```

`minio-init` runs once to create the `product-images` bucket (private: imgproxy reads it with the
S3 credentials, chat files go out only through signed `/api/media` links), then exits — that exited
container is expected, not a failure.

Check status / logs:

```bash
docker compose ps
docker compose logs -f backend
docker compose down            # add -v to also wipe the named volumes
```

## URLs

- Mini App: http://localhost:3000, admin: http://localhost:3001, website: http://localhost:3007
- Backend API: http://localhost:8080/api
- Swagger UI: http://localhost:8080/swagger-ui.html
- Backend health: http://localhost:8080/actuator/health
- MinIO console: http://localhost:9003  (login = `S3_ACCESS_KEY` / `S3_SECRET_KEY`)
- MinIO S3 API: http://localhost:9002
- Images: http://localhost:8082/img/<signature>/<processing>/plain/s3://product-images/<key>@webp

## How the image pipeline works

```
browser ──> nginx (disk cache, :8082) ──> imgproxy (:8080, resize/WebP/AVIF) ──> minio (originals)
```

1. The backend uploads original images into the MinIO bucket `product-images`
   via the S3 SDK (key = content hash).
2. The frontend builds imgproxy URLs (signed only when `IMGPROXY_KEY` is set) against `IMAGE_BASE_URL`
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
