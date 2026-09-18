# Sprint 3V — Help / Contacts / Legal UX Redesign

CODE / OFFLINE: PASS.
Render acceptance: NOT RUN.

1. **Initial git state.** Первой командой выполнен `git status --short`: tracked working tree чистый, поэтому initial diff не потребовался. Прежние untracked README.txt, docs/ и SPRINT_3N_CATALOG_EXPANSION_PLANNER_REPORT.md не изменялись. Старые reports не редактировались. Изучены Help, Footer/CSS, Navbar, FaqSection/CSS, Home, site config, App routes, ScrollToSection, HomeCollections CSS, existing frontend tests. Backend config safety checks и production/payment gate references читались без запуска приложения. AGENTS.md поиском не найден.

2. **Контекст acceptance.** 3Q/3R/3S/3T owner acceptance приняты только в сообщённом владельцем scope. Для 3U визуально подтверждён Login; реальные login/session/protected redirect NOT RUN по решению владельца, не ошибка. Browser password change 3T также NOT RUN. Нового Render acceptance в 3V не выполнялось.

3. **Audit routes/links до изменения.** App имел `/help/:topic`, с content только booking/cancellation/privacy. `/help`, `/contacts`, `/privacy`, отдельного legal index и общего wildcard 404 не было. Неизвестный help topic показывал простой текст «Страница не найдена»; неизвестный общий route не имел matching page. Footer: `/`, `/results`, `/favorites`, `/my-bookings`, `/#faq`, `/help/booking`, `/help/cancellation`, `/help/privacy`, tel/mailto. Эти существующие Footer routes были валидны; отсутствие help index/contact page было пробелом структуры, а не dead Footer ссылками. Navbar: Главная, «Туры» → results, `/#countries`, `/#home-search`, `/#contacts`, account/admin/auth links. Contacts anchor находился на Footer, Home FAQ — id=faq. ScrollToSection обслуживает hash и legacy #hot-tours→offers, не выполняет provider calls.

4. **Audit текстов/документов.** Booking описывал повторную проверку «перед оформлением» как действующий flow и условия «при оформлении». Cancellation направлял пользователя к доступным действиям/результату возврата. Это не соответствовало consumer sales-disabled UX. Privacy называлась «Политика конфиденциальности», но в проверенной frontend реализации содержала лишь несколько product paragraphs, в том числе активное оформление/передачу сведений поставщику. В проверенных routes/content нет утверждённого юридического документа, договорных реквизитов или подтверждённых сроков возврата/хранения. Это не заключение о документах вне приложения: docs/ и внешние правовые документы не аудировались. Новая страница не заявляет юридическую силу или compliance.

5. **Help hub.** Добавлен `/help` с заголовком «Помощь», шестью карточками: поиск, цены, бронирование, отмена/возврат, конфиденциальность, контакты. Статьи `/help/search`, `/help/prices`, `/help/booking`, `/help/cancellation`, `/help/privacy`; контакты `/contacts`. Ссылки ведут только на реализованные pages. Статьи показывают breadcrumbs-like nav с aria-current, readable header и links Help/Contacts/Home search. Общий content вынесен в helpContent.js, API не нужен.

6. **Booking help.** Явно: можно искать/сравнивать отели, смотреть номер/питание/тестовую цену, сохранять избранное после входа. «Реальное бронирование и оплата сейчас отключены». Просмотр/favorite не резервируют номер. Будущая реальная операция требует повторной проверки тарифа; условия должны быть показаны до оформления. Тестовая запись не подтверждает проживание/оплату. Нет instructions оплатить, обещаний подтверждения/списания, rateKey/offerToken/internal provider деталей. Search/prices разделяют total/per-night, валюту, guests/nights и saved price; перелёт/трансфер/страхование не считаются включёнными в hotel stay search.

7. **Cancellation/refunds.** Реальные бронирования из текущего TEST режима не оформляются, реальная отмена/возврат по ним недоступны. Будущие правила зависят от тарифа и должны быть показаны до оформления. Нет бесплатного возврата, фиксированных сроков/процентов, гарантий или кнопок sandbox refund. Тестовая запись не выдаётся за движение денег. Backend refund lifecycle не изменялся и не вызывался.

8. **Privacy factual boundary.** Заголовок «Конфиденциальность», явное «информационная страница … не утверждённая юридическая политика». Описаны реальные имя/email/optional phone/settings, account/favorites/имеющиеся заявки, existing localStorage session и очистка авторизации при logout. Отмечено, что logout не удаляет аккаунт/записи. Нет GDPR/KZ compliance claim, retention periods или гарантии «никогда не передаём третьим лицам». Не добавлены неподтверждённые юридические основания, entity registration number или DPO/contact roles.

9. **Contacts.** Новый `/contacts` и shared ContactDetails для страницы/Footer используют только прежний site.js: default phone `+7 707 630 61 35`, email `newgign@gmail.com`, city `Астана, Казахстан`; существующие VITE_SUPPORT_PHONE/EMAIL overrides сохраняются, env не меняется. Эти значения уже были в проекте; их фактическая работоспособность независимо не проверялась. tel/mailto с accessible labels, город без выдуманного street address. Нет WhatsApp/Telegram, внешней карты/iframe, contact form, SLA/24×7 promises или отправки сообщений инструментами.

10. **FAQ.** Общие faqItems и прежний accordion. Home остаётся компактным: четыре исходные темы и «Все вопросы и помощь» → /help; Help hub показывает шесть, дополнительно booking disabled и account/favorites. Статьи не дублируют весь accordion. Home вопрос о тестовой цене уже содержит booking/payment disabled statement. Native buttons с aria-expanded/controls, panels role=region/aria-labelledby/hidden; один open item, повторный click закрывает. Существующие четыре Home пункта и old tests сохранены.

11. **Footer/Nav.** Один shared Footer на существующих потребительских pages и новых help/contact/404. Сохранены прежние рабочие ссылки и id=contacts; добавлены Help/Contacts, privacy label изменён на «Конфиденциальность». ContactDetails исключает рассинхронизацию values. Navbar «Туры» → «Отели», Contacts → /contacts; остальные Home anchors, auth/admin visibility не менялись. Help доступен из Footer/Home FAQ, Navbar не перегружался новым пунктом. Старый /#contacts продолжает работать, ScrollToSection не менялся. Payment logos/partners/company details не добавлялись.

12. **NotFound.** Wildcard `*` в App показывает NotFound с Navbar/Footer, «Страница не найдена» и «Вернуться на главную»/Help, без silent redirect. Неизвестные help темы используют тот же view; Object.hasOwn защищает от constructor/__proto__ как фиктивной темы. ProtectedRoute/auth redirects и конкретные routes сохраняются. Это client-side 404 UI; HTTP status статического хостинга не менялся. `/privacy` ранее отсутствовал и остаётся 404; canonical privacy route — `/help/privacy`.

13. **Design/responsive.** support content width ≤1320px, article ≤840px, cards с border/light shadow и white surface, общий navbar clearance. Desktop hub 3 columns, ≤1000px 2, ≤600px 1. Footer 4/2/1 columns minmax(0,1fr) вместо minimum 240px columns; min-width:0/border-box/wrap защищают длинные email/text. На 320px support width 292px, article внутреннее пространство 250px после 20px paddings/borders; ссылки переносятся, contact actions full width. FAQ min-width/wrap/focus добавлены без JS resize. Footer в естественном document flow, не fixed. Реальные 360–390px screenshots/layout measurements не выполнялись.

14. **Accessibility.** main/header/article/nav/section/address; h1 страницы и h2 карточек/FAQ; anchors/Link вместо clickable div; contact aria-label, FAQ button semantics и current-topic aria-current. Scoped focus-visible на Help/FAQ/Footer, текущие Navbar focus rules сохранены. Keyboard Tab/Enter/Space поддерживаются native elements; фактический browser/screen-reader walkthrough остаётся acceptance. Full WCAG audit не заявляется.

15. **Network evidence.** helpUx.test.mjs рендерит реальные HelpView, ContactsView, NotFoundView, Footer, FaqSection; fetch spy запрещает любые HTTP, включая payment. Hotelbeds client entrypoints замоканы fail-on-call по шести категориям. Результат status=0/content=0/availability=0/checkrate=0/booking=0/cancellation=0; all HTTP/payment calls=0. Source asserts отсутствие fetch/authFetch/payment/booking services/effects/timers в новых static views и FAQ. Links проверены через matchRoutes с route patterns фактического App; help topics и anchors проверены отдельно. Это SSR/source evidence, не mounted router/accordion automation. Shell использует прежний Navbar/FavoritesProvider: у авторизованного пользователя глобальный provider может сделать прежний own GET /favorites, не Hotelbeds/payment. Home search CTA может загрузить прежний локальный catalog при переходе Home; help сам поиск не запускает.

16. **Exact changed files.**

    - frontend/src/App.jsx — help index/contact/wildcard routes.
    - frontend/src/pages/Help.jsx — hub/article rendering, unknown topic.
    - frontend/src/pages/Contacts.jsx — новая contact page/view.
    - frontend/src/pages/NotFound.jsx — новая shared 404 page/view.
    - frontend/src/content/helpContent.js — новые factual articles/shared FAQ data.
    - frontend/src/components/ContactDetails.jsx — новый shared contact presentation.
    - frontend/src/components/FaqSection.jsx — shared data, compact/full modes, Help link.
    - frontend/src/components/FaqSection.css — wrap/min-width/focus.
    - frontend/src/components/Footer.jsx — shared contacts, Help/Contacts/privacy links.
    - frontend/src/components/Footer.css — responsive columns/wrap/focus.
    - frontend/src/components/Navbar.jsx — только Отели/Contacts link.
    - frontend/src/styles/Help.css — новый scoped support layout.
    - frontend/tests/helpUx.test.mjs — новый offline suite.
    - SPRINT_3V_HELP_CONTACTS_LEGAL_UX_REPORT.md — этот отчёт.

17. **Tests/results.**

    | Проверка | Результат |
    | --- | --- |
    | Новый 3V suite | PASS — 8 reported tests (parent + 7 subtests) |
    | Все frontend suites вместе | PASS — 89 |
    | 3U / 3T / 3S / 3R | PASS — 10 / 10 / 12 / 10 |
    | 3Q / Results acceptance | PASS — 8 |
    | 3P / 3P.1 | PASS — 10 |
    | 3O / 3O.1 / 3O.2 frontend | PASS — 15 |
    | 3N / 3M.1 / 3K | PASS — 4 / 1 / 1 |
    | Full backend runner | PASS — 101 |
    | Frontend lint | PASS — 0 errors, 3 прежних admin warnings |
    | Production build | PASS — 165 modules |
    | Backend syntax / secret scan | PASS — 183 backend files, 369 scanned files, findings=[] |
    | git diff --check | PASS |

    Из frontend: `node --require ../backend/tests/offlineNetwork.cjs --test --test-concurrency=1 --test-force-exit tests/helpUx.test.mjs tests/authUx.test.mjs tests/profileUx.test.mjs tests/accountUx.test.mjs tests/detailsUx.test.mjs tests/resultsAcceptance.test.mjs tests/homeUx.test.mjs tests/rateAwareFiltering.test.mjs tests/searchQuality.test.mjs tests/catalogPlanner.test.mjs tests/accessCircuits.test.mjs tests/catalogSearchUx.test.mjs`. Также npm.cmd run lint/build; TEST display flag только process env. Из корня: `node backend/scripts/sprint3mRegression.cjs`, `node backend/scripts/sprint3mVerify.cjs`, `git -c core.safecrlf=false diff --check`. Existing tests не изменялись и не ослаблялись. Новый и общий прогоны прошли с первого раза. Lint warnings прежние: BookingsTable/NotificationsTable/RefundsTable hook dependency load.

18. **Limitations/safety.** Browser/Render acceptance NOT RUN, контакты не обзванивались/не проверялись письмом. Privacy — product notice, правовая проверка не выполнена и compliance не заявляется. Нет гарантий о будущих условиях бронирования/возврата. Backend production/migrations/safety flags/provider pipeline/auth/selection/ranking/candidate compaction/Results/Details не менялись. NO real Hotelbeds/Content/Status/Availability/CheckRate/Booking/Cancellation/LIVE, NO payment calls. Backend runner использовал offline stubs и временные схемы локального PostgreSQL. Render/env/Secret Files не менялись, git add/commit/push/deploy не выполнялись. README.txt/docs/старые reports не тронуты. Secret scan проверяет известные локальные secret values/private-key patterns, не все мыслимые секреты.

19. **Owner Render checklist — NOT RUN.** Использовать offline/network-intercept fixtures; этот sprint не разрешает provider/payment traffic.

    1. Home → FAQ: четыре compact темы, toggle/close, ссылка всей помощи.
    2. Footer → каждый navigation/help link: нет blank/dead routes, старые Home anchors работают.
    3. /help: шесть карточек, шесть FAQ, readable desktop layout.
    4. /help/booking: явное booking/payment disabled, future tariff recheck без активного оформления.
    5. /help/cancellation: реальная отмена/возврат недоступны, нет обещаний сроков/процентов/бесплатности.
    6. /help/privacy: информационный статус, factual account/session data, нет compliance claims.
    7. /contacts: существующие values, tel/mailto labels; не отправлять письма/не звонить без отдельного решения владельца.
    8. Неизвестный URL и /help/unknown: явная 404, Home/Help links; protected auth redirects не нарушены.
    9. Desktop/tablet/360–390px плюс 320px: wrap длинного email/текста, columns stack, footer в потоке, no overflow.
    10. Keyboard FAQ/navigation: Tab, Enter/Space, видимый focus, expanded/controls/hidden states.
    11. Сверить уже доступные observations до/после help/navigation без запуска provider probes: все шесть счётчиков не увеличиваются из-за этих операций.
    12. Network: никаких provider/payment calls; зафиксировать фактический owner acceptance отдельно. Render PASS пока не заявляется.
