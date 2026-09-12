# SPRINT 3E — ASEDELIYA / HOTELBEDS TEST REAL DATA READ-ONLY

Дата: 12 сентября 2026. Работа продолжена поверх Sprint 3D/3C без отката. Перед изменениями выполнен git status; исходно были только сторонние untracked README.txt и docs/, они не изменялись.

**CODE READINESS: PASS. LOCAL TEST STATUS / AVAILABILITY: PASS — реальные HTTP 200 через mTLS. RENDER ACCEPTANCE: NOT RUN.** Код и настройки этого спринта на Render не применялись. Это TEST/Evaluation, не LIVE и не разрешение продаж.

## CODE READINESS

| Блок | Статус | Результат |
|---|---|---|
| Explicit staging TEST policy | PASS | HOTELBEDS_STAGING_TEST_ENABLED=true — отдельный opt-in, default false. Без него production TEST остаётся запрещённым. |
| Fail closed | PASS | Opt-in требует явно false у всех booking/money/background flags и disabled/none у payments. Пропущенный защитный flag также блокирует конфигурацию. |
| Read-only transport | PASS | Staging TEST принудительно read-only; false у HOTELBEDS_READ_ONLY блокирует конфигурацию. Разрешены только status, Availability и CheckRate. Content и booking/list/details/cancellation заблокированы. |
| Public search | PASS, offline | Согласованы ограничения клиента, ProviderManager и publicOnly search. Реальный provider adapter остаётся единственным источником цен. |
| Frontend display | PASS, offline/build | TEST показывается только с публичным build opt-in и серверными TEST/read-only метками. TEST badge и предупреждение, оформление отключено. |
| Production safeguards | PASS | productionGate не изменялся. LIVE policy, hosts и отдельные credentials сохранены. Mock в production запрещён. |

Аудит выявил четыре отдельных ограничения TEST: client.assertConfigured, ProviderManager, searchService publicOnly и frontend cards/details. Исключение добавлено согласованно; одного frontend flag недостаточно для backend доступа. HOTELBEDS_STAGING_TEST_ENABLED — явное заявление владельца, что deployment используется для staging; hostname Render сам по себе не включает режим. Флаг действует только при environment=test. В обычном local development без opt-in прежнее поведение сохранено.

Сигнатура SHA256(key+secret+Unix seconds) формируется перед каждым HTTP request. Redirects отключены. Agent использует cert/key, optional passphrase/CA и проверку TLS. В staging TEST нельзя разрешить Content либо mutation изменением HOTELBEDS_READ_ONLY. Проверка allowlist работает и перед очередью, и при прямом performRequest.

Pricing Sprint 3A и строгий product identity Sprint 3D не переписывались. sellingRate/net policy, отсутствие выдуманного FX, исключение некорректной currency/price сохранены. В provider offer добавлены bookingDisabled и stagingTestAllowed; они включены в подписанный snapshot. CheckRate обновляет цену, taxes/fees, policies/comments из текущего ответа. BOOKABLE не вызывает CheckRate.

## TEST CREDENTIAL READINESS

**PASS, local configuration.** TEST credentialsConfigured=true. Значения key/secret/passphrase не выводились, не копировались в source/report/frontend. Существующие environment variables использовались программно внутри процесса. LIVE credentials не использовались.

Локальный .env не изменялся. Для preflight/smoke только в отдельном процессе выставлялись NODE_ENV=production, TEST opt-in и безопасные флаги из checklist ниже. Это не изменение реальных Render variables и не сохранение настроек development.

## mTLS READINESS

**PASS, local material and real TEST transport.** certificateConfigured=true, privateKeyConfigured=true, mtlsReady=true, caConfigured=false. Системная trust chain использована без дополнительной CA. Валидатор проверил срок сертификата, чтение encrypted private key с существующим passphrase и соответствие ключа сертификату. Содержимое, subject, private paths и секреты не выводились.

Проверка TLS не отключалась. Официальный TEST hostname — api-mtls.test.hotelbeds.com; требования mTLS для Availability/CheckRate и этот hostname указаны в [HBX Mutual Authentication](https://developer.hotelbeds.com/documentation/hotels/knowledge-base/mutual-authentication/).

## TEST NETWORK EVIDENCE

**PASS — локальная реальная TEST сессия, не Render.** Успешные запросы 2026-09-12 13:43:07–13:43:08 UTC.

| Параметр | Фактический результат |
|---|---|
| Environment | test |
| Hostname | api-mtls.test.hotelbeds.com |
| GET /hotel-api/1.0/status | HTTP 200 |
| POST /hotel-api/1.0/hotels | HTTP 200 |
| Завершённые HTTP операции | 2, последовательно |
| Runner duration | 521 ms |
| Retries | 0 |
| DB/catalog/history writes из smoke | Нет |

Первая попытка из сетевой песочницы завершилась PROVIDER_UNAVAILABLE без HTTP status на status step. После разрешённого запуска вне песочницы выполнен успешный status → Availability. Первый отказ не выдан за HTTP 502 провайдера: фактический HTTP status был null. Ошибка не скрывалась mock fallback.

## AVAILABILITY EVIDENCE

**PASS — настоящий TEST provider response.** Запрос: hotel code 3424 (из существующего TEST smoke проекта), checkIn 2026-10-12, checkOut 2026-10-13, один номер, два взрослых, без детей. Один hotel code, одна ночь; destination-wide crawling не выполнялся.

| Evidence | Результат |
|---|---|
| Hotels | 1 |
| Rates | 8 |
| Provider currency | EUR |
| Интерпретированный priceSource | net |
| Raw response / rateKey в выводе | Нет |

Точные суммы не печатались и не сохранялись в отчёт. Это не фиктивные цены и не offline fixture: counts/currency/source получены из реального ответа. Количество rates относится к provider response, а не гарантированному числу frontend карточек: существующая нормализация выбирает подходящий rate на отель и исключает неподдерживаемые тарифы.

Реальное прохождение этих данных через Render search/API/frontend **NOT RUN**. Smoke вызывает клиент напрямую и не пишет в каталог. Полный search → normalization → signed offer проверен offline с локальным adapter и без DB fixtures на staging.

## CHECKRATE EVIDENCE

**NOT RUN — реальный CheckRate не выполнялся.** Smoke сознательно запускался без --checkrate. Наличие настоящего RECHECK в этих 8 rates не фиксировалось; утверждения о RECHECK PASS нет. Повторная Availability ради дополнительного доказательства не выполнялась для экономии evaluation quota.

**PASS, offline preparation:** --checkrate сначала получает свежую Availability; использует только RECHECK из неё, strict identity hotel/room/board/occupancy/currency/product. Неоднозначный набор требует ROOM_CODE/BOARD_CODE selection; случайный rate не выбирается. BOOKABLE и empty response не вызывают CheckRate. Реальный CheckRate остаётся отдельным acceptance действием при необходимости.

## TEST/LIVE ISOLATION

**PASS, offline regression.** LIVE не наследует TEST key/secret/hostname. LIVE checkout отвергает TEST signed offer до provider refresh. Cache keys и history fingerprint содержат provider/environment; TEST public search проверен отдельно. Catalog читает только соответствующий content_environment. TEST observations не становятся LIVE hot deals; автоматические monitor/content sync не включались.

Public frontend требует одновременно VITE_HOTELBEDS_STAGING_TEST_ENABLED=true, provider=hotelbeds, priceEnvironment=test, stagingTestAllowed=true и bookingDisabled=true. Сохранённая карточка без этих меток не получает публичную TEST цену. Для карточек сохранена проверка свежести observation. TEST badge не является LIVE badge или разрешением продажи.

## MOCK FALLBACK SAFETY

**PASS.** Production ProviderManager по-прежнему отвергает mock. Public search с TEST opt-in допускает только Hotelbeds. Auth/timeout/rate-limit/provider errors не заменяются fixtures; пустая выдача остаётся пустой. Offline tests отдельно проверяют ошибки и empty flow. В настоящем smoke mock fallback не использовался.

## BOOKING SAFETY

**PASS. Booking POST performed: NO. Cancellation performed: NO.** TEST opt-in требует HOTELBEDS_BOOKING_ENABLED=false и HOTELBEDS_LIVE_BOOKING_ENABLED=false. Client allowlist блокирует mutations до network. Local createBooking дополнительно возвращает безопасный 503 до pool.connect и создания draft при staging TEST opt-in. Существующий productionGate не ослаблен.

Frontend detail buttons отключены, direct checkout PaymentStep показывает недоступность подтверждения для production TEST и bookingDisabled offers. Подмена UI не снимает backend/transport блокировки.

## PAYMENT SAFETY

**PASS. Payment/charge/refund performed: NO.** Для TEST policy обязательны PAYMENTS_MODE=disabled, PAYMENTS_PROVIDER=none, PRODUCTION_SALES_ENABLED=false, REAL_CHARGES_ENABLED=false, REAL_REFUNDS_ENABLED=false. Payment services не изменялись. Smoke их не вызывает. Unsafe flags делают TEST config недопустимой.

## ADMIN READINESS

**PASS, code/offline/build; deployed UI NOT RUN.** Existing auth + admin role + system permissions сохранены. Endpoint выбирает TEST либо LIVE preflight/runner по серверной конфигурации, не по переданному клиентом environment.

Отображаются environment, stagingTestAllowed, credentialsConfigured, mtlsReady, last probe status/timestamp, Availability result/hotelCount/rateCount, bookingDisabled/paymentsDisabled, salesReady=false. JSON поле liveProbe сохранено для совместимости, но содержит фактический environment; UI заголовок теперь TEST/LIVE по конфигурации, не постоянный LIVE.

История probe остаётся process-scoped in-memory, сбрасывается при restart. CLI process не обновляет состояние web process. Сохранены сериализация admin probe и cooldown 60 секунд после network attempt; это не распределённый limiter нескольких instances.

## BUILD / TEST RESULTS

| Проверка | Статус | Evidence |
|---|---|---|
| Frontend production build | PASS | npm.cmd run build; отдельно с VITE_HOTELBEDS_STAGING_TEST_ENABLED=true |
| Relevant frontend lint | PASS | TourCard, TourDetails, PaymentStep, HotelbedsStatus, providerEnvironment |
| Backend syntax | PASS | node --check 12 изменённых/новых JS |
| Sprint 3E | PASS | 8 tests, 0 failed, 0 skipped |
| Sprint 3D | PASS | 24 tests; включая signature, TLS pair/encrypted key, isolation, CheckRate |
| Sprint 3C | PASS | 15 tests; local PostgreSQL isolated temporary schema/rollback |
| Relevant older regression | PASS | Sprint 2F, Sprint 3A, priceHistory |
| Старый unrelated Sprint 2H | FAIL | tests/sprint2h.test.js:62 ожидает source substring provider === "console" в неизменённом email service |
| git diff --check | PASS | Финальная проверка whitespace |
| Secret scan | PASS | Tracked repository/frontend dist, без вывода значений; credential files не tracked |

Обычные offline suites не обращались в Hotelbeds. HTTP 200 в их stub logs не являются network evidence; настоящая сессия указана отдельно выше. Никакие старые tests не удалялись. Dependency changes и npm audit fix не выполнялись.

## OWNER ACTIONS

1. Проверить изменения. Git add/commit/push/deployment в этом спринте не выполнялись; решение о публикации остаётся владельцу.
2. После отдельного решения владельца настроить backend staging variables и TEST Secret Files по checklist. Не отправлять API secret/private key в чат. Реальные Render env и Secret Files из этой сессии не менялись.
3. Настроить публичный frontend build flag и выполнить будущий deployment. Одно backend переключение не отменяет frontend защиту. Не включать LIVE и booking/payment flags.
4. Выполнить TEST preflight в runtime backend. Для сетевого smoke выбрать один известный hotel code и будущие даты; максимум status + Availability + optional однозначный CheckRate, retries=0.
5. Проверить Render /results, detail refresh, TEST badge, currency, пустую выдачу/provider errors и заблокированный checkout. Это ещё не выполнено на Render.
6. Country/city search без explicit destinationCode/hotelCodes зависит от существующего локального TEST Content-каталога. Его наполненность на Render в 3E не подтверждалась. Пустой каталог вернёт HOTELBEDS_CATALOG_EMPTY; данные не подделываются. Для первой проверки использовать explicit hotelCodes/destinationCode. Content sync намеренно не разрешён staging TEST transport policy; отдельную подготовку каталога согласовать отдельно, не включать scheduler ради обхода.

### Точный Render staging env checklist

Backend, non-secret:

```ini
NODE_ENV=production
ACTIVE_PROVIDER=hotelbeds
HOTELBEDS_ENV=test
HOTELBEDS_ENABLED=true
HOTELBEDS_STAGING_TEST_ENABLED=true
HOTELBEDS_READ_ONLY=true
HOTELBEDS_BOOKING_ENABLED=false
HOTELBEDS_LIVE_BOOKING_ENABLED=false
PRODUCTION_SALES_ENABLED=false
PAYMENTS_MODE=disabled
PAYMENTS_PROVIDER=none
REAL_CHARGES_ENABLED=false
REAL_REFUNDS_ENABLED=false
HOT_DEALS_MONITOR_ENABLED=false
HOTELBEDS_CONTENT_SYNC_ENABLED=false
HOTELBEDS_READ_RETRIES=0
HOTELBEDS_REQUEST_INTERVAL_MS=300
HOTELBEDS_TIMEOUT_MS=12000
```

Обязательны точные строки false у семи booking/money/background flags; пропуск не считается разрешением staging TEST. HOTELBEDS_READ_ONLY рекомендуется явно true и не может быть false.

Существующие CORS_ORIGINS, DATABASE_URL, JWT_SECRET, OFFER_TOKEN_SECRET, DB SSL и PORT оставить без изменений. PORT предоставляет Render. LIVE переменные не заполнять. NODE_TLS_REJECT_UNAUTHORIZED=0 недопустим.

URL overrides лучше убрать, используя встроенный выбор TEST. Если overrides сохранены, допустимы только:

```ini
HOTELBEDS_BASE_URL=https://api.test.hotelbeds.com
HOTELBEDS_CONTENT_BASE_URL=https://api.test.hotelbeds.com
HOTELBEDS_BOOKING_BASE_URL=https://api-mtls.test.hotelbeds.com
```

Backend secrets: HOTELBEDS_API_KEY, HOTELBEDS_API_SECRET (legacy HOTELBEDS_SECRET поддержан), HOTELBEDS_MTLS_KEY_PASSPHRASE для encrypted key. Их значения здесь и в Git отсутствуют. .env.example использует пустые Hotelbeds credential placeholders.

TEST certificate и private key — Render Secret Files; CA только при необходимости. Пример non-secret paths (имена выбирает владелец):

```ini
HOTELBEDS_MTLS_CERT_PATH=/etc/secrets/hotelbeds-test.crt
HOTELBEDS_MTLS_KEY_PATH=/etc/secrets/hotelbeds-test.key
# Только при необходимости дополнительной CA:
HOTELBEDS_MTLS_CA_PATH=/etc/secrets/hotelbeds-test-ca.crt
```

При системной trust chain CA variable оставить пустой. Windows/local paths по-прежнему поддерживаются; никаких файлов не переносилось в source. render.yaml не изменён и сохраняет HOTELBEDS_ENABLED=false: его повторный import не следует считать включением 3E.

Frontend public build variables:

```ini
VITE_API_URL=https://asedeliya-staging-api.onrender.com/api
VITE_HOTELBEDS_STAGING_TEST_ENABLED=true
```

VITE_API_URL следует сохранить в формате текущего backend API base проекта. Это публичные значения; backend credentials нельзя помещать в VITE_*. Новое значение Vite применяется при сборке, а не в уже собранном bundle.

Optional bounded smoke variables, backend non-secret:

- HOTELBEDS_TEST_PROBE_HOTEL_CODES — explicit 1–5 известных codes; рекомендуется один.
- HOTELBEDS_TEST_PROBE_CHECKIN / HOTELBEDS_TEST_PROBE_CHECKOUT — будущие YYYY-MM-DD, 1–14 ночей.
- HOTELBEDS_TEST_PROBE_ADULTS — 1–4, default 2; smoke всегда один номер, children=0.
- HOTELBEDS_TEST_PROBE_ROOM_CODE / HOTELBEDS_TEST_PROBE_BOARD_CODE — selectors для однозначного RECHECK.

В постоянном script нет default hotel codes или автоматического выбора дат. Код 3424 использовался только в отдельном контролируемом запуске этого спринта.

Команды из backend/:

```text
npm run hotelbeds:test-preflight
npm run hotelbeds:test-smoke
npm run hotelbeds:test-smoke -- --availability
npm run hotelbeds:test-smoke -- --checkrate
npm run test:sprint3e
npm run test:sprint3d
npm run test:sprint3c
```

Preflight не использует network. Smoke без options делает только status. --availability добавляет один Availability; --checkrate добавляет свежую Availability и CheckRate только при подходящем RECHECK. Параметры TEST никогда не наследуются из LIVE_PROBE variables. BLOCKED/FAIL дают ненулевой exit code. Автоматические запуск/monitor/crawling не добавлены.

## Файлы

Изменены:

- backend/.env.example
- backend/config/hotelbeds.js
- backend/controllers/bookingController.js
- backend/integrations/hotelbeds/client.js
- backend/package.json
- backend/providers/providerManager.js
- backend/routes/adminOperations.js
- backend/services/hotelbedsLiveReadOnlyService.js
- backend/services/offerTokenService.js
- backend/services/searchService.js
- backend/sources/hotelbeds.js
- frontend/.env.example
- frontend/src/components/TourCard.jsx
- frontend/src/components/admin/HotelbedsStatus.jsx
- frontend/src/components/checkout/PaymentStep.jsx
- frontend/src/pages/TourDetails.jsx

Созданы:

- backend/scripts/hotelbedsTestReadOnly.js
- backend/services/hotelbedsTestReadOnlyService.js
- backend/tests/hotelbedsStagingTest.test.js
- frontend/src/utils/providerEnvironment.js
- SPRINT_3E_HOTELBEDS_TEST_REAL_DATA_REPORT.md

**Итог:** code-ready и локальный настоящий TEST status/Availability подтверждены. Настройка Render, пользовательский staging acceptance и настоящий CheckRate остаются отдельными действиями. LIVE network, Booking POST, cancellation, payment/charge/refund, git add/commit/push и deployment не выполнялись. ProductionGate сохранён.
