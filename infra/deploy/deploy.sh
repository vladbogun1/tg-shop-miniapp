#!/usr/bin/env bash
# Выкатка магазина без даунтайма (сервер прода, каталог проекта ~/TELEGRAM_BOTS/maxsolch-v2).
#
#   bash infra/deploy/deploy.sh v3.50.0          релиз или откат на тег: образы, дамп БД, переключение
#   bash infra/deploy/deploy.sh --rollout [svc…] только перекатить сервисы на образы, которые уже есть
#                                                (стенд: собрал `compose build` — и перекатил)
# Опции: --no-backup (без дампа), --force (пересоздать, даже если образ тот же).
# Окружение: DEPLOY_COMPOSE — аргументы `docker compose` (по умолчанию три файла прода),
#            DEPLOY_SETTLE — сколько ждать, пока шлюзы увидят новый адрес (с; resolver valid=10s в gateway*.conf).
#
# Как без даунтайма: шлюзы nginx ищут backend / site-public / … через DNS Docker на каждый запрос
# и при отказе соединения или 404 статики пробуют второй адрес (infra/gateway*.conf). Поэтому для
# каждого сервиса: рядом поднимается временная копия на НОВОМ образе под тем же сетевым именем →
# ждём её готовности → пересоздаём основной контейнер (копия отвечает) → ждём его → гасим копию.
# Копия бэкенда не опрашивает бота (TELEGRAM_POLLING=false), фоновые задачи защищены ShedLock.
#
# Всё тело — в main(): bash читает функцию целиком до запуска, поэтому `git checkout` тега,
# который перепишет этот файл, не ломает выполнение.

main() {
set -euo pipefail

DEFAULT_SERVICES="cutout backend site-public frontend-public frontend-admin-public"
# Инфраструктура, которую трогаем, только если поменялся её конфиг (перезапуск nginx ≈ 1 с).
INFRA="gateway:infra/gateway.conf gateway-admin:infra/gateway-admin.conf gateway-site:infra/gateway-site.conf nginx:infra/nginx/nginx.conf caddy:infra/Caddyfile.prod"
DEPLOY_COMPOSE="${DEPLOY_COMPOSE:--f docker-compose.yml -f docker-compose.public.yml -f docker-compose.prod.yml}"
SETTLE="${DEPLOY_SETTLE:-12}"

local mode=release tag="" backup=1 force="" services=""
while [ $# -gt 0 ]; do
  case "$1" in
    --rollout)   mode=rollout ;;
    --no-backup) backup="" ;;
    --force)     force=1 ;;
    -h|--help)   sed -n '2,12p' "$0"; return 0 ;;
    v[0-9]*)     tag="$1" ;;
    -*)          die "неизвестная опция $1" ;;
    *)           services="$services $1" ;;
  esac
  shift
done
services="${services:-$DEFAULT_SERVICES}"
dc config -q </dev/null || die "docker compose не читает конфиг — запускать из каталога проекта (или задать DEPLOY_COMPOSE)"

exec 9>/tmp/maxsolch-deploy.lock
flock -n 9 || die "уже идёт другая выкатка (/tmp/maxsolch-deploy.lock)"

PROBER=$(main_ctr nginx)
[ -n "$PROBER" ] || die "не нашёл запущенный контейнер nginx (через него проверяется готовность)"
NET=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$PROBER" | awk '{print $1}')

if [ "$mode" = rollout ]; then
  [ -z "$tag" ] || die "--rollout не принимает тег"
  for s in $services; do rollout_one "$s" "$force"; done
  log "готово: $services"
  return 0
fi

[ -n "$tag" ] || die "укажи тег: deploy.sh v3.X.Y (или --rollout)"
[[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$ ]] || die "странный тег: $tag"
[ -f .env ] || die "нет .env в $(pwd)"
local cur prev_ref
cur=$(sed -n 's/^IMAGE_TAG=//p' .env)
prev_ref=$(git rev-parse HEAD)
log "прод сейчас: ${cur:-?} ($(git describe --tags --always 2>/dev/null)), выкатываю $tag"

git fetch --tags --force -q origin
git rev-parse -q --verify "refs/tags/$tag" >/dev/null || die "тега $tag нет в origin"

# Файлы — на тег сразу: работающие контейнеры их не перечитывают (одиночные bind-файлы держат
# старую версию до перезапуска), а compose нового тега знает про новые сервисы.
git checkout -qf "$tag"
log "образы $tag: pull"
if ! IMAGE_TAG="$tag" dc pull -q $services </dev/null; then
  git checkout -qf "$prev_ref"
  die "образы $tag не скачались — ничего не переключал (git вернул на $prev_ref)"
fi

if [ -n "$backup" ]; then
  local b
  b=~/BACKUPS/maxsolch-pre-$tag-$(date +%Y%m%d-%H%M%S)
  mkdir -p "$b"
  log "дамп БД → $b"
  dc exec -T mysql sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines "$MYSQL_DATABASE" 2>/dev/null' \
    </dev/null | gzip > "$b/tgshop_v2.sql.gz"
  zcat "$b/tgshop_v2.sql.gz" | tail -1 | grep -q "Dump completed" || { git checkout -qf "$prev_ref"; die "дамп неполный ($b) — ничего не переключал"; }
  cp .env "$b/.env"; chmod 600 "$b/.env"
fi

sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$tag/" .env
for s in $services; do rollout_one "$s" "$force"; done
refresh_infra "$prev_ref" "$tag"

if [ -n "$cur" ] && [ "$cur" != "$tag" ]; then write_rollback "$cur" "$tag"; fi
log "ГОТОВО: прод на $tag. Откат: ./rollback.sh (→ $cur)"
}

# ───────────────────────────── helpers ─────────────────────────────

log() { printf '%s  %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die() { log "ОШИБКА: $*"; exit 1; }
# shellcheck disable=SC2086  # DEPLOY_COMPOSE is a list of arguments on purpose
dc() { docker compose $DEPLOY_COMPOSE "$@"; }

# The service's own container (not a `compose run` copy), running or not.
main_ctr() {
  local id
  for id in $(dc ps -a -q "$1" 2>/dev/null); do
    if [ "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.oneoff"}}' "$id")" = False ]; then
      echo "$id"; return 0
    fi
  done
  return 0
}

# port, path that answers 200 when the instance is ready, seconds to wait
probe_spec() {
  case "$1" in
    backend)               echo "8080 /actuator/health 300" ;;
    cutout)                echo "8090 /health 180" ;;
    site-public)           echo "3000 / 120" ;;
    frontend-public)       echo "3000 / 120" ;;
    frontend-admin-public) echo "3001 / 120" ;;
    *) return 1 ;;
  esac
}

# Polls the container by its address on the shop network, from the image-cache nginx (busybox wget).
wait_ready() {
  local ctr="$1" svc="$2" port path limit ip t0
  read -r port path limit < <(probe_spec "$svc") || { log "$svc: не знаю, как проверить готовность"; return 1; }
  t0=$(date +%s)
  while :; do
    [ "$(docker inspect -f '{{.State.Running}}' "$ctr" 2>/dev/null)" = true ] || { log "$svc: контейнер упал"; return 1; }
    ip=$(docker inspect -f "{{with index .NetworkSettings.Networks \"$NET\"}}{{.IPAddress}}{{end}}" "$ctr")
    if [ -n "$ip" ] && docker exec "$PROBER" wget -q -O /dev/null -T 5 "http://$ip:$port$path" 2>/dev/null; then
      log "$svc: готов за $(( $(date +%s) - t0 )) с"; return 0
    fi
    [ $(( $(date +%s) - t0 )) -lt "$limit" ] || { log "$svc: не ответил за $limit с"; return 1; }
    sleep 2
  done
}

rollout_one() {
  local svc="$1" force="$2" old want name shadow new
  probe_spec "$svc" >/dev/null || die "$svc: сервис не из списка перекатки"
  old=$(main_ctr "$svc")
  want=$(docker image inspect -f '{{.Id}}' "$(dc config --images "$svc")" 2>/dev/null) || die "$svc: нет образа $(dc config --images "$svc") — сначала pull/build"
  if [ -n "$old" ] && [ -z "$force" ] && [ "$(docker inspect -f '{{.Image}}' "$old")" = "$want" ] \
     && [ "$(docker inspect -f '{{.State.Running}}' "$old")" = true ]; then
    log "$svc: уже на этом образе — пропускаю"; return 0
  fi
  if [ -z "$old" ] || [ "$(docker inspect -f '{{.State.Running}}' "$old")" != true ]; then
    log "$svc: старого контейнера нет — просто поднимаю"
    dc up -d --no-deps --no-build --pull never "$svc" </dev/null
    wait_ready "$(main_ctr "$svc")" "$svc" || die "$svc не поднялся: docker logs $(main_ctr "$svc")"
    return 0
  fi

  name=$(docker inspect -f '{{.Name}}' "$old"); name="${name#/}"
  shadow="${name}_next"
  docker rm -f "$shadow" >/dev/null 2>&1 || true
  local extra=()
  [ "$svc" = backend ] && extra=(-e TELEGRAM_POLLING=false)
  log "$svc: временная копия $shadow на новом образе"
  dc run -d --no-deps --use-aliases --pull never --name "$shadow" "${extra[@]}" "$svc" </dev/null >/dev/null
  if ! wait_ready "$shadow" "$svc"; then
    docker logs --tail 40 "$shadow" 2>&1 | sed 's/^/    /'
    docker rm -f "$shadow" >/dev/null
    die "$svc: новая версия не поднялась. Этот сервис остался на старой версии и работает; копия удалена"
  fi
  sleep "$SETTLE"   # шлюзы перечитали DNS и знают адрес копии

  log "$svc: пересоздаю основной $name (отвечает копия)"
  local fr=()
  [ -n "$force" ] && fr=(--force-recreate)
  dc up -d --no-deps --no-build --pull never "${fr[@]}" "$svc" </dev/null
  new=$(main_ctr "$svc")
  wait_ready "$new" "$svc" \
    || die "$svc: основной $name не поднялся. Копия $shadow (новая версия) ОСТАВЛЕНА и отвечает. Смотри docker logs $name"
  sleep "$SETTLE"

  docker stop -t 30 "$shadow" >/dev/null && docker rm "$shadow" >/dev/null
  log "$svc: готово"
}

# Gateways / image cache / legacy redirects: recreated only when their config changed between the tags.
refresh_infra() {
  local from="$1" to="$2" pair svc file
  for pair in $INFRA; do
    svc="${pair%%:*}"; file="${pair#*:}"
    [ -n "$(main_ctr "$svc")" ] || continue
    if git diff --quiet "$from" "$to" -- "$file" 2>/dev/null; then
      # Same file: a no-op unless the compose definition itself changed.
      dc up -d --no-deps --no-build --pull never "$svc" </dev/null
      continue
    fi
    if [[ "$file" == *.conf ]]; then
      local target=/etc/nginx/conf.d/default.conf
      [ "$svc" = nginx ] && target=/etc/nginx/nginx.conf
      docker run --rm --network "$NET" -v "$(pwd)/$file:$target:ro" nginx:alpine nginx -t -q \
        || die "$file не проходит nginx -t — $svc не трогал (работает со старым конфигом)"
    fi
    log "$svc: поменялся $file — пересоздаю (≈1 с без ответа)"
    dc up -d --no-deps --no-build --pull never --force-recreate "$svc" </dev/null
  done
}

write_rollback() {
  local to="$1" from="$2" dir
  dir=$(pwd)
  if [ -f rollback.sh ]; then mv rollback.sh "rollback.sh.before-$from-$(date +%Y%m%d-%H%M%S)"; fi
  cat > rollback.sh <<EOF
#!/usr/bin/env bash
# Откат прода с $from на $to — образы, без даунтайма (создан infra/deploy/deploy.sh $(date -u +%F)).
# Миграции $from остаются в базе; разрушающие (drop/rename) — откат только с дампом ~/BACKUPS/maxsolch-pre-$from-*.
set -euo pipefail
cd "$dir"
read -r -p "Откатить прод с $from на $to? (yes/no) " a; [ "\$a" = yes ] || exit 1
git show $from:infra/deploy/deploy.sh > /tmp/maxsolch-deploy.sh
exec bash /tmp/maxsolch-deploy.sh --no-backup $to
EOF
  chmod +x rollback.sh
}

main "$@"; exit $?
