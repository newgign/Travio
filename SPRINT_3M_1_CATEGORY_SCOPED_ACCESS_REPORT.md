# Sprint 3M.1 — category-scoped TEST access и безопасное начальное состояние

## Итог

CODE / OFFLINE: PASS. Render acceptance: NOT RUN.

Изменения внесены поверх незакоммиченного Sprint 3M и HEAD `557210c`, без отката 3L. Исправлены global circuit и автоматический initial READY. Новых таблиц и миграций нет; migration 020 не изменена.

## Identities и аудит STATUS

Оба circuit используют существующую PK `(job, environment)` таблицы `provider_job_state`:

| Access | job | environment | Read categories |
|---|---|---|---|
| Content | `hotelbeds_test_access_content` | `test` | content |
| Booking read | `hotelbeds_test_access_booking_read` | `test` | availability, diagnostic 3424, checkrate, status |

Аудит `HotelbedsClient.performRequest` установил: status вызывает `/hotel-api/1.0/status`, Availability — `/hotel-api/1.0/hotels`, CheckRate — `/hotel-api/1.0/checkrates`. Они используют одну настроенную пару API credentials и signing implementation для Booking API. Однако status идёт через обычный `baseUrl` без mTLS, Availability/CheckRate — через `bookingBaseUrl` и mTLS agent. Поэтому status относится к Booking read gate, но его 200 **не принимается за доказательство восстановления Availability**.

Content 403 изменяет только Content row. Availability 403 изменяет только Booking read row. STATUS 200 не восстанавливает Content и не закрывает Booking read circuit. Старый `controlStatus()` явно отклоняется; API больше не принимает operation=STATUS.

Старая global row `hotelbeds_test_access`, если существует, сохраняется, но не используется новой защитой и не переносится в новые identities. Из неё не выводится READY, AUTH_BLOCKED или историческая причина ошибки.

## Missing state и переходы

Отсутствующая row ведёт себя как **UNKNOWN_BLOCKED**. Локальный inspect/arm может создать row только с этим начальным state. До успешной соответствующей control operation provider calls равны нулю. Это действует сразу после запуска; ручная SQL-инициализация для предотвращения traffic не требуется.

UNKNOWN_BLOCKED не означает HTTP 403. `lastAuthErrorAt`, `lastAuthErrorCategory`, `openedAt`, `reason` и `lastSuccessAt` остаются неизвестными/null, пока нет соответствующего факта. Рассказ владельца и исторический Render 403 не backfill-ятся.

| Событие | Результат соответствующего circuit |
|---|---|
| Обычный read при UNKNOWN_BLOCKED/AUTH_BLOCKED | Safe unavailable, ZERO transport, permit не потребляется |
| Реальный транспортный HTTP 403 + AUTH_ERROR | AUTH_BLOCKED, реальные timestamp/category, reason HOTELBEDS_AUTH_ERROR |
| Arm соответствующей operation | State прежний, permit armed, ZERO transport |
| Полностью успешная permitted operation | READY, lastSuccess обновляется |
| Permitted non-auth failure, invalid response, rollback | Исходное blocked-состояние сохраняется, permit consumed |
| Ошибка persistence до transport | ZERO transport |
| Ошибка записи наблюдения/финального результата | Fail-safe latch соответствующего circuit сохраняется |

Обычный успешный request в READY обновляет lastSuccess, но не является способом recovery. Нет автоматического reset, expiration, retry, scheduled probe или re-import. TEST retries остаются 0.

## Content recovery

Admin arm/execute принимает строго `{"operation":"CONTENT","scopeId":"PT:CEN"}`; scopeId должен находиться в текущем server allowlist. Scope проверяется повторно при execute. Другой scope не потребляет permit. Arm не вызывает Hotelbeds.

Execute запускает **один next Content import выбранного scope** через существующий 3L importer. Persistent permit и in-flight token относятся ко всей операции, включая проверку metadata, hotel response, identities и commit каталога. READY устанавливается только после успешного завершения importer и фиксации итогового состояния guard.

Сохранены:

- Один scope, next batch до 10, общий cap 20 уникальных hotelCode на destination.
- Metadata 1–100, затем при необходимости 101–200; после этого максимум один hotel GET.
- До 3 Content requests; дополнительные transport attempts блокируются guard.
- При 403 на metadata #1 — 1 call; на metadata #2 — 2; на hotel GET — 3. Немедленная остановка, никакого следующего запроса.
- Advisory lock 319030, cooldown 60 секунд, timeout 12000 ms, interval 1000 ms, retries=0, identity validation, transaction rollback и TEST/LIVE isolation.

Частичные metadata 200 не обновляют recovery success. Invalid response, scope mismatch, ошибка upsert/commit, cap/cooldown и отсутствие transport не могут открыть circuit. Валидный пустой hotel response после полностью успешной bounded operation подтверждает доступ, но не гарантирует рост каталога/тарифы.

Если scope уже достиг cap 20, importer сохраняет IMPORT COMPLETE и не выполняет контрольный import. Для этого механизма recovery нужен разрешённый scope с доступным следующим batch; cap не обходится ради проверки доступа. Ошибка после consume оставляет permit использованным.

## Booking read recovery

Admin arm/execute принимает строго `{"operation":"AVAILABILITY_3424"}`. Scope, hotel codes, даты, occupancy, URL, credentials и environment из body не принимаются.

Операция делает **один Availability POST через настоящий Booking API transport path**, используя offline stub только в тестах. Selection фиксирован сервером: hotel 3424, один номер, два взрослых, без детей, одна ночь; заезд через 7 дней от текущей UTC-даты, выезд через 8 дней. Payload проверяется существующим bounded builder.

Нет предварительного STATUS, CheckRate, Content, booking или payment. Для recovery требуется успешный ответ с массивом `hotels.hotels`, содержащим только hotel 3424 либо пустым. Пустой массив подтверждает read access, но не наличие тарифов. Ошибка схемы/чужой hotel ID не подтверждает recovery.

Проверяются существующие TEST opt-in, read-only и booking/payment safety flags. Подготовка credentials/TLS остаётся в прежнем transport; ошибки до вызова HTTP не считаются provider request. Успех операции меняет только Booking read circuit. Он не доказывает Content access и не разрешает продажи.

## API, concurrency и in-flight

Сохраняются admin-protected endpoints:

- `GET /admin/providers/hotelbeds/access` — оба circuit, summary и агрегированные counters; ZERO provider calls.
- `POST /admin/providers/hotelbeds/access/arm` — только одна из двух описанных operation; ZERO calls.
- `POST /admin/providers/hotelbeds/access/control` — отдельное explicit выполнение.

Требуются admin role и существующие permissions. Extra body fields и произвольные operations отклоняются. Double arm, повторное использование permit, wrong scope и попытка выполнить CONTROL в READY отклоняются. Public search/diagnostic/CheckRate/обычный probe не могут использовать admin permit.

Каждый circuit атомарно потребляет свой permit под `SELECT ... FOR UPDATE` и фиксирует private in-flight token до network. Блокировка строки БД не удерживается во время HTTP. Два consumers одного permit допускают только одну операцию; для Content это одна bounded последовательность, а не один HTTP request.

`AsyncLocalStorage` передаёт уже потреблённый permit внутри операции, но не является источником разрешения: перед каждым transport request PostgreSQL проверяет circuit/token, pending request, category, failure flag и bound. Контекст CONTENT не авторизует Availability; Booking read context не авторизует Content или STATUS.

Content и Booking read могут одновременно иметь разные in-flight tokens и выполнять независимые control operations. Внутри одного circuit сохранена conservative serialization. PUBLIC request, совпавший по времени с контрольной операцией своего circuit, блокируется до network.

При неопределённом результате после crash/DB failure блокируется только соответствующий circuit. Для очистки stale token по-прежнему требуется восстановить DB и гарантированно остановить выполнявшиеся операции/instances; автоматическое снятие latch не добавлено. Такая ручная процедура относится к неопределённому crash outcome, **не к обычному startup/missing state**.

## Counters, UI, reliability и public search

Observations остаются в `system_events`, category=`hotelbeds_test_read`, с прежним безопасным набором metadata. Считаются фактические обращения к transport, а не локальные guard rejections, arm или inspect. Today — UTC calendar day, last24h — rolling 24h; breakdown status/content/availability/checkrate. Секреты, rateKey, raw responses, PII и payment data не сохраняются этим механизмом.

**Observed app requests != official Hotelbeds quota.** Счётчик отражает зафиксированные наблюдения приложения. Неопределённый outcome при crash/write failure может не иметь observation; latch предотвращает дальнейшие обращения соответствующего типа.

Admin показывает две отдельные панели с state, last success, last AUTH_ERROR и permit. Content panel позволяет выбрать configured scope; Booking read panel явно указывает Availability 3424. UNKNOWN_BLOCKED не сопровождается ложным текстом о 403. Общий summary: READY / PARTIAL / BLOCKED. TEST header больше не объявляет глобальную недоступность по process-local health. Content status обновляется локально после control.

Reliability сохраняет существующий lifecycle, но показывает конкретные Content и Booking read states как degradation. Content AUTH_BLOCKED при Booking read READY отображается как частичная доступность, не как доказательство отказа public Availability.

Search проверяет **Booking read** перед cache lookup. Content 403 не блокирует search и не запрещает прежний свежий cache по существующей policy. Booking read UNKNOWN_BLOCKED/AUTH_BLOCKED не выдаёт сохранённые offers как новую availability. Results различает unknown access, auth block и empty rates. PostgreSQL catalog browsing/planning работает независимо от circuit.

## Offline tests и регрессии

Команда из корня: `node backend/scripts/sprint3mRegression.cjs`. Каждая suite получает локальную временную DB-схему; HTTPS запрещён preload, provider transport заменён stubs. Данные удаляются вместе с fixture schema. Для legacy suites с предпосылкой работающего доступа runner явно задаёт READY **только в fixture**. Runtime default не изменяется. Ни одна legacy suite 3D–3L не удалена и не ослаблена.

`npm.cmd run test:sprint3m1` из backend запускает расширенную 3M/3M.1 suite. Прежние A–O сценарии адаптированы к исправленной category-scoped архитектуре и дополнены проверками missing state, cross-circuit independence, Content recovery, scope matching и независимой concurrency.

| Проверка | Результат |
|---|---|
| 3M / 3M.1 | PASS — 20 reported tests: 19 сценариев и parent |
| 3L | PASS — 2 |
| 3J | PASS — 2 |
| 3I | PASS — 3 |
| 3G | PASS — 9 |
| 3F | PASS — 2 |
| 3E | PASS — 16 |
| 3D | PASS — 24 |
| 3K / frontend acceptance | PASS — 2 |
| Новая frontend access-panel проверка | PASS — 1 |
| Backend syntax | PASS — 177 файлов |
| Frontend lint | PASS — 0 errors, 3 прежних warnings |
| Production build с TEST display flag | PASS |
| git diff --check | PASS |
| Secret scan | PASS — 306 файлов, findings=[] |

Доказательства zero-network: missing identities блокируют все четыре categories; Content 403 блокирует следующий Content, сохраняя Availability; Booking read 403 сохраняет Content; arm оставляет calls=0; wrong scope и cross-circuit context дают 0 calls; public search не consumes оба permits; повторный consumer не проходит к transport. Отдельно проверены Content calls=1/2/3 при соответствующей точке 403, DB rollback без recovery, отсутствие persistence до/после transport, TEST/LIVE isolation, UTC counters, secrets в persistence/API/logs и запреты mutations/payment.

Lint warnings остались в BookingsTable, NotificationsTable, RefundsTable (dependency `load`). Старые frontend acceptance tests печатают Vite websocket conflict на порту 24678, но проходят; новая panel test отключает HMR. Render/browser acceptance не выполнялся.

Secret checker сравнивает source/report files с локально настроенными secret values и ищет private-key blocks, не выводя значения. README.txt/docs исключены. Это ограниченная проверка, а не утверждение об исчерпывающем поиске любых секретов.

## Изменённые файлы относительно состояния после 3M

Новые:

- `backend/services/hotelbedsBookingReadControl.js`
- `frontend/tests/accessCircuits.test.mjs`
- этот отчёт.

Обновлены:

- `backend/services/hotelbedsTestAccess.js`
- `backend/integrations/hotelbeds/client.js`
- `backend/services/hotelbedsTestContent.js`
- `backend/services/hotelbedsLiveReadOnlyService.js`
- `backend/services/searchService.js`
- `backend/services/reliabilityMonitorService.js`
- `backend/routes/adminOperations.js`
- `backend/tests/hotelbedsAccess.test.js`
- `backend/scripts/sprint3mRegression.cjs`
- `backend/package.json`
- `frontend/src/components/admin/HotelbedsAccess.jsx`
- `frontend/src/components/admin/HotelbedsStatus.jsx`
- `frontend/src/components/admin/HotelbedsContentStatus.jsx`
- `frontend/src/pages/Results.jsx`
- `SPRINT_3M_TEST_REQUEST_BUDGET_REPORT.md` — пометка о заменённой архитектуре.

## Owner acceptance после отдельного решения о deployment

1. Выпустить guarded release на всех instances, сохранив отключённые booking/payment/schedulers. Новая migration/env-настройка не нужна. Смешанные старые instances не обеспечивают новую модель защиты.
2. Открыть только local access/catalog status. При отсутствии новых rows оба circuit должны быть UNKNOWN_BLOCKED с пустой auth history. SQL bootstrap больше не нужен.
3. Убедиться, что catalog/plans доступны, а обычные TEST provider operations блокируются до network.
4. После отдельного решения владельца выбрать configured Content scope с next batch, arm CONTENT, проверить отсутствие роста counters. Затем отдельным нажатием выполнить control import. Успех меняет только Content.
5. Отдельно arm AVAILABILITY_3424, проверить ZERO calls при arm. Отдельным нажатием выполнить один diagnostic read. Успех меняет только Booking read; actual 403 блокирует только его. Не повторять автоматически.
6. Проверить PARTIAL/READY states, last success, counters и сохранение остальных scopes/identity. Отсутствие тарифов не считать отсутствием auth recovery при валидном пустом Availability response.

Эти шаги здесь не выполнялись. Для rollback сначала остановить TEST traffic: предыдущая 3M release имеет признанные риски global circuit/initial READY. Не удалять каталог, observations или states и не менять migration 020.

## Safety

Никаких реальных Hotelbeds Content/Status/Availability/CheckRate/Booking/Cancellation/LIVE requests и payment calls. Все provider responses — offline fixtures. Booking/payment safety flags не изменены. Нет git add/commit/push/deploy, изменений Render environment/Secret Files. README.txt/docs не тронуты. Render PASS, quota exhaustion и точное время quota reset не заявляются.
