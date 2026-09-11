# SPRINT 3C — Asedeliya staging acceptance

Дата: 12 сентября 2026, Asia/Qyzylorda. Ветка: `develop`.

**Staging acceptance НЕ пройден.** Реальные проверки выявили дефекты регистрации, состояния авторизации, профиля и мобильной навигации. Исправления подготовлены и проверены локально; staging продолжает обслуживать предыдущий код. Требуются проверка владельцем, commit/push/deploy и повторная проверка исправленных сценариев. Commit, push и deployment не выполнялись.

Проверенные адреса: [frontend](https://asedeliya-staging-web.onrender.com), [backend health](https://asedeliya-staging-api.onrender.com/health). Проверки выполнены HTTP-запросами и настоящим headless Microsoft Edge через Playwright. Локальные browser fixtures ниже явно отделены от staging.

## Аудит до изменений

`git status --short` показал только ранее существовавшие untracked `README.txt` и `docs/`. Они не изменялись. Tracked-файлы были чистыми; предыдущие спринты не откатывались.

Routes из `frontend/src/App.jsx`: `/`, `/help/:topic`, `/results`, `/favorites`, `/tour/:provider/:id`, `/tour/:id`, `/login`, `/register`, `/checkout/:provider/:tourId`, `/checkout/:tourId`, `/profile`, `/voucher/:bookingId`, `/my-bookings`, `/my-bookings/:bookingId`, `/admin`, `/admin/bookings`. Новых routes нет.

Auth: `POST /api/auth/register`, `POST /api/auth/login`, `GET/PUT /api/auth/profile`, `PUT /api/auth/password`. Login сохраняет bearer access token и public user в localStorage (`token`, `user`); cookie-session и refresh-token endpoint отсутствуют. Logout удаляет эти записи. Backend проверяет JWT через `authMiddleware`; admin router использует `requireRole("admin")` и `requirePermission("admin.operations.read")`, отдельные system endpoints требуют дополнительных permissions. `/api/users`, административный список и изменения bookings также защищены ролью. Роль берётся из подписанного JWT; frontend storage не является backend-источником полномочий.

Favorites: `GET/POST /api/favorites`, `DELETE /api/favorites/:provider/:hotelId`. Bookings пользователя: `GET /api/bookings/me`, `GET /api/bookings/:id/details`; создание и provider mutation routes в staging не вызывались. Travelers: `GET/POST /api/travelers`, `PUT/DELETE /api/travelers/:id`.

`frontend/src/services/api.js` использует публичный `VITE_API_URL`; production bundle действительно содержит staging backend с `/api`. Остальные services используют общий API config. `backend/config/cors.js` выбирает явные origins; production по умолчанию не добавляет localhost. Реальные preflight результаты приведены ниже.

## Таблица acceptance

Статус относится к проверенному staging, если явно не указано «локально». Локальный PASS не заменяет повторную проверку deployment.

| Блок | Статус | Реальное свидетельство / ограничение |
|---|---|---|
| Frontend/backend/PostgreSQL | PASS | Frontend documents 200; `/health` 200, status ok, database.ok true; `/api/health/live` 200. |
| Регистрация | FAIL | UI registration успешна, API mandatory fields 400, duplicate после upper-case/trim 409; но email без `@` принят с 201. Исправление F1 локально PASS. |
| Только role=user при регистрации | PASS | UI account и API account с `role=admin` получили user; нормализованный email принимает повторный login. |
| Login, неверный пароль, неизвестный email | PASS | UI login и повторный login успешны. Неверный пароль и неизвестный email — 401 с одинаковым публичным сообщением. |
| Logout, F5 и expired-session UI | FAIL | F5 сохраняет авторизацию; logout + Back/direct URL после завершения React redirect блокируют profile. Но другая открытая protected-вкладка сохраняет страницу, а после 401 profile не переходит на login. F3 локально PASS. |
| Невалидный token | PASS | Реальный staging API возвращает 401. UI реакция на этот ответ включена в F3. |
| Истёкший подписанный token | BLOCKED | Нет естественно истёкшего staging token. Подпись staging не подделывалась. Локальный тест настоящего signed expired JWT — PASS. |
| User → admin UI/API | PASS | `/admin` обычного user переводит на `/`; admin overview/system/provider endpoints, `/api/users`, admin bookings list — 403, без token — 401. |
| Положительный admin login / sidebar | BLOCKED | В этой сессии нет административной авторизации. Предыдущее подтверждение владельца не засчитывается как выполненный мной тест. Локальные role/permission middleware пропускают admin. |
| Profile | FAIL | GET, UI save имени и F5 работают, email read-only, blank phone сохраняется; role/id/email/password/permissions из обычного PUT не меняют защищённые поля или пользователя B. Отсутствующий preferred_language сохранялся как строка `undefined`. F2 локально PASS. |
| Travelers / DOB | PASS | У нового staging user список пуст; пустая дата в UI остаётся пустой после F5. Локально создание traveler с пустой датой сохраняет NULL, другой пользователь его не видит/не удаляет. Полный staging traveler CRUD не выполнялся. |
| Favorites | BLOCKED | У A/B read-only списки пусты, anonymous получает 401. Staging catalog hotels также пуст. Add/duplicate/delete с настоящей карточкой, F5 и повторный login после добавления проверить нечем; fake offers/цены не создавались. Локальная SQL-изоляция чтения/удаления — PASS. |
| Search / Results при отключённом provider | PASS | API с параметрами возвращает 503; UI показывает «Поиск предложений временно недоступен», 0 предложений, без mock цен. Form submit передаёт страну/даты/adults/children/age/nights/food/stars; query/F5 проверены на четырёх размерах. |
| Результаты реального поиска, фильтрация найденных карточек | BLOCKED | Hotelbeds выключен и каталог пуст. Destination/city переданы через query; проверить их provider resolution без предложений нельзя. Модальное применение фильтров к выдаче и результат сортировки не засчитаны как PASS. |
| Detail routes | BLOCKED | Direct navigation/F5-подобные document loads на `/tour/hotelbeds/acceptance-unavailable` получают SPA 200 и обработанный provider error. Успешную карточку, её фото, питание, cancellation conditions и переход из results проверить без offer нельзя. |
| My Bookings | PASS | Staging A/B получают пустые массивы, UI empty state и document navigation работают; anonymous — 401. Реальная изоляция непустых списков/details проверена локально с rollback-only fixtures. Никаких staging booking fixtures нет. |
| Booking/payment safety | PASS | Staging payment readiness: mode disabled, provider none, realChargesEnabled false, productionSalesEnabled false, safetyGate true, sandboxAvailable false. Поиск закрыт. Локальные hard gate и Hotelbeds regression проходят. |
| Checkout confirmation UI | BLOCKED | Нет допустимого offer для полного checkout. Booking POST, provider confirmation, cancellation, payment/intent/refund операции не выполнялись. PASS фактической попытке покупки не приписывается. |
| SPA document refresh | PASS | На четырёх viewports все перечисленные ниже документы отдаются 200, без Render 404; React защищает пользовательские/admin routes. |
| CORS | PASS | Staging origin OPTIONS 204 с точным ACAO и credentials=true; чужой origin и localhost — 403, без ACAO. Wildcard нет. Реальные browser fetch проходят. |
| HTTP error handling | PASS | Staging 400/401/403/404/409/503 проверены, секреты/password/hash в проверенных ответах отсутствуют. 429 и controlled 500 проверены только локально, без нагрузки/искусственных падений staging. |
| Mobile/responsive | FAIL | Проверены 390×844, 768×1024, 1366×768, 1920×1080. Profile на 390 px расширяет document до 411 px. Mobile navbar не содержит login/logout actions. F4/F5 исправлены локально. Успешные offer cards и admin sidebar — BLOCKED. |
| Console / Network | FAIL | Нет uncaught exceptions, React crashes, mixed content, неверного API URL или CORS errors в проверенных flows. Есть ожидаемые 503 при недоступном detail/search и 401 при invalid token; приложение логирует обработанные ошибки в Console. Security-дефект F3 не позволяет считать auth acceptance пройденным. |
| Git и frontend secrets | PASS | `.env`, certificates/private keys, backend/cache не tracked. Served bundle содержит публичный API URL, не содержит проверенные secret markers или совпадения с двумя непустыми локальными секретами. Это проверка текущих файлов/bundle, не аудит всей Git history или неизвестных staging secrets. |
| Build / новые критические тесты | PASS | Frontend build/lint, backend syntax, Sprint 3C+deployment tests и локальные browser regression проходят. |
| Старые unrelated tests | FAIL | Sprint 2H по-прежнему ожидает отсутствующую текстовую строку в email service, который не менялся. Остальные перечисленные regression PASS. |
| Реальный LIVE / платежи | NOT APPLICABLE | Не входят в этот спринт и не включались. |

## Подтверждённые дефекты и исправления

| ID | Проблема и причина | Изменённые файлы | Проверка исправления |
|---|---|---|---|
| F1 | Register валидировал наличие email, но не формат: строка без `@` создаёт пользователя. | `backend/controllers/authController.js` | Локальные HTTP/PG tests: malformed, whitespace/двойной `@`, обязательные поля, короткий пароль — 400; корректная регистрация и normalization проходят. |
| F2 | В updateProfile проверялось значение с default `ru`, а сохранялось `String(undefined)`. | `backend/controllers/authController.js` | Локальный PUT без language возвращает/сохраняет ru. Role, identity, password не изменяются; B остаётся неизменным. |
| F3 | ProtectedRoute читал localStorage без подписки. Удаление session при 401 не уведомляло UI; другая вкладка не реагировала на logout. | `ProtectedRoute.jsx`, `Navbar.jsx`, `FavoritesContext.jsx`, `authFetch.js`; новые `useSession.js`, `session.js` | Локальный Edge: logout закрывает protected tab, repeat login/F5 работают, 401 переводит на login, Back не восстанавливает profile. Подписка на storage/pageshow/auth event; при смене user protected subtree перемонтируется. Поздний 401 старого token не удаляет новую сессию; поздний favorites response старого token игнорируется. |
| F4 | Длинный email в profile hero не переносился и увеличивал ширину mobile document до 411 px при viewport 390. | `frontend/src/styles/Profile.css` | Перенос текста и min-width; local Edge с длинными именем/email: без overflow на всех четырёх размерах. |
| F5 | Desktop account actions скрываются на mobile, но mobile menu не содержит вход/выход. В staging оба счётчика видимых действий равны нулю. | `frontend/src/components/Navbar.jsx` | Добавлены login/logout в существующее mobile menu. Локальные проверки видимости обоих действий и перехода по login проходят. |

F1–F5 всё ещё присутствуют в опубликованной версии до обновления владельцем. В первичном browser runner была слишком ранняя проверка URL сразу после `goto('/profile')`: она ошибочно отметила anonymous redirect как FAIL до React hydration. Отдельный повтор с `waitForURL('**/login')` подтвердил PASS. Это исправлено в runner и не записано как дефект приложения.

## Реальные staging данные проверки

Созданы только следующие явно тестовые аккаунты; они не удалялись:

- `asedeliya.staging.3c.1789157409017.a@example.com` — UI register/login, профиль, read-only lists, roles и session checks.
- `asedeliya.staging.3c.1789157409017.b@example.com` — role injection register, нормализация, login и независимые пустые списки.
- `asedeliya.staging.3c.1789157409017.invalid` — некорректный email, принятый существующим сервером; evidence F1.
- `asedeliya.staging.3c.1789158027217.c@example.com` — повторный UI profile save/F5, blank phone/DOB, payment readiness и search form.

Пароли сгенерированы случайно в памяти; JWT/пароли/cookies/connection strings в отчёт и Git не переносились. Admin account и существующие данные владельца не изменялись. У A изменено тестовое имя и воспроизведено сохранение некорректного language; у C сохранено тестовое имя. Ненулевой новый телефон и настоящий DOB не придумывались. Email профиля сейчас read-only; эта бизнес-логика сохранена.

Фактические query из формы C: provider hotelbeds, страна Турция, departureDate 2026-12-01, people 3, children 1, childrenAges 8, nights 10, food AI, stars 5. Дополнительный direct Results query: country Turkey, city Antalya, destinationCode AYT, departureDate 2026-12-01, nights 7, people 2, children 1, childrenAges 8, food AI, stars 5. За navigation + reload наблюдалось ровно два search request на каждый viewport; бесконечного polling не обнаружено. Без query `/results` показывает форму, а не фиктивные предложения.

Проверенные document routes на каждом размере: `/`, `/login`, `/register`, `/results`, `/favorites`, `/my-bookings`, `/profile`, `/admin`, `/help/booking`, `/tour/hotelbeds/acceptance-unavailable`. Для profile дополнительно выполнен настоящий reload после login и после сохранения. Для Results с query — reload на всех размерах. `/admin` проверен только как запрещённый route обычного пользователя. Public/login/register/favorites/bookings/help и detail error layout не показали document overflow. Полный успех admin/details layout не заявляется. Loading state реального provider запроса отдельно не фиксировался; не объявляется проверенным.

Preflight `POST /api/auth/login`, requested headers content-type/authorization:

| Origin | HTTP | Access-Control-Allow-Origin | Credentials |
|---|---|---|---|
| `https://asedeliya-staging-web.onrender.com` | 204 | Точный staging origin | true |
| `https://example.org` | 403 | Отсутствует | Нет credentialed доступа |
| `http://localhost:5173` | 403 | Отсутствует | Нет credentialed доступа |

Проверены текущие публичные VITE-переменные в source: API URL и support contacts. JWT secret, DATABASE_URL и Hotelbeds credential identifiers в served JS не найдены; дополнительно выполнено сравнение bundle с известными локальными secret values без их вывода. Изменение Render env не выполнялось. Ожидаемые `HOTELBEDS_ENABLED=false`, `HOTELBEDS_ENV=test`, booking/content/monitor flags false заданы владельцем и соответствуют закрытому поведению; фактические значения всех private runtime env через Dashboard в этой сессии не читались. ProductionGate сохранён без изменений.

## Automated checks и воспроизведение

- `cd frontend; npm.cmd run build` — PASS.
- ESLint всех изменённых/созданных frontend JS/JSX/MJS — PASS.
- `node --check` всех 150 проверенных backend JS/CJS, включая новые tests — PASS.
- `cd backend; npm.cmd run test:sprint3c` — PASS, 15 tests по отчёту Node (8 acceptance subtests + parent и 6 deployment tests). Новый acceptance использует реальные Express routes, JWT/bcrypt и локальный PostgreSQL. Host guard запрещает удалённую БД; migrations выполняются во временной схеме внутри BEGIN, все fixtures и schema откатываются ROLLBACK. Существующие migrations не изменялись.
- Локальный production preview + `node frontend/scripts/staging-acceptance-ui.mjs` — PASS, 10 browser checks, 0 page errors. Это local UI fixtures, не staging data и не доказательство deployed исправлений.
- `node --test tests/hotelbedsLive.test.js` — PASS, 10 offline tests.
- Sprint 2I, 2J, 2K, 2L, 3A — PASS.
- Sprint 2H — FAIL, `tests/sprint2h.test.js:62`, исходное ожидание source substring `provider === "console"`; email-модуль и старые tests не менялись.
- `git diff --check` — PASS. Возможные предупреждения LF→CRLF отражают Windows Git configuration, не whitespace errors.

Для browser scripts использован Playwright во временном каталоге `%TEMP%/asedeliya-3c-tools`, установленный без изменения project dependencies/lockfiles, и системный Edge. Local UI: сначала `cd frontend; npm.cmd run preview -- --host 127.0.0.1`, затем из корня `node frontend/scripts/staging-acceptance-ui.mjs`. Read-only staging search/bundle/menu probe: тот же script с `--staging-public`. Этот probe сохраняет факты, а не присваивает автоматический общий PASS.

`backend/tests/stagingAcceptance.live.cjs` запускается только с явным `RUN_STAGING_ACCEPTANCE=yes`; он создаёт новые тестовые аккаунты. Не включён в обычный test:sprint3c и не должен запускаться автоматически в production CI. Основной реальный прогон дал 39 HTTP/preflight записей и 49 UI наблюдений; затем выполнены read-only search/mobile/bundle probe и отдельный focused UI профиль/поиск. Sanitized JSON/screenshot evidence оставлены во временном каталоге `asedeliya-3c-*`; в Git временные данные не добавлялись. Будущему повторному запуску нужно учитывать общий auth rate limit и не считать timeout/429 успешным тестом.

## Dependency audit

`npm audit --json` выполнен для обоих lockfiles через registry; ничего не обновлялось.

| Project | Package | Severity | Direct | npm сообщает fixAvailable |
|---|---|---|---|---|
| backend | qs | moderate | нет | да |
| frontend | qs | moderate | нет | да |
| frontend | multer | high | да | да |
| frontend | nanoid | high | нет | да |

Backend: 1 moderate, 0 high/critical. Frontend dependency graph: 1 moderate, 2 high, 0 critical. Наличие в dependency graph само по себе не доказывает включение в browser bundle или достижимость уязвимого кода. Нужен отдельный review advisory/dependency paths перед обновлением; `npm audit fix`, force и изменения dependencies не выполнялись.

## Файлы Sprint 3C

Изменены:

1. `backend/controllers/authController.js`
2. `backend/package.json` — добавлена команда test:sprint3c.
3. `frontend/src/components/Navbar.jsx`
4. `frontend/src/components/ProtectedRoute.jsx`
5. `frontend/src/context/FavoritesContext.jsx`
6. `frontend/src/services/authFetch.js`
7. `frontend/src/styles/Profile.css`

Созданы:

1. `backend/tests/stagingAcceptance.test.js`
2. `backend/tests/stagingAcceptance.live.cjs`
3. `frontend/scripts/staging-acceptance-ui.mjs`
4. `frontend/src/hooks/useSession.js`
5. `frontend/src/services/session.js`
6. `SPRINT_3C_STAGING_ACCEPTANCE_REPORT.md`

## Что осталось

Владелец должен проверить и опубликовать локальные изменения, затем повторить F1–F5 на staging. Отдельно проверить положительный admin login и responsive sidebar в административной сессии, а также обновлённый session lifecycle с непустыми данными. Не объявлять favorites/details/полный checkout успешными до появления допустимого каталога/offer; пока это документированные BLOCKED, без подделки цен.

Перед Hotelbeds LIVE остаются действия Sprint 3A: отдельные LIVE credentials/mTLS, договорные pricing/taxes/quota, контролируемые read-only smoke/catalog/Availability/CheckRate проверки, настоящий payment authorization/capture и reconciliation, cancellation/refund acceptance. Этот спринт не даёт разрешения снимать hard productionGate или включать provider/booking/payment/content/monitor flags. LIVE не включён. Реальных бронирований, списаний, возвратов или cancellation не было.
