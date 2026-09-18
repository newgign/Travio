# Sprint 3U — Login / Register / Authentication UX Redesign

CODE / OFFLINE: PASS.
Render acceptance: NOT RUN.

## Initial audit — before implementation

Первой командой выполнен `git status --short`: tracked tree чистый; поэтому git diff/stat на входе не запускались. Прежние untracked README.txt, docs/, SPRINT_3N_CATALOG_EXPANSION_PLANNER_REPORT.md не трогаются. Старые reports не изменяются. Изучены Login/Register/Auth.css, ProtectedRoute/App, Navbar, session/useSession/authFetch, API base, Profile 3T, AccountAuth/Favorites/MyBookings, auth routes/controller и users schema. AGENTS.md в проекте поиском не найден.

Фактический backend contract:

- POST /auth/login: email/password; email trim+lowercase, пароль без trim; missing values → 400, неизвестный email/неверный пароль → одинаковый 401. Success 200: message, token, user.
- POST /auth/register: full_name/email/password и необязательный phone. Имя/телефон trim, пустой телефон → null; email trim+lowercase, regex `^[^\s@]+@[^\s@]+\.[^\s@]+$`, максимум 254; пароль минимум 8. Schema full_name VARCHAR(255), phone VARCHAR(50), email VARCHAR(320), register validator строже для email. Duplicate email → 409. Success 201: message/user, без token и без автоматической сессии.
- Public user: id/full_name/email/phone/role/preferred_language/email_notifications/booking_reminders/created_at. Hash не возвращается. Пароль bcrypt hash cost 12; login JWT id/email/role и существующий срок JWT_EXPIRES_IN или 7d. Регистрация не принимает role, действует default user.
- Существуют authenticated profile GET/PUT и password change PUT; нет reset/forgot password, email verification, social auth, MFA, magic links, remember-me server sessions, avatar upload или terms acceptance persistence. Admin delete-user не является self-service account deletion.
- Ошибки имеют HTTP status + message; internal messages не должны копироваться в новый UI. Backend production не требует изменений.

До: alert(), обещания бронирования, отсутствие inline errors/show-hide/synchronous duplicate guard, raw response сохранение, нет safe return route и late-response protection. План: общий consumer auth view и page-local form lifecycle поверх существующей session, без второго global user store.

Owner 3T acceptance: PASS по сообщению владельца для profile load/save/cancel/session Navbar sync/Favorites/My Bookings/zero-extra-Hotelbeds; реальная browser смена пароля NOT RUN, не считается ошибкой. Здесь Render не перепроверялся.

## Implementation / results

1. **До / после.** Login/Register теперь небольшие route wrappers над общим AuthPage/AuthView. Светлый фон, card max-width 500px, компактный бренд со ссылкой Home, consumer wording без обещаний доступного бронирования. Общая форма, labels и ошибки согласованы с Profile. Нет маркетинговой split-screen, TEST/provider/debug блоков, fake features. Компактный auth header используется вместо полного Navbar; Footer не добавлялся.

2. **Login.** «Вход в аккаунт», «Войдите, чтобы управлять избранным, профилем и поездками». Email type=email/autocomplete=email; password autocomplete=current-password. Show/hide сохраняет value, отдельная кнопка type=button с aria-label/aria-pressed. CTA «Войти» / «Входим…», disabled при pending. «Нет аккаунта? Зарегистрироваться» — настоящая ссылка /register. Reset link отсутствует, поскольку endpoint отсутствует.

3. **Register.** «Создать аккаунт», поля full_name/email/phone/password; phone явно необязателен. confirmPassword только локальный, не попадает в body. Password autocomplete=new-password, текущий minimum 8 без дополнительных правил. Success требует валидного public user; переход /login replace с нейтральным «Аккаунт создан. Теперь войдите в Asedeliya». Ни автоматического login, ни email verification обещания. History state содержит только registered boolean и safe returnTo, никаких personal fields.

4. **Validation.** Login: required email/password, разумный email syntax по существующему register regex. Register: имя required, максимум 255 по schema; email максимум 254 и regex по validator; phone максимум 50 по schema; пароль ≥8 по JS length backend; confirmation совпадает. Имя/телефон schema lengths считаются по Unicode code points. Login не получает нового password minimum и register-specific email length ceiling. Email trim перед отправкой; lowercase оставлен backend, identity semantics не изменены. Пароль никогда не trim. Телефон отправляется без выдуманного форматирования; backend сам trim/null-normalizes. Inline errors связаны через aria-describedby/aria-invalid. submit сначала синхронно валидирует, затем focusAuthError фокусирует первое ошибочное поле по порядку формы. Невалидная форма не отправляет POST. alert() отсутствует.

5. **Safe error mapping.** Login 401 → «Не удалось войти. Проверьте email и пароль.» без разделения account missing/wrong password. Register 409 → «Аккаунт с таким email уже существует.» — соответствует уже существующему backend disclosure. HTTP 400 → «Проверьте заполненные поля и попробуйте ещё раз.». Network/500/malformed JSON/невалидный 2xx → «Не удалось выполнить запрос. Попробуйте ещё раз.». Серверные error body вообще не читаются для показа. Error role=alert; passwords очищаются после завершившегося запроса, остальные поля сохраняются для исправления. Frontend validation errors не стирают введённый пароль.

6. **Success/session.** authSuccess проверяет положительный integer id, email/name types, role user/admin, типы optional public fields, непустую строку token без whitespace для login; затем используется тот же publicProfile allowlist 3T. Token не декодируется в UI; проверка его подписи и полномочий остаётся серверу. Login устанавливает только существующие token/user localStorage entries и dispatch travio-auth-changed. Navbar использует прежний useSession/accountName и обновляется без F5. AuthFormStore — только временные значения формы, второй global user store не создан. Register не записывает session. Неуспешный login не очищает и не заменяет существующий user: используется отдельный unauthenticated POST, а не authFetch 401 expiry behavior.

7. **Redirect security.** Только точные paths `/profile`, `/favorites`, `/my-bookings`; `/admin` и `/admin/bookings` — только после role=admin. ProtectedRoute сохраняет allowlisted pathname в navigation state; AccountAuth даёт такой же returnTo для Favorites login CTA. Favorites остаётся страницей с guest auth state, автоматический redirect не добавлен. Profile/MyBookings expiry fallback передаёт соответствующий фиксированный путь. Login/Register ссылки сохраняют только safe returnTo. External/protocol-relative/javascript/backslash/encoded URL, query/hash, object/null и неизвестные internal paths отвергаются → `/`. Query redirect не читается. Даже admin без валидного origin возвращается Home, а не автоматически в CRM. Checkout/voucher/detail IDs не включены в allowlist.

8. **History semantics.** ProtectedRoute → login с replace; login success → destination с replace. Back не возвращает только что завершённую login submission entry. Login ↔ Register — обычные links, register success replaces register на login. Password не помещается в history state; unmount очищает form state. Browser Back/Forward и hard reload ещё требуют owner acceptance; offline проверены navigation arguments, safe path helper и source wiring.

9. **Auth expiry/races.** authFetch/clearSession existing owner-token guard сохранён. session.js добавляет revision для auth attempts: более новый submit, logout даже guest→guest, profile session update или successful login инвалидируют прежнюю попытку. Captured sessionSnapshot дополнительно обнаруживает смену token/user. Page store generation + AbortController предотвращают применение ответа после unmount, смены формы, logout/new login; проверка current выполняется перед POST и после response. connect подписывается на существующие session/storage/pageshow events, очищает локальную форму и abort pending; собственный commit event исключён из self-invalidation. Polling/timers не добавлены. Abort после отправки регистрации не гарантирует отмену server insert: UI лишь не применяет поздний ответ, что явно не выдаётся за rollback backend.

10. **Navbar/guest.** Явные Войти/Регистрация desktop и Войти/Создать аккаунт mobile; user name/admin shortcut только при существующем user. Общий logout session.js остаётся. В mobile nav добавлен overflow-y:auto, чтобы дополнительная guest ссылка оставалась доступной на коротком экране. Весь Navbar не перепроектировался. FavoritesProvider после установления сессии может выполнить свой прежний GET /favorites — это собственный API, не Hotelbeds; новый auth flow не добавляет provider requests.

11. **Responsive.** Desktop card 500px, border-box и min-width:0; tablet ≤1024 и mobile ≤600 с меньшими отступами. При 320px: side padding 14×2, card padding 20×2 и border 2 оставляют 250px для input; ≤360 show/hide переносится отдельной full-width кнопкой. На 390px input flex:1/min-width:0 делит строку с кнопкой, а не задаёт жёсткую ширину. Ошибки/заголовки переносятся overflow-wrap:anywhere. Нет JS resize listeners, fixed CTA или Footer overlay. Это reasoning/CSS evidence, не реальные layout measurements.

12. **Accessibility.** main/section/header/form, label/htmlFor/id, name/type/autocomplete, required с noValidate для единых inline errors, aria-invalid/describedby, role=alert для request errors. Submit native type=submit поддерживает Enter; show/hide type=button. Pending aria-busy и отдельный role=status/aria-live polite без visual layout jump; register success polite. Visible focus-visible на inputs/buttons/links. Tab order соответствует DOM. Полный WCAG/screen-reader audit не заявляется.

13. **Privacy.** Ни passwords, ни tokens, ни email/phone не добавляются в URL/query/history/debug. Пароли только page memory и body своего POST, очищаются после request/invalidate. user persistence ограничен public allowlist 3T, без hash/raw internal fields. ID остаётся во внутреннем существующем session contract, но отсутствует в markup. JWT lifetime/signing/bcrypt/backend roles не менялись. LocalStorage session architecture сохранена; это не переход на cookie/remember-me sessions.

14. **Zero-Hotelbeds evidence.** authUx.test.mjs использует реальные auth form/session/presentation helpers и mocked fetch, разрешающий только POST /auth/login и POST /auth/register без Authorization header. Проверены SSR, validation (0 requests), duplicate login/register (1 POST), successful session/event, safe errors/malformed response, return allowlist, register без session, late logout/new login/unmount/storage event и AbortSignal. Отдельный test вызывает реальные backend login/register controllers с mocked DB/bcrypt/JWT и fail-on-call client entrypoints. Финальные counters: status=0, content=0, availability=0, checkrate=0, booking=0, cancellation=0. Existing offlineNetwork preload запрещает реальный HTTPS. Это service/controller + SSR/source evidence, не mounted browser automation. Настоящих аккаунтов/паролей не создавали и не меняли.

15. **Exact changed files.**

    - frontend/src/pages/Login.jsx — wrapper общего auth UI.
    - frontend/src/pages/Register.jsx — wrapper register mode.
    - frontend/src/components/AuthPage.jsx — новый view/fields, visibility/focus/accessibility, lifecycle wiring.
    - frontend/src/services/authFormStore.js — новый local form/request lifecycle.
    - frontend/src/utils/authPresentation.js — новый validators/payload/error/success/return allowlist.
    - frontend/src/services/session.js — auth attempt revision и guarded session establishment.
    - frontend/src/components/ProtectedRoute.jsx — safe origin navigation state.
    - frontend/src/components/AccountStates.jsx — safe Favorites/auth CTA origin.
    - frontend/src/pages/Profile.jsx — только фиксированный returnTo при auth redirect.
    - frontend/src/pages/MyBookings.jsx — только фиксированный returnTo при auth redirect и завершающий newline.
    - frontend/src/components/Navbar.jsx — guest Login/Register links.
    - frontend/src/styles/Auth.css — новый scoped auth layout.
    - frontend/src/styles/Navbar.css — mobile menu overflow-y.
    - frontend/tests/authUx.test.mjs — новый suite.
    - SPRINT_3U_LOGIN_REGISTER_AUTH_UX_REPORT.md — этот отчёт, initial audit записан до реализации.

16. **Tests/results.**

    | Проверка | Результат |
    | --- | --- |
    | 3U suite | PASS — 10 reported tests: 2 top-level + 8 subtests |
    | Общий frontend run | PASS — 81 |
    | 3T / 3S / 3R | PASS — 10 / 12 / 10 |
    | 3Q / Results acceptance | PASS — 8 |
    | 3P / 3P.1 | PASS — 10 |
    | 3O / 3O.1 / 3O.2 frontend | PASS — 15 |
    | 3N / 3M.1 / 3K | PASS — 4 / 1 / 1 |
    | Full existing backend runner | PASS — 101 |
    | Frontend lint | PASS — 0 errors, 3 прежних admin warnings |
    | Production build | PASS — 160 modules |
    | Backend syntax / secret scan | PASS — 183 backend files, 363 scanned files, findings=[] |
    | git diff --check | PASS |

    Из frontend: `node --require ../backend/tests/offlineNetwork.cjs --test --test-concurrency=1 --test-force-exit tests/authUx.test.mjs tests/profileUx.test.mjs tests/accountUx.test.mjs tests/detailsUx.test.mjs tests/resultsAcceptance.test.mjs tests/homeUx.test.mjs tests/rateAwareFiltering.test.mjs tests/searchQuality.test.mjs tests/catalogPlanner.test.mjs tests/accessCircuits.test.mjs tests/catalogSearchUx.test.mjs`. Также `npm.cmd run lint`, `npm.cmd run build` с VITE_HOTELBEDS_STAGING_TEST_ENABLED=true только в процессе. Из корня: `node backend/scripts/sprint3mRegression.cjs`, `node backend/scripts/sprint3mVerify.cjs`, `git -c core.safecrlf=false diff --check`.

17. **Regressions/limitations.** Все тесты прошли с первого запуска; old tests не менялись/не ослаблялись. Прежние warnings BookingsTable/NotificationsTable/RefundsTable dependency load. Реальный register/login, browser geometry, mounted Navbar sync, actual focus/show-hide/history не выполнялись. Тест focus вызывает настоящий helper с fixture form elements; visibility/session/Navbar wiring дополнительно проверяется source/SSR. Нет обещания cryptographic JWT validation на frontend; backend остаётся authoritative. Browser password manager может предлагать сохранение пароля согласно браузерным настройкам; приложение само его не сохраняет. Abort не отменяет уже исполненную backend операцию. Secret scan ограничен известными локальными secret values/private-key patterns.

18. **Safety/final scope.** Backend production, migrations, provider pipeline/circuits/planner/importer/observations/ranking/compaction/Results/Details/snapshot helpers не менялись. Реальных Hotelbeds Status/Content/Availability/CheckRate/Booking/Cancellation/LIVE и payment calls не было. Backend regressions — offline stubs и временные схемы только локального PostgreSQL. Test JWT secret выставлялся только внутри test process и восстанавливался; env/Render/Secret Files не редактировались. README.txt/docs/старые reports не тронуты. Git add/commit/push/deploy не выполнялись. Рабочее дерево оставлено для owner review.

## Owner Render acceptance checklist — NOT RUN

Использовать network-intercept/offline fixtures для негативных, race и registration scenarios. Реальную регистрацию выполнять только после отдельного решения владельца создать test account. Этот sprint не разрешает реальные provider/payment запросы.

1. Guest открыть /login: header/card/layout, labels/email keyboard, password скрыт; show/hide сохраняет введённое значение; Register ссылка ведёт на /register.
2. Empty/invalid login: inline errors, focus первого ошибочного поля, POST отсутствует. Fixture 401/400/500/network/malformed success: safe error без raw data; при wrong credentials не различается наличие email.
3. Valid login: один собственный auth POST даже при double click; pending; после response Navbar/session обновлены без F5. Password отсутствует в storage/URL/history.
4. Ctrl+F5: existing localStorage session восстанавливается; invalid/expired session очищается при собственном API 401.
5. Logout: token/user удалены, переход Home; повторный protected route требует login, предыдущие personal data не видны.
6. Logged out /profile → login → успешный вход возвращает /profile. Проверить /favorites через auth CTA и /my-bookings. Проверить external/`//`/javascript/query return rejection, admin origin допускается только admin. Проверить Back/Forward; login success использует replace.
7. Register: поддержанные поля, phone optional, minimum 8, confirmation local only, show/hide. Fixture 409 safe. Fixture success → login с сообщением, без auto-login/verification. Реальная регистрация — только с отдельным разрешением владельца.
8. Desktop/tablet/mobile 360–390px и 320px: no overflow, Tab/Enter/focus, перенос show button, длинные ошибки, доступная mobile guest navigation. Full WCAG PASS не выводить из этой проверки автоматически.
9. Во время pending fixture выполнить logout/новый login/уход со страницы/storage event: поздний response не восстанавливает прежнюю session и не перенаправляет.
10. До/после auth проверки сверить уже доступные observations без запуска provider probes: status/content/availability/checkrate/booking/cancellation не увеличиваются из-за auth действий. Собственные auth/account/favorites API разрешены.
11. Записать фактический owner результат отдельно. Sprint 3U Render acceptance пока NOT RUN.
