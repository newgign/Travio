# SPRINT 3I — HOTELBEDS TEST MULTI-DESTINATION CATALOG + SEARCH UX

14 сентября 2026, develop. **CODE / OFFLINE ACCEPTANCE: PASS. Render multi-destination acceptance: NOT RUN.**

Начальный git status: только untracked README.txt и docs/. Они не изменены. Входное подтверждение владельца: Render CEN, 10 Content hotels, 8 реальных Availability offers, изображения и отключённые booking/payment. Эти сведения не являются новым network evidence Codex.

## Аудит и архитектура

Сохранены existing ContentClient, bounded TEST importer, provider_destinations/provider_hotels с identity migration 020, server environment isolation и существующий signed offer/detail flow. Новая schema/migration не нужна.

До изменений importer читал одну COUNTRY/DESTINATION пару и общие FROM/COUNT; admin принимал пустой body. `/api/catalog/test-options` отдавал локальные страны/направления без per-destination counts. SearchBar уже разделял страны и направления по данным этого endpoint, но не отключал пустые направления. Results title уже получает имя выбранного направления из локального каталога. Эти части 3G/3G.1 сохранены.

```text
Server allowlist -> admin selects scopeId -> guarded bounded importer
  -> 1 destination metadata page + 1 hotel page -> additive TEST upserts

Local PostgreSQL -> catalog options/counts -> country -> destination
  -> validated destination hotel codes -> existing TEST mTLS Availability
  -> matching Content metadata + real rates -> signed offer -> Details
```

Dropdown/status читают только PostgreSQL. Public search и Details не запускают Content. Никакого общего импорта всех настроенных scopes или scheduler.

## Multi-scope format

Новая server variable:

```ini
HOTELBEDS_TEST_CONTENT_SCOPES=PT:CEN
```

Формат: comma-separated `COUNTRY:DESTINATION`, максимум 5 уникальных destination codes; uppercase, country — 2 буквы, destination — 2–10 букв/цифр. Дубликаты и некорректный список блокируют конфигурацию целиком. Один destination code нельзя одновременно привязать к двум странам: это соответствует существующей provider destination identity.

Непустой SCOPES имеет приоритет над прежней одиночной парой. При отсутствующем/пустом SCOPES сохраняется legacy COUNTRY/DESTINATION. FROM и COUNT остаются общими для scopes и задаются только сервером. Admin отправляет только `{ "scopeId": "PT:CEN" }`. Country/destination/url/другие поля не принимаются; даже строковый scopeId должен точно присутствовать в текущем allowlist. При нескольких scopes пустой body блокируется. Для одного scope прежний пустой body остаётся совместимым.

Admin labels используют локальное имя направления, если оно уже импортировано; иначе показывают только настроенные provider codes. Названия новых направлений не угадываются.

## Hard limits

| Ограничение | Значение |
|---|---|
| Настроенных scopes | Максимум 5 |
| Выбрано за manual run | Ровно 1 |
| Content GET requests | Максимум 2 |
| Destination metadata | Одна country page 1–100; без следующих страниц |
| Hotel page | Одна, FROM 1–100, COUNT 1–20; default COUNT=1 |
| Hotels per selected destination per run | Максимум 20 |
| Retries / interval / timeout | 0 / 1000 ms / 12000 ms |
| Cooldown | Общий 60 секунд; PostgreSQL timestamp + advisory lock 319030 |
| Public destination search | Максимум 20 hotel codes, один Availability batch, retries=0 |

Повторные ручные страницы не обходятся автоматически. Если накопленный каталог направления превышает лимит поиска, действует прежний controlled TEST_SEARCH_LIMIT; автоматический поиск всех страниц не начинается. Лимитер координирует instances с общей БД, не разные независимые БД.

## Preservation / isolation / найденные дефекты

- Импорт второго scope не удаляет прежние строки. Upsert остаётся idempotent по provider/environment/hotelCode. Добавлена проверка существующих hotel/destination identity внутри транзакции: попытка перенести известный TEST hotelCode в другую страну/направление откатывает импорт. LIVE строки не участвуют в этой проверке и не изменяются.
- Поиск направления теперь имеет приоритет над присланными вместе с ним explicit hotelCodes. CountryCode добавлен в SQL lookup. Diagnostic 3424 исключён из обычной destination selection и используется только отдельным явно выбранным diagnostic path. Сам standalone explicit-hotel path сохранён для прежних flows.
- Availability response публикует только запрошенные TEST hotel codes; посторонний отель в offline response отбрасывается.
- Details выбирает из Availability именно запрошенный hotelCode вместо первого hotel response. Static lookup остаётся provider + environment + hotelCode; прежняя защита от чужой Content-строки и safe image placeholder сохранены.
- Обнаружено, что текстовый room filter раньше сравнивался только с room code. Для staging TEST добавлено case-insensitive совпадение по реальному room name; exact roomCode и CheckRate identity не ослаблены. Цена выбирается из реально подходящего rate. Non-TEST поведение room filter сохранено.

Pricing 3A, валюты, rate data, taxes/cancellation, signed-offer schema, mTLS, credentials, productionGate, payment/booking gates не менялись. Новые рейтинг, board, category, цены или картинки не создавались.

## Counts / SearchBar / admin

Repository возвращает hotel_count для направления с совпадением provider, environment, destination и country. Catalog API выдаёт только safe code/name/country/count fields, а также countriesCount/destinationsCount/hotelsCount. Admin сохраняет общие counts и показывает hotels per destination.

В TEST SearchBar получает список из локального catalog endpoint; несколько направлений одной страны остаются отдельными options. Направление с нулём hotels disabled и подписано «отели пока не загружены»; submit также проверяет наличие hotels. Diagnostic 3424 сохранён отдельно. Исторические non-TEST country choices не изменялись и не используются как TEST catalog evidence.

Admin selection ограничена allowlist. Импорт выполняется кнопкой «Импортировать выбранное направление». История last import остаётся общей для импортера, не отдельным dashboard каждой страны; счётчики получаются из БД. Scope id сохраняется в безопасном result details. Для отсутствующего локального имени admin показывает код.

## Tests

| Проверка | Результат |
|---|---|
| Sprint 3I | PASS — 3 tests с комплексными scenarios, 0 failed/skipped |
| Sprint 3G / image identity | PASS — 8 tests |
| Sprint 3F / diagnostic 3424 | PASS — 2 tests |
| Sprint 3E | PASS — 16 tests |
| Sprint 3D / pricing and safety | PASS — 24 tests |
| Sprint 3C | PASS — 15 tests, isolated local PostgreSQL rollback |
| Sprint 3A / priceHistory | PASS |
| Frontend acceptance | PASS — существующий тест nights 1/3/7, title/image/CTA |
| Relevant lint / production build | PASS, build с TEST display flag |
| Backend syntax / git diff --check | PASS |
| Secret scan | PASS, findings [] |
| Отдельная Sprint 3H suite | NOT RUN — команда/файл 3H не обнаружены в текущем repository |
| Render multi-destination acceptance | NOT RUN |

3I проверяет allowlist/legacy format/limits, HTTP rejection произвольного scope и лишних полей, counts без raw_data, реальные SQL upserts двух стран/трёх направлений, повторный CEN import, пустое направление, TEST/LIVE coexistence и rollback конфликтующего импорта. Fixture codes ALT/OTH — только offline data, не owner рекомендации и не настоящие импортированные направления.

Полный search test проверяет priceAsc/priceDesc, BB board, category, Superior room text, nights, подписанный TEST offer, Details с посторонним первым hotel в response, cross-destination isolation, сохранение diagnostic 3424 и bookingDisabled. Content/provider/payment methods в поисковых tests заблокированы stubs. SQL fixture использует outer rollback и savepoints вместо настоящего COMMIT импортера; рабочая БД не менялась. Существующие tests не удалялись. Известный unrelated Sprint 2H failure не исправлялся и не перезапускался.

## Network / safety

**Codex не выполнял реальные Hotelbeds Content, Availability, status, CheckRate или LIVE requests.** Booking POST, cancellation, payment/charge/refund не выполнялись. Network в tests — только локальный HTTP loopback; Hotelbeds responses — явно offline fixtures. Новые provider цены и изображения на Render этим спринтом не подтверждались.

Git add/commit/push, deployment, изменения Render env и Secret Files не выполнялись. README.txt/docs/ не затронуты. Secrets не выводились; scan не является аудитом всей Git history.

## Owner Actions / добавление одного следующего направления

1. Review кода и отчёта. Отдельное решение владельца о commit/push/deployment. Миграций в 3I нет; существующая 020 должна оставаться применённой.
2. Для сохранения текущего CEN можно сначала задать `HOTELBEDS_TEST_CONTENT_SCOPES=PT:CEN`. Текущие FROM/COUNT можно оставить, например подтверждённый владельцем COUNT=10. Нового импорта CEN ради включения dropdown не требуется.
3. Для добавления направления подтвердить его настоящие HBX country/destination codes вне этого coding task. Добавить ровно одну пару в allowlist: `PT:CEN,<COUNTRY>:<DESTINATION>`, заменив placeholders реальными кодами; не копировать offline ALT/OTH fixtures.
4. Перед первым импортом нового scope поставить server COUNT=1, FROM=1. Эти общие значения применяются к выбранному scope, но не изменяют уже сохранённый CEN catalog. В Render настройки и их применение выполняет владелец отдельным действием.
5. Сохранить NODE_ENV=production, ACTIVE_PROVIDER=hotelbeds, HOTELBEDS_ENV=test, HOTELBEDS_ENABLED=true, HOTELBEDS_STAGING_TEST_ENABLED=true, HOTELBEDS_READ_ONLY=true, HOTELBEDS_READ_RETRIES=0. Credentials/mTLS оставить прежними.
6. Сохранить HOTELBEDS_BOOKING_ENABLED=false, HOTELBEDS_LIVE_BOOKING_ENABLED=false, PRODUCTION_SALES_ENABLED=false, REAL_CHARGES_ENABLED=false, REAL_REFUNDS_ENABLED=false, PAYMENTS_MODE=disabled, PAYMENTS_PROVIDER=none, HOT_DEALS_MONITOR_ENABLED=false, HOTELBEDS_CONTENT_SYNC_ENABLED=false. Frontend: существующие TEST display flag и staging API URL.
7. После отдельно разрешённого deployment открыть admin Content, выбрать **новый** разрешённый scope и нажать импорт один раз. Максимум два Content GET; если направление не в первой metadata page, остановиться, не включать crawler.
8. Проверить last import result и per-destination counts: CEN должен остаться прежним. Если PASS с одним новым hotel — открыть Home, выбрать страну/направление, пользовательские будущие даты/гостей и выполнить один ручной поиск с учётом quota. EMPTY/FAIL фиксировать честно.
9. Проверить destination title, hotel identity/image, actual price/currency, сортировки и Details. Бронирование/оплата остаются отключёнными. Расширять COUNT до 20 только сознательным отдельным действием; приложение не обходит список scopes автоматически.

## Rollback

Вернуть allowlist к `PT:CEN` либо очистить SCOPES и оставить прежнюю COUNTRY=PT/DESTINATION=CEN пару. Это убирает scopes из **import allowlist**, но не удаляет каталог и не скрывает уже импортированные направления из public search. Чтобы остановить TEST search целиком, владелец может отдельно выключить HOTELBEDS_ENABLED. Для блокировки всех импортов необходимо очистить и SCOPES, и legacy COUNTRY/DESTINATION.

UI/backend changes совместимы с существующей 020; новые таблицы отсутствуют. Данные не удалять, старую environment identity migration не откатывать. При откате приложения учитывать прежние проблемы cross-destination selection/Details, исправленные в этом спринте. ProductionGate, scheduler и booking/payment flags оставить безопасными.

## Файлы

Изменены:

- backend/.env.example
- backend/package.json
- backend/repositories/providerCatalogRepository.js
- backend/routes/adminOperations.js
- backend/routes/catalog.js
- backend/services/filterService.js
- backend/services/hotelbedsTestContent.js
- backend/services/hotelbedsTestDestination.js
- backend/sources/hotelbeds.js
- frontend/src/components/SearchBar.jsx
- frontend/src/components/admin/HotelbedsContentStatus.jsx

Созданы:

- backend/tests/hotelbedsMultiDestination.test.js
- SPRINT_3I_HOTELBEDS_TEST_MULTI_DESTINATION_REPORT.md

**Готово к review и отдельному Render acceptance владельца. Render multi-destination PASS не заявляется.**
