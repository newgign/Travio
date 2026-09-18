# Sprint 3S — Favorites + My Bookings UX Redesign

CODE / OFFLINE: PASS. Sprint 3S Render acceptance: NOT RUN.
Continuation audit: 19 сентября 2026 (Asia/Qyzylorda). Owner acceptance 3Q/3R: PASS по сообщению владельца; здесь повторно не проверялось.

1. **Initial continuation audit.** Первой командой выполнен `git status --short`, затем `git diff --stat` и `git diff`. На входе уже изменены шесть tracked файлов: Navbar, FavoritesContext, Favorites, MyBookings и два page CSS. Найдены восемь новых файлов 3S: три компонента, два service модуля, presentation helper, общий CSS и test suite. Отчёта 3S не было. README.txt, docs/ и прежний untracked 3N report уже существовали; не изменялись. AGENTS.md поиском в проекте не обнаружен. Проверены backend controllers, migrations, provider status handling, app services, новый код и тесты. TODO/merge markers в проверенных новых service/helper/card/test файлах не найдены.

2. **Что уже было сделано.** Обе страницы, responsive карточки, loading/error/auth/empty states, saved price wording, status mapping, disclosure, локальные filters/sort, защита от повторного удаления, session-owned store и новый suite уже присутствовали при возобновлении. Это фактическое состояние на входе, а не восстановление по памяти или подтверждение времени написания файлов.

3. **Что оставалось.** Не было финального отчёта и подтверждённых в этой сессии результатов обязательных проверок. Первичный прогон обнаружил рабочую реализацию: новый suite и прежние regressions прошли. Незавершённых production-фрагментов, требующих переписывания, не выявлено.

4. **Что завершено сейчас.** Проведены contract/diff audit и все указанные offline проверки. В существующем новом тесте общий provider counter заменён шестью явными счётчиками с assertion и diagnostic output. Production-реализация сохранена без изменений. Создан этот отчёт. Existing regression tests не редактировались и не ослаблялись.

5. **Favorites data contract.** `favoriteController.getFavorites` читает favorites только из БД текущего user_id, сортируя по created_at DESC. Ответ `{success:true,data:[...]}` разворачивает persisted hotel_data JSON и добавляет favoriteId, provider, providerHotelId, id, favoriteCreatedAt. Hotel_data создаётся прежним addFavorite через generateOffer; набор полей зависит от сохранённого snapshot. Upsert обновляет hotel_data, но не created_at, поэтому дата добавления не доказывает дату цены. GET и DELETE не вызывают provider. Существующий POST добавления может обращаться к provider; он не вызывается новой страницей Favorites и не включён в zero-provider обещание этого sprint.

6. **Bookings data contract.** `getMyBookings` использует SQL projection текущего пользователя: bookings b.*, сохранённый offer_snapshot/search_filters, people, booking_date, total_amount/currency, quoted_amount/quoted_currency, status/provider_status, confirmed_at/cancelled_at. Название/location/image берутся из snapshot с fallback на локальную tours table. Projection price может использовать payment amount или текущую tours.price — UI его не использует как сохранённую сумму. Currency projection имеет существующий fallback на snapshot и KZT; frontend не может отдельно определить происхождение этого fallback. Последний payment добавляет payment_status, gateway_provider, refund_status и другие поля; raw payment metadata/identifiers не показываются. booking_date — фактическое поле создания, не вымышленный createdAt.

7. **Favorites UX.** Заголовок «Избранное», подзаголовок «Сохранённые отели для будущих поездок», count с отель/отеля/отелей. Image использует HotelImage fallback, имя/location/category и room/board — только из сохранённых данных. «Посмотреть отель» ведёт на Home search form с allowlisted направлением; пояснение сообщает о новом поиске. Старые даты/цены/токены не передаются как fresh snapshot. Автоматический поиск/refresh не запускается. Это безопасный переход к поиску, а не exact-rate Details старого favorite.

8. **Saved price semantics.** «Последняя сохранённая цена», «Текущая стоимость может отличаться». Fixture с 420.91 EUR и observedAt 2020 года выводит 420,91 и не содержит «Актуальная цена». Нет повторного provider resolution. При неизвестной/невалидной сумме или currency цена скрыта.

9. **Remove/error/auth.** Собственный DELETE favorites/provider/hotelId; item удаляется из store только после успешного ответа. Pending, disabled и синхронный ref guard защищают double-click; store также объединяет одинаковые pending mutations. Ошибка сохраняет item и позволяет повторить действие; пользователю показывается нейтральный alert без внутреннего сообщения. AUTH_REQUIRED/401 ведёт на login. Store не применяет старые responses к новой сессии, защищает от resurrection удалённой строки поздним GET. Navbar скрывает count до получения достоверного списка. Прежний POST payload добавления сохранён.

10. **My Bookings UX.** «Мои бронирования», «Заявки и история поездок»; для набора только новых заявок — «Ваши заявки». Широкие cards показывают локальные persisted/projected hotel fields, даты, ночи, гостей, status, secondary ID и дату создания. Неизвестные даты/гости имеют нейтральный fallback. Нет выдуманного Hotelbeds confirmation, payment success или provider reference.

11. **Фактические статусы.** Локальные values подтверждены bookingController.allowedStatuses; provider values — booking/provider controllers и migrations. Для Hotelbeds непустой provider_status имеет приоритет, неизвестный outcome не маскируется локальным подтверждением. Каждый mapping проверен новым suite.

    | Value | Consumer label |
    | --- | --- |
    | Новая | На рассмотрении |
    | Подтверждена | Подтверждено |
    | Отменена | Отменено |
    | LOCAL_PENDING | Заявка создана |
    | CONFIRMING | Ожидает подтверждения |
    | CONFIRMATION_UNKNOWN | Требует сверки |
    | CONFIRMATION_FAILED | Не подтверждено |
    | RATE_EXPIRED | Тариф недоступен |
    | CONFIRMED | Подтверждено |
    | MODIFIED | Подтверждено с изменениями |
    | CANCELLED / CANCELED | Отменено |
    | Любой неизвестный | Статус неизвестен |

    Provider values нормализуются по регистру. PENDING/REFUNDED не добавлены как booking statuses. requested/refunded — отдельные payment.refund_status, не статусы бронирования.

12. **Amount/payment.** Используется total_amount с currency; fallback только quoted_amount/quoted_currency. Labels: «Сумма заявки», «Сумма бронирования» для подтверждённого статуса, либо «Сумма при создании заявки». Подпись прямо отделяет сумму записи от подтверждения оплаты; даже fixture payment_status=paid не выводит «Оплачено». TEST badge появляется только при mock provider, snapshot priceEnvironment=test, gateway_provider=sandbox или payment_status=test, а не для каждого Hotelbeds hotel. Sandbox refund имеет явное тестовое wording без движения денег.

13. **Actions/details.** Native закрытый disclosure «Детали»: сохранённые room/board, даты истории подтверждения/отмены, allowlisted refund label. Нет JSON.stringify(fullBooking), rateKey, offerToken, raw metadata, payment tokens или credentials. Прежние sync/cancel/simulation/voucher actions из MyBookings удалены уже до возобновления; новые pay/refund/retry/provider handlers не добавлены. Ссылка ведёт в search form. Backend endpoints и отдельная старая BookingDetails page не изменялись; эта работа не является аудитом всех маршрутов приложения.

14. **States.** Structured skeleton с role=status; отдельные ошибки загрузки с role=alert и «Повторить»; auth не становится empty. Empty тексты соответствуют заданию, «Найти отели» ведёт на /#home-search. Повторная загрузка использует только собственный API. MyBookings auth redirect сохраняет безопасный login flow.

15. **Responsive/filtering.** Favorites grid 3/2/1 columns, single column при ≤700px. Booking cards single column при ≤800px; mobile actions stack и disclosure facts single column при ≤600px. Общая ширина ≤1320px, minmax(0,1fr), min-width:0, overflow-wrap:anywhere. Уже существовавшие локальные фильтры показываются от 5 записей: Все/Активные/Отменённые/Другие статусы. Sorting booking_date DESC, невалидные даты в конце; исходный массив не мутируется. Filters/sort не загружают данные. Фактическая геометрия 360–390px и Navbar требует browser acceptance.

16. **Accessibility.** Семантические main/header/article/headings, buttons type=button, remove aria-label с именем отеля, текстовые статусы, aria-pressed filters, status/alert roles, native details, focus-visible outlines и keyboard links. Browser keyboard/screen-reader walkthrough не выполнялся.

17. **Zero-Hotelbeds-network evidence.** Frontend fixture использует реальные app read/delete wrappers с mocked fetch и строгим allowlist: GET /favorites, DELETE /favorites/hotelbeds/101, GET /bookings/me. Любой другой URL падает. Проверены saved rendering, remove/failure/retry/deduplication, sorting/filtering, disclosure markup, empty/auth states и session races. Отдельный test вызывает настоящие backend GET/DELETE controllers с mocked pool.query; все три SQL операции scoped к user_id=7. Client entrypoints замоканы с fail-on-call; итог: Availability=0, Content=0, Status=0, CheckRate=0, Booking=0, Cancellation=0. HTTPS preload запрещает реальные HTTPS requests. Это service/controller + SSR/CSS evidence, не mounted browser automation; native disclosure не имеет network handler. Обычная браузерная загрузка сохранённых image URLs не является Hotelbeds API refresh.

18. **Changed files относительно HEAD.** Уже существовавшие tracked изменения: frontend/src/components/Navbar.jsx; frontend/src/context/FavoritesContext.jsx; frontend/src/pages/Favorites.jsx; frontend/src/pages/MyBookings.jsx; frontend/src/styles/Favorites.css; frontend/src/styles/MyBookings.css. Уже существовавшие новые файлы: frontend/src/components/AccountStates.jsx; PersistedBookingCard.jsx; SavedHotelCard.jsx; frontend/src/services/accountListStore.js; savedAccountData.js; frontend/src/styles/AccountPages.css; frontend/src/utils/savedAccountPresentation.js; frontend/tests/accountUx.test.mjs. В этой сессии изменён только accountUx.test.mjs (отдельные counters) и добавлен этот report. Backend, 3Q/3R identity/filter/snapshot helpers не менялись.

19. **Tests/results.**

    | Проверка | Результат |
    | --- | --- |
    | 3S suite после уточнения counters | PASS — 12 reported tests (2 top-level + 10 subtests) |
    | Общий frontend run, включая 3S | PASS — 61 |
    | Existing frontend regressions без 3S | PASS — 49 |
    | 3R | PASS — 10 |
    | 3Q / Results acceptance | PASS — 8 |
    | 3P / 3P.1 | PASS — 10 |
    | 3O / 3O.1 / 3O.2 frontend | PASS — 15 |
    | 3N / 3M.1 / 3K | PASS — 4 / 1 / 1 |
    | Full existing backend runner | PASS — 101 |
    | Frontend lint | PASS — 0 errors, 3 existing admin warnings |
    | Frontend production build | PASS — 156 modules |
    | Backend syntax / secret scan | PASS — 183 backend files; 354 scanned files; findings=[] |
    | git diff --check | PASS |

    Из frontend: `node --require ../backend/tests/offlineNetwork.cjs --test --test-concurrency=1 --test-force-exit tests/accountUx.test.mjs tests/detailsUx.test.mjs tests/resultsAcceptance.test.mjs tests/homeUx.test.mjs tests/rateAwareFiltering.test.mjs tests/searchQuality.test.mjs tests/catalogPlanner.test.mjs tests/accessCircuits.test.mjs tests/catalogSearchUx.test.mjs`. После test-only правки отдельно повторён accountUx.test.mjs. Также `npm.cmd run lint`, `npm.cmd run build` с VITE_HOTELBEDS_STAGING_TEST_ENABLED=true только в процессе. Из корня: `node backend/scripts/sprint3mRegression.cjs`, `node backend/scripts/sprint3mVerify.cjs`, `git -c core.safecrlf=false diff --check`.

20. **Regressions/fixes.** Failing tests и production regression при возобновлении не обнаружены; production semantics не менялись ради PASS. Изменение нового теста только повышает детализацию network evidence. Lint warnings: BookingsTable, NotificationsTable, RefundsTable hook dependencies. Первое чтение части файлов PowerShell без explicit UTF8 отображало кириллицу неверно; повторное чтение UTF8 подтвердило корректный исходный текст, файлы не перекодировались.

21. **Known limitations.** Browser screenshots, mounted interactions, layout measurements и Render acceptance не выполнялись. Saved favorite не гарантирует exact current offer; CTA открывает форму поиска направления и требует нового пользовательского выбора. Legacy booking labels/images могут приходить из текущей локальной tours table по существующему API projection. TEST marker зависит от реально имеющихся полей. Scan покрывает известные локальные secret values и private-key patterns, не доказывает отсутствие всех возможных секретов.

22. **Safety / final audit.** Реальных Hotelbeds Availability/Content/Status/CheckRate/Booking/Cancellation/LIVE и payment calls не было. Backend runner использовал offline stubs и временные схемы только локального PostgreSQL. Safety flags/env/Secret Files, transport, circuits, planner, importer, migrations, observations и candidate semantics не редактировались. README.txt/docs/ и прежний 3N report не изменялись. Git add/commit/push, deploy и Render changes не выполнялись. Дерево оставлено владельцу для review.

23. **Owner Render acceptance checklist — NOT RUN.** Проверять только с offline/network intercept fixtures, без реального provider traffic.

    - Favorites: сохранённая цена 420.91 EUR со старым observedAt, корректные room/board/category, image/fallback, count 1/2/5; отсутствие live claims.
    - Remove: double click даёт один DELETE, pending/disabled видимы, failure оставляет карточку, retry успешен, 401 ведёт на login.
    - Favorites CTA открывает search form без автоматического provider resolve и без fresh snapshot старого тарифа.
    - Bookings: все mappings из таблицы, unknown fallback, заявка не выглядит подтверждённой, сумма не помечена оплаченной, TEST только с marker.
    - Details disclosure закрыт; только allowlisted fields, нет raw/token/reference leakage и provider/payment actions.
    - Обе страницы: loading/error/retry/auth/empty; при смене аккаунта старые responses не показывают чужой список.
    - От 5 bookings локальные filters и sorting сохраняют нулевые provider counters.
    - Desktop/tablet/360–390px: длинные hotel names, даты, суммы, status/actions, Navbar/Footer без horizontal overflow.
    - Keyboard/focus, remove labels, native disclosure и status/alert announcements.
    - Network: Availability=Content=Status=CheckRate=Booking=Cancellation=0 на standalone opening и перечисленных interactions; собственные app API разрешены.
    - Зафиксировать фактический owner acceptance отдельно. Render PASS сейчас не заявляется.
