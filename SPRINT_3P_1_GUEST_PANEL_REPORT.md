# Sprint 3P.1 — Guest panel clipping fix

CODE / OFFLINE: PASS. Render/browser acceptance: NOT RUN.

Причина: существующее правило `.app .hero { overflow:hidden }` в HomeCollections.css обрезало absolute GuestPanel у нижней границы Hero. Z-index панели не мог преодолеть clipping предка.

Исправление ограничено layout:

- Hero содержит отдельный `hero-visual` background layer: border-radius:inherit, overflow:hidden, прежние image/gradient.
- `hero-unclipped` и `hero-interactive` сохраняют overflow:visible; Hero имеет stacking level выше следующих sections. Navbar остаётся выше Hero.
- GuestPanel получает `home-guest-floating` contract с внутренней вертикальной прокруткой. Geometry helper рассчитывает высоту под trigger с отступом от viewport 8px; если снизу меньше 160px и сверху места больше — открывает вверх. Положение пересчитывается на scroll/resize, listeners удаляются при закрытии.
- На mobile ≤600px geometry styles очищаются: прежний normal flow/full width, без max-height и внутреннего clipping. На tablet сохраняется absolute panel с viewport bounds.
- Guests/children/ages, validation, URL, Results, provider/backend/3O/circuits не изменены.

Regression добавлен в существующий homeUx suite: разделение clipping/interactive layers, CSS specificity относительно legacy overflow, scroll/mobile contracts, SSR panel с тремя детьми и кнопкой «Готово», pure geometry cases для открытия вниз/вверх и разных высот viewport. Это SSR/CSS/function verification, не browser screenshot test.

Проверки:

- Sprint 3P/3P.1: 10 reported tests PASS.
- Все relevant frontend suites: 31 PASS (включая 3O/3O.1/3O.2, 3N, 3M.1 panel, catalog/Results acceptance).
- Lint: 0 errors, 3 прежних admin hook warnings.
- Production build с TEST display flag: PASS.
- `git -c core.safecrlf=false diff --check`: PASS.

Изменены: HeroBanner.jsx, HeroBanner.css, GuestPanel.jsx, HomeSearch.css, новый utils/guestPanelLayout.js, tests/homeUx.test.mjs и этот отчёт.

Owner browser check: открыть Guests с 2–3 детьми на desktop/tablet, проверить наложение поверх Popular Destinations и доступность «Готово» через scroll; уменьшить высоту окна, прокрутить страницу; на mobile проверить normal flow, отсутствие horizontal overflow и Escape/Готово.

NO real Hotelbeds network, payment calls, git add/commit/push/deploy. README.txt/docs не изменены. Render PASS не заявляется.
