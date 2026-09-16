# Sprint 3O — Hotelbeds TEST search quality, deduplication и display-rate ranking

> Дополнение Sprint 3O.1: ограничение фильтрации только default rate устранено. Актуальная candidate/filter модель описана в `SPRINT_3O_1_RATE_AWARE_FILTERING_REPORT.md`; ниже сохранён отчёт исходного 3O.

## Результат

CODE / OFFLINE: PASS. Sprint 3O Render acceptance: NOT RUN.

База: HEAD `a3126ef`. Начальный `git status --short`: только существующие untracked `README.txt`, `docs/` и отчёт Sprint 3N. Они не изменены. Сообщённый владельцем Render acceptance 3M/3M.1/3N принят как контекст. Примерные counts владельца не используются в коде.

## Архитектура до / после

До: один hotel object нормализовался в один offer, но повторный hotelCode в Availability создавал повторный result. Выбор тарифа сортировал только по цене, поэтому равные цены зависели от порядка response. Card/Details отдельно отображали питание и цену; общей модели per-night не было.

После: backend `hotelbedsDisplayRates` выбирает тариф детерминированно и объединяет нормализованные результаты одного hotel identity. И destination search, и существующий single-hotel resolver используют этот модуль. Все candidates рассматриваются в памяти; дополнительных provider calls для выбора нет. Frontend получает один authoritative selected offer на hotel и выполняет только presentation sorting/filtering.

`hotelOfferDisplay` содержит общие board/room labels, per-night arithmetic и stable sorting. `StayPrice` используется Card и Details. `selectedOfferSnapshot` проверяет идентичность отеля, свежесть и параметры проживания перед использованием исходного выбранного offer.

Не менялись Content importer, catalog repositories, category-scoped circuits, observed counters, planner, migration/schema, cache TTL и transport retries. Существующие PostgreSQL TEST scope selection и предел 20 hotelCodes сохранены.

## Hotel identity и ranking

Dedup key: `provider=hotelbeds + configured environment + String(providerHotelId/hotelCode)`. Имя, фотография и адрес не участвуют. Разные hotelCode с одинаковыми именами остаются разными отелями. Для каждой повторной записи сначала рассматриваются все её допустимые rates; затем выбирается лучший результат среди записей того же identity. Это даёт тот же минимум по всем допустимым rates без слияния или изменения provider objects.

Правила выбора:

1. Существующая safe policy: исключены packaging, AT_HOTEL, отсутствие rateKey и невалидная цена/валюта. Сохраняются прежние явно переданные room/board constraints resolver. Обычный TEST Results не передаёт локальные фильтры в provider search.
2. Денежный источник выбирается существующим `pricing.extract`: sellingRate, если присутствует; иначе net, с прежними правилами mandatory/commission. Добавлена проверка типа/decimal string: boolean, arrays, objects, пустые и malformed значения не становятся ценой.
3. Для одной валюты — минимальная валидная TOTAL price. Невалидный первый rate не исключает hotel, если следующий валиден. Без безопасной цены hotel не возвращается.
4. При одинаковой цене: roomCode, boardCode, rateType, затем точный rateKey. Первые три поля сравниваются после trim/uppercase только в comparator; исходные поля не меняются. Сравнение лексикографическое, без предпочтения BOOKABLE, питания или refundable.
5. Исходный provider index используется только последним fallback при равенстве всех перечисленных значений. При полном совпадении между повторными hotel records сохраняется первый эквивалентный результат.

Для разных валют суммы не объявляются сопоставимыми: используется стабильная группировка по currency code, затем цена внутри валюты. Конвертации нет; это не утверждение о самом дешёвом эквиваленте в другой валюте.

RateKey используется внутри comparator и прежнего offer/token design, никогда не добавляется в подпись, HTML или browser URL. Исходный API уже содержит rate identity и подписывает compact offer; Sprint 3O не меняет этот security contract и не выдаёт его за шифрование. Raw rates не добавлены в публичный response.

Сохраняются выбранные rateKey, providerHotelId, roomCode, original roomName, boardCode, boardName, rateType, currency, monetary source и signed offer. Отсутствующий rateType при Availability normalization больше не подменяется выдуманным BOOKABLE. Source response не мутируется — проверено frozen fixtures.

## Total, per-night и presentation

Главная цена — выбранный supplier TOTAL за проживание. Per-night = total / nights только при валидной положительной цене, известной currency и целочисленном nights >= 1. Source/stored price не округляется. Display использует существующий locale formatter; для EUR — два знака после запятой.

Примеры fixtures:

- 75.74 EUR, 1 ночь: `75,74 €`, `за 1 ночь`.
- 1242.02 EUR, 7 ночей: TOTAL `1 242,02 €`, вторичная цена `177,43 € / ночь`, `за 7 ночей`.
- Null/undefined/NaN/неизвестная валюта не отображаются как 0 €.

Сохраняются Hotelbeds TEST badge, «Тестовая цена», source/observedAt и отдельное сообщение об отключённом бронировании. BOOKABLE остаётся типом provider rate; он не включает CTA. Card booking button disabled; Details сохраняет disabled booking button.

Board dictionary: RO — Без питания, BB — Завтрак, HB — Полупансион, FB — Полный пансион, AI — Всё включено. Неизвестный code использует provider board name, затем сам code. Original boardCode не переписывается. Filter options строятся из выбранных offers, включая неизвестные codes; фильтрация сравнивает именно code, а не перевод.

Room presentation только trim/collapse whitespace; case-insensitive room filtering использует тот же текст. Original roomName/roomCode остаются в offer. Перевода или изменения supplier naming нет.

Stars берутся из локального Content: только целые 1–5, иначе null. Отсутствующая категория не выводится как 0 stars и не восстанавливается из guest rating/произвольной цифры category text. Card и Details показывают «Категория не указана». Guest rating остаётся отдельным полем.

## Сортировки, фильтры и counts

TEST локальные сортировки: TOTAL ascending/descending, per-night ascending, stars descending, name A–Z; прежний guest-rating вариант сохранён. Tie-break: hotelName, hotelCode, затем provider/environment. Nullable values помещаются после известных. Source array не мутируется.

Сохраняются stars, boardCode, room text, max TOTAL price и прежние beach filters. Цена подписана «Цена за весь период — до». Необязательный max-per-night filter не добавлен. Фильтры применяются к выбранному самому дешёвому offer каждого hotel; они не ищут более дорогой альтернативный board/room rate и не инициируют fetch.

`meta.total` теперь считает нормализованные уникальные hotels. Results говорит «Найдено N отелей», «Показано M из N». Raw rate count не выдаётся за hotel count.

Пустые состояния остаются раздельными:

- Каталог направления пока не загружен.
- На выбранные даты доступных тарифов не найдено.
- Нет отелей, соответствующих выбранным фильтрам; reset восстанавливает локальный source set.
- Booking-read UNKNOWN_BLOCKED/AUTH_BLOCKED — прежние safe unavailable messages.

URL search identity, nights как search input и back/forward query handling сохранены. Sort/filters не меняют `providerQuery`, от которого зависит Results fetch effect. Изменения дат/направления/гостей по-прежнему являются новым поиском.

## Card / Details identity и freshness

Карточка передаёт исходный selected offer, включая прежний token, через navigation state. Details не выбирает другой rate и не выполняет provider request для свежего совпадающего snapshot. Общий helper проверяет provider/hotel ID, observedAt < 15 минут и заданные даты/ночи/гостей в URL; будущий timestamp не принимается.

Для устаревшего или несовпадающего переданного TEST snapshot Details требует новый поиск вместо автоматического получения подменного rate. Прямой URL без selected snapshot сохраняет существующий resolver flow: это не обещание восстановить прежний exact offer после потери navigation state. Если resolver получает тот же response, он использует ту же selection/dedup функцию, что Results. Этот случай тоже проверен offline.

Существующая freshness policy Card и Booking-read pre-cache gate сохранены. Новый код не добавляет background refresh, CheckRate, Content или повторный Availability. Content circuit не участвует в ranking уже полученного response. Изображения используют прежний Content image/локальный fallback; нового external fallback нет.

## Zero-extra-network evidence

Новый frontend integration test вызывает реальный `searchService` с fixture catalog и Availability stub. Один initial destination search: `availability=1`, два hotelCodes, два уникальных результата. Затем последовательно меняет sort, stars, board, room, maxPrice, выполняет локальную обработку и проверяет неизменный Results fetch dependency: `availability=1`, `checkrate=0`. Reset filters и SSR rendering Card/Details также не увеличивают счётчик.

Это offline SSR/function integration, не mounted browser/Render acceptance. Backend отдельно проверяет resolver против того же response, перестановки rates и duplicate records, signed identity, immutable inputs, предел 20 hotels и отказ на 21/retries>0.

3M/3M.1 регрессии подтверждают прежние zero-network blocking/circuit isolation; 3N — прежние planner zero-provider operations и persisted counters после bounded import. UI sorting/filtering не создаёт observations.

**Observed requests != official Hotelbeds quota.** Никаких quota remaining calculations или reset-time предположений.

## Tests / regression results

| Suite / check | Result |
|---|---|
| Sprint 3O backend | PASS — 9 |
| Sprint 3O frontend/integration | PASS — 7 (6 сценариев + parent) |
| Sprint 3N backend / frontend | PASS — 8 / 4 |
| Sprint 3M/3M.1 backend / panel | PASS — 20 / 1 |
| Sprint 3L | PASS — 2 |
| Sprint 3K/frontend acceptance | PASS — 2 |
| Sprint 3J | PASS — 2 |
| Sprint 3I | PASS — 3 |
| Sprint 3G | PASS — 9 |
| Sprint 3F | PASS — 2 |
| Sprint 3E | PASS — 16 |
| Sprint 3D | PASS — 24 (8 + 10 + 6) |
| Frontend lint | PASS — 0 errors, 3 прежних warnings |
| Production build, TEST display flag=true | PASS — 137 modules |
| Backend syntax | PASS — 182 файла |
| Secret scan | PASS — 320 файлов, findings=[] |
| git diff --check | PASS |

Итого: 95 backend + 14 frontend reported tests, все PASS. Существующие tests не удалены и не ослаблены.

Secret scanner сравнивает source/report files с локально настроенными secret values и ищет private-key blocks, не печатая значения. README.txt/docs исключены. Это ограниченная проверка, не доказательство отсутствия всех возможных видов секретов.

Команды:

- `node backend/scripts/sprint3mRegression.cjs` — runner расширен 3O; локальная PostgreSQL, изолированные временные schemas, HTTPS запрещён preload.
- Backend standalone: `npm.cmd run test:sprint3o`.
- Из frontend: `node --test --test-force-exit tests/searchQuality.test.mjs tests/catalogPlanner.test.mjs tests/catalogSearchUx.test.mjs tests/resultsAcceptance.test.mjs tests/accessCircuits.test.mjs`.
- `npm.cmd run lint`; `VITE_HOTELBEDS_STAGING_TEST_ENABLED=true` + `npm.cmd run build`.
- `node backend/scripts/sprint3mVerify.cjs`; `git -c core.safecrlf=false diff --check`.

Новый frontend integration использует fixture repository и mocked persistence gate; реальные DB не затрагивает. Сам persistent gate проверяется прежней PostgreSQL suite 3M.1. Все provider responses — fixtures/stubs.

Прежние lint warnings: dependency `load` в BookingsTable, NotificationsTable, RefundsTable. Существующие SSR tests печатают websocket port 24678 conflict; tests завершаются PASS. Первая новая standalone fixture имела неполные safety env defaults и возвращала environment=unknown; исправлена только fixture-конфигурация, финальный signing test подтверждает test.

## Изменённые файлы

Новые:

- `backend/services/hotelbedsDisplayRates.js`
- `backend/tests/fixtures/hotelbedsSearchQuality.js`
- `backend/tests/hotelbedsSearchQuality.test.js`
- `frontend/src/utils/hotelOfferDisplay.js`
- `frontend/src/utils/selectedOfferSnapshot.js`
- `frontend/src/components/StayPrice.jsx`
- `frontend/tests/searchQuality.test.mjs`
- Этот отчёт.

Обновлены:

- `backend/sources/hotelbeds.js`
- `backend/services/hotelbedsPriceService.js`
- `backend/package.json`
- `backend/scripts/sprint3mRegression.cjs`
- `frontend/src/utils/localOfferFilters.js`
- `frontend/src/components/ResultsFilters.jsx`
- `frontend/src/components/TourCard.jsx`
- `frontend/src/pages/Results.jsx`
- `frontend/src/pages/TourDetails.jsx`

## Owner Render acceptance — не выполнялся

1. После отдельного review/deploy сохранить все существующие TEST/read-only/booking/payment flags. Новые migrations/env/Secret Files не нужны.
2. После отдельного решения владельца выполнить один destination search на выбранные даты. Проверить unique hotel cards, totals, room/board, stars и TEST/booking-disabled labels. Числа каталога читать из реальной DB, не из примеров отчёта.
3. Зафиксировать observed Content/Availability counters. Менять sort, stars, board, room, max TOTAL; provider observations не должны увеличиваться. Проверить filter-empty и reset без нового поиска.
4. Открыть Details из свежей карточки: тот же total/currency, room, board, rateType; booking disabled; без дополнительного provider call. При устаревшем snapshot требуется явный новый поиск.
5. Отдельным явным поиском проверить 1 и 7 ночей, TOTAL как главную цену и per-night как вторичную. Не выполнять CheckRate/booking/payment ради acceptance.
6. Открыть/обновить/выбрать scope в planner: прежняя локальная работа без provider calls. Не запускать Content import для проверки 3O.

## Safety

NO real Hotelbeds Availability/Content/Status/CheckRate/Booking/Cancellation/LIVE requests. NO payment calls. Booking/payment flags, category circuits и retries не ослаблены. Нет git add/commit/push/deploy, Render env/Secret Files changes. README.txt/docs и прежний отчёт 3N не изменены. Sprint 3O Render PASS не заявляется.
