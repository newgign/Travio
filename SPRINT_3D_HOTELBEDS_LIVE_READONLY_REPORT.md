# SPRINT 3D — ASEDELIYA / HOTELBEDS LIVE READ-ONLY CONNECTION

Дата проверки: 12 сентября 2026. Ветка: develop. Работа продолжена поверх начатого 3D и существующего 3C, без отката. Этот отчёт заменяет предварительный отчёт с именем READ_ONLY.

**CODE READINESS: PASS. LIVE NETWORK: BLOCKED — LIVE credentials/mTLS not configured в доступном окружении.** Это не FAIL реализации и не свидетельство успешного LIVE подключения. Реальных LIVE status/Availability/CheckRate responses нет. Commit, push, deployment, Booking POST, cancellation, payment/charge/refund не выполнялись.

## CODE READINESS

| Блок | Статус | Результат |
|---|---|---|
| Аудит | PASS | Перед продолжением выполнен git status; сохранены начатые 3D edits, README.txt/docs не затрагивались. |
| Explicit environment/credentials/hosts | PASS | test/live выбираются конфигурацией, LIVE не наследует TEST pair/host, NODE_ENV не выбирает LIVE. |
| Transport/read-only allowlist | PASS | Booking/cancellation/неизвестные пути блокируются до network, включая прямой transport и SIMULATION. |
| Signature | PASS | SHA256(key+secret+Unix seconds), hex, формируется перед каждым HTTP request; offline формула и вызов per-request проверены. |
| mTLS implementation | PASS | Чтение, X.509 validity, key match, encrypted key/passphrase, CA optional, verified TLS, безопасные ошибки. |
| Availability/CheckRate preparation | PASS | Bounded probe, explicit будущие даты/hotel codes, только текущий RECHECK, строгая проверка продукта. |
| Admin readiness API/UI | PASS | Boolean diagnostics, status/timestamp/Availability, booking/payment flags; frontend build/lint и backend tests проходят. Положительный UI runtime на новом deployment — NOT RUN. |

### Завершённый аудит

- `backend/config/hotelbeds.js`: default TEST при отсутствии HOTELBEDS_ENV; explicit `live` выбирает `https://api-mtls.hotelbeds.com` для Booking transport и `https://api.hotelbeds.com` для Content. Legacy overrides с TEST/другим host блокируют конфигурацию. Production + TEST не становится LIVE автоматически.
- `HotelbedsClient`: X-Signature создаётся в createHeaders непосредственно перед http.request. Api-key/signature/raw provider response не выводятся в лог. Redirects выключены (`maxRedirects:0`). HTTPS agent содержит cert/key, optional passphrase/CA, `rejectUnauthorized:true`, minimum TLS1.2, стандартную hostname verification.
- Existing timeout: default read 12 секунд; booking timeout >=60 секунд, default65 секунд — в этом спринте mutation transport не используется. Existing client queue: последовательно, максимум100 pending, interval default300 ms/min250 ms, read retries до3, Retry-After/backoff до30 секунд. Auth/permanent ошибки не retry. Explicit 3D probe использует retries=0 и максимум3 read operations. Admin probe: один одновременно и cooldown60 секунд после network attempt, в пределах процесса; это не распределённый лимитер нескольких deployments.
- `ProviderManager` в production запрещает mock/TEST; `searchService` не делает fallback при provider error. Он выбирает provider перед cache lookup. Cache key сериализует provider, environment и весь filters object, включая hotel/destination, dates, occupancy, ages, board/category и остальные filters.
- `offerTokenService` подписывает priceEnvironment/provider/product metadata. `checkoutController` отклоняет TEST signed offer в LIVE до refresh/CheckRate. JWT signature сама по себе не подтверждает текущую доступность.
- `priceHistory`: environment в record/fingerprint; запись требует environment предложения = активному; provider должен быть hotelbeds. Hot deals берут только LIVE snapshots и более раннее LIVE observation того же fingerprint, с меньшей текущей ценой. Старые TEST строки не становятся LIVE. Monitor/content-sync flags не включались.
- Catalog repository фильтрует content_environment; search не запускает Content sync. Probe вызывает client напрямую, не использует searchService, не пишет catalog/history/checkout/bookings/DB и не делает crawling.
- Pricing Sprint3A сохранён: sellingRate предпочтителен, net разрешён существующей policy; обязательный sellingRate нельзя подменить net. Некорректная/нулевая цена или отсутствующая currency исключают публикацию. FX provider отсутствует, KZT-конвертация не добавлялась.
- Основные места потенциального Booking POST: HotelbedsBookingService.confirm → provider.createBooking → client.createBooking; frontend bookingService → local booking routes. В 3D flow они не используются. Read-only allowlist добавлен перед request queue и прямым performRequest; hard productionGate и LIVE mutation checks сохранены.
- Frontend PaymentStep для LIVE Hotelbeds уже показывает недоступность подтверждения/оплаты; это сохранено. Ранее проверенные staging provider-empty/error states не заменялись mock. Успешная новая LIVE карточка/checkout в этом спринте не проверялись.
- `render.yaml`, реальные .env, credentials и migrations001–019 не изменены. Поддерживаются локальные Windows/relative paths и Render Secret Files.

Документированный status endpoint `/hotel-api/1.0/status` сохранён для минимального smoke: он присутствует в [официальном Getting Started HBX](https://developer.hotelbeds.com/documentation/getting-started/). LIVE hostname/mTLS требования для Availability/CheckRate подтверждены [HBX Mutual Authentication](https://developer.hotelbeds.com/documentation/hotels/knowledge-base/mutual-authentication/). Status проверяет transport; он не доказывает доступность inventory или право продавать.

### Найденные и исправленные дефекты

| Дефект | Исправление | Проверка |
|---|---|---|
| Совпадение rateKey обходило сравнение product, replacement выбирался первым похожим rate без полного identity. | Общий `hotelbedsRateIdentity`: hotel/room/board, rooms/adults/children/ages, currency, rateClass/paymentType/packaging проверяются и при прежнем key. Неоднозначное совпадение отклоняется. | Offline changed hotel/currency/occupancy/product/ages rejection и прежний CheckRate pricing regression. |
| CheckRate ориентировался только на recheckRequired. | Network CheckRate только при rateType RECHECK; BOOKABLE не делает лишнего запроса. | Offline BOOKABLE со stale recheckRequired и probe BOOKABLE/empty tests. |
| Старые rateComments могли сохраняться вместо актуального отсутствующего значения. | CheckRate возвращает актуальные comments или null; Availability сохраняет переданный rateComments; обновляется observedAt. | Source audit, pricing/CheckRate regression. |
| LIVE connection не имел собственного transport allowlist, полный TLS preflight отсутствовал. | LIVE default read-only, safe mTLS validator, guarded smoke и explicit bounded parameters. | Mutation/absolute-path/direct-transport, cert validity/key/passphrase tests. |
| mTLS file error включал абсолютный путь. | Только safe message/code. | Ошибка unreadable file не содержит path. |
| Readiness не показывала отдельные credential/TLS/probe состояния. | Boolean connection diagnostics и process-scoped probe state в admin API/UI, salesReady=false. | Offline readiness types/concurrency test, auth regression, build/lint. |

## CREDENTIAL READINESS

**BLOCKED. LIVE credentials detected: NO.** Проверка доступных local env/process env выполнена без вывода значений. Отдельные HOTELBEDS_LIVE_API_KEY и HOTELBEDS_LIVE_API_SECRET не обнаружены. Текущий локальный environment — TEST; TEST key/secret не используются как LIVE fallback.

Локальные TEST enabled/booking flags и sandbox payment config сохранены для development; они делают LIVE probe BLOCKED и не свидетельствуют о настройках Render. Private Render environment из этой сессии не читался. API secrets не запрашивались в чате и не переносились в Git/frontend/report/tests.

## mTLS READINESS

**BLOCKED. LIVE mTLS ready: NO.** LIVE cert/private-key paths отсутствуют. Положительный TLS unit test использует только временную сгенерированную локальную fixture, не Hotelbeds certificate. OpenSSL CLI нужен только для этой fixture; cert/key файлы удалены после теста и не добавлены в Git.

Admin diagnostics: environment, apiKeyConfigured, secretConfigured, certificateConfigured, privateKeyConfigured, caConfigured, mtlsReady. Поля Configured относятся к выбранному environment; отдельное liveCredentialsConfigured показывает LIVE pair. Содержимое сертификата/ключа, subject, passphrase, API key/secret и private paths не возвращаются. NODE_TLS_REJECT_UNAUTHORIZED=0 блокирует preflight, verification не отключается. Связь сертификата с LIVE key в HBX portal может подтвердить только владелец.

## LIVE NETWORK EVIDENCE

**BLOCKED. LIVE smoke performed: NO.** `npm.cmd run hotelbeds:live-smoke` и новые preflight/read-only команды фактически запущены; они отказали до network:

```text
status: BLOCKED
environment: test
liveCredentialsConfigured: false
mtlsReady: false
networkAttempted: false
operations: []
```

Target hostname будущего разрешённого запроса: **api-mtls.hotelbeds.com**. HTTP status: **не получен**. Никакой 200 из offline adapter не является LIVE evidence. Логи environment=live в tests относятся к локальному stub adapter.

## AVAILABILITY EVIDENCE

**BLOCKED. Availability performed: NO.** Реальные hotels/rates, currency и priceSource не получены, не объявляются нулём или EUR по умолчанию.

Подготовлен `POST /hotel-api/1.0/hotels` через production mTLS: explicit1–5 hotel codes, будущие календарно корректные даты,1–14 ночей,1 room,1–4 adults, children0 для минимального smoke. Общая существующая Availability поддерживает children/ages; настоящий LIVE ответ с детьми не проверен. Нет широкого destination scan или TEST hotel-code defaults.

Поля обрабатываются существующим provider normalization: checkIn/checkOut, hotel/destination, occupancy, room code/name, board, rateKey/type, paymentType, packaging, currency, sellingRate/net, taxes/fees, cancellationPolicies, rateComments. При отсутствии значения оно не выдумывается. Probe выводит безопасные counts/category/HTTP/duration/hostname; raw responses/rateKeys/цены не логируются. Public offers сохраняют providerAmount/providerCurrency/displayAmount/displayCurrency/priceSource, provider hotelbeds, priceEnvironment live и observedAt; без реального ответа новые offers не создаются.

## CHECKRATE EVIDENCE

**BLOCKED. RECHECK rate received: NO. CheckRate performed: NO.** Настоящий текущий LIVE key отсутствует.

Опция `--checkrate` сначала выполняет свежую Availability. Только один однозначно выбранный RECHECK после optional ROOM_CODE/BOARD_CODE filters может быть проверен. При нескольких кандидатах AMBIGUOUS_RECHECK_SELECTION; случайный первый rate не выбирается. BOOKABLE/пустая выдача → NOT APPLICABLE для CheckRate. Возвращённый hotel/room/board/occupancy/children ages/currency/product сопоставляются даже при неизменном key; неизвестный/неоднозначный продукт отклоняется. Цена может измениться: существующий price-confirmation flow сохранён; новые price, taxes/fees, policies/comments поступают из ответа.

## TEST/LIVE ISOLATION

**PASS, offline evidence.** TEST credential/host fallback запрещён, TEST signed offer отклоняется LIVE checkout, cache key содержит environment/provider/all filters, history record/fingerprint и catalog environment разделены. Hot deals требуют более раннего сопоставимого LIVE observation, не TEST snapshot. Monitor не включался. Исторический catalog интеграционный механизм не переписывался; текущий 3D probe не обращается к catalog DB.

## MOCK FALLBACK SAFETY

**PASS, offline evidence.** 401/403, TLS failure, timeout,429,5xx отклоняются без mock; TEST cache не скрывает LIVE error. Empty Availability остаётся empty; invalid response — FAIL, не fake success. No real provider response не выдаётся за availability. Existing queued read retries сохранены; отдельный probe deliberately retries0 и не участвует в booking/cancellation retries.

## BOOKING SAFETY

**PASS, offline safeguards. Booking POST performed: NO. Cancellation performed: NO.** В read-only разрешены только Booking-channel status/Availability/CheckRate и Content GET с относительным path. Booking GET/list/details также исключены из connection-only scope, чтобы не читать PII. Read-only smoke требует booking flags false. Hard productionGate не ослаблен; снятие read-only само по себе не включает LIVE mutation.

## PAYMENT SAFETY

**PASS, offline safeguards. Payment/charge/refund performed: NO.** Probe требует disabled/none и false real-money flags. Test проверяет отсутствие payment intent/booking/cancellation вызовов. Реальные payment modules не изменялись. Mock fallback used: **NO**; offline fixtures используются только внутри tests.

## ADMIN READINESS

`GET /api/admin/providers/hotelbeds` сохраняет auth + admin role + system permission. Отдаёт connection boolean diagnostics, liveProbe status/timestamp/lastAvailabilityStatus, bookingDisabled/paymentsDisabled, salesReady false. Существующий `POST .../probe` использует guarded runner, разрешает только boolean availability/checkRate options; hotel selection задаётся серверным env, не произвольным клиентским payload.

Probe history **in-memory, process-scoped**: after restart NOT RUN; отдельный CLI process не обновляет историю web process. UI явно объясняет это ограничение. Нет fake persisted success. Admin probe сериализован, после сетевой попытки выдерживается60 секунд; multiple instances требуют общего лимитера/согласованной quota при будущем включении. Новый admin UI не задеплоен и через настоящий admin login в 3D не проверялся — **NOT RUN**, а не LIVE UI PASS.

## BUILD / TEST RESULTS

| Проверка | Статус | Результат |
|---|---|---|
| Frontend build | PASS | npm.cmd run build |
| Frontend lint | PASS | Изменённый HotelbedsStatus.jsx |
| Backend syntax | PASS | node --check изменённых/новых backend JS |
| Sprint3D offline | PASS | npm run test:sprint3d:24 tests,0 failed,0 skipped |
| Sprint3C regression | PASS | npm run test:sprint3c:15 tests; локальный PostgreSQL temporary schema/rollback |
| Hotelbeds3A regression | PASS |10 hotelbedsLive tests входят в3D; sprint3a.test.js, priceHistory.test.js и2F также PASS |
| Старый unrelated2H | FAIL | Сохранился source-substring contract tests/sprint2h.test.js:62 в неизменённом email service |
| Security scan | PASS |313 tracked/dist files,2 известные local secret values сравнивались без вывода; findings[] |
| git diff --check | PASS | Whitespace errors отсутствуют |

Secret scan: `node backend/scripts/scanProviderSecrets.js`. Имена backend env variables в source/.env.example не являются утечкой; scanner проверяет реальные известные значения/credential files/private-key material и запрещённые server-secret markers в dist. Это не сертификат отсутствия неизвестных secrets во всей Git history. `.gitignore` содержит backend/certs/, *.key/*.pem/*.p12/*.pfx/*.crt; git ls-files не показывает этих файлов или реальных .env. JWT/DATABASE_URL/Hotelbeds secrets в frontend bundle не найдены. Audit fix/force и dependency changes не выполнялись.

## OWNER ACTIONS

1. Проверить локальные изменения. Commit/push/deploy выполняет только владелец по отдельному решению; в этом спринте они не выполнялись.
2. Подтвердить LIVE access и связать certificate с LIVE API key в HBX portal. API secret/private key не отправлять в чат.
3. После решения о следующем deployment: Render backend → Environment → Environment Variables: LIVE API key, LIVE API secret и optional key passphrase — secret variables. В Secret Files добавить certificate/private key и CA только при необходимости.
4. Файлы доступны как `/etc/secrets/<filename>`; соответствующие *_PATH variables должны ссылаться на них. **Сохранение Secret Files запускает Render deployment**; поэтому сейчас эти действия не выполнялись. Для обычных env Render имеет Save only, но значения применяются при следующем deploy. [Render Environment Variables and Secrets](https://render.com/docs/configure-environment-variables#secret-files).
5. Настроить отдельный контролируемый runtime согласно таблице, удалить конфликтующие TEST URL overrides. Не менять JWT_SECRET, OFFER_TOKEN_SECRET или DATABASE_URL ради probe.
6. Сначала preflight, затем status; Availability/CheckRate — только с явными маленькими selection параметрами. CLI не запускает web server или monitor, не пишет DB. Переключение общего web deployment на enabled LIVE может открыть пользовательский поиск и расходовать quota, поэтому его не делать автоматически вместе с начальным smoke.

| Env | Значение/назначение для будущего probe | Secret |
|---|---|---|
| HOTELBEDS_ENV | live | нет |
| HOTELBEDS_ENABLED / HOTELBEDS_READ_ONLY | true / true, только в подготовленном runtime | нет |
| HOTELBEDS_LIVE_API_KEY / HOTELBEDS_LIVE_API_SECRET | Отдельная LIVE pair | да |
| HOTELBEDS_LIVE_MTLS_CERT_PATH | /etc/secrets/выбранный-certificate | path нет; файл вне Git |
| HOTELBEDS_LIVE_MTLS_KEY_PATH | /etc/secrets/выбранный-private-key | key content да |
| HOTELBEDS_LIVE_MTLS_CA_PATH | optional /etc/secrets/выбранный-ca | CA не credential |
| HOTELBEDS_LIVE_MTLS_KEY_PASSPHRASE | Только для encrypted key | да |
| HOTELBEDS_BOOKING_ENABLED / HOTELBEDS_LIVE_BOOKING_ENABLED | false / false | нет |
| PAYMENTS_MODE / PAYMENTS_PROVIDER | disabled / none | нет |
| PRODUCTION_SALES_ENABLED / REAL_CHARGES_ENABLED / REAL_REFUNDS_ENABLED | false | нет |
| HOT_DEALS_MONITOR_ENABLED / HOTELBEDS_CONTENT_SYNC_ENABLED | false | нет |
| HOTELBEDS_LIVE_PROBE_HOTEL_CODES | Явные1–5 known hotel codes | нет |
| HOTELBEDS_LIVE_PROBE_CHECKIN / CHECKOUT | Полные имена с общим префиксом; будущие даты YYYY-MM-DD | нет |
| HOTELBEDS_LIVE_PROBE_ADULTS |1–4, default2 | нет |
| HOTELBEDS_LIVE_PROBE_ROOM_CODE / BOARD_CODE | Необязательные selectors для однозначного RECHECK | нет |

Все credential placeholders в .env.example пустые. Приведённые выше значения не применялись к настоящему environment.

Команды из backend/:

```text
npm run hotelbeds:live-preflight
npm run hotelbeds:live-smoke
npm run hotelbeds:live-readonly -- --availability
npm run hotelbeds:live-readonly -- --checkrate
npm run test:sprint3d
npm run test:sprint3c
```

`--preflight` не обращается в сеть. Smoke без options делает status. Invalid options/parameters/credentials fail closed; BLOCKED/FAIL дают ненулевой exit code. Probe output ограничен diagnostics/counts/status/duration/category, без raw payload. Нормальные offline tests не обращаются в LIVE; OpenSSL временные сертификаты и stub adapters — только fixtures.

## Файлы

Изменены:

- backend/.env.example
- backend/config/hotelbeds.js
- backend/integrations/hotelbeds/client.js
- backend/package.json
- backend/routes/adminOperations.js
- backend/scripts/hotelbedsLiveSmoke.js
- backend/sources/hotelbeds.js
- backend/tests/hotelbedsLive.test.js — fixture расширена полным product identity, старый test не удалён.
- frontend/src/components/admin/HotelbedsStatus.jsx

Созданы:

- backend/integrations/hotelbeds/mtls.js
- backend/scripts/hotelbedsLiveReadOnly.js
- backend/scripts/scanProviderSecrets.js
- backend/services/hotelbedsLiveReadOnlyService.js
- backend/services/hotelbedsRateIdentity.js
- backend/tests/hotelbedsIsolation.test.js
- backend/tests/hotelbedsReadOnly.test.js
- SPRINT_3D_HOTELBEDS_LIVE_READONLY_REPORT.md

Предварительный READ_ONLY report заменён этим файлом с требуемым именем. Реальные env/certs, render.yaml, migrations, productionGate, payment business logic и предыдущие спринты не откатывались.

## Решение

Sprint3D **code-ready: YES**, в пределах описанного read-only flow и process-scoped admin diagnostics. **LIVE network acceptance complete: NO**. Следующий допустимый этап — review владельца, безопасная настройка credentials/Secret Files и отдельный разрешённый read-only network acceptance. Переход к реальным bookings/payments пока не разрешён. После успешного Availability ещё требуются договорная pricing/quota/taxes проверка, gateway/reconciliation и отдельный booking/cancellation/refund acceptance; они не входят в этот спринт.
