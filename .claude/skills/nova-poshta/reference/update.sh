#!/usr/bin/env bash
# Перекачивает снимок документации нового портала Nova Post (api-portal.novapost.com) в reference/portal/.
# Использование:  bash .claude/skills/nova-poshta/reference/update.sh
# Нужны: bash, curl, grep, sed. Ключи API не нужны (портал публичный).
# Имя файла = путь URL без домена, "/" → "__" (methods/methods/shipments.md → methods__methods__shipments.md).
set -euo pipefail

BASE="https://api-portal.novapost.com"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/portal"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$DIR"
echo "llms.txt…"
curl -fsSL --retry 3 "$BASE/llms.txt" -o "$TMP/llms.txt"

# Все ссылки на .md-страницы портала, без дублей.
grep -oE "$BASE/[^) ]+\.md" "$TMP/llms.txt" | sort -u > "$TMP/urls.txt"
total=$(wc -l < "$TMP/urls.txt")
echo "страниц: $total"

ok=0; fail=0
while IFS= read -r url; do
  path="${url#"$BASE"/}"
  name="${path//\//__}"
  if curl -fsSL --retry 3 --max-time 60 "$url" -o "$TMP/$name"; then
    ok=$((ok + 1))
  else
    echo "  ! не скачалось: $url" >&2
    fail=$((fail + 1))
  fi
  sleep 0.3   # вежливо
done < "$TMP/urls.txt"

if [ "$ok" -eq 0 ]; then
  echo "ничего не скачалось — снимок не трогаю" >&2
  exit 1
fi

# Заменяем снимок целиком (удалённые на портале страницы тоже уйдут).
find "$DIR" -maxdepth 1 -type f \( -name '*.md' -o -name 'llms.txt' \) -delete
cp "$TMP"/*.md "$DIR"/
cp "$TMP/llms.txt" "$DIR/llms.txt"

echo "готово: $ok скачано, $fail ошибок → $DIR"
echo "Не забудьте обновить дату снимка в reference/README.md и SKILL.md и пройтись по changelog-1__2026__*.md."
