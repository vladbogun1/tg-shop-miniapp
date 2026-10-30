# Интеграционные тесты бэкенда (реальная MySQL)

Юниты (`*Test`, Mockito) не проверяют блокировки, Flyway, `@Transactional` и события после коммита.
Для этого — тесты `*IT` в `backend/src/test/java/com/maxsolch/shop/it/`: весь Spring-контекст, миграции и MySQL 8.4.

- `mvn -B -ntp test` их **не** запускает (surefire берёт только `*Test`) — быстрый цикл не страдает.
- В CI их гоняет джоба **«Backend (integration tests on MySQL)»** (`backend-integration`, service-контейнер `mysql:8.4`
  — тот же, что у `backend-boot`). Команда: `mvn -B -ntp test-compile failsafe:integration-test failsafe:verify`.
  Первый тест поднимает контекст (~35 с), остальные берут его из кэша.
- Локально: любая MySQL 8.4 и переменные `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD` (те же, что у приложения):

  ```
  docker run -d --name tgshop-it-mysql -e MYSQL_ROOT_PASSWORD=rootpw -e MYSQL_DATABASE=tgshop_v2 \
    -e MYSQL_USER=tgshop -e MYSQL_PASSWORD=tgshoppw -p 3317:3306 mysql:8.4
  DB_HOST=127.0.0.1 DB_PORT=3317 DB_PASSWORD=tgshoppw mvn -B -ntp test-compile failsafe:integration-test failsafe:verify
  ```

Правила: тесты коммитят по-настоящему, поэтому каждый создаёт свои товары/заказы с новыми id и не рассчитывает на пустую базу;
Telegram (`NotificationService`) и MinIO (`ImageStorageService`) — `@MockitoBean`, сети и ключей нет. Базовый класс — `AbstractMysqlIT`.

## Клиентские эндпоинты и `open-in-view: false`

`ClientEndpointsLazyLoadingIT` проходит все не-админские эндпоинты (Mini App `/api/me/**`, вход, публичный каталог/сайт, корзина, промо,
отзывы, поддержка, предзаказы, оплата, справочник НП, кейсы подарков) покупателем через MockMvc на живой MySQL с данными: варианты, фото,
характеристики, заказы во всех статусах (подарок, возврат, оплата), отзыв, чат, предзаказ. Telegram — фейк-шлюз, который принимает всё,
поэтому слушатели `AFTER_COMMIT` и уведомители собирают тексты по-настоящему. Они глотают свои исключения, поэтому тест читает лог и падает
на любом `LazyInitializationException` / «no Session». Добавляете не-админский эндпоинт — добавьте его вызов в этот тест.
Тест не рассчитывает на пустую базу, но `ReportsSqlIT` рассчитывает: гоняйте IT на свежей MySQL.
