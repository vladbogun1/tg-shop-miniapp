#!/usr/bin/env bash
# Откат прода на прежний релиз: возвращает теги образов и конфиги compose.
#
#   infra/rollback.sh v3.42.0            # откатить на тег v3.42.0
#   infra/rollback.sh v3.42.0 --no-backup
#
# Что делает: (1) дамп БД через infra/backup.sh, (2) git checkout тега (compose и конфиги
# совпадут с тем релизом), (3) IMAGE_TAG в .env, (4) pull + up только наших образов,
# (5) рестарт gateway/caddy/nginx (подхватить адреса контейнеров), (6) ждёт healthy backend.
#
# Чего НЕ делает: не откатывает миграции базы. Если между релизами была миграция, несовместимая
# со старым образом (удалённые колонки/таблицы — например V48), бэкенд старого тега не стартует:
# тогда откат только восстановлением дампа, снятого ПЕРЕД выкаткой (docs/DEPLOY-SERVER.md §5, «Восстановление»).
# Настройки: PROJECT_DIR (по умолчанию родитель infra/), COMPOSE_FILES.
set -euo pipefail

main() {
  local to="${1:-}" backup=1
  [ -n "$to" ] || { echo "usage: infra/rollback.sh <тег, например v3.42.0> [--no-backup]" >&2; return 2; }
  [ "${2:-}" = "--no-backup" ] && backup=0

  local dir="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
  cd "$dir"
  local files="${COMPOSE_FILES:--f docker-compose.yml -f docker-compose.public.yml -f docker-compose.prod.yml}"
  local services="backend frontend-public frontend-admin-public site-public"
  local from; from="$(grep -E '^IMAGE_TAG=' .env | tail -n1 | cut -d= -f2- | tr -d '\r')"

  read -r -p "Откатить прод с ${from:-?} на $to? (yes/no) " a
  [ "$a" = yes ] || { echo "отмена"; return 1; }

  if [ "$backup" = 1 ]; then
    bash "$dir/infra/backup.sh" || { echo "дамп не снят — откат остановлен (или --no-backup)" >&2; return 1; }
  fi

  # Сначала проверяем, что образы этого тега существуют, и только потом трогаем рабочий каталог.
  git fetch --tags --force origin
  git rev-parse -q --verify "refs/tags/$to" >/dev/null || { echo "тега $to нет" >&2; return 1; }
  git checkout -f "$to"
  sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$to/" .env

  # shellcheck disable=SC2086
  docker compose $files pull $services
  # shellcheck disable=SC2086
  docker compose $files up -d --no-build $services
  # shellcheck disable=SC2086
  docker compose $files restart gateway gateway-admin gateway-site caddy nginx

  echo "жду backend..."
  for _ in $(seq 1 40); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' tgshop_v2_backend 2>/dev/null)" = healthy ] \
      && { echo "backend healthy, прод на $to"; return 0; }
    sleep 5
  done
  echo "backend не стал healthy за 200 с: docker compose logs backend" >&2
  return 1
}

# Всё тело — в функции, а вызов — последней строкой: `git checkout` меняет этот файл на диске,
# и bash не должен дочитывать его из середины.
main "$@"
exit $?
