# Sprint 3P — Home UX redesign

CODE / OFFLINE: PASS. Sprint 3P Render acceptance: NOT RUN.

Owner acceptance 3O/3O.1/3O.2 принят как сообщённый владельцем контекст. Первой командой выполнен `git status --short`: только прежние untracked README.txt, docs/ и отчёт 3N. Эти объекты не изменялись.

## Audit и архитектура до/после

Изучены Home, общий SearchBar, HeroBanner, PopularDestinations/TestDestinationCards, CountrySection/DestinationOptions, Home/Hero/Collections/SearchBar/mobile CSS, HotTours, Advantages, FAQ, Footer, Navbar, Help routes, ScrollToSection, catalog/test-options, URL helper и frontend suites. Server validators подтверждают 1–6 adults, 0–3 children, ages 0–17, одну комнату, будущую дату и 1–14 nights.

До: Home использовал общий с Results SearchBar, отдельные country/destination, children, board/stars controls; раздельные catalog effects; 8 преимуществ; FAQ с обещанием оформления; пустой Hot Deals section.

После: Home имеет отдельные HomeSearch/GuestPanel и один общий catalog state для формы и карточек. Общий SearchBar Results и его diagnostic flow не изменены. Новые helpers выполняют только локальное изменение состояния и построение URL. Backend и 3O helpers не изменены.

Существующий hero.png сохранён. Eyebrow: «Найдите своё следующее путешествие». H1: «Найдите отель для следующего путешествия». Subtitle: «Сравнивайте доступные варианты, питание и цены в одном месте». Название бренда больше не дублируется гигантским H1.

## Форма и search identity

Desktop: **Куда | Дата заезда | Ночей | Гости | Найти отели**.

Единая белая surface, умеренная тень, согласованные labels/controls, заметная синяя CTA. Нет отдельных Home controls children/food/stars и нет check-out input. Results filters сохранены.

Куда — native select только из уже загруженных `/api/catalog/test-options` с hotelCount > 0. Label состоит из human destination + country; value — tuple countryCode/destinationCode. Пустые scopes не выбираются. Нет hardcoded search scopes, external geocoding или remote autocomplete. CountrySection с hardcoded links больше не монтируется на Home.

URL: `/results?provider=hotelbeds&checkIn=…&nights=…&adults=…&children=…&rooms=1&countryCode=…&destinationCode=…`, плюс childrenAges при наличии детей. Display labels не заменяют codes. Нет rateKey/token/secrets. Submit делает только существующий navigate в Results. CheckOut не отправляется из формы и вычисляется существующим backend из checkIn+nights; проверено реальным stagingTestSearch validator без transport.

При back/forward query заново инициализирует Home form через существующий pattern key=params.toString(). Поддерживаются прежние aliases country/departureDate/people при чтении URL.

Diagnostic 3424 не находится в обычном destination dropdown. Явный `/?stagingTestHotel=3424` при staging flag показывает отдельную TEST/diagnostic подпись, сохраняет underlying Results query и одну комнату. Существующий Results SearchBar/backend diagnostic flow и tests не изменены.

## Гости, даты, ночи и validation

Collapsed Guests: «2 взрослых» либо «2 взрослых · 1 ребёнок». Панель содержит adults/children counters; bounds 1–6 и 0–3. Кнопки всегда type=button и disabled на границах. Добавление ребёнка создаёт пустой age select, а не выдуманный возраст. Возраст каждого ребёнка обязателен, 0–17; 0 корректно сериализуется. Удаление ребёнка удаляет соответствующий последний age. Одна комната, нового room-count UX нет.

Дата — один date input с будущей минимальной датой. Submit повторно проверяет ISO date, календарную корректность и будущее относительно UTC, как существующий TEST contract. Ночи — явный select 1–14 с правильными формами «1 ночь», «2 ночи», «5 ночей». Нет значения 21, отвергаемого TEST validator.

Inline errors: отсутствующее/unavailable направление, некорректная дата, nights, guests и пропущенный/неверный возраст. alert() нет. Поля связаны с ошибками через aria-invalid/aria-describedby; первое ошибочное поле получает focus, при guest error открывается панель.

## Collections и содержание

Popular Destinations получает те же catalog rows, что форма. Counts не хардкодятся и не выводятся как маркетинговые числа. Сохранены локальные turkey/egypt/dubai/thailand assets и нейтральный CSS fallback для Centre Portugal/неизвестных image identities. No external image fallback.

Пять карточек на широком desktop занимают один сбалансированный ряд. На меньшей ширине flex-wrap + justify-content:center центрирует неполную последнюю строку. Единый aspect ratio 3:4, на mobile 4:3. Loading — пять skeleton placeholders соответствующего размера; error/empty — аккуратные сообщения. Unavailable card остаётся явно disabled, не ссылкой.

Hot Deals при пустых/unconfirmed данных, loading или ошибке не renderится. Существующий local `/special-offers` читает сохранённую price history, не вызывает provider; frontend получает его один раз при mount, прежний polling убран. Только реальные LIVE offers с существующим price_history discount evidence могут отобразиться. Не создаются fake offers/oldPrice/discounts. Подтверждённая offline fixture проверяет сохранение непустого section.

Четыре преимущества:

1. Удобный поиск — «Выбирайте направление, даты, ночи и состав гостей.»
2. Понятные цены — «Сразу видите стоимость проживания за весь период.»
3. Гибкие фильтры — «Сравнивайте категорию, питание, номер и бюджет.»
4. Все детали в одном месте — «Просматривайте номер, питание, даты и условия выбранного варианта.»

Иконки — четыре декоративных Feather SVG из уже установленного react-icons, без новой dependency. Нет преимуществ про активные продажи/оплату.

FAQ: «Как работает поиск?», «Что означает тестовая цена?», «Почему цена может измениться?», «Что входит в стоимость?». Ответы описывают TEST, отключённое бронирование/оплату, будущую повторную проверку цены, номер/питание/ночи/гостей и отсутствие перелёта. Accordion остаётся button + aria-expanded + aria-controls; закрытые ответы hidden, panels связаны с headings через aria-labelledby.

## Header/footer audit

Все Footer targets существуют: /, /results, /favorites, /my-bookings, /#faq, /help/booking, /help/cancellation, /help/privacy. Существующие Help pages и contacts сохранены; новых legal pages/контактов нет. Footer description теперь про поиск, «Туры» переименованы в «Отели».

Logo/auth/favorites/profile/logout/admin visibility не изменены. Единственное изменение Navbar: ссылка «Акции» на отсутствующий при пустых offers section заменена на «Поиск» /#home-search. Старый /#countries anchor поддержан в catalog-driven popular block.

## Responsive и accessibility

Desktop form: 5 columns. Tablet ≤1100px: 2 columns + full-width CTA. Mobile ≤600px: 1 column; guest panel становится частью потока, без наложения на viewport. Hero получает меньшие padding/type sizes вместо fixed desktop min-height. Benefits: 4/2/1 columns; Footer stacked на mobile; FAQ full-width в контейнере.

Все controls имеют label/id/name. Guest buttons имеют accessible names; Escape/Готово закрывают панель и возвращают focus на trigger. Native select и destination links keyboard-accessible. Visible focus сохранён. Errors имеют текст, а не только цвет. Decorative SVG aria-hidden. Skeleton имеет status label и поддерживает reduced motion.

Viewport verification — SSR markup + CSS breakpoint/layout contracts для desktop/tablet/mobile, не real-browser screenshots. Точные визуальные размеры, native date/select поведение и focus traversal остаются owner browser acceptance; heavyweight browser dependency не добавлена.

## Zero-provider-network evidence

Home catalog effect вызывает только local catalog endpoint и передаёт результат обоим компонентам. Home controls и helpers не выполняют fetch. HotTours читает только local saved specials. Нет Availability preview, Content/status/CheckRate, provider prefetch/retry.

3P test подменяет global fetch запрещающим stub; SSR, guest callbacks и field/URL helper sequence дают 0 unexpected network calls. Отдельно loadHomeCatalog проверяется с request stub: ровно один вызов /catalog/test-options, изменения fields не увеличивают счётчик. Это function/SSR evidence, не mounted browser measurement. Сохранённые 3O integrations подтверждают обычный Results search: Availability=1, CheckRate=0, Content=0 после filters/Details.

## Tests и regressions

| Проверка | Итог |
|---|---|
| Sprint 3P frontend | PASS — 9 reported tests (8 сценариев + parent) |
| 3O frontend | PASS — 7 |
| 3O.1/3O.2 frontend | PASS — 7 |
| 3N frontend | PASS — 4 |
| 3M.1 panel | PASS — 1 |
| 3K/catalog + Results acceptance | PASS — 2 |
| Все frontend suites | PASS — 30 |
| Backend 3O/3O.1/3O.2 | PASS — 14 |
| Backend 3M/3M.1 | PASS — 21 |
| Backend 3N | PASS — 8 |
| Backend 3L/3J/3I/3G/3F/3E/3D | PASS — 2/2/3/9/2/16/24 |
| Полный backend runner | PASS — 101 |
| Frontend lint | PASS — 0 errors, 3 прежних warnings |
| Production build, TEST flag=true | PASS — 138 modules |
| Backend syntax | PASS — 183 файла |
| Secret scan | PASS — 331 файл, findings=[] |
| git diff --check | PASS |

Syntax/secret scan: `node backend/scripts/sprint3mVerify.cjs`; diff: `git -c core.safecrlf=false diff --check`. Scanner проверяет локальные secret values и private-key blocks без вывода значений, исключает README.txt/docs. Это ограниченная проверка, не доказательство отсутствия любых секретов. Финальный diff отдельно подтвердил отсутствие изменений backend, общего SearchBar, localOfferFilters, selectedOfferSnapshot и TourDetails.

Существующие tests не удалены и не ослаблены. Финальный frontend запуск последовательный (--test-concurrency=1), чтобы избежать конкуренции старых Vite suites за dependency cache/порт. Первый параллельный запуск дал все PASS, но Vite сообщил cache rename ENOENT и прежние websocket warnings. Повторный последовательный запуск чистый. Первый lint нашёл Date.now в render; minimumDate перенесён в lazy state initializer, финальный lint PASS. Три прежних warnings — dependency load в admin BookingsTable/NotificationsTable/RefundsTable.

Команды:

- Из frontend: `node --test --test-concurrency=1 --test-force-exit tests/homeUx.test.mjs tests/rateAwareFiltering.test.mjs tests/searchQuality.test.mjs tests/catalogPlanner.test.mjs tests/catalogSearchUx.test.mjs tests/resultsAcceptance.test.mjs tests/accessCircuits.test.mjs`.
- `node backend/scripts/sprint3mRegression.cjs` — local PostgreSQL, isolated schemas, offline HTTPS preload.
- Из frontend: `npm.cmd run lint`; `npm.cmd run build` с процессным VITE_HOTELBEDS_STAGING_TEST_ENABLED=true.

Build JS 487.01 kB / 133.37 kB gzip; CSS 105.00 kB / 18.87 kB gzip. Относительно предыдущего 3O.2 build JS примерно +8.03 kB / +1.77 kB gzip. Новых packages, fonts, images, animation/carousel libraries нет.

## Изменённые файлы

Новые: `frontend/src/components/HomeSearch.jsx`, `HomeSearch.css`, `GuestPanel.jsx`, `HotToursSection.jsx`; `frontend/src/services/homeCatalog.js`; `frontend/src/utils/homeSearch.js`; `frontend/tests/homeUx.test.mjs`; этот отчёт.

Обновлены: `frontend/src/pages/Home.jsx`; components `HeroBanner.jsx`, `PopularDestinations.jsx`, `HotTours.jsx`, `Advantages.jsx`, `FaqSection.jsx`, `Footer.jsx`, `Navbar.jsx`; styles `HeroBanner.css`, `Home.css`, `HomeCollections.css`.

## Safety

NO real Hotelbeds Availability/Content/Status/CheckRate/Booking/Cancellation/LIVE; NO payment calls. Backend/candidate compaction/rate-aware filters/selectedOfferSnapshot/Details/searchService/circuits/observations/planner/importer/migrations не менялись. Safety flags и booking/payment CTAs не активировались. NO git add/commit/push/deploy, Render env/Secret Files changes. README.txt/docs и старый untracked 3N report не затронуты.

## Owner Render acceptance — не выполнялся

1. После отдельного review/deploy проверить Home на desktop 1440, tablet 768–1024 и mobile 360–390: форма, Guests panel, карточки, FAQ, Footer; отсутствие horizontal overflow.
2. До submit открыть destination/guests, изменить дату/ночи/гостей: provider observations не должны расти. Catalog/specials — только local backend reads.
3. Проверить «Ночей» 1/7/14, child age 0/17 и missing-age error, adults/children bounds, Escape/Готово/Tab и клавиатурный submit. Checkout input отсутствует.
4. После отдельного разрешения владельца на TEST search выполнить обычный submit: корректные codes/dates/nights/guests в Results, один обычный Availability, без CheckRate/Content. Проверить back/forward.
5. Проверить catalog-only destinations и нейтральный Portugal fallback; empty Hot Deals скрыт; четыре benefits и TEST FAQ честно описывают продукт.
6. При необходимости проверить явный diagnostic URL и прежний 3424 flow; не создавать real booking/payment. Render PASS здесь не заявляется.
