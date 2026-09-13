# SPRINT 3G — HOTELBEDS TEST CONTENT CATALOG + DESTINATION SEARCH

Дата: 14 сентября 2026. Ветка develop. **CODE / OFFLINE ACCEPTANCE: PASS. RENDER ACCEPTANCE: NOT RUN.**

Исходный `git status --short`: только untracked `README.txt` и `docs/`. Они не изменялись. Подтверждённые владельцем Render status/Availability/public search из 3F — входные сведения, не новый network evidence этого спринта.

## Аудит существующего каталога

Использованы прежние `provider_destinations`, `provider_hotels`, `provider_job_state`, repository и Content mapper. Миграция 005 создала каталог; 019 добавила `content_environment`. До 3G UNIQUE(provider, code/hotel_id) не включал environment: upsert другого environment мог заменить строку. Чтение отелей/направлений уже фильтровалось по environment, но `getCounts` считал оба окружения вместе.

Существующий Hotelbeds client уже имеет отдельные Booking/Content HTTP instances, подпись перед каждым запросом, запрет redirects и безопасные provider errors. Staging TEST allowlist общего клиента запрещает Content. Прежний `hotelbedsCatalogService.sync` обходит справочники и страницы; для нового bounded TEST import он не используется и не включается.

Ранее `prepareFilters` при destinationCode мог передать destination прямо в Availability, а country/city lookup допускал до 2000 hotel codes. SearchBar содержал фиксированные страны и diagnostic 3424. Статическое обогащение Availability из repository и detail refresh через локальный каталог уже существовали.

## Архитектура после изменений

```text
Owner -> protected admin Content import -> bounded Content GETs -> PostgreSQL TEST catalog

SearchBar -> GET /api/catalog/test-options -> PostgreSQL (без Hotelbeds)
Country -> provider destination code -> GET /api/search
  -> ProviderManager -> локальное TEST destination lookup
  -> максимум 20 hotel codes -> один существующий mTLS Availability batch
  -> локальные Content metadata + реальные normalized rates
  -> существующее pricing / signed offer -> Results -> Details
```

Новый `hotelbedsTestDestination` проверяет направление по server-selected environment. Название страны не превращается в destinationCode. Код страны проверяется против выбранного направления. Разрешённая selection разрешается до постфильтрации, чтобы country code не сравнивался с локализованным названием страны. Query для обычного поиска сохраняет выбранный destinationCode; внутренний Availability payload получает hotel codes, без destination-wide запроса.

Даты и occupancy проверяются действующей validation 3F: будущие корректные даты, 1–14 ночей, один номер, 1–6 взрослых, 0–3 детей и целые возраста 0–17. `checkOut` имеет приоритет над nights. TEST_PROBE variables не используются. `stagingTestHotel=3424` сохранён отдельно, без fallback.

Пустой каталог, неизвестное направление, несоответствие страны и превышение лимита завершаются безопасным controlled error до Availability. Пустая Availability остаётся пустой; provider error не заменяется mock. В новом destination flow retries должны быть 0; другая настройка блокирует поиск. LIVE flow не получает новую TEST selection policy.

## DB migration и данные

`020_catalog_environment_identity.sql` добавляет уникальные индексы `(provider, identity, content_environment)` и заменяет прежние двухколоночные UNIQUE constraints. Существующие строки и их ID сохраняются; таблицы и данные не удаляются. Миграции 001–019 не изменены. Миграция выполнена только внутри локальных rollback fixtures, не в рабочей БД и не на Render.

Repository upsert использует новую identity. Для ручного импорта upserts и результат выполняются одной транзакцией на одном соединении. Сбой откатывает импортируемые строки; безопасный результат ошибки сохраняется отдельно. `getCounts` теперь учитывает активный environment.

Используются существующие поля имени, country/destination code, zone code, city, category, coordinates, address/postal code, description, images, facilities и local timestamps. Названия/зоны направления сохраняются из destination response. Дополнительные реальные Content поля, включая provider update timestamp, если он присутствует, сохраняются в существующем `raw_data`; отдельная новая колонка для каждого такого поля не создавалась. Public dropdown и admin status raw_data не возвращают. Известные переводы стран берутся из прежнего словаря, для остальных показывается фактический country code.

Исправлен mapper: отсутствующие/null coordinates остаются null, а не превращаются в 0. Импорт отклоняет отель без настоящего name/code или с чужим country/destination. Старые sentinel значения категории из схемы не преобразуются в выдуманную категорию. Pricing, room/board, taxes/fees, cancellation normalization и offer-token schema не изменялись.

## Content allowlist и ограничения

Отдельный `ContentClient` наследует существующий HotelbedsClient, используя его transport/signature/queue/error handling. Второй HTTP stack не создан. Общий public Hotelbeds client по-прежнему запрещает Content в staging TEST.

На отдельном экземпляре разрешены только:

- `GET https://api.test.hotelbeds.com/hotel-content-api/1.0/locations/destinations`
- `GET https://api.test.hotelbeds.com/hotel-content-api/1.0/hotels`

Другие endpoints, Booking channel, POST/PUT/PATCH/DELETE, absolute URLs и другой hostname блокируются до network. Content не использует mTLS agent; Api-key/X-Signature/Accept и TLS verification сохранены, redirects отключены. Availability продолжает использовать существующий обязательный mTLS transport. Разделение статического Content и динамического поиска соответствует [официальному описанию Content API](https://developer.hotelbeds.com/documentation/hotels/content-api/).

| Ограничение | Значение |
|---|---|
| Импортируемые направления | Ровно одно, explicit country + destination code |
| Destination metadata | Одна страница страны, from=1/to=100; импортируется только выбранное направление |
| Если направление вне этой страницы | Остановка, без следующей страницы и без hotel request |
| Hotel pages | Одна; FROM 1–100; COUNT 1–20, default 1 |
| Отели за импорт | Максимум 20; oversized response отклоняется |
| Content requests | Максимум 2, без retries |
| Request interval / timeout | 1000 ms / 12000 ms |
| Конкурентность | Один импорт; PostgreSQL advisory lock 319030 |
| Повторные запуски | Не чаще раза в 60 секунд после начала network attempt; timestamp в БД, плюс local mutex |
| Новый TEST destination search | Один batch, максимум 20 hotel codes, retries=0 |
| Каталог направления >20 отелей | Controlled TEST_SEARCH_LIMIT, без provider request и без скрытого частичного обхода |

Одна БД координирует несколько web processes; независимые БД/деплойменты не делят limiter. Импорт не включает scheduler, dictionary scan, monitor, hot deals или фоновые поиски.

## Admin и UI

Новые GET/POST `/api/admin/providers/hotelbeds/content` находятся в прежнем router с auth, admin role и admin.operations.read; дополнительно требуют admin.system.read / admin.system.selftest соответственно. POST принимает только пустой object, scope берётся из server env. Подмена URL, country, destination или environment клиентом отклоняется.

Admin показывает environment, country/destination/hotel counts, last import timestamp/result/upserted count, scope и limits. Кнопка запускает только bounded import. Raw provider payload, rateKey, credentials и private material не выводятся. Ошибки импорта показываются безопасно; это не mock success.

SearchBar при существующем TEST display flag загружает страны/направления одним локальным DB endpoint. Смена страны сбрасывает destination selection. Пустой каталог и ошибка загрузки показываются отдельно. Diagnostic hotel 3424 остаётся доступен. Results/Details используют существующее статическое обогащение, TEST labels, «Тестовая цена» и отключённое оформление. Content API из поиска, dropdown или detail не вызывается.

## Safety / network evidence

**Реальные Hotelbeds network операции Codex: NONE.** Content, status, Availability, CheckRate и LIVE не запускались. Booking POST, cancellation, payment intent, charge/refund не выполнялись. Локальные HTTP tests используют только loopback и stubs; SQL tests — temporary schema внутри rollback. HTTP 200 в offline adapter logs не является provider evidence.

ProductionGate, mTLS validator, credential precedence, read-only общего клиента, strict CheckRate identity, TEST/LIVE signed offers, booking/payment flags и pricing 3A сохранены. Реальные env/certs, Render resources и secrets не изменялись. Никаких git add/commit/push/deploy.

## Проверки

| Проверка | Результат |
|---|---|
| Sprint 3G | PASS — 7 tests, 0 failures/skips |
| Sprint 3F | PASS — 2 tests |
| Sprint 3E | PASS — 16 tests |
| Sprint 3D, включая Hotelbeds pricing tests | PASS — 24 tests |
| Sprint 3C | PASS — 15 tests, локальный PostgreSQL rollback |
| Sprint 3A / priceHistory | PASS |
| Existing frontend results acceptance | PASS — 1 test |
| Relevant frontend ESLint | PASS |
| Frontend production build | PASS, включая build с TEST display flag |
| Backend syntax | PASS |
| git diff --check | PASS |
| Secret scan tracked/dist | PASS — findings [] |
| Render UI / настоящий Content import | NOT RUN |

Новые tests проверяют bounded config/transport, подпись/no-mTLS Content, отсутствие mutation calls, destination lookup, empty/invalid/limit states, полный search/sign flow с локальной metadata, empty/error без fallback, transaction/cooldown, protected HTTP scope и PostgreSQL TEST/LIVE upsert isolation. Прежние tests не удалялись. На промежуточной проверке новая нормализация затронула старый explicit-hotel cache path; исправлено ограничением новой ранней нормализации destination flow. Итоговые 3E/3F проходят без изменения прежних tests.

Известный unrelated Sprint 2H email source-contract failure не исправлялся и в этом спринте не запускался. Dependency updates/audit fix не выполнялись. Secret scan не является аудитом всей Git history. Browser Render acceptance остаётся отдельным этапом.

## Owner Actions — только после отдельного решения владельца

1. Review изменений и миграции 020. Решение о commit/push/deployment принимает владелец. До запуска импорта применить 020 штатным `npm run migrate` из backend в нужном deployment. Не запускать эту команду из локальной сессии против Render случайно.
2. Сохранить существующий безопасный TEST runtime:

```ini
NODE_ENV=production
ACTIVE_PROVIDER=hotelbeds
HOTELBEDS_ENV=test
HOTELBEDS_ENABLED=true
HOTELBEDS_STAGING_TEST_ENABLED=true
HOTELBEDS_READ_ONLY=true
HOTELBEDS_READ_RETRIES=0
HOTELBEDS_BOOKING_ENABLED=false
HOTELBEDS_LIVE_BOOKING_ENABLED=false
PRODUCTION_SALES_ENABLED=false
PAYMENTS_MODE=disabled
PAYMENTS_PROVIDER=none
REAL_CHARGES_ENABLED=false
REAL_REFUNDS_ENABLED=false
HOT_DEALS_MONITOR_ENABLED=false
HOTELBEDS_CONTENT_SYNC_ENABLED=false
```

3. Оставить TEST credentials/mTLS уже настроенными. Не менять JWT/OFFER_TOKEN/DATABASE secrets. Content host — api.test.hotelbeds.com; Availability — api-mtls.test.hotelbeds.com. Новых credentials не требуется.
4. Frontend: существующий `VITE_HOTELBEDS_STAGING_TEST_ENABLED=true`, текущий staging `VITE_API_URL`. Настройки применяет только владелец при отдельно разрешённом deployment.

### Первый bounded import

1. Владелец выбирает один **достоверно известный HBX country code и destination code**, не название города и не hotel code. Код направления для отеля 3424 в этом спринте не получен от API и не угадывается.
2. Настроить server-side:

```ini
HOTELBEDS_TEST_CONTENT_COUNTRY=<реальный двухбуквенный HBX country code>
HOTELBEDS_TEST_CONTENT_DESTINATION=<реальный HBX destination code>
HOTELBEDS_TEST_CONTENT_FROM=1
HOTELBEDS_TEST_CONTENT_COUNT=1
```

3. После отдельного deployment открыть admin Hotelbeds Content TEST, проверить environment/scope/limits и безопасные booking/payment flags. Нажать «Импортировать Hotelbeds TEST Content» один раз.
4. Ожидается максимум два GET: одна ограниченная destination page, затем один hotel. Если выбранного направления нет среди первых 100 строк страны, импорт остановится; следующий page не запрашивается. Не компенсировать ошибку full sync или crawling.
5. Проверить last import result и catalog counts. PASS означает успешный Content import, не наличие Availability или разрешение продаж. EMPTY допустим. При FAIL/BLOCKED остановиться и проверить scope/provider access, не нажимать повторно циклически.
6. Повторный импорт того же scope после cooldown обновляет строки idempotently. Расширять COUNT до 20 только отдельным сознательным действием владельца с учётом quota. Несколько страниц не обходятся автоматически.

### Проверка public search на Render

1. Home: выбрать загруженную страну и направление, будущую дату, одну ночь, двух взрослых, без детей. Сначала без дополнительных board/category filters.
2. В Browser Network dropdown вызывает только `/api/catalog/test-options`. Поиск передаёт стабильный destinationCode и пользовательские dates/guests в `/api/search`.
3. Проверить реальную TEST цену/currency/source и metadata в Results/Details, TEST labels и недоступность бронирования; F5 и возврат назад. Наличие Content не гарантирует тариф на выбранные даты.
4. При empty/error записать фактический результат. Не считать его подтверждением доступного тарифа и не заменять diagnostic 3424 автоматически. CheckRate и booking/payment acceptance не выполнять в этом этапе.

### Rollback procedure

Для остановки новых импортов удалить/очистить COUNTRY/DESTINATION scope через отдельное решение владельца. Для остановки TEST provider целиком — HOTELBEDS_ENABLED=false. Scheduler/monitor/booking/payment flags оставить false. Content строки не чистить.

Миграцию 020 предпочтительно оставить: она сохраняет данные и разделяет environment. **Не откатывать repository на старый ON CONFLICT writer без совместимой схемы**: прежний двухколоночный UNIQUE после появления TEST+LIVE дубликатов восстановить нельзя без отдельного плана данных. Безопасный откат приложения — отключить новый UI/импорт, сохранив совместимый repository и 020. Полный возврат схемы требует отдельного review и backup; автоматического destructive down migration здесь нет.

## Файлы

Изменены: backend/.env.example; backend/package.json; backend/repositories/providerCatalogRepository.js; backend/routes/adminOperations.js; backend/routes/catalog.js; backend/services/hotelbedsContentMapper.js; backend/services/searchService.js; backend/sources/hotelbeds.js; frontend/src/components/SearchBar.jsx; frontend/src/components/admin/HotelbedsStatus.jsx.

Созданы: backend/services/hotelbedsTestContent.js; backend/services/hotelbedsTestDestination.js; backend/tests/hotelbedsContent.test.js; database/migrations/020_catalog_environment_identity.sql; frontend/src/components/admin/HotelbedsContentStatus.jsx; этот отчёт.

**Итог: локальная кодовая/offline подготовка завершена. Render acceptance не выполнен и не объявляется PASS.**
