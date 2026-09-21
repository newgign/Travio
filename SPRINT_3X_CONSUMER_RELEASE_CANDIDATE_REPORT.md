# Sprint 3X — Consumer Release Candidate / End-to-End Readiness

CODE / OFFLINE: PASS.
Render acceptance: NOT RUN.

Это staging release candidate consumer-части при прежнем TEST/sales-disabled baseline. Результат не означает готовность реальных продаж или browser acceptance.

## 1. Initial/recovered git state

Повторно, первыми командами продолжения, выполнены `git status --short`, `git diff --stat`, `git diff`. Source of truth — рабочее дерево. На входе modified: `frontend/index.html`, `frontend/src/components/ConsumerShell.jsx`; untracked partial 3X: `ConsumerErrorBoundary.jsx`, `ConsumerMetadata.jsx`, `consumerTitle.js`. Tracked diff на входе: 2 files, 11 insertions, 5 deletions. Также присутствовали прежние untracked `README.txt`, `docs/`, `SPRINT_3N_CATALOG_EXPANSION_PLANNER_REPORT.md`. Они сохранены; старые reports не редактировались. Очистки/отката рабочего дерева не было.

## 2. Partial 3X changes discovered

Существующие changes признаны частичной реализацией 3X и продолжены. Поиск по source не обнаружил другого document.title/error boundary mechanism. Boundary уже корректно скрывал Error/stack, давал Home CTA и сбрасывался по route key. В partial title helper отсутствовали destination/hotel display titles: Results и Details имели только общие fallback titles. Это дополнено без изменения search/account state или provider API.

## 3. Owner acceptance inherited

Подтверждённый владельцем 3W.2 scope: Render `/profile` 320×900 PASS — «Администратор» целиком, text block переносится, avatar не сжат, horizontal overflow визуально отсутствует. Ранее владелец проверял Home desktop/mobile, Navbar mobile/narrow 320, mobile menu, Results mobile/filter drawer, Details mobile, Favorites empty, MyBookings empty, Profile mobile, Help/Contacts/404 desktop. Эти области не переработаны.

Real login/register browser flow не был полностью принят; browser password change не выполнялся. Bookings/payment выключены, provider TEST остаётся baseline. В этом sprint новой browser/Render проверки нет.

## 4. Full consumer journey audit

- Home: `buildHomeSearch` валидирует направление из готового каталога, будущую дату, 1–14 ночей, взрослых/детей/возраста; CTA формирует один Results URL. Существующий TEST contract — один номер (`rooms=1`), не добавлен новый room selector. В fixture сохранены два ребёнка возрастов 0 и 8, что проверяет falsy age zero. Navigation helper не вызывает provider.
- Results: country/destination identity, checkIn, nights и occupancy сохраняются. Header использует нормализованное название направления и даты/гостей. `providerQuery` и локальные filter/sort semantics не изменены. Полученный набор содержит cheap BB 420.91 и Family/FB 1139.95; выбор FB/Family сохраняет второй candidate.
- Details: price 1139.95 EUR, hotel 101, FAMILY, FB, dates, nights, adults/children/ages и signed identity сверяются с offerToken. Ни дешёвый candidate, ни default не подставляются. Gallery handler меняет активное фото локально; technical disclosure — закрытый native details. Favorite handler использует тот же объект в mock.
- Back: `resultsOrigin` сохраняет allowlisted search/filter/sort; `detailsBackTarget` возвращает -1 при подтверждённом origin/history. Повторный backend search в fixture попадает в прежний memory cache и не вызывает второй Availability. Это проверка helpers/cache, не browser history engine.
- Favorites: saved display price прямо названа последней сохранённой ценой; стоимость может отличаться. CTA ведёт к новому поиску с выбором дат, не резервирует тариф. Не изменён прежний add flow; provider-free fixture использует явно разрешённый favorite UI mock, а не реальный POST.
- MyBookings: persisted own-app records; empty state не создаёт fake booking. Реальная бронь и оплата не включены.
- Profile/Auth: используются прежние session.js, page-local stores и FavoritesContext; данные старой session не принимаются новой. Navbar использует тот же accountName. ProtectedRoute и safe login/register return сохранены.
- Help/Contacts/404: фактические тексты, implemented internal routes и explicit wildcard сохранены.

## 5. Route matrix

| Route | Реализация / поведение |
| --- | --- |
| `/` | Home, catalog-backed search |
| `/results` | Results; без даты — предложение заполнить поиск |
| `/tour/:provider/:id` | Details, selected snapshot или прежний direct resolver |
| `/tour/:id` | Сохранённый legacy Details route |
| `/favorites` | Favorites, отдельный guest/auth state |
| `/my-bookings` | ProtectedRoute → MyBookings |
| `/profile` | ProtectedRoute → Profile |
| `/login`, `/register` | Auth forms, safe return |
| `/help` | Help overview |
| `/help/search` | Поиск |
| `/help/prices` | Цены |
| `/help/booking` | Выключенные продажи и ограничения |
| `/help/cancellation` | Фактические ограничения отмены |
| `/help/privacy` | Существующее информационное описание |
| `/contacts` | Contacts |
| `*` | Explicit NotFound; неизвестный Help topic также 404 |
| `/admin`, `/admin/bookings` | Прежний adminOnly; вне consumer shell/boundary |

SSR links Navbar/Footer/Help/Contacts/404/Profile сверены с routes App.jsx. Navbar Home anchors `countries`, `home-search` и Footer/Help `faq` существуют в исходных компонентах. Home→Results, Results→Details, Details→Back, edit search→Home, Favorites→search, Profile→Favorites/MyBookings/Admin и safe auth return покрыты новым и прежними suites. Canonical route structure не менялась. Checkout/Voucher/booking-detail routes остаются вне consumer shell, как до 3X.

## 6. URL/navigation contract

| Параметры | Сохранённая семантика |
| --- | --- |
| destinationCode, countryCode | Home URL сохраняет catalog identity; providerQuery отображает countryCode в существующий country field |
| checkIn / departureDate | Home генерирует checkIn; Details link сохраняет прежний departureDate alias; оба читаются текущими helpers |
| checkOut, nights | Home не добавляет вычисленный checkout в URL; backend нормализует checkout, Details переносит его и nights |
| rooms | TEST = 1; Details URL берёт occupancy.rooms либо прежний fallback 1 |
| adults / people | Home adults; Details link people; snapshot сверяет существующие aliases |
| children, childrenAges | Количество и упорядоченные возраста сохраняются, включая 0 |
| food, roomType | Локальные rate predicates выбирают один и тот же candidate; Details URL contract сохранён |
| departureCity | Прежний optional Details link field; Home не добавляет выдуманный город вылета |
| provider | Home query и Details path используют прежний contract |

Home builder использует URLSearchParams с уникальными ключами. Нового URL format нет. Selected offer/token остаются во внутреннем navigation state, не добавлены в URL или обычный consumer HTML. rateKey, credentials, signatures, TLS/cert fields не выводятся. resultsOrigin продолжает использовать прежний allowlist; структура origin не расширена.

## 7. Session/reload/history

Normal navigation использует URL + navigation state. Fresh snapshot (age < 15 minutes) принимается; stale/future/identity/date/occupancy mismatch отклоняется без silent resolver replacement. Fixture проверяет JSON round-trip сохранённого state как offline модель сериализации. При отсутствии state direct Details сохраняет один existing own-app resolver request; он в тесте mocked. При hard reload наличие history state зависит от браузера: fresh state принимается, отсутствующий идёт в direct resolver, rejected state показывает stale. Browser Ctrl+F5/Back/Forward здесь не выполнялись.

Account stores используют owner token/generation; late response от old account не populates new account. Session logout очищает token/user, auth events обновляют Navbar, ProtectedRoute передаёт allowlisted returnTo через state, без personal URL params. Старые 3S/3T/3U regressions проверяют races, logout, profile/password/session handlers offline. Новый global store не добавлен.

## 8. Loading/error/empty states

| Область | Отдельные причины |
| --- | --- |
| Results | Loading; EMPTY CATALOG; NO AVAILABILITY; FILTERED TO ZERO; provider access error; generic search error |
| Details | Loading; SELECTED_OFFER_STALE; OFFER_NOT_FOUND; provider access error; generic details UI error |
| Favorites/MyBookings | Guest/auth required; loading; ready empty; API error; persisted list |
| Profile | Loading; API error; auth redirect; confirmed user/form |
| Consumer shell | Render error boundary fallback |

Корректные существующие тексты и причины не объединены и не переписаны. Inventory подтверждён source review, новым SSR fixture и прежними 3Q/3R/3S/3T tests. SSR не запускает page effects автоматически.

## 9. Error boundary decision/implementation

Существующий partial `ConsumerErrorBoundary` оставлен без переписывания. Он находится внутри consumer shell, охватывает consumer children и metadata; Admin и прежние исключённые routes не оборачиваются. Safe fallback: «Что-то пошло не так», «Обновите страницу или вернитесь на главную», Home anchor `/`. Нет raw Error/stack/componentStack, внешнего логирования, Sentry или retry timers.

Reset key включает location key, pathname и search. Та же сломанная route остаётся в fallback без endless retry; новый key разрешает render. Тест вызывает реальные lifecycle methods класса и SSR fallback; это не mounted React exception recovery и не проверка event-handler/async exceptions, которые React error boundary не перехватывает.

## 10. Document title/metadata decision

Один ConsumerMetadata component выполняет `document.title = title` в effect. Для обычных routes его рендерит shell; Results и Details владеют своим metadata component, чтобы не было двух конкурирующих effect writers. Results передаёт уже загруженные catalog rows и params; params только выбирают совпадающую country/destination identity. Display title использует существующий destinationLabel. До загрузки, при неизвестной identity/diagnostic используется «Отели — Asedeliya»; новые запросы ради title отсутствуют.

Details передаёт имя реально показанного offer. Loading/error/stale рендерят безопасное «Отель — Asedeliya», а не имя rejected snapshot. Примеры: «Отели: Antalya — Asedeliya», «Grand Kaptan — Asedeliya». Static titles соответствуют заданию, включая «Вход», «Регистрация», «Страница не найдена». Help articles используют статическое содержание.

Display names нормализуются, ограничены 120 символами; HTML delimiters/control/format characters отклоняются. Arbitrary raw query не становится title. Metadata не вставляет HTML, не читает rateKey/token и не добавляет provider calls. `index.html` сохраняет исправленный default Home title и фактическое описание отключённых бронирования/оплаты. SEO framework/OpenGraph/external packages не добавлены. Effect wiring проверен source; отображение document.title в браузере требует owner acceptance.

## 11. Responsive/a11y regression

Новых CSS изменений нет. Новый suite проверяет применимость существующих consumer/profile rules для 320/360/390/440/768/1024/1440, сохранение narrow Navbar и full-row profile text <=360, focus-visible, wrapping и menu semantics. Прежние suites покрывают Navbar, open/closed CSS, Escape/focus return, Footer, Home guest panel, Results cards/drawer, Details, account/auth/help layouts и disabled/aria-controls/aria-expanded.

Long email, long hotel/room names и large TOTAL рендерятся offline. CSS/cascade/source evidence не измеряет glyph bounds, overflow или реальную высоту Footer. Не добавлены body overflow-x masking, fixed widths, transforms или positive tabindex. Унаследованный owner 3W.2 PASS не объявлен новой acceptance 3X.

## 12. Zero-extra-provider evidence

Новый `releaseCandidate.test.mjs` содержит два fixture scope:

| Scope | Availability | Content | Status | CheckRate | Booking | Cancellation | Payment |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Pure navigation SSR/helpers, до initial search | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Один MOCKED initial Availability → selected Details → gallery/disclosure/favorite mock → Back/cache → account/help/contacts/404 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |

Используются actual backend search/normalization/signing/cache, frontend helpers/services/components; provider client/catalog repositories/access check/price-history/monitor заменены offline stubs. Реальный сетью запрос не выполняется. Global fetch запрещён; отдельный direct URL subtest временно разрешает ровно один mocked own-app resolver. Account data подаются через injected APIs/state. HTTPS preload запрещает реальные HTTPS requests. Native disclosure проверен по SSR markup, gallery callback вызван явно. Эти counters доказывают заданный offline fixture, не все возможные browser effects и не вечный cache hit при истечении TTL.

## 13. Exact changed files

1. `frontend/index.html` — recovered fallback title/description.
2. `frontend/src/components/ConsumerShell.jsx` — recovered scoped boundary + route reset; metadata ownership.
3. `frontend/src/components/ConsumerErrorBoundary.jsx` — recovered new boundary, сохранён.
4. `frontend/src/components/ConsumerMetadata.jsx` — recovered new component; display-data props и один title effect.
5. `frontend/src/utils/consumerTitle.js` — recovered new helper; static/destination/hotel safe titles.
6. `frontend/src/pages/Results.jsx` — metadata import/render, existing params/catalog data.
7. `frontend/src/pages/TourDetails.jsx` — metadata import/render для loading/error/loaded offer.
8. `frontend/tests/releaseCandidate.test.mjs` — новый offline integration suite.
9. `SPRINT_3X_CONSUMER_RELEASE_CANDIDATE_REPORT.md` — этот отчёт.

Backend, providerQuery, snapshot/resolver/signing contracts, session/auth stores, FavoritesContext, CSS, Admin, dependencies и старые tests не изменены. Generated dist/cache/локальные regression logs не являются source changes и не staging-ились.

## 14. Tests/results

| Проверка | Результат |
| --- | --- |
| Новый suite отдельно | PASS — 10/10 (parent + 9 subtests) |
| Полный frontend 3X → 3K | PASS — 112/112 |
| Existing full backend runner | PASS — 101/101, 12 suites |
| Lint | PASS — 0 errors, 3 прежних admin hook warnings |
| Production build | PASS — 170 modules |
| Backend syntax scan | PASS — 183 files |
| Secret scan, включая новый отчёт | PASS — 381 scanned, findings=[] |
| git diff --check | PASS |

Команды frontend:

```powershell
node --require ../backend/tests/offlineNetwork.cjs --test --test-concurrency=1 --test-force-exit tests/releaseCandidate.test.mjs
node --require ../backend/tests/offlineNetwork.cjs --test --test-concurrency=1 --test-force-exit tests/releaseCandidate.test.mjs tests/narrowProfile.test.mjs tests/narrowNavbar.test.mjs tests/globalUxPolish.test.mjs tests/helpUx.test.mjs tests/authUx.test.mjs tests/profileUx.test.mjs tests/accountUx.test.mjs tests/detailsUx.test.mjs tests/resultsAcceptance.test.mjs tests/homeUx.test.mjs tests/rateAwareFiltering.test.mjs tests/searchQuality.test.mjs tests/catalogPlanner.test.mjs tests/accessCircuits.test.mjs tests/catalogSearchUx.test.mjs
npm.cmd run lint
$env:VITE_HOTELBEDS_STAGING_TEST_ENABLED='true'
npm.cmd run build
```

Build flag установлен только в process environment команды, .env не изменялся. Root commands:

```powershell
node backend/scripts/sprint3mRegression.cjs
node backend/scripts/sprint3mVerify.cjs
git -c core.safecrlf=false diff --check
```

`sprint3mVerify.cjs` — существующая общая схема backend syntax + known-secret/private-key scan; отдельный произвольный scanner не создавался. Backend runner проверяет local DB host и использует временные PostgreSQL schemas; реальные app account records не менялись. Даже suites с Live/Content в названии работают через offline preload/stubs, не запускают probes.

## 15. Build results

170 modules; `dist/index.html` 1.08 kB / gzip 0.57; JS 504.03 kB / gzip 140.93; CSS 111.36 kB / gzip 20.15. Сравнение с 3W.2: JS +2.36 kB / gzip +0.88; CSS без изменения. Existing chunk >500 kB warning не подавлен. Нет новых dependencies, scripts/fonts/maps или external telemetry.

## 16. Regressions/fixes found during implementation

Partial 3X имел общие Results/Details titles вместо display titles; это единственная дополнительная production integration доработка за пределами recovered files. Canonical URLs, tariffs, account behavior и дизайн не переписаны.

При разработке нового теста исправлены broad CSS matcher (flex-basis другой области ошибочно считался profile rule) и assertion имени Navbar state (`menuOpen`). До окончательного запуска stale-query fixture очищен от неверного подхода append duplicate key: используется URLSearchParams.set. Одна локальная edit-команда первоначально указала удвоенный frontend path; файлов не изменила, путь исправлен. Production/старые tests под эти ошибки не подгонялись. Итоговый standalone и full run прошли.

## 17. Limitations

Render/browser acceptance NOT RUN. Нет screenshots, mounted page effects, настоящего browser Back/Forward/Ctrl+F5, measurements, login/register/password browser acceptance. Boundary test проверяет class lifecycle/fallback, а не реальное перехваченное React mount exception. Title tests проверяют helper и effect wiring, не browser tab. No-extra-provider evidence ограничено описанным offline fixture и прежними service/controller regressions. Direct resolver и реальный favorite POST не заявлены как provider-free во всех runtime ситуациях. Secret scan ограничен известными env secret values и private-key patterns, не является универсальным security audit.

## 18. Safety audit

NO real Hotelbeds Status/Content/Availability/CheckRate/Booking/Cancellation/LIVE. NO payment/charges/refunds. Provider client calls только mocks; HTTPS network preload включён в test commands. ProductionGate, TEST/LIVE isolation, mTLS semantics, HOTELBEDS production flags, sales/charges/refunds/payment gates и quotas не менялись. Catalog не расширялся, hotel imports/probes не запускались. Render/env/Secret Files не менялись. Реальные account mutations не выполнялись. README.txt/docs/3N и старые reports сохранены. NO git add/commit/push/deploy. Финальные `git status --short`, `git diff --stat`, `git diff` выполнены: tracked diff — 4 files, 18 insertions, 9 deletions; 5 новых файлов 3X перечислены выше наряду с tracked changes. Untracked файлы не входят в обычный git diff, их содержимое также проверено. Рабочее дерево оставлено для review владельца.

## 19. Owner Render acceptance checklist — NOT RUN

После отдельного решения владельца о deploy проверить desktop 1440px, tablet 768px, mobile 390px и 320px:

1. Home → Results → Details → Back → Favorites → My Bookings → Profile → Help → Contacts → unknown URL. Выбранные room/board/TOTAL/currency/даты/гости не подменяются; Back сохраняет исходные filters/sort. Favorites historical price и bookings empty factual.
2. Проверить route titles, Results после загрузки catalog label, Details loaded/loading/stale, 404 title. Не переносить offerToken/rateKey в URL.
3. На контролируемом локальном/dev fixture вызвать render error внутри consumer boundary: safe text/Home CTA, recovery при смене route, повторная ошибка не вызывает loop. Fixture не добавлен в production route и не требует provider requests.
4. Footer на коротких и длинных страницах; mobile menu open/closed/Escape/focus, Results drawer, длинные названия/email/large TOTAL, отсутствие horizontal overflow. Повторить имя «Администратор» при 320px без его разрыва и с несжатым avatar.
5. Browser Back/Forward и hard reload, direct Details и rejected snapshot проверять на подготовленных offline/сохранённых fixtures с учётом expiry и возможного resolver call. Не выполнять реальные login/register/password mutations ради этого sprint; эти acceptance ограничения фиксировать отдельно.
6. Не запускать provider probes. Если для staging journey нужен один новый реальный Hotelbeds TEST search, это отдельное решение владельца. Агент его не выполнял; самостоятельный search/direct resolver на Render здесь не запускался.

CODE / OFFLINE: PASS.
Render acceptance: NOT RUN.
