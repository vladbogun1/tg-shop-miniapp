#!/usr/bin/env bash
# Дамп MySQL магазина с ротацией. Секретов в файле нет: имя базы берётся из .env проекта,
# пароль root — из окружения самого контейнера mysql (в аргументах команд он не появляется).
#
#   infra/backup.sh                 # один дамп сейчас
#   BACKUP_DIR=/mnt/b KEEP_DAYS=30 infra/backup.sh
#
# Настройки (переменные окружения, все необязательные):
#   PROJECT_DIR     каталог проекта с .env              (по умолчанию — родитель infra/)
#   MYSQL_CONTAINER имя контейнера MySQL                 (tgshop_v2_mysql)
#   BACKUP_DIR      куда класть дампы                    (~/BACKUPS/db)
#   KEEP_DAYS       сколько дней хранить ежедневные      (14)
#   KEEP_WEEKS      сколько недель хранить воскресные    (12)
#   OFFSITE_TARGET  если задано (user@host:/путь/ ) — rsync копии за пределы сервера
# Расписание (cron) — docs/DEPLOY-SERVER.md §5.
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
MYSQL_CONTAINER="${MYSQL_CONTAINER:-tgshop_v2_mysql}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/BACKUPS/db}"
KEEP_DAYS="${KEEP_DAYS:-14}"
KEEP_WEEKS="${KEEP_WEEKS:-12}"

# .env читаем как данные, не как скрипт (в нём могут быть пробелы и спецсимволы).
DB_NAME="$(grep -E '^DB_NAME=' "$PROJECT_DIR/.env" | tail -n1 | cut -d= -f2- | tr -d '\r"'"'")"
[ -n "$DB_NAME" ] || { echo "backup: DB_NAME не найден в $PROJECT_DIR/.env" >&2; exit 1; }

mkdir -p "$BACKUP_DIR/weekly"
stamp="$(date +%F-%H%M)"
out="$BACKUP_DIR/${DB_NAME}-${stamp}.sql.gz"
tmp="$out.part"
trap 'rm -f "$tmp"' EXIT

# Пароль берётся внутри контейнера из его MYSQL_ROOT_PASSWORD, не передаётся снаружи.
docker exec -i "$MYSQL_CONTAINER" sh -c \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot --single-transaction --routines --triggers --no-tablespaces "$1"' \
  _ "$DB_NAME" | gzip -9 > "$tmp"

# Пустой или битый дамп хуже его отсутствия: молчаливый «успех» оставил бы нас без бэкапа.
gzip -t "$tmp"
[ "$(stat -c%s "$tmp")" -gt 10240 ] || { echo "backup: дамп подозрительно мал" >&2; exit 1; }
zcat "$tmp" | tail -n 5 | grep -q 'Dump completed' || { echo "backup: дамп оборван" >&2; exit 1; }
mv "$tmp" "$out"
echo "backup: $out ($(du -h "$out" | cut -f1))"

# Воскресный дамп живёт дольше.
if [ "$(date +%u)" = 7 ]; then cp "$out" "$BACKUP_DIR/weekly/"; fi

# Ротация: только файлы с нашим префиксом и расширением.
find "$BACKUP_DIR" -maxdepth 1 -name "${DB_NAME}-*.sql.gz" -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR/weekly" -maxdepth 1 -name "${DB_NAME}-*.sql.gz" -mtime +$((KEEP_WEEKS * 7)) -delete

if [ -n "${OFFSITE_TARGET:-}" ]; then
  rsync -a --timeout=60 "$BACKUP_DIR/" "$OFFSITE_TARGET"
  echo "backup: скопировано в OFFSITE_TARGET"
fi
