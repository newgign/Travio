# Sprint 3R — HOTEL DETAILS UX REDESIGN

Статус: implementation / offline regression PASS. Browser/Render acceptance Sprint 3R: NOT RUN. Render PASS не заявляется. Owner acceptance Sprint 3Q: PASS — сообщено владельцем во входном задании, независимо здесь не перепроверялось.

1. **Initial audit / starting state.** Первой командой выполнен `git status --short`. Tracked working tree был чистым; уже существовали untracked README.txt, docs/ и SPRINT_3N_CATALOG_EXPANSION_PLANNER_REPORT.md. Они не изменялись. Изучены TourDetails.jsx/CSS, selectedOfferSnapshot, hotelOfferDisplay, StayPrice, TourCard, offerDetailsLink, HotelImage, FavoritesContext, public candidate allowlist, Content normalization, direct resolver и существующие 3O/3O.1/3O.2/3Q tests. Backend использовался только для чтения и offline regression.

2. **Before / after Details UX.** До 3R: несколько TEST/debug сообщений наверху, gallery вне основного двухколоночного layout, дублирующие факты/цены/booking notices, technical BOOKABLE в основных условиях, фиксированная mobile booking bar и общий «Тур не найден» для разных ошибок. После: consumer header → две области: gallery/выбранный вариант/информация слева и price card справа. Technical details закрыты. На узком экране одна колонка без fixed CTA. Названия классов Details изолированы от старых общих tour/price CSS.

3. **Header.** Имя отеля, подтверждённые 1–5 целых звёзд или «Категория не указана», реальное местоположение и favorite button. Нулевые/дробные звёзды не отображаются. Район, адрес, resort category и guest rating не выдумываются. hotelLocation использует существующие country/destination labels только при совпадении названия того же города: DUBAI + AE/DXB становится Dubai, ОАЭ; Al Barsha остаётся Al Barsha. Исходные data/URL identities не меняются. Для неизвестных labels сохраняется исходное имя.

4. **Gallery.** Существующие image/images от локального Content model, уникальные изображения, прежний максимум 6. Все шесть теперь доступны через thumbnails; раньше выбирались только первые пять. Большая image, compact counter, кнопки thumbnails с active state и горизонтальным overflow внутри strip. Hero alt — имя отеля. Thumbnail images lazy. Сохраняется HotelImage fallback для отсутствующего/broken src. Пустая gallery не показывает вымышленное «1 / 1». Нет carousel library, image API, image prefetch или Content call. Обычная загрузка уже известных image URLs браузером остаётся.

5. **Selected offer presentation.** «Ваш вариант проживания» показывает именно tour/selected candidate: normalizeRoomDisplay для supplier room naming, normalizeBoardDisplay для board, stay dates и компактную строку ночей/гостей. Room и board не берутся из других rates или query filters. При отсутствующих значениях выводится нейтральный fallback, а не данные default offer. BOOKABLE не используется как признак доступного заказа.

6. **Price hierarchy.** Существующий StayPrice не редактировался. TOTAL — самый крупный текст; per-night — вторичная строка; далее «за N ночей · за всех гостей». Никакого повторного округления stored source price/FX. В 3R fixture выводятся 1 139,95 EUR и 162,85 EUR/ночь. Дублирующая fixed mobile цена удалена. Booking button во всех состояниях этой публичной Details страницы disabled, обработчика оформления нет.

7. **Stay summary.** Компактные даты, ночи и взрослые/дети в выбранном варианте; ниже подписанные даты заезда/выезда. Приоритет offer.checkIn, затем существующий departureDate. CheckOut берётся из offer либо вычисляется из checkIn+nights только для display. Форматирование и вычисление выполняются в UTC, без локального timezone сдвига. ISO значения и childrenAges в candidate/URL сохраняются. Проверены переход месяца/года, невалидная дата и склонения: ночь/ночи/ночей, взрослый/взрослых, ребёнок/ребёнка/детей.

8. **Hotel information / amenities.** Аудит показал: public 3O.1 candidate содержит images и булевы facility flags, но не description, amenities arrays или arbitrary tax/cancellation objects. Нормализованный direct resolver может возвращать local Content description и amenities. UI показывает description только при наличии строки; иначе только известные имя и location. Amenities выводятся из строгих true flags или строк существующего amenities массива; пустая секция скрывается. Нет fake Wi-Fi/pool/parking/spa. Информация о береговой линии показывается только из имеющегося поля.

9. **TEST messaging.** Один badge «Hotelbeds TEST» в price card. Там же «Тестовая цена Hotelbeds» и пояснение: «Цена получена из тестовой среды. Перед реальным оформлением тариф потребуется проверить повторно». Disabled CTA и пояснение об отключённых бронировании/оплате. Повторы TEST в header, offer block и mobile bar удалены. Нет утверждения «цена подтверждена» или «доступно к бронированию».

10. **Technical disclosure.** Native details/summary «Техническая информация», закрытый по умолчанию. Явно перечисленные строковые поля priceSource, observedAt, rateType. Не рендерятся rateKey, offerToken, raw provider object, credentials, signatures, TLS/cert data; отсутствует stringify offer. Условия отмены/налогов не выводятся из произвольных nested objects. Вместо домыслов: «Подробные условия тарифа будут доступны после повторной проверки перед оформлением». CheckRate при этом не выполняется.

11. **Disabled booking.** Удалены Details goCheckout и mobile booking bar. Единственный button «Бронирование отключено» имеет native disabled и не имеет onClick. Нет booking/reserve/payment/CheckRate handlers. Backend safety gates и все env flags не менялись. Non-Hotelbeds TourCard behavior сохранён; сама Details CTA отключена независимо от provider в соответствии с заданием.

12. **Favorite behavior.** Прежние isFavorite/toggleFavorite и hotel/provider key сохранены. Передаётся исходный tour по ссылке, без подмены/мутации selected candidate и без resolver. Отсутствующая сессия/AUTH_REQUIRED ведут на login. Pending временно отключает кнопку; локальная ошибка доступна через role=alert. Текст «В избранное»/«В избранном», aria-label и aria-pressed. Реальное действие по-прежнему использует существующий собственный favorites API; тест использует local mock и не делает provider calls.

13. **Fresh snapshot behavior.** selectedOfferSnapshot.js не изменён. Fresh navigation state сразу формирует Details и возвращается frontend loader по той же object reference. Тот же signed offerToken, rateKey, hotel, roomCode, boardCode, price, currency, nights и guests сохраняются. Нет автоматического перехода к более дешёвому BB. При смене route/search/state keyed DetailsPage не показывает старый hotel до окончания нового resolve.

14. **Stale snapshot behavior.** Прежняя freshness граница сохранена: age < 0 либо age >= 900000ms отвергаются. Wrong hotel/provider, даты, ночи, adults/people, children/ages не принимаются. Любой переданный rejected selection показывает «Выбранный тариф устарел» / «Выполните новый поиск…», а не вызывает resolver для тихой замены. CTA «Вернуться к поиску» ведёт на Home с allowlisted исходными параметрами. Новые проверки включают свежий snapshot, 899999ms, ровно 900000ms, >15 минут, future timestamp и mismatch cases. Contract самой snapshot-функции не расширялся и не ослаблялся.

15. **Direct URL behavior / back action.** При отсутствии navigation snapshot сохраняется прежний GET `/offers/:provider/:id` с теми же query parameters и AbortSignal. Это один существующий resolver flow, который может использовать прежнюю provider Availability логику; новых endpoints/retries нет. Есть structured loading, hotel-not-found, stale, provider-access и generic local error. AUTH_BLOCKED / UNKNOWN_BLOCKED / ACCESS_UNAVAILABLE сохраняют отдельный code; не становятся «Отель не найден». TourCard дополнительно передаёт allowlisted resultsOrigin в state, сохраняя selectedOffer и Details URL. При подтверждённом переходе из Results и наличии history entry back использует navigate(-1); direct tab/нет history — безопасная Home search form, не внешний history и не автоматически запущенный новый поиск. Browser return восстанавливает исходную Results URL с filters/sort. Сам Results loader/cache не изменялся: его существующая remount логика остаётся, и поведение после истечения backend cache не объявляется новым zero-network contract.

16. **Responsive desktop/tablet/mobile.** Desktop layout: minmax main + 300–360px price card. Sticky использует существующий --travio-page-top, ограничен своим grid container перед Footer. При viewport height ≤700px sticky отключается, чтобы высокая карточка не мешала доступу. При width ≤1000px tablet/mobile переключаются в одну колонку, price card position:static/full width. При ≤600px компактнее paddings/hero, факты в одну колонку. Long hotel/room/technical/price text переносится; min-width:0 и внутренний thumbnails scroll защищают от горизонтального overflow. Нет JS scroll listeners или fixed bar поверх Footer. Browser geometry ещё требует owner acceptance.

17. **Accessibility.** Семантические header/section/aside, dl/dt/dd для фактов, headings. Gallery thumbnails — кнопки с «Показать фото N из M» и aria-pressed; counter aria-live; hero meaningful alt. Favorite/back — keyboard buttons; technical disclosure native details. Disabled booking имеет disabled semantics и текст. Focus-visible outlines; loading role=status/aria-busy, ошибки role=alert. Heavyweight browser/a11y dependency не добавлялась.

18. **Exact candidate preservation.** Новый integration fixture проходит настоящий backend SearchService на mocked Hotelbeds transport: один отель, default BB 420.91 EUR / STD и alternate FB 1139.95 EUR / DBL.CLASSIC. Затем существующий filterOffers выбирает FB. Card и Details показывают 1139.95 / Полный пансион / Double or Twin CLASSIC; 420.91 отсутствует. Decoder существующего signed token подтверждает rateKey, roomCode, boardCode, hotel, price/currency, nights/adults/children. Loader возвращает тот же selected object; fixture не мутируется.

19. **Zero-extra-network evidence.** Счётчики integration fixture после initial search и после Details, выбора 6-го thumbnail, mocked favorite toggle, technical disclosure SSR и back helper остаются Availability=1 / CheckRate=0 / Content=0. Неожиданный frontend fetch запрещён spy; direct URL тест отдельно разрешает ровно один mocked local /offers call. Дополнительно проверен existing backend cache hit при возврате с тем же providerQuery. Это service/function/handler + SSR/CSS evidence, не mounted browser automation. Native disclosure не имеет network handler; scroll исключительно CSS. Единственный setTimeout(0) сохраняет прежнее cancellable mount scheduling, не является timer refresh; setInterval/poll/prefetch отсутствуют. Fresh snapshot и interactions не инициируют provider calls.

20. **Changed files.**

    - frontend/src/pages/TourDetails.jsx — новая композиция, состояния loading/error/stale, безопасный back, неизменный selected offer.
    - frontend/src/styles/TourDetails.css — desktop/tablet/mobile, sticky, gallery, typography и accessibility.
    - frontend/src/components/TourCard.jsx — только дополнительный resultsOrigin navigation state.
    - frontend/src/components/DetailsGallery.jsx — новая presentational gallery.
    - frontend/src/services/detailsOffer.js — frontend snapshot/direct resolver boundary, тот же endpoint.
    - frontend/src/utils/detailsPresentation.js — dates/summary/location/amenities/back/error presentation helpers.
    - frontend/src/utils/detailsFavorite.js — тестируемый wrapper существующего favorites behavior.
    - frontend/tests/detailsUx.test.mjs — новый 3R integration/SSR/helper/CSS suite.
    - SPRINT_3R_HOTEL_DETAILS_UX_REPORT.md — этот отчёт.

    StayPrice, selectedOfferSnapshot, offerDetailsLink, hotelOfferDisplay, Results/localOfferFilters, FavoritesContext, HotelImage и backend файлы не изменялись. Старые suites не редактировались.

21. **Tests / results.**

    | Проверка | Результат |
    | --- | --- |
    | 3R new suite | PASS — 10 reported tests (parent + 9 subtests) |
    | Все запрошенные frontend regressions | PASS — 49 |
    | 3Q / Results acceptance | PASS — 8 |
    | 3P / 3P.1 | PASS — 10 |
    | 3O / 3O.1 / 3O.2 frontend | PASS — 15 |
    | 3N frontend | PASS — 4 |
    | 3M.1 access panel | PASS — 1 |
    | 3K catalog UX | PASS — 1 |
    | Full existing backend runner | PASS — 101 |
    | Frontend lint | PASS — 0 errors, 3 прежних admin warnings |
    | Frontend production build, процессный TEST display flag | PASS — 149 modules |
    | Backend syntax / secret scan | PASS — 183 backend файла; 346 scanned files, findings=[] |
    | git diff --check | PASS |

    Из frontend: `node --require ../backend/tests/offlineNetwork.cjs --test --test-concurrency=1 --test-force-exit tests/detailsUx.test.mjs tests/resultsAcceptance.test.mjs tests/homeUx.test.mjs tests/rateAwareFiltering.test.mjs tests/searchQuality.test.mjs tests/catalogPlanner.test.mjs tests/accessCircuits.test.mjs tests/catalogSearchUx.test.mjs`.
    Дополнительно `npm.cmd run lint`, `npm.cmd run build` с VITE_HOTELBEDS_STAGING_TEST_ENABLED=true только в текущем процессе.
    Из корня: `node backend/scripts/sprint3mRegression.cjs`, `node backend/scripts/sprint3mVerify.cjs`, `git -c core.safecrlf=false diff --check`.

22. **Regressions / limitations.** Все прежние tests сохранены и прошли. Lint warnings прежние: BookingsTable, NotificationsTable, RefundsTable hook dependencies. Первый запуск нового test file обнаружил лишнюю закрывающую скобку в тестовом SSR wrapper; исправлено до полного прогона. Production build прошёл. Браузерные screenshots, layout measurements, mounted history/interaction test и Render acceptance не выполнялись. Обычный favorites API остаётся сетевым; zero-extra-network здесь относится к Hotelbeds, не ко всем HTTP/image requests. Direct URL сохраняет существующую resolver семантику и не обещает exact alternate rate без fresh snapshot.

23. **Safety.** NO real Hotelbeds Availability / Content / Status / CheckRate / Booking / Cancellation / LIVE; NO payment calls. Backend runner использовал существующие offline stubs/HTTPS preload и временные схемы локального PostgreSQL. Env/Secret Files не редактировались; тестовые safety значения выставлялись только внутри test process. Backend selection semantics, public candidate/compaction, searchService, transport, circuits 3M/3M.1, planner 3N, importer, migrations, observations и booking/payment gates не изменялись. Не выполнялись git add/commit/push/deploy или Render changes. README.txt/docs/ и существующий 3N report не тронуты. Secret scan ограничен известными локальными secret values/private-key patterns и не доказывает отсутствие всех возможных секретов.

24. **Owner Render acceptance checklist — NOT RUN для 3R.** Владелец выполняет после отдельного решения о публикации. Для проверки без real provider traffic использовать offline/network-intercept fixtures. Этот sprint не разрешает реальные Hotelbeds вызовы.

    - Из Results выбрать alternate FB, открыть Details: те же hotel/room/board/TOTAL/currency/nights/guests; default BB не появляется.
    - Проверить readable header/location/category, favorite active state и отсутствие выдуманных amenities.
    - Переключить все 6 thumbnails, проверить active/counter, alt и broken/no-photo fallback.
    - На desktop проверить sticky ниже Navbar и остановку до Footer; при небольшой высоте окна — normal flow.
    - На tablet и 360–390px проверить одну колонку, полную ширину price card, видимый disabled CTA и отсутствие horizontal overflow с длинными названиями.
    - Проверить крупный TOTAL, secondary per-night, «за всех гостей», один TEST badge и спокойное пояснение.
    - Проверить закрытый technical disclosure: BOOKABLE только там; rateKey/token/raw fields нигде не показаны.
    - Проверить back из Results с сохранением исходной URL/filter/sort; direct tab back ведёт в безопасную search form.
    - На fixtures проверить fresh, ≥15 минут, future timestamp, wrong hotel/dates/occupancy; rejected state не вызывает resolver.
    - Direct URL: structured loading, прежний resolver, 404 отдельно от AUTH_BLOCKED/UNKNOWN_BLOCKED/generic error.
    - На перехваченном network fixture после initial Availability=1 перейти в fresh Details, переключать gallery/favorite/disclosure: Availability остаётся 1, CheckRate=0, Content=0; booking/payment отсутствуют.
    - Проверить keyboard/focus, favorite labels, disabled semantics и доступность Footer. Зафиксировать фактический результат 3R отдельно; Render PASS пока отсутствует.