# SPRINT 3F — HOTELBEDS TEST PUBLIC SEARCH ACCEPTANCE

Дата: 13 сентября 2026. Работа поверх существующих 3E/3D/3C, без отката. Исходный git status показывал только untracked README.txt и docs/; они не изменялись.

**CODE / OFFLINE ACCEPTANCE: PASS. RENDER PUBLIC SEARCH ACCEPTANCE: NOT RUN.** Реальная доступность конкретного тарифа зависит от выбранных пользователем дат/гостей; наличие результатов не гарантируется кодом и не подделывается.

## Аудит и изменения

Home/Hero → SearchBar → /results query → Results → tourService.searchTours → GET /api/search → searchController → searchService → ProviderManager → Hotelbeds source → normalization → offerService/offerTokenService → TourCard → offerDetailsLink → TourDetails/GET offers.

Найден разрыв: Results не передавал hotelCodes, checkIn/checkOut, rooms/adults. Обычный country/city search без destinationCode зависел от Content-каталога. Каталог и scheduler не запускались.

- В существующей форме добавлен явный пункт **Hotelbeds TEST — отель 3424 (1 номер)**, только при VITE_HOTELBEDS_STAGING_TEST_ENABLED=true. Это отдельный выбор, а не fallback при ошибке country search.
- Новый backend stagingTestSearch разрешает marker stagingTestHotel=3424 только при server stagingTestAllowed=true и environment=test. Он выбирает ровно один hotel code, убирает несвязанную country/city/destination selection и использует пользовательские даты/гостей. В LIVE marker отклоняется. Обычный запрос без marker не меняется.
- Для этого режима: будущие календарно корректные даты, 1–14 ночей, 1 номер, 1–6 взрослых, 0–3 детей с целыми возрастами 0–17. Ограничения соответствуют существующей форме; multi-room не объявлен поддержанным и rooms != 1 отклоняется. В форме можно выбрать одну ночь.
- checkOut из query имеет приоритет над nights; при отсутствии вычисляется из пользовательского checkIn+nights. Постоянные probe dates и HOTELBEDS_TEST_PROBE_* не используются.
- Results теперь передаёт marker, hotelCodes, checkIn/checkOut, rooms/adults. Detail link сохраняет checkOut и rooms для refresh. Нормальные даты формы — departureDate + nights; explicit checkIn/checkOut поддерживаются URL/API.
- Карточки и detail явно показывают «Hotelbeds TEST», «Тестовая цена», provider=hotelbeds/environment=test, priceSource и observedAt. Существующие room/board/currency/price отображаются из нормализованного предложения. Cancellation и taxes сохранены; добавлен вывод известных структур fees (array либо fees.fees) с фактически переданными amount/currency/included. Неизвестные структуры не вычисляются и не сериализуются в UI.
- Существующие bookingDisabled, disabled detail buttons и PaymentStep сохранены. Backend createBooking и read-only transport блокируют mutation независимо от frontend.

## Данные и безопасность

Hotelbeds source остаётся единственным provider для production staging. Нет mock fallback, FX conversion, выдуманных скидок, тарифа или currency. Pricing Sprint 3A и строгий CheckRate identity не изменены. TEST offer подписывается с priceEnvironment=test и bookingDisabled=true. TEST/LIVE cache, history, catalog и offer validation не объединяются.

Public search не запускает CheckRate: для него остаётся отдельный существующий flow. Loading, empty, provider error обрабатываются Results; неподдерживаемые rates отбрасываются нормализацией. Существующая свежесть карточки — 15 минут; stale сохранённый offer не отображается как актуальная цена, detail выполняет refresh при необходимости. Raw provider payload, rateKey и credentials в UI не выводятся.

Поиск может записывать реальные TEST observations существующим historyService; это не LIVE history или hot deal. Background monitor/content sync не включались. В offline tests DB/catalog/history вызовы заменены adapter/stubs; staging DB не изменялась.

## Network evidence

Владелец сообщил подтверждённые Render TEST status/Availability HTTP 200, 1 hotel/8 rates, EUR/net и выключенные booking/payment/sales. Это входное evidence Sprint 3E, не результат новых действий Codex.

**В Sprint 3F Codex не выполнял Hotelbeds network вообще:** ни status, ни Availability, ни CheckRate, ни LIVE, ни Booking POST/cancellation. Payment intent/charge/refund не выполнялись. Content sync/crawling/monitor не запускались. Все provider responses в новых тестах — явно offline fixtures, не сохранённые public offers.

Новая форма и публичная выдача на Render ещё не проверялись: deployment запрещён заданием. Реальный успешный Render admin probe не доказывает прохождение полного пользовательского flow после этих изменений.

## Проверки

| Проверка | Результат |
|---|---|
| Sprint 3F | PASS — 2 сценария: policy/validation и полный search/sign/detail/error adapter flow |
| Sprint 3E regression | PASS — 16 tests |
| Sprint 3D regression | PASS — 24 tests |
| Sprint 3C regression | PASS — 15 tests, isolated local PostgreSQL/rollback |
| Pricing regressions | PASS — hotelbedsLive.test.js, priceHistory.test.js, sprint3a.test.js |
| Backend syntax | PASS — новые/изменённые backend JS |
| Frontend relevant lint | PASS |
| Frontend production build | PASS — с TEST display flag |
| git diff --check | PASS |
| Secret scan | PASS после устранения ложного marker срабатывания, описанного ниже |

Первый scan нашёл SERVER_SECRET_MARKER_IN_BUNDLE: причиной была статическая admin UI подпись имени LIVE secret variable из предыдущего спринта. Значения credentials не найдены. Подпись заменена на «LIVE secret», TEST/legacy source labels сохранены; scanner не ослаблялся. Последующий scan выполнен после пересборки. Проверка не является аудитом всей Git history.

Старый unrelated Sprint 2H failure в email source contract известен из предыдущих спринтов; в 3F не исправлялся и повторно не запускался. Tests не удалялись, dependencies не менялись.

## Owner Render acceptance

1. Review локальных изменений; отдельное решение владельца о commit/push/deploy. Эти действия Codex не выполнял.
2. Сохранить backend NODE_ENV=production, ACTIVE_PROVIDER=hotelbeds, HOTELBEDS_ENV=test, HOTELBEDS_ENABLED=true, HOTELBEDS_STAGING_TEST_ENABLED=true, HOTELBEDS_READ_ONLY=true. Существующие TEST credentials/mTLS paths оставить безопасно настроенными. Новых backend variables не требуется.
3. Сохранить HOTELBEDS_BOOKING_ENABLED=false, HOTELBEDS_LIVE_BOOKING_ENABLED=false, PRODUCTION_SALES_ENABLED=false, REAL_CHARGES_ENABLED=false, REAL_REFUNDS_ENABLED=false, PAYMENTS_MODE=disabled, PAYMENTS_PROVIDER=none, HOT_DEALS_MONITOR_ENABLED=false, HOTELBEDS_CONTENT_SYNC_ENABLED=false. ProductionGate не менять.
4. Frontend build: VITE_HOTELBEDS_STAGING_TEST_ENABLED=true; VITE_API_URL — существующий staging backend API URL. В этой сессии Render env не изменялись.
5. После будущего deployment открыть Home, выбрать «Hotelbeds TEST — отель 3424», будущую дату, одну ночь, двух взрослых, без детей. Нажать поиск один раз. Никакой страны для отеля не придумывается. Сначала оставить food/category без фильтра, чтобы не исключить доступный тариф.
6. Проверить Browser Network: GET /api/search содержит stagingTestHotel=3424, пользовательские departureDate/nights/people/rooms; backend выполняет Availability через TEST mTLS. Не использовать admin probe dates как public search dates.
7. Проверить реальную карточку/детали, EUR или иную фактически возвращённую currency, room/board/priceSource/observedAt, TEST labels, отсутствие скидок без LIVE evidence. Сверить checkIn/checkOut/occupancy; F5 results/detail и переход назад. При empty/error не объявлять PASS наличия цены.
8. Проверить смену дат/гостей и age при необходимости, учитывая Evaluation quota. Убедиться, что оформление отключено. Не нажимать/вызывать booking/payment APIs для подтверждения запрета: offline tests уже проверяют их блокировку.

Пример формы URL для контролируемого теста (дату выбирает владелец в будущем): `/results?provider=hotelbeds&stagingTestHotel=3424&departureDate=YYYY-MM-DD&nights=1&people=2&rooms=1&children=0`.

## Файлы

Изменены:

- backend/package.json
- backend/services/searchService.js
- frontend/src/components/SearchBar.jsx
- frontend/src/components/TourCard.jsx
- frontend/src/components/RateConditions.jsx
- frontend/src/components/admin/HotelbedsStatus.jsx
- frontend/src/pages/Results.jsx
- frontend/src/pages/TourDetails.jsx
- frontend/src/utils/hotTours.js

Созданы:

- backend/services/stagingTestSearch.js
- backend/tests/hotelbedsPublicSearch.test.js
- SPRINT_3F_HOTELBEDS_TEST_PUBLIC_SEARCH_REPORT.md

Итог: локальная кодовая подготовка завершена; фактический Render public search acceptance остаётся владельцу. Git add/commit/push/deployment не выполнялись. Реальные env/certs, migrations, README.txt и docs/ не изменены.
