# Sprint 3W — Global UI Consistency / Mobile / Accessibility Polish

CODE / OFFLINE: PASS.
Render acceptance: NOT RUN.

1. **Recovered git state.** Первой командой выполнен `git status --short`, затем `git diff --stat` и `git diff`. Tracked working tree чистый, staged изменений нет. Только прежние untracked README.txt, docs/ и SPRINT_3N_CATALOG_EXPANSION_PLANNER_REPORT.md. Файлов реализации 3W, globalUxPolish.test.mjs и отчёта 3W на диске не было. Поэтому утверждать, что реализация сохранилась до лимита, нельзя. Рабочее дерево — источник истины; откат/cleanup не выполнялись.

2. **Что было до продолжения / что выполнено сейчас.** Существующая рабочая реализация 3P–3V сохранена. До продолжения не было сохранённых 3W changes или результатов его tests. Сейчас выполнены audit, один consumer shell, ограниченный scoped CSS baseline, Navbar keyboard polish, labels старой формы Results, уточнение privacy, новый suite, все запрошенные regressions и этот отчёт. Старые suites и reports не редактировались.

3. **Audit scope.** Прочитаны App/global CSS, Navbar/Footer, Home/Hero/HomeSearch/GuestPanel/collections, Results/filters/cards, Details/gallery, account/Profile/Auth и Help/Contacts/404 styles/views, existing tests. Проверены containers, media queries, sticky/fixed, overflow, form labels, focus и animations. AGENTS.md поиском не найден. Backend production не редактировался. Owner acceptance прежних этапов принимается только в сообщённом scope: в частности, 3U real login/session и 3T browser password change NOT RUN не считаются ошибками; 3V desktop visual acceptance не заменяет mobile/network acceptance 3W.

4. **Inventory до изменения и решение.** Разные размеры не были автоматически признаны ошибками.

   | Область | Фактическое состояние / решение |
   | --- | --- |
   | A. Containers | Основные Results/Details/Account/Help 1320px; Home outer 1400px; Help article 840px; Auth 500px; Profile form 640px. Разделение сохранено, одинаковые consumer maxima привязаны к token. |
   | B. Top/gutters | Существующий --travio-page-top: 118/92/88px; большинство страниц gutters 24px desktop /14px mobile, Results 20px. Home hero и компактный Auth имеют собственную композицию. |
   | C. Radius | Основные cards 22px, Details section 20px, inputs 10–11px, маленькие badges 8–12px. Основные однотипные cards сведены к 22px; badges/gallery не уравниваются механически. |
   | D. Shadow | Несколько слабых shadows; выбран существующий 0 6px 24px #0f172a08 для account/support cards. Hero и price hierarchy сохраняют свои shadows. |
   | E. Border | #e2e8f0/#dbe2ea/#cbd5e1 и близкие оттенки. Основные карточки используют #e2e8f0; поля сохраняют различимый border. |
   | F/G. Buttons | Primary #245de0/#2563eb; secondary white. Pending opacity/cursor отличались. В scoped baseline спокойный disabled background/text, native disabled сохраняется. |
   | H. Forms | Home controls 52px; Profile/Auth 46px; filters 44px; guest +/- 36px. Home 52 сохранён, filters 46, guest +/- 44; без нового Form framework. |
   | I. Typography | Page h1 обычно clamp 28–40px, Auth 32/28; body 14–16, hints 11–13. Иерархия сохраняется, длинные строки получают перенос. |
   | J. Breakpoints | Home 1100/600, Navbar 1040/520, Results 1050/800/520, Details 1000/600 и height700, Profile1024/600, Auth1024/600/360, Favorites1100/700, Bookings800/600, Help1000/600. Они обслуживают разные layouts; массового объединения нет. |
   | K. Navbar | Fixed solid / отдельная Home позиция; clearance общий. Поздний media1040 переопределял padding520; исправлен consumer override. |
   | L. Footer | Normal flow, но root без flex и margin-top100; короткие pages не заполняли viewport. Теперь shell/main/flex, Footer не fixed. |
   | M/N. Duplicates/cascade | Footer CSS и HomeCollections задавали разные 1100/720 и1000/600 columns. Scoped consumer rules задают однозначные 4/2/1, независимо от старых global selectors. Старые CSS не удалены, чтобы не менять legacy/Admin. |
   | O. Overflow | Offscreen mobile menu transform, min-width actions, узкие guest rows, длинный Profile summary. Исправлены источники/риски; глобального body overflow-x:hidden не добавлено. |

5. **Конкретные проблемы: причина → before/after → evidence.**

   | Проблема / affected pages | Root cause и before | After / regression evidence |
   | --- | --- | --- |
   | Footer коротких Help/Contacts/404/Account | Root min-height без flex, content не занимал свободное место; Results main сам требовал100vh сверх Footer | Shell min-height100vh/100dvh, main flex, Footer margin-top:auto, Results min-height0. SSR shell/ordering и CSS test; browser geometry NOT RUN. |
   | Закрытое mobile Navbar | translateX скрывал визуально, но ссылки оставались доступными Tab; риск offscreen scroll area | visibility:hidden/pointer-events:none, без offscreen transform; open restores visibility, dynamic viewport height/scroll. Source/CSS regression. |
   | Navbar Escape/relationship | Не было aria-controls и Escape focus return | useId связывает toggle/nav; Escape закрывает и фокусирует toggle; decorative bars aria-hidden. Source regression, browser interaction NOT RUN. |
   | Mobile Navbar gutters | Последний <=1040 rule побеждал <=520 padding | Scoped <=520 возвращает14px16px. CSS regression. |
   | Footer columns | Пересекающиеся global media из HomeCollections/Footer | Consumer1000/600, 4→2→1 minmax(0,1fr). CSS + existing route tests. |
   | Results desktop sticky | top100px расходился с --travio-page-top118px | Использован общий clearance; <=800 fixed drawer top0 сохранён. CSS/source regression. |
   | Legacy Results filters accessibility | Заголовки h3 не были labels семи input/select | label/htmlFor + unique useId/id. SSR проверяет все7, instant form прежние6, duplicate ids отсутствуют. Payload/handlers не менялись. |
   | Guest controls/mobile long data | 36px buttons, тесные flex rows; Profile summary не переносил avatar/text как блоки | +/-44px, wrap; selects100%/min-width0, mobile summary wrap и card actions min-width0. CSS evidence, actual overflow не измерялся. |
   | Motion | Shimmer/transitions не имели общего consumer reduce override | Scoped prefers-reduced-motion отключает CSS animation/transition/smooth scroll и hover transforms cards. CSS test. |
   | Privacy | «не содержит гарантий о передаче» допускало двусмысленность | «не утверждает, что передача данных третьим лицам исключена». SSR test + 3V factual tests. |

6. **Global shell.** Единственный ConsumerShell оборачивает прежние Routes, не заменяет маршрутизацию и не выполняет запросы. Прямой main растёт; Home сохраняет свою .app/home-page композицию с внутренним main/Footer. Details grid/sticky container не изменён. Admin, checkout, voucher и legacy booking details исключены из нового wrapper/CSS. Auth остаётся compact page без Footer, как в 3U; новый Footer туда не добавлялся. Его main заполняет shell, карточка остаётся сверху с нормальными отступами. Это не второй auth/layout store.

7. **Tokens/consistency.** Consumer.css использует существующие значения бренда и --travio-page-top, добавляет только scoped tokens width/article-width/radius/border/surface/muted/primary/background/shadow/focus. Нет глобальной новой design system или правок Admin palette. Основные cards, disabled buttons и focus согласованы. Intentional Home/Auth/article widths сохранены.

8. **Navbar.** Auth/admin/favorite count/accountName/logout/links прежние. Long desktop name сохраняет ellipsis160px, mobile account ссылки доступны внутри scrollable меню. На1040 и ниже меню hidden до открытия;320–390 gutters16px, toggle44px. Escape доступен через header event bubbling. Это navigation, не новый modal: focus trap/body lock не добавлены. Существующий route-key close сохраняется. Shared Navbar получает aria/keyboard улучшение и вне consumer shell, но Admin styling не переделывается.

9. **Footer.** Прежний общий компонент, реальные contacts/routes не менялись. Определённая сетка4/2/1, перенос длинного email, links min-height44px. Footer normal flow и flex-shrink0. При коротком main свободное место распределяется до Footer; при длинном контенте Footer следует после него. Home сохраняет существующий внешний container/padding; не заявляется full-bleed redesign.

10. **Home.** Hero, пять search controls, destination/date/nights/guests URL и3P.1 positioning сохранены. Mobile <=600 одна колонка и guest panel normal flow, children ages не получают fixed min-width. +/- увеличены до44px; rows wrap вместо переполнения. Популярные направления, benefits, FAQ и catalog loading не менялись. Intentional desktop floating-panel JS остался прежним, новых listeners нет.

11. **Results.** Исправлены desktop sticky offset и mobile actions min-width. Drawer <=800, max-width viewport, scroll/body lock/Escape/focus trap прежние. Старой non-instant форме добавлены только labels/id; local instant filters и URL/providerQuery/rate-aware selection не менялись. Count/chips/sort/empty states и TOTAL hierarchy сохранены.

12. **Details.** Exact selected candidate/snapshot/freshness не редактировались. Gallery/thumbnails со своим overflow-x:auto, mobile <=1000 одна колонка, low-height<=700 sticky off сохранены. Общие card/focus/disabled tokens применены через scope; booking native disabled. Никакого fixed booking overlay, token/rateKey/raw display или resolver refresh не добавлено.

13. **Favorites / My Bookings.** Сохранены loading/error/auth/empty различия, persisted prices/statuses, remove pending/error rollback и own API. Cards/account empty получают тот же baseline, Footer заполняет короткий viewport. Fixtures non-empty остаются offline; реальные bookings не создавались.

14. **Profile.** Mobile summary может перенести текст под avatar, длинные значения wrap; поля46px, форма max640, <=1024 одна колонка, <=600 shortcuts/password controls stack. Confirmed/draft/save/cancel/session/Navbar sync/password lifecycle не менялись. Technical/debug panels не возвращались.

15. **Auth.** Карточка500px, <=600 gutters14px, <=360 show/hide stack сохранены. Общие disabled/focus/radius rules не меняют labels/errors/pending state. AuthFormStore/session/redirect/race logic untouched; никаких новых auth features. Реальный login/register/password не выполнялись.

16. **Help / Contacts /404.** Short-page shell, max article840px и existing1000/600 grid. Privacy: «Эта страница не устанавливает сроки хранения данных и не утверждает, что передача данных третьим лицам исключена». Это смысл запрошенного уточнения, без retention/compliance/юридических гарантий. Контакты, FAQ, canonical privacy route и unknown-route behavior прежние.

17. **Forms/buttons.** Home52px сохранён для search, account/auth/filter46px. Touch targets guest/favorite/reset/close/links около44px; secondary остаётся white, native disabled muted и не выглядит активным. Labels фильтров используют уже существующий .filter-block>label style. Native date/select, password values и validation не изменены.

18. **Typography / loading/error/empty.** Не вводились новые гигантские headings или глобальный font. Scoped long-string wrapping h1–h3/p/dl/status/chips/price. Skeleton/status, alert и empty CTA прежние; общие cards/focus связали визуальный baseline. Один h1 проверен SSR для help/contact/404/auth, остальные покрыты существующими page suites. Не заявляется автоматическая проверка всех DOM веток браузера.

19. **Responsive/overflow.** Контракты покрывают desktop, <=1040 Navbar, <=1000 Help/Details/Footer, <=1024 Profile, <=800 Results/Bookings, <=600 small layouts, <=520 Navbar, <=360 Auth. Для320/360/375/390 действуют те же правила, отдельных media на каждую ширину нет. На320 support outer292px, article interior250px; auth input interior250px с отдельной show button<=360. 520/768/800/1024/1280/1440 используют существующие container/breakpoint ветки. Реальные measurements не выполнялись. Нет width100vw или body overflow-x:hidden в новом baseline. Existing calc100vw для viewport-bounded menu/guest positioning не удалён механически.

20. **Accessibility.** Добавлены Navbar controls relationship/label/Escape/focus return и реальные labels старых filters. Scoped focus-visible, native disabled, decorative menu bars aria-hidden. Auth/filters SSR label targets и уникальность ids проверены; FAQ expanded/controls и Results dialog keyboard covered прежними suites. Positive tabindex не добавлен. Screen-reader walkthrough/full WCAG certification не заявляются.

21. **Reduced motion / stacking.** Consumer CSS animations/transitions отключены при reduce, hover card transforms neutralized. Новых animation libraries нет. Existing programmatic scroll actions не переписаны. Navbar2000/menu2001/logo2002, Results drawer2500, guest local20 и Details sticky без завышенного z-index сохранены; stacking scale не переделывался без нужды.

22. **Network evidence.** Новый suite рендерит реальные shell/help/contact/404/Footer/Auth/Account states/filters/gallery с fetch fail-on-call и mocked Hotelbeds entrypoints. Counters status=content=availability=checkrate=booking=cancellation=0; all HTTP/payment=0. CSS/new shell не содержат API/effects/timers. Это SSR/source/CSS evidence; новый suite не монтирует mobile меню в браузере. Полные3P–3V regressions отдельно проверяют guest input, local chips/sort/filter, selected gallery/favorite/back, auth/profile lifecycle, собственные account API и их zero-extra-provider boundaries. Initial Results Availability=1 существует только в прежних offline mocked fixtures. Existing global FavoritesProvider может делать собственный GET после авторизации; не обещается ноль всех HTTP приложения.

23. **Exact changed files.**

    - frontend/src/App.jsx — ConsumerShell и scoped stylesheet import, routes прежние.
    - frontend/src/components/ConsumerShell.jsx — новый presentation wrapper с исключением legacy/Admin.
    - frontend/src/styles/Consumer.css — scoped baseline, responsive/focus/motion/overflow.
    - frontend/src/components/Navbar.jsx — только keyboard/aria/ref.
    - frontend/src/components/ResultsFilters.jsx — label/id/useId старой формы, handlers прежние.
    - frontend/src/content/helpContent.js — одна privacy sentence.
    - frontend/tests/globalUxPolish.test.mjs — новый3W suite.
    - SPRINT_3W_GLOBAL_UI_MOBILE_A11Y_POLISH_REPORT.md — этот отчёт.

24. **Tests/results.**

    | Проверка | Финальный результат |
    | --- | --- |
    | Новый3W suite | PASS —9 reported tests: parent+8 subtests |
    | Все frontend suites | PASS —98/98 |
    | 3V /3U /3T /3S /3R | PASS —8/10/10/12/10 |
    | 3Q /3P–3P.1 /3O–3O.2 | PASS —8/10/15 |
    | 3N /3M.1 /3K | PASS —4/1/1 |
    | Full backend runner | PASS —101/101,12 suites |
    | Frontend lint | PASS —0 errors,3 прежних admin warnings |
    | Production build | PASS —167 modules |
    | Backend syntax /secret scan | PASS —183 backend files,371 scanned files,findings=[] |
    | git diff --check | PASS |

    Из frontend: `node --require ../backend/tests/offlineNetwork.cjs --test --test-concurrency=1 --test-force-exit tests/globalUxPolish.test.mjs tests/helpUx.test.mjs tests/authUx.test.mjs tests/profileUx.test.mjs tests/accountUx.test.mjs tests/detailsUx.test.mjs tests/resultsAcceptance.test.mjs tests/homeUx.test.mjs tests/rateAwareFiltering.test.mjs tests/searchQuality.test.mjs tests/catalogPlanner.test.mjs tests/accessCircuits.test.mjs tests/catalogSearchUx.test.mjs`. Также `npm.cmd run lint`, build с VITE_HOTELBEDS_STAGING_TEST_ENABLED=true только в процессе. Из root: `node backend/scripts/sprint3mRegression.cjs`, `node backend/scripts/sprint3mVerify.cjs`, `git -c core.safecrlf=false diff --check`.

25. **Build/bundle.**167 modules; JS501.67kB/gzip140.05kB; CSS110.80kB/gzip20.05kB. Доступный предыдущий build baseline:165 modules, JS500.84/gzip139.87, CSS106.53/gzip19.08. Изменение: +2 modules, JS+0.83kB, CSS+4.27kB; обусловлено shell и scoped CSS. Vite сообщает chunk>500kB; warning не подавлялся, code splitting вне данного polish. Большие существующие PNG не добавлялись/не менялись. Packages/fonts/framework/browser automation dependencies не добавлены; dist остаётся обычным ignored build output, в review diff не включён.

26. **Regressions/fixes during work.** Первый новый test искал Escape в Results.jsx, но реальный обработчик находится в ResultsFilterPanel.jsx; исправлен путь нового assertion. Старые assertions не менялись. Первый lint указал react-refresh/only-export-components на export вспомогательной shell-функции; export убран, test проверяет реальный rendered wrapper. Финальные98 tests и lint прошли после исправлений. Patch Navbar первой строки не применился из-за file boundary/BOM; выполнена точечная правка без переписывания файла. Прежние lint warnings BookingsTable/NotificationsTable/RefundsTable dependency load остаются.

27. **Limitations.** No browser geometry, screenshots, mounted Navbar focus/show-hide walkthrough или Render acceptance. Responsive/overflow выводы — CSS/source reasoning, не доказательство отсутствия каждого pixel overflow. Admin visual browser regression не запускалась; CSS scoped, admin routes исключены и соответствующие existing suites проходят. Secret scan покрывает известные локальные secret values/private-key patterns, не все возможные секреты. Старые global CSS остаются, но consumer cascade для исправленных мест определён явно.

28. **Safety/final audit.** Backend production, provider/search/selection/auth/session/DB/migrations и safety flags не менялись. NO real Hotelbeds Status/Content/Availability/CheckRate/Booking/Cancellation/LIVE и NO payment. Backend tests использовали offline stubs/HTTPS preload и временные схемы локального PostgreSQL. NO Render/env/Secret Files changes, NO git add/commit/push/deploy. README.txt/docs/3N/старые reports не тронуты. Final status/stat/diff проверены; staged changes нет; packages/generated screenshots/artifacts не входят в changes. Рабочее дерево оставлено владельцу для review.

29. **Owner Render acceptance checklist — NOT RUN.** Использовать fixtures/network intercept; не запускать provider probes ради проверки.

    1. Desktop1440: Home → Results fixture → Details → Favorites empty → My Bookings empty → Profile → Login/Register → Help → Contacts →404. Проверить coherent widths/cards/headings/disabled buttons и Footer.
    2. Tablet768/800: Navbar/menu, Home search/guests, Results drawer, Details one-column, Profile и Help. На1024 проверить переход Navbar/Profile layouts.
    3. Mobile390/375/360 и DevTools320: отсутствие horizontal scroll, длинные hotel/room/price/email, guest +/-/ages, фильтры/chips/sort, gallery strip, Profile form, Auth show/hide, FAQ/contacts/footer.
    4. Short pages Help article/Contacts/404/Favorites empty/Bookings empty: Footer внизу, normal flow, без fixed overlay. Auth по прежнему без Footer: card/layout заполняют page корректно. На длинных страницах Footer следует за контентом.
    5. Tab/Enter/Space, focus-visible, закрытое меню не посещается Tab; open/Escape → toggle. Results drawer Escape/focus trap/return; filter labels фокусируют input, disabled booking недоступен. На short viewport menu scroll доступен.
    6. Desktop Details: sticky ниже Navbar, остановка до Footer; height<=700 normal flow. Home3P.1: guest panel не клипается. Reduced-motion DevTools: shimmer/transitions отключены.
    7. Проверить guest/user/admin Navbar visibility, длинное имя, existing profile/session sync; никаких новых login/password/registration операций без решения владельца.
    8. Сверить уже доступные observations до/после: status/content/availability/checkrate/booking/cancellation не увеличиваются из-за navigation/mobile/account/help действий; payment отсутствует. Intentional реальный Results search — только отдельное решение владельца, не часть coding acceptance.
    9. Зафиксировать фактический browser scope отдельно. Sprint3W Render PASS не заявляется.
