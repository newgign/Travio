# Sprint 3W.1 — Narrow Mobile Navbar Fix

CODE / OFFLINE: PASS.
Render acceptance: NOT RUN.

1. **Initial audit.** Первая команда `git status --short`, затем `git diff --stat` и `git diff`: tracked tree чистый, staged changes отсутствуют. Sprint 3W уже находится в tracked baseline. Прежние untracked README.txt, docs/, SPRINT_3N_CATALOG_EXPANSION_PLANNER_REPORT.md не тронуты. Старые reports не изменены. Изучены Navbar.jsx/Navbar.css, Consumer.css, глобальные icon selectors, AdminPanel import и existing3W tests. AGENTS.md поиском не найден.

2. **Owner evidence.** На Render Home320×900 logo/action icons/hamburger не помещались; hero/search/GuestPanel помещались. На400/440 ранее visual result был корректным. Это входное свидетельство владельца, здесь браузер повторно не запускался.

3. **Root cause.** Navbar.css при<=1040 задаёт `.desktop-icon { display:none }`, но глобальный `.icon-btn { display:flex }` из admin.css имеет ту же специфичность и может победить при более позднем порядке CSS. AdminPanel импортируется приложением вместе с его global styles. Дублирующие top icons снова занимают ширину; у hamburger не было защиты от flex shrink. Scoped3W styles скрывают закрытое меню, но не переопределяли этот icon collision. Новый targeted test использует реальные CSS declarations и воспроизводит display:flex до исправления при порядке Navbar→Consumer→Admin.

4. **Before/after.** Только `@media(max-width:360px)` в Consumer.css: `.consumer-shell .navbar .nav-right > .desktop-icon` и `> .desktop-user` получают display:none с большей специфичностью; nav-right не сжимается; nav-toggle явно inline-flex, flex:0 0 44px, min-width/min-height44px. В верхней строке остаются существующие logo и hamburger. Logo/font/paddings не уменьшались. Нет negative margins, transform для прятания или body overflow-x:hidden. Global Admin CSS не редактировался, Admin вне consumer scope.

5. **Navigation/auth/menu.** Navbar.jsx не изменён. Favorites/My Bookings всегда остаются внутри mobile menu, Profile/logout — для authenticated, Admin — только admin, Login/Register — guest. Главная/Отели/Страны/Поиск/Контакты сохранены. Закрытый menu visibility:hidden из3W, open visibility, scroll на коротком viewport, aria-controls/expanded, Escape/focus return и route-key close сохранены. CSS display:none исключает top duplicates из Tab на узкой ширине. Нового positive tabindex нет. Это не новая auth/navigation implementation.

6. **Widths and limitations.** Offline targeted cascade tests:320/360 — icons/user group hidden независимо от проверенного порядка CSS;375/390/400/440/768/1440 — новые declarations не влияют на прежний результат. Более широкий global icon collision не переделывался: scope ровно подтверждённая narrow bug. На320 после side padding16×2 остаётся288px; hamburger44px и существующий gap12px оставляют232px для неизменённого logo. Это reasoning, не измерение rendered font. Actual logo bounds/scrollWidth/touch hit area и открытие меню проверяет владелец. Browser/Render PASS не заявляется.

7. **Targeted evidence.** `frontend/tests/narrowNavbar.test.mjs`:3 reported tests (parent+2 subtests). Ограниченный CSS cascade evaluator читает настоящие Navbar/Consumer/Admin CSS и сравнивает specificity/order только relevant shortcut selectors; это не общий browser CSS engine. Vite SSR рендерит настоящий Navbar с mocked own session/favorites hooks для guest/user/admin, включая длинное имя. Проверяются menu routes/logout/auth actions, один toggle, relationship ID, no positive tabindex, source Escape/focus return. Открытое состояние меню не монтировалось: SSR проверяет его существующие пункты, CSS/source — правила открытия/закрытия.

8. **Network safety.** Targeted fetch fail-on-call, Hotelbeds entrypoints fail-on-call. Итог status=content=availability=checkrate=booking=cancellation=0; HTTP/payment=0. Никаких реальных provider/payment requests. Полные прежние suites используют existing offlineNetwork preload; initial Availability=1 встречается только в существующих mocked Results fixtures. Home/Hero/HomeSearch/GuestPanel/catalog/API/provider behavior не менялись.

9. **Tests/results.** Все проверки прошли; existing tests не редактировались и не ослаблялись.

   | Проверка | Результат |
   | --- | --- |
   | Новый narrowNavbar suite отдельно | PASS —3/3 |
   | Полный frontend3W.1→3K | PASS —101/101, включая прежние98 |
   | Full backend runner | PASS —101/101,12 suites |
   | Lint | PASS —0 errors,3 прежних admin hook warnings |
   | Production build | PASS —167 modules |
   | Backend syntax / secret scan | PASS —183 files /373 scanned,findings=[] |
   | git diff --check | PASS |

   Frontend: `node --require ../backend/tests/offlineNetwork.cjs --test --test-concurrency=1 --test-force-exit tests/narrowNavbar.test.mjs tests/globalUxPolish.test.mjs tests/helpUx.test.mjs tests/authUx.test.mjs tests/profileUx.test.mjs tests/accountUx.test.mjs tests/detailsUx.test.mjs tests/resultsAcceptance.test.mjs tests/homeUx.test.mjs tests/rateAwareFiltering.test.mjs tests/searchQuality.test.mjs tests/catalogPlanner.test.mjs tests/accessCircuits.test.mjs tests/catalogSearchUx.test.mjs`. Targeted запуск — та же команда только с narrowNavbar.test.mjs. Также `npm.cmd run lint`, `npm.cmd run build` с VITE_HOTELBEDS_STAGING_TEST_ENABLED=true только в процессе. Root: `node backend/scripts/sprint3mRegression.cjs`, `node backend/scripts/sprint3mVerify.cjs`, `git -c core.safecrlf=false diff --check`.

10. **Build.** JS501.67kB/gzip140.05kB — размер прежний; CSS111.09kB/gzip20.10kB против3W110.80/20.05 (+0.29/+0.05kB). Modules167 прежние. Существующий Vite chunk>500kB warning остаётся. Packages/framework/dependencies/fonts не добавлены. Build output ignored, не включён в changes.

11. **Exact changed files.**

    - frontend/src/styles/Consumer.css — один narrow media block,7 строк с комментарием.
    - frontend/tests/narrowNavbar.test.mjs — новый focused regression.
    - SPRINT_3W_1_NARROW_MOBILE_NAVBAR_FIX_REPORT.md — этот отчёт.

12. **Final safety/audit.** Только указанные3 файла; backend/auth/search/provider/booking/payment/safety flags/DB не менялись. README.txt/docs/3N и старые reports не тронуты. NO git add/commit/push/deploy, NO Render/env/Secret Files changes. Backend runner использовал offline stubs и временные схемы локального PostgreSQL. Secret scan ограничен известными secret values/private-key patterns, не абсолютной гарантией. Рабочее дерево оставлено владельцу для review.

13. **Owner Render checklist — NOT RUN.** После отдельной публикации владельцем:

    1. Home320×900: полный logo, hamburger целиком в viewport, top duplicate icons отсутствуют; hit area>=44×44, horizontal scroll отсутствует.
    2. Открыть меню: Главная/Отели/Страны/Поиск/Контакты/Favorites/My Bookings; Profile/logout для user, Admin только admin; guest Login/Register сохранены. Повторить с длинным account name.
    3. Tab не посещает закрытое меню/top hidden controls; open меню доступно; Escape закрывает и возвращает focus на toggle. Проверить scroll меню на коротком viewport.
    4. Повторить320/360, затем375/390/400/440/768 и desktop1440. На более широких viewport сравнить с прежним Navbar, без нового redesign.
    5. Home hero/search/GuestPanel/children ages по-прежнему помещаются. Не запускать поиск или provider probes ради Navbar acceptance.
    6. Сверить уже доступные observations: navbar/menu действия не увеличивают status/content/availability/checkrate/booking/cancellation; payment отсутствует. Зафиксировать фактический acceptance scope отдельно.
