# Sprint 3W.2 — Narrow Profile Summary Fix

CODE / OFFLINE: PASS.
Browser/Render acceptance после изменения: NOT RUN.

1. **Initial audit.** Первой командой выполнен `git status --short`, затем `git diff --stat` и `git diff`: tracked tree чистый. Только прежние untracked README.txt, docs/, SPRINT_3N_CATALOG_EXPANSION_PLANNER_REPORT.md. Изучены Profile.jsx, Profile.css, Consumer.css и AccountPages.css. Существующая3W/3W.1 реализация сохранена, старые reports не редактировались.

2. **Owner evidence.** Render /profile320×900: имя «Администратор» разрывалось «Администрато» / «р». По сообщению владельца форма, password controls, shortcuts, admin/logout и Footer помещались, horizontal overflow отсутствовал. Здесь browser повторно не запускался.

3. **Root cause.** Mobile account width calc(100% - 28px) даёт292px на320. Card padding20px×2 и borders оставляют250px. Avatar52px + gap16px оставляют тексту182px. Consumer.css задаёт text flex:1 1 180px: вместе с avatar блок ещё помещается в одну строку, поэтому flex-wrap не переносит его вниз. Общие `.account-page h2` и `.consumer-shell :is(...)` задают overflow-wrap:anywhere, разрешая разрыв обычного имени внутри слова.

4. **Before/after.** В Profile.css добавлены только5 строк. При<=360 summary text получает flex-basis:100% и min-width:0; существующий flex-wrap переносит блок под avatar, предоставляя ему всю внутреннюю ширину250px на320. При<=600 для summary h2 word-break:normal/overflow-wrap:break-word: обычный текст переносится по пробелам, чрезмерно длинная непрерывная строка может разрываться при реальном недостатке полной строки. Email/phone paragraphs сохраняют anywhere. Специфичность scoped rules выше общих Account/Consumer rules независимо от их порядка. Avatar сохраняет flex:0 0 … — не сжимается. Новых fixed widths, negative margins, transforms, JS resize или body overflow masking нет.

5. **Widths.** Targeted CSS/source проверяет320/360/390/600/1440. На320/360 текст под avatar;390/600 — прежняя flex-композиция без forced full-row basis, но без aggressive anywhere для имени;desktop/tablet>600 — прежние rules. Это reasoning/cascade evidence, не измерение glyph bounds или browser geometry. Проверку отсутствия разрыва «Администратор» в целевом браузере выполняет владелец.

6. **Exact changed files.**

   - frontend/src/styles/Profile.css —5 строк, только summary mobile presentation.
   - frontend/tests/narrowProfile.test.mjs — новый focused CSS/source regression.
   - SPRINT_3W_2_NARROW_PROFILE_SUMMARY_FIX_REPORT.md — этот отчёт.

   Profile.jsx/Consumer.css/Navbar/Footer/Home/Results/Details и auth/session/profile stores/services не изменены. Save/cancel/password/session behavior покрыт прежним неизменённым3T suite.

7. **Targeted test.** Ограниченный evaluator применяет реальные relevant CSS selectors, specificity и media width; проверяет отсутствие anywhere/break-all у mobile имени, avatar shrink0, text min-width0/full-row<=360, email wrapping и desktop baseline. Fetch запрещён spy. Это не browser CSS engine. При разработке теста исправлены две ошибки нового assertion/helper: :is specificity должна использовать наиболее специфичный аргумент, не сумму; cancel в JSX передаётся как onClick={actions.cancel}, а не вызывается inline. Production не менялся ради этих тестовых исправлений; старые tests не редактировались.

8. **Tests/results.**

   | Проверка | Результат |
   | --- | --- |
   | narrowProfile targeted | PASS —1/1 |
   | Полный frontend3W.2→3K | PASS —102/102 |
   | Existing full backend runner | PASS —101/101,12 suites |
   | Lint | PASS —0 errors,3 прежних admin hook warnings |
   | Production build | PASS —167 modules |
   | Backend syntax /secret scan | PASS —183 files /375 scanned,findings=[] |
   | git diff --check | PASS |

   Frontend targeted: `node --require ../backend/tests/offlineNetwork.cjs --test --test-force-exit tests/narrowProfile.test.mjs`.
   Full: `node --require ../backend/tests/offlineNetwork.cjs --test --test-concurrency=1 --test-force-exit tests/narrowProfile.test.mjs tests/narrowNavbar.test.mjs tests/globalUxPolish.test.mjs tests/helpUx.test.mjs tests/authUx.test.mjs tests/profileUx.test.mjs tests/accountUx.test.mjs tests/detailsUx.test.mjs tests/resultsAcceptance.test.mjs tests/homeUx.test.mjs tests/rateAwareFiltering.test.mjs tests/searchQuality.test.mjs tests/catalogPlanner.test.mjs tests/accessCircuits.test.mjs tests/catalogSearchUx.test.mjs`.
   Также `npm.cmd run lint`, `npm.cmd run build` с прежним TEST display flag только в process env; root `node backend/scripts/sprint3mRegression.cjs`, `node backend/scripts/sprint3mVerify.cjs`, `git -c core.safecrlf=false diff --check`.

9. **Build/limitations.** JS501.67kB/gzip140.05 — прежний размер; CSS111.36kB/gzip20.15 против111.09/20.10 (+0.27/+0.05kB). Existing chunk>500kB warning не подавлялся. Нет новых dependencies. Browser/Render acceptance NOT RUN; screenshots, mounted account actions и measurements не выполнялись. Secret scan ограничен известными secret values/private-key patterns.

10. **Safety/final audit.** Только CSS и новый test/report. Backend, auth/session/password, booking/payment/provider semantics не менялись. Нет реальных Hotelbeds/provider/payment/Render requests, probes или account mutations. Новый test читает source/CSS, HTTP=0; предыдущие suites используют offline stubs/HTTPS preload, backend runner — временные схемы локального PostgreSQL. NO git add/commit/push/deploy; NO env/Secret Files changes. README.txt/docs/3N и старые reports не тронуты. Рабочее дерево оставлено для review.

11. **Owner acceptance checklist — NOT RUN.**

   1. /profile320×900 с именем «Администратор»: text под avatar, слово целое, avatar не сжат.
   2. Проверить360/390/600 и desktop: ожидаемая композиция, имя с пробелами, длинный email и экстремальная непрерывная строка без horizontal overflow.
   3. Убедиться, что формы/password buttons/shortcuts/Footer выглядят как раньше. Новую реальную смену пароля выполнять не требуется.
   4. Не запускать provider/payment probes. Зафиксировать browser result отдельно после отдельного deploy владельцем.
