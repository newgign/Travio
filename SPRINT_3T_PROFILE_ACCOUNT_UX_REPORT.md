# Sprint 3T — Profile & Account UX Redesign

CODE / OFFLINE: PASS.
Sprint 3T Render acceptance: NOT RUN.

Owner Render acceptance Sprint 3S: PASS по сообщению владельца только для Favorites/My Bookings empty states и zero-extra-Hotelbeds-network: status=0, content=0, availability не увеличился, checkrate=0. Non-empty favorite remove в браузере не выполнялся; non-empty bookings недоступны в текущем sales-disabled режиме. Эти cases покрывались offline tests. Это сообщение не является независимой проверкой Render в 3T.

1. **Initial git state.** Первой командой выполнен `git status --short`, затем `git diff --stat` и `git diff`. Tracked working tree чистый. Только прежние untracked README.txt, docs/ и SPRINT_3N_CATALOG_EXPANSION_PLANNER_REPORT.md; они не менялись. 3S уже находился в базовом tracked состоянии. Изучены Profile/CSS, Navbar, session/useSession, ProtectedRoute/App, Login/Register, profileService/authFetch, Favorites/MyBookings account store/tests, backend auth/users routes, authController и migrations 002/009. Backend использовался только для чтения и offline tests. AGENTS.md поиском по проекту не найден.

2. **Factual user contract.** buildPublicUser возвращает id, full_name, email, phone, role, preferred_language, email_notifications, booking_reminders, created_at. GET profile дополнительно возвращает SQL booking stats. users содержит password hash и updated_at, но public response их не включает. Нет user avatar, birthDate, city, country, отдельных firstName/lastName или profile status/completeness. birth_date у traveler/booking — другой contract, не поле user. role user/admin; public Profile показывает badge только для admin. Database ID нужен существующей auth architecture, но не выводится в markup.

3. **Existing endpoints/auth.** POST /auth/login и /auth/register остаются прежними. Authenticated GET /auth/profile возвращает public user + stats; PUT /auth/profile — {message,user,stats}; PUT /auth/password принимает currentPassword/newPassword и возвращает message. Все три account операции используют БД, password compare/hash локальны. Login сохраняет token/user в существующем localStorage session и dispatch travio-auth-changed; useSession подписан через useSyncExternalStore. Нет нового auth механизма. DELETE /users/:id существует только как admin operation за requireRole(admin), не self-service account deletion; danger zone не добавлена.

4. **Profile before/after.** До: большой экран со stats, контактной формой, password, travelers CRUD, email delivery/debug и payment readiness; загрузка пяти ресурсов, alert() для ошибок/успеха, смешение изменяемого draft с отображаемым profile. После: consumer header «Личный кабинет» / «Управляйте личными данными и настройками аккаунта», summary, две ограниченные по ширине формы личных данных/безопасности, shortcuts и logout. Profile больше не загружает travelers, notification history/status или payment readiness, не отправляет тестовые письма. Travelers editor убран из этого экрана вместе с техническими панелями; его API, данные и Checkout integration не изменялись. Это сознательное сужение пользовательского Profile до account scope, не удаление backend capabilities.

5. **Editable/read-only.** Editable: full_name, phone, preferred_language (ru/kk/en), email_notifications, booking_reminders — все поддержаны существующим PUT. Обе boolean настройки сохраняются явно, чтобы backend defaults не включали их случайно. Email readOnly с пояснением об отсутствии изменения здесь; неподтверждённого «изменения через администратора» нет. Summary показывает подтверждённые имя/email/phone и валидную created_at. Initials fallback без image URL, внешнего avatar service или upload. Предпочитаемый язык не обещает автоматического перевода UI; reminders явно обозначены будущим сервисом.

6. **Validation.** Имя после trim не пустое — существующий controller validator. Ограничения имени 255 и телефона 50 следуют фактическим VARCHAR schema, не новым правилам backend. Телефон не переформатируется, frontend отправляет исходное значение; существующий backend сам trim/null-normalizes. Password требует текущий пароль и минимум 8 символов нового, как controller; confirmation проверяется только локально и не отправляется. Email syntax в Profile не валидируется, поскольку email не редактируется. Backend validation не менялась. Ошибки полей inline, aria-invalid/aria-describedby; raw server error не показывается.

7. **Save/cancel.** Page-local profileStore хранит user как последнее подтверждённое состояние и отдельный draft. Summary не меняется при наборе текста. «Сохранить изменения» disabled без dirty или во время запроса; store синхронно deduplicates submit. Поля блокируются на pending. Success принимается только с валидным public user response; затем обновляются confirmed user, draft и существующая session. При 4xx/5xx/malformed success прежний user остаётся, dirty draft сохраняется. «Отменить изменения» восстанавливает последние подтверждённые значения без HTTP. Dirty message явный; navigation blocker/modal не добавлен.

8. **Password.** Реальная отдельная форма сохранена на существующем PUT /auth/password. Есть current/new/confirmation, autoComplete, show/hide type=button с accessible label/aria-pressed, pending и duplicate protection. В запросе только currentPassword/newPassword. Password values живут только в памяти page store, не в localStorage/sessionStorage/URL. После успеха, server failure, auth expiry или invalidate очищаются. Не добавлены reset/verification/MFA, изменения bcrypt/token lifetime или automatic session revocation. Существующий password endpoint не отзывает текущий JWT; эта backend семантика сохранена.

9. **Auth/session.** Существующий ProtectedRoute остаётся; Profile дополнительно проверяет token/user и использует Navigate /login replace. Store принадлежит конкретному token, проверяет его перед отправкой и применением результата, generation защищает unmount. Старый response не публикует user в новый login. Учтено, что authFetch на 401 очищает token до catch: локальное персональное состояние также очищается. Неавторизованное состояние не превращается в пустой profile. Новый store на смену token и keyed view предотвращают показ предыдущей формы. Нет polling, только cancellable setTimeout(0) для mount load.

10. **Navbar integration.** Navbar использует прежний useSession, теперь label full_name с fallback email/«Личный кабинет», profile aria-label и явный button type. updateSessionUser публикует allowlisted подтверждённый user через существующий travio-auth-changed; full reload для save не нужен. Logout вынесен из Navbar в session.js без изменения поведения: clear token/user, event, location.href='/'. Profile и Navbar вызывают один handler. Admin shortcut и guest Login/Register flow сохранены; mobile Navbar не перестраивался, существующий desktop ellipsis сохранён. Второй общий user store не создавался; profileStore — временный draft экрана.

11. **Shortcuts.** Keyboard links /favorites и /my-bookings, admin link только при role=admin. Новых fetch для counts нет, booking stats не выдаются за loyalty/profile completeness. Existing глобальный FavoritesProvider по-прежнему может выполнять собственный GET /favorites при запуске приложения; Profile не добавляет запросов к нему. Навигация к Favorites/MyBookings использует уже проверенные app-only flows 3S.

12. **Loading/error/success.** До загрузки structured skeleton, без empty → loaded скачка и без cached personal data в форме. Load failure: «Не удалось загрузить данные профиля» и retry собственного GET. Save failure: «Не удалось сохранить изменения» role=alert. Validation отдельно у полей. Password errors нейтральны, не копируют серверный объект. Success «Изменения сохранены» / «Пароль изменён» через role=status/aria-live polite; редактирование сбрасывает соответствующий feedback. alert() в новом Profile отсутствует.

13. **Privacy/security.** publicProfile allowlist отделяет display/session user от raw server object; token/hash/stats/internal metadata не распространяются новым Profile в markup или session update. ID остаётся только в session contract для ProtectedRoute, не в UI. Personal fields не попадают в URL/query/debug logs. Нет JSON.stringify(full user) в markup. Passwords отправляются только body существующего auth API; тестовые строки — фикстуры, не реальные credentials. Existing Login/Register implementation и localStorage token architecture не переписывались.

14. **Responsive/date/phone.** Общий AccountPages max-width 1320px и navbar clearance; форма max-width 640px. Desktop две колонки, ≤1024px одна; ≤600px compact paddings/avatar, shortcuts stack, actions full width и password inputs/button wrap. min-width:0/minmax(0,1fr), box-sizing и общие overflow-wrap/focus rules. Phone без выдуманной country conversion. created_at использует существующий UTC-safe displayDate: invalid скрывается, нет Invalid Date. User date-only birthDate отсутствует и не добавлялся. Это CSS/source evidence, не browser geometry.

15. **Accessibility.** main/header/section/nav/headings; явные label/htmlFor/id; fieldset/legend для настроек; aria-invalid и aria-describedby для validation; safe server errors role=alert; save messages aria-live polite; native links и правильные button types; focus-visible из AccountPages. Read-only email доступен для чтения/копирования. Initials декоративны, имя рядом текстом. Keyboard/screen reader walkthrough в браузере остаётся acceptance.

16. **Zero-Hotelbeds evidence.** Новый frontend fixture запускает реальные profileStore/profileService/authFetch/session helpers с mocked fetch, разрешающим только GET/PUT /auth/profile и PUT /auth/password. Проверены load, edit/cancel (0 requests), deduplicated save (1 PUT), failed save, malformed success, password validation/save/failure, load retry, 401, late response нового login и logout (0 requests). SSR проверяет allowlisted display, shortcuts, отсутствие внутренних ID/token/hash. Отдельный test вызывает реальные backend profile/updateProfile/changePassword controllers с mocked pool/bcrypt и fail-on-call client entrypoints. Итог counters: Availability=0, Content=0, Status=0, CheckRate=0, Booking=0, Cancellation=0. Full regressions 3S подтверждают destination pages app-only semantics. HTTPS offline preload запрещает реальный HTTPS. Это handler/store/controller + SSR/CSS evidence; mounted navigation/show-hide/Navbar rerender не исполнялись в браузере. Navbar evidence — общий session event/state и реальный accountName плюс source wiring, не screenshot.

17. **Changed files.**

    - frontend/src/pages/Profile.jsx — consumer composition, формы/states, protected session binding.
    - frontend/src/styles/Profile.css — ограниченная ширина, desktop/tablet/mobile, inputs и summary.
    - frontend/src/components/Navbar.jsx — общий logout, accountName fallback/aria-label/button type.
    - frontend/src/services/session.js — общий существующий logout flow и confirmed user publisher.
    - frontend/src/services/profileStore.js — новый page-local confirmed/draft/password lifecycle.
    - frontend/src/utils/profilePresentation.js — новый public allowlist, initials/name и contract validation.
    - frontend/tests/profileUx.test.mjs — новый 3T offline suite.
    - SPRINT_3T_PROFILE_ACCOUNT_UX_REPORT.md — этот отчёт.

    Backend, routes, Login/Register, Favorites/MyBookings, old tests, provider pipeline и protected selection helpers не менялись.

18. **Tests.**

    | Проверка | Результат |
    | --- | --- |
    | 3T suite | PASS — 10 reported tests: 2 top-level + 8 subtests |
    | Общий frontend run | PASS — 71 |
    | 3S | PASS — 12 |
    | 3R | PASS — 10 |
    | 3Q / Results acceptance | PASS — 8 |
    | 3P / 3P.1 | PASS — 10 |
    | 3O / 3O.1 / 3O.2 frontend | PASS — 15 |
    | 3N / 3M.1 / 3K | PASS — 4 / 1 / 1 |
    | Full backend runner | PASS — 101 |
    | Frontend lint | PASS — 0 errors, 3 прежних admin warnings |
    | Production build | PASS — 157 modules |
    | Backend syntax / secret scan | PASS — 183 backend files, 358 scanned files, findings=[] |
    | git diff --check | PASS |

    Из frontend: `node --require ../backend/tests/offlineNetwork.cjs --test --test-concurrency=1 --test-force-exit tests/profileUx.test.mjs tests/accountUx.test.mjs tests/detailsUx.test.mjs tests/resultsAcceptance.test.mjs tests/homeUx.test.mjs tests/rateAwareFiltering.test.mjs tests/searchQuality.test.mjs tests/catalogPlanner.test.mjs tests/accessCircuits.test.mjs tests/catalogSearchUx.test.mjs`. Дополнительно `npm.cmd run lint` и `npm.cmd run build` с VITE_HOTELBEDS_STAGING_TEST_ENABLED=true только в текущем процессе. Из корня: `node backend/scripts/sprint3mRegression.cjs`, `node backend/scripts/sprint3mVerify.cjs`, `git -c core.safecrlf=false diff --check`.

19. **Regressions.** Новый и полный frontend suites прошли с первого запуска; existing tests не менялись. При review до тестов устранён случай authFetch 401 clearing token до store catch. Existing lint warnings: BookingsTable, NotificationsTable, RefundsTable dependency load. Первоначальный apply_patch с delete/add одного пути в одном patch был отклонён до применения; замена выполнена последовательными patch, код восстановлен до проверки. Это ошибка инструмента редактирования, не production/test failure.

20. **Limitations.** Render/screenshots/mounted browser interactions не запускались; responsive/browser acceptance не заявляется. Travelers CRUD и notification history больше не представлены в Profile; их отдельное UX развитие не входит в этот sprint. Language preference — persisted setting, не обещание локализации всего сайта; reminders зависят от будущего сервиса. Password session revocation — прежнее backend ограничение. Secret scan покрывает известные локальные secret values/private-key patterns, не абсолютное доказательство отсутствия любых секретов.

21. **Safety/final audit.** NO real Hotelbeds Availability/Content/Status/CheckRate/Booking/Cancellation/LIVE, NO payment calls. Backend runner работает на offline stubs и временных схемах локального PostgreSQL. Safety env flags/Secret Files/Render settings не редактировались. hotelbedsDisplayRates/publicCandidate/searchService/transport/circuits/planner/importer/migrations/observations/localOfferFilters/selectedOfferSnapshot/Results/Details semantics не менялись. README.txt/docs/ и прежние reports не тронуты. Git add/commit/push/deploy не выполнялись. Финальный tracked diff ограничен Profile/Navbar/session и новыми 3T файлами; дерево оставлено для review.

22. **Owner Render acceptance — NOT RUN.** Только offline/network-intercept fixtures, без реальных provider/payment вызовов.

    - Authenticated /profile: новый header/summary, initials, phone/дата при наличии, email read-only, admin badge/link только admin; нет ID/hash/token/debug.
    - Loading skeleton, GET error/retry, guest/401 → login без старых данных.
    - Edit supported fields: dirty, save enabled, cancel возвращает confirmed values без запросов.
    - Double submit: один own PUT; до response summary/Navbar прежние, после success новые имя/значения и aria-live сообщение без reload.
    - 400/500: безопасный error, draft остаётся, summary не меняется; повторная попытка работает.
    - Password: validation/current/new/confirmation, show/hide без изменения значения, один PUT, очистка после success/failure; ничего не сохраняется в storage/URL.
    - Logout общий с Navbar: session очищена, переход на Home, protected data не остаются; проверить смену аккаунта при pending response.
    - Shortcuts Favorites/MyBookings и admin link, desktop/mobile Navbar, keyboard/focus/labels/read-only/alerts.
    - Desktop/tablet/360–390px: длинные имя/email/телефон, full-width inputs, wrap buttons, nav shortcuts, отсутствие horizontal overflow.
    - На opening/edit/save/cancel/logout/navigation fixture counters: Availability=Content=Status=CheckRate=Booking=Cancellation=0; собственные account/favorites/bookings API разрешены.
    - Зафиксировать owner result отдельно. Sprint 3T Render PASS сейчас не заявляется.
