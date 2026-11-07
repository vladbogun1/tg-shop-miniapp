#!/usr/bin/env bash
# Bucket of the supply reader's pictures (Э6 of the built-in AI): create it and put a 7-day lifetime rule on it.
# The app creates the bucket itself at start (MinioAiFileObjects.ensureBucket) and deletes expired files every night
# (AiFileJobs); this script adds the second line of defence — MinIO removes anything older than 7 days on its own —
# and makes sure the bucket is private. Run it ONCE per server at release; it is idempotent. NOT run by CI.
#
#   S3_ACCESS_KEY=... S3_SECRET_KEY=... ./infra/ai-files-bucket.sh [bucket] [minio-endpoint]
# Defaults: bucket ai-files (env AI_FILES_BUCKET of the backend), endpoint http://localhost:9000.
# Needs the `mc` client (the image minio/mc from docker-compose.yml works: docker run --rm --network <net> --entrypoint sh ...).
set -euo pipefail

BUCKET="${1:-${AI_FILES_BUCKET:-ai-files}}"
ENDPOINT="${2:-${S3_ENDPOINT:-http://localhost:9000}}"
: "${S3_ACCESS_KEY:?set S3_ACCESS_KEY}"
: "${S3_SECRET_KEY:?set S3_SECRET_KEY}"

mc alias set aifiles "$ENDPOINT" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null
mc mb --ignore-existing "aifiles/$BUCKET"
mc anonymous set none "aifiles/$BUCKET"
# 7 days = AiFile.KEEP in the backend. `--expire-days` replaces the rule of the same id, so a rerun is harmless.
mc ilm rule add --expire-days 7 "aifiles/$BUCKET" 2>/dev/null || mc ilm rule list "aifiles/$BUCKET"
mc ilm rule list "aifiles/$BUCKET"
echo "ok: $BUCKET is private, objects expire after 7 days"
