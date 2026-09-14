# Sprint 3K — Search UX + catalog-driven Home

CODE / OFFLINE: PASS. Render acceptance: NOT RUN.

## До / после

В TEST Home прежние статические ссылки заменены карточками из локального `/api/catalog/test-options`. READY активен, EMPTY виден без ссылки с подписью «отели пока не загружены». Статический блок стран в TEST скрыт, чтобы не оставлять обходные ссылки без catalog identity. Non-TEST коллекции сохранены.

Карточка READY ведёт на Results с настоящими countryCode/destinationCode, без автоматически выбранных дат и сетевого поиска. Форма подхватывает выбранную страну/направление; даты и гостей выбирает пользователь.

Словарь UI переводит известные country codes и подписывает подтверждённые destination identities. Он не создаёт scopes, catalog rows или доступность. TH:HKT отображается как Таиланд / Phuket, оставаясь EMPTY. Имя из локального Content имеет приоритет. Коды URL/API не изменяются. Карточка отеля и location в Details отображают human country label без изменения offer.

AYT/SSH/DXB/HKT используют существующие локальные country/destination illustrations, не фотографии отелей. CEN и отсутствующее/сломанное изображение получают единый нейтральный фон. External image fetching не добавлен.

## Фильтры и счётчики

В Hotelbeds TEST display mode Results получает исходный нормализованный набор без presentation filters: page=1, limit=100 в пределах существующего server TEST destination bound 20 hotel codes. Никаких новых Availability batches не добавлено. Backend не менялся.

Stars/rating, boardCode, room text, maxPrice, beach filters и sort применяются к полученным предложениям. Изменение этих query-полей не меняет зависимость fetch effect и не запускает новый поиск. Исходные объекты/цены/offer tokens не мутируются. Board/room фильтруют только уже возвращённые предложения: другие тарифы отеля не запрашиваются и не выдумываются.

Ночи остаются параметром длительности проживания, а не локальным фильтром. Их изменение требует нового поиска; при явном изменении nights старый checkOut удаляется, чтобы backend вычислил новую дату выезда. Reset сохраняет nights, даты, гостей и destination. Чип ночей помечен как параметр поиска; съёмные чипы presentation filters сохранены.

- Пустой каталог: «Каталог направления пока не загружен» — прежний server guard до provider call.
- Пустой исходный набор: «На выбранные даты доступных тарифов не найдено».
- Непустой набор полностью исключён фильтрами: «Нет предложений, соответствующих выбранным фильтрам» и доступная кнопка «Сбросить фильтры».
- «Найдено N предложений» — нормализованные возвращённые предложения, не catalog hotels и не все raw rates. «Показано M из N» — результат локальных фильтров.

## Проверки

| Проверка | Результат |
|---|---|
| Frontend acceptance, включая новый 3K | PASS — 2 комплексных теста |
| 3J | PASS — 2 |
| 3I | PASS — 3 |
| 3G | PASS — 9 |
| 3F | PASS — 2 |
| 3E | PASS — 16 |
| 3D | PASS — 24 |
| Relevant frontend lint | PASS |
| Production build с TEST flag | PASS |
| Backend syntax существующих search/catalog файлов | PASS; backend не менялся |
| git diff --check | PASS |
| Secret scan tracked/dist + новые source/tests | PASS — 352 files, findings [] |

Frontend tests проверяют SSR READY/EMPTY cards/options, отсутствие неподтверждённых активных карточек, подписи и коды, фильтры/counts/reset, неизменность fetch query для stars/board/room/price/sort, сохранение offer объектов и query для nights 1/3/7/back sequence. Это offline evidence, не полноценный browser interaction или Render acceptance. 3J guards подтверждают ноль provider calls для пустого HKT.

## Изменённые файлы

- frontend/src/components/CountrySection.jsx
- frontend/src/components/DestinationOptions.jsx
- frontend/src/components/PopularDestinations.jsx
- frontend/src/components/ResultsFilters.jsx
- frontend/src/components/SearchBar.jsx
- frontend/src/components/TourCard.jsx
- frontend/src/pages/Results.jsx
- frontend/src/pages/TourDetails.jsx
- frontend/src/styles/HomeCollections.css
- frontend/src/utils/destinationTitle.js

Созданы:

- frontend/src/components/TestDestinationCards.jsx
- frontend/src/utils/localOfferFilters.js
- frontend/src/utils/testDestinationLabels.js
- frontend/tests/catalogSearchUx.test.mjs
- этот отчёт.

## Safety и Owner acceptance

Hotelbeds Content/Availability/status/CheckRate/LIVE network: NONE. Booking/cancellation/payment: NONE. Backend, importer, pricing, currency, taxes/cancellation, mTLS, credentials, signed offers и guards не изменены. Git add/commit/push/deploy и Render env changes не выполнялись. README.txt/docs/ остались нетронутыми untracked.

После отдельного решения владельца о deployment:

1. Сохранить существующий TEST display flag и backend safety flags; новых variables/migrations нет.
2. Проверить Home: только local catalog/scopes, human labels, HKT disabled, CEN нейтральное изображение, ссылки READY сохраняют identity и предлагают выбрать даты.
3. По отдельному сознательному решению о расходе quota выполнить один CEN search с пользовательскими датами. Зафиксировать число возвращённых нормализованных offers.
4. В Browser Network проверить: stars/board/room/price/sort/reset не вызывают новый `/api/search`; счётчики M/N меняются, исходные цены не меняются. Если фильтры исключили всё — проверить отдельное сообщение и reset.
5. F5 восстанавливает URL и делает обычный исходный поиск; back/forward между локальными фильтрами в смонтированной странице не делает новый provider search. Изменение дат/гостей/ночей требует нового поиска и расходует quota — проверять отдельно, осознанно.
6. HKT остаётся недоступен для поиска до импорта; прямой URL с валидными датами получает catalog-empty без Hotelbeds call. Import HKT и причину 403 здесь не проверять.

Для отката UI использовать совместимую предыдущую frontend версию по решению владельца. Catalog/schema/backend не менялись и не требуют отката или удаления данных.
