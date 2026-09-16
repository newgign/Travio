# Sprint 3O.1 — rate-aware local filtering

## Итог

CODE / OFFLINE: PASS. Render acceptance: NOT RUN.

Реализовано поверх незакоммиченного 3O, без отката. Начальный git status подтвердил сохранённые изменения 3O и прежние untracked README.txt/docs/отчёт 3N. Эти три прежних объекта не изменены.

Один hotel теперь содержит безопасные signed candidate offers из того же Availability response. Локальные board/room/price filters выбирают подходящий candidate вместо ложного исключения hotel по его default rate.

## Продолжение 2026-09-16

Первой командой выполнен `git status --short`, затем изучены tracked diff и новые файлы. До продолжения уже существовали все изменения 3O, candidate normalization/signing, совместные board/room/price predicates, alternate sorting, reset, передача selected candidate в Details и тесты 3O.1. Они сохранены.

В этом продолжении исправлен оставшийся cross-currency maxPrice: валюта бюджета выбирается детерминированно из полного исходного candidate set и одинаково используется фильтром и UI. Добавлены проверки mixed-currency filtering и Content=0. Allowlist теперь сохраняет массив числовых childrenAges (целые 0–17); добавлена проверка. Все обязательные suites и проверки запущены повторно, результаты ниже относятся к этому запуску.

## Backend representation и безопасность

Dedup identity остаётся `hotelbeds + configured environment + hotelCode`. В TEST search `normalizeHotelOffers` рассматривает каждый rate каждой комнаты, включая повторные hotel records, через прежний нормализатор. Это копии контейнеров, исходный response не изменяется. Сохраняются invalid-price, currency, packaging и AT_HOTEL ограничения.

Внутренний `candidateHotels` содержит нормализованные варианты, отсортированные прежним comparator. SearchService удаляет этот внутренний массив из display hotel и строит публичный `candidateOffers`. Для каждого:

1. `offerService.generateOffer` сохраняет конкретные stay/occupancy/rate поля.
2. `hotelbedsPublicCandidate` применяет явный allowlist.
3. `offerTokenService.sign` подписывает именно этот безопасный candidate.

Публичный candidate содержит hotel identity и presentation metadata, roomCode/original roomName, boardCode/boardName, rateType/rateClass, supplier TOTAL/currency, nights/guests, priceSource/priceBasis/observedAt, read-only flags и прежние offer identity fields. Безопасные hotel presentation поля включают image, nullable stars и прежние amenities/beach flags.

Arbitrary provider objects не копируются. Для обычных полей разрешены только primitive/null values; occupancy проецируется в rooms/adults/children, images — в строки, массив childrenAges — в целые возраста 0–17. Headers, credentials, API signature, certificate data, raw response, raw rates, вложенные candidate arrays отсутствуют. Тест проверяет исключение marker из произвольных и вложенных объектов, включая decoded signed token.

RateKey остаётся только в прежнем public/signed-offer identity contract; новый способ передачи ключа не добавлен. Он не вставляется в HTML/URL. JWT — подпись, не шифрование. Rate-specific cancellation/tax/comment objects не заимствуются у default rate и не добавляются в ограниченный candidate payload; прежний Details fallback сообщает об отсутствии детализации, не выдумывая условия.

Default верхнеуровневый hotel сохраняется для совместимости. `meta.total`/pagination считают hotels, а не candidates. LIVE candidate expansion не включается: используется TEST staging opt-in. Planner, circuits, persistence, migrations, counters и provider transport не изменены.

## Selection, filters, sorting

Backend candidate order: currency group, TOTAL ascending, normalized roomCode, boardCode, rateType, exact rateKey; original provider order — последний fallback при полном равенстве. Это прежние правила 3O, без business preference для питания/BOOKABLE/refundable.

Frontend не разбирает provider response и не реализует второй rate comparator. Он выбирает первый matching candidate из authoritative backend order:

- Без rate filters: первый, самый дешёвый валидный candidate внутри валютной группы.
- Board: точное равенство boardCode.
- Room: trim/collapse whitespace + case-insensitive substring по safe room text.
- Board + room: оба условия должны совпасть на одном candidate.
- Max TOTAL: применяется к цене того же matching candidate, а не к default hotel price.
- Stars/rating/beach: сначала проверяются на hotel; сами по себе candidate selection не меняют.

Примеры offline:

| Rates | Filters | Display |
|---|---|---|
| BB Standard 100; AI Standard 120 | нет | BB 100 |
| те же | AI | AI 120 |
| BB Standard 100; BB Superior 130 | Superior | Superior 130 |
| AI Standard; BB Superior | AI + Superior | hotel скрыт |
| AI Standard 120; AI Superior 150 | AI + Superior | 150 |
| BB 100; AI 120 | AI + max110 | hotel скрыт |
| те же | AI + max130 | AI 120 |

После selection применяется прежний `stableSortHotels` к текущим display candidates. Поэтому сортировка по цене при AI использует именно AI prices. Reset возвращает default candidate из неизменённого source set. Board options собираются по всем candidates, включая неизвестные codes, а не только по default offers.

Одна карточка на hotel, независимо от количества candidates. «Найдено N отелей» и «Показано M из N» сохраняют hotel semantics. Для старого response без candidateOffers сохранён fallback `[offer]`.

## Details identity

В Card поступает самостоятельный выбранный candidate, без смешивания его полей с default rate. Сортировка возвращает тот же candidate object. Прежняя navigation state передаёт этот объект и его token в Details; `selectedOfferSnapshot` проверяет его identity/stay/freshness.

Fixture AI / 120 EUR / Standard отображается одинаково в Card и Details, decoded token содержит тот же rateKey, roomCode, boardCode, price и currency. Fresh snapshot не вызывает resolver/Availability. Прежнее поведение устаревшего snapshot и прямой ссылки без snapshot не менялось.

## Bounds и mixed currency

Поиск остаётся одним Availability batch, максимум 20 hotelCodes, retries=0. Нет второго fetch, CheckRate, per-hotel request, polling или фонового обновления. Все candidates берутся из уже полученного response.

Нового per-hotel candidate cap нет: ни один валидный alternate rate не обрезается молча. Цена этого решения — размер JSON/token payload и память растут с количеством rates в исходном response; предел 20 hotels не является пределом количества rates. Модуль не сохраняет отдельный candidate cache и не выполняет запросы ради недостающего matching rate.

Mixed currencies сортируются отдельными детерминированными currency groups, затем численно внутри группы. 1 USD не объявляется дешевле 100 EUR. FX conversion нет. Валюта Max TOTAL — лексикографически первый валидный currency code из всех исходных candidates; UI показывает именно её. Она не меняется при локальных фильтрах/сортировках. При активном maxPrice candidates в других валютах исключаются; без maxPrice доступны все валютные группы. Проверены перестановка source set и alternate AI в USD при default BB в EUR. Per-night использует валюту текущего candidate. Legacy fixtures без currency сохраняют прежнее поведение; safe Hotelbeds candidates всегда имеют проверенную currency.

## Zero-extra-network evidence

Новый integration test использует реальный SearchService/provider normalization/signing с fixture catalog и Availability stub:

- Initial destination search: Availability=1, 3 requested hotels, 3 unique results.
- Все board/room/combined/maxPrice/star/sort/reset действия: Availability остаётся 1.
- Alternate Card/Details SSR: Availability остаётся 1.
- CheckRate=0 и Content=0 на всём сценарии; Content entrypoints заменены запрещающими stubs со счётчиком.
- `providerQuery` неизменен при presentation edits, то есть зависимость Results fetch effect прежняя.

Это offline SSR/function integration, не mounted browser/Render acceptance. Persistence gate в новом integration mocked; реальный persistent gate и zero-network blocked states проверяются сохранёнными регрессиями 3M/3M.1. HTTPS запрещён preload. Старые tests не удалены и не ослаблены.

## Проверки

| Проверка | Результат |
|---|---|
| 3O/3O.1 backend | PASS — 11 |
| 3O frontend | PASS — 7 |
| 3O.1 frontend/integration | PASS — 6 (5 сценариев + parent) |
| 3N backend/frontend | PASS — 8 / 4 |
| 3M/3M.1 backend/panel | PASS — 20 / 1 |
| 3L | PASS — 2 |
| 3K/frontend acceptance | PASS — 2 |
| 3J | PASS — 2 |
| 3I | PASS — 3 |
| 3G | PASS — 9 |
| 3F | PASS — 2 |
| 3E | PASS — 16 |
| 3D | PASS — 24 |
| Frontend lint | PASS — 0 errors, 3 прежних warnings |
| Production build, TEST display flag=true | PASS |
| Backend syntax | PASS — 183 файла |
| Secret scan | PASS — 323 файла, findings=[] |
| git diff --check | PASS |

Итого 97 backend + 20 frontend reported tests. Runner: `node backend/scripts/sprint3mRegression.cjs`. Backend alias: `npm.cmd run test:sprint3o1`. Frontend command: `node --test --test-force-exit tests/rateAwareFiltering.test.mjs tests/searchQuality.test.mjs tests/catalogPlanner.test.mjs tests/catalogSearchUx.test.mjs tests/resultsAcceptance.test.mjs tests/accessCircuits.test.mjs`.

Прежние warnings: hook dependency load в BookingsTable/NotificationsTable/RefundsTable; websocket port 24678 conflict в существующих SSR tests. Tests проходят. PostgreSQL regressions используют только local host и изолированные временные schemas.

Syntax/secret scan: `node backend/scripts/sprint3mVerify.cjs`; diff: `git -c core.safecrlf=false diff --check`. Scanner проверяет совпадения с локальными secret values и private-key blocks без вывода значений; README.txt/docs исключены. Это ограниченная проверка, не доказательство отсутствия всех возможных секретов.

## Изменения относительно 3O

Новые:

- `backend/services/hotelbedsPublicCandidate.js`
- `frontend/tests/rateAwareFiltering.test.mjs`
- Этот отчёт.

Обновлены:

- `backend/services/hotelbedsDisplayRates.js`
- `backend/sources/hotelbeds.js`
- `backend/services/searchService.js`
- `backend/tests/hotelbedsSearchQuality.test.js` — добавлены проверки, прежние сохранены.
- `backend/package.json`
- `frontend/src/utils/localOfferFilters.js`
- `frontend/src/pages/Results.jsx`
- `SPRINT_3O_SEARCH_QUALITY_REPORT.md` — ссылка на заменяющую модель фильтрации.

## Owner acceptance — не выполнялся

После отдельного review/deploy и решения владельца использовать provider: выполнить один TEST search; у hotel с несколькими boards/rooms выбрать alternate filter и сравнить цену/room/board в Card и Details. Проверить reset, combined mismatch и sorting; observed Availability counter не должен расти от локальных действий. Не создавать дополнительный CheckRate или Content request для проверки. Никаких новых migrations/env-настроек не требуется.

## Safety

NO real Hotelbeds network, CheckRate, extra Availability, booking/payment. NO git add/commit/push/deploy, Render env/Secret Files changes. README.txt/docs не изменены. Safety flags, category-scoped circuits, retries, planner и freshness guards не ослаблены. Observed requests != official Hotelbeds quota. Render PASS не заявляется.
