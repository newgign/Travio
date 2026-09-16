# Sprint 3O.2 — safe candidate compaction & payload bounds

CODE / OFFLINE: PASS. Render acceptance: NOT RUN.

## Исходное состояние

Первой командой выполнен `git status --short`. Проверены текущий diff и новые файлы 3O/3O.1. Незакоммиченные dedup, deterministic ranking, safe signed candidates, rate-aware filtering, currency budget и Card/Details snapshot сохранены. README.txt/docs и отчёт 3N не изменялись.

## Exact semantic grouping

Внутри hotel identity `hotelbeds + configured environment + String(providerHotelId)` применяется tuple:

`[currency, boardCode ?? null, roomCode ?? null, normalizedRoomText, rateType ?? null]`

`normalizedRoomText = String(roomName || roomType || '').trim().replace(/\s+/g, ' ').toLowerCase()`.

Это тот же текст и нормализация, которые использует room substring filter 3O.1. BoardCode, roomCode и rateType в grouping не trim/uppercase: разные исходные коды консервативно остаются разными группами. Отсутствующий code не объединяется с известным. Разные roomCode при одинаковом тексте не объединяются; одинаковый roomCode при разном нормализованном тексте тоже не объединяется. Нет перевода supplier naming.

Разные board/currency/room/type сохраняются. В одной группе более дорогой candidate не может выиграть текущий cheapest selection или maxPrice: если он проходит верхний предел цены, более дешёвый проходит тоже. Нормализованный room text сохраняет все substring matches.

RateType сейчас не является frontend filter/sort dimension. Однако он участвует в прежнем deterministic comparator и recheck semantics, поэтому включён в grouping как консервативная граница. Compaction не обещает максимально возможное уменьшение.

## Survivor и память

Для каждой группы сохраняется целый исходный normalized offer с минимальным существующим comparator 3O: currency, TOTAL, normalized roomCode/boardCode/rateType, exact rateKey. При полном равенстве остаётся первый эквивалентный candidate. Поля отброшенного offer не копируются в победителя; synthetic rates нет. После compaction survivors сортируются тем же comparator.

Обработка rates потоковая через generator: больше не создаётся промежуточный массив всех однотарифных hotel wrappers и не сохраняются все normalized candidates. Map хранит только победителей групп. Каждый raw rate всё ещё необходимо нормализовать; CPU нормализации остаётся линейным по входу. Уже полученный provider response остаётся в памяти транспортного слоя.

Compaction выполняется до SearchService signing. Safe allowlist и token schema не расширены. Победитель получает существующий signed offer token; room/board/price/rate identity остаются его собственными. Совместимый top-level default offer сохраняется.

## Absolute fail-safe ceilings

- До 256 semantic candidates на unique hotel включительно.
- До 4096 semantic candidates на весь response включительно.
- Существующий предел destination search — 20 hotelCodes — сохранён.

Это инженерные ограничения TEST display model, не сведения о Hotelbeds quotas или оценка реального распределения rates. 256 оставляет запас для сочетаний room/board/type; общий предел 4096 ограничивает суммарный signing/browser workload даже при нескольких насыщенных отелях. В рамках 20 hotels максимум 4116 подписей с учётом совместимых top-level offers.

При появлении 257-й группы одного hotel или 4097-й группы response выбрасывается `TEST_CANDIDATE_LIMIT_EXCEEDED`, status 422, с безопасным сообщением «Слишком много вариантов размещения. Уточните параметры поиска.». Число групп монотонно растёт, поэтому ранний отказ эквивалентен проверке после полного compaction. Duplicate records учитываются в одной hotel map.

Отказ прерывает весь поиск до signing/cache и записи search price history/monitor. Provider transport observation к этому моменту уже записана: `performRequest` ожидает `access.finish` в finally до возврата response в normalization. Успешный HTTP attempt учитывается независимо от последующего normalization error. Частичной выдачи, silent truncate, per-hotel fetch и provider retry нет. Существующий SearchController передаёт status/message/code, frontend searchTours показывает сообщение ошибки.

Лимиты ограничивают количество candidates/tokens, а не точное число байтов JSON: длина существующих supplier text fields отдельно здесь не ограничивается. Это не transport response-size limit.

## Payload и business audit

Новых public metrics или raw fields нет. Counts проверяются внутри tests. `rateKey` уже присутствовал в public offer architecture до 3O.2: это подтверждено исходным offerService в HEAD и текущим safe allowlist. 3O.2 не вводит нового пути его экспонирования. UI использует application token как opaque identity и не выводит rateKey/token в HTML/URL. JWT подписан, не зашифрован.

Существующие tests проверяют исключение arbitrary provider objects/headers/secret markers из candidate и decoded token; immutable fixtures проверяют отсутствие мутаций. Credentials/signatures/certificates/raw response не добавляются.

Cancellation/tax/refund terms не используются как критерий compaction и не смешиваются между candidates. Они отсутствуют в ограниченном candidate payload 3O.1. Политика относится только к текущему TEST display/search model с disabled booking/payment. Перед production booking её необходимо пересмотреть, если условия отмены/возврата/налоги станут selection dimension. Различие таких условий нельзя считать несущественным для будущего бронирования.

## Filtering, Details и currency UX

Rate-aware фильтры 3O.1 не изменены. Board/room/price совпадают на одном survivor. AI и Superior alternatives сохраняются; combined mismatch остаётся no match. Sorting работает по выбранному candidate, reset возвращает default. Counts остаются unique hotels.

Существующий exact alternate Card/Details тест выполняется на compacted response, проверяет price/board/room и signed identity. Fresh snapshot не вызывает resolver.

Mixed currencies остаются отдельными currency groups, FX нет. Валюта бюджета выбирается детерминированно из полного исходного набора, compaction не удаляет currency groups. В TEST controls добавлено явное пояснение: «Лимит только в EUR. При заданном лимите тарифы в других валютах скрыты. Конвертации нет.» Currency подставляется из реальной выдачи. Rendered label проверен тестом; mixed currency sorting/filtering regressions сохранены.

## Stress и zero-extra-network evidence

| Fixture | Valid input candidates | Survivors | Signing |
|---|---:|---:|---:|
| Один hotel, одинаковый semantic tuple | 10000 | 1 | Normalization-only |
| Реальный SearchService с fixture provider, 3 hotels | 1008 | 8 | 11: 8 candidates + 3 top-level |
| Per-hotel boundary | 256 | 256 | Normalization-only |
| Per-hotel overflow | 257 | explicit error | До signing |
| Response boundary | 4096 | 4096 | Normalization-only |
| Response overflow | 4097 | explicit error | До signing |

Integration сравнивает rate identities результатов фильтров на expanded и compacted наборах: default, AI, Superior, combined, max110/max130, descending price и stars. Старые reset/counts/Details tests также проходят. По окончании всей последовательности Availability=1, CheckRate=0, Content=0. ProviderQuery остаётся неизменным при presentation edits. Это offline function/SSR integration, не mounted browser/Render acceptance.

## Проверки

| Suite/check | Result |
|---|---|
| 3O/3O.1/3O.2 backend | PASS — 14 |
| 3O frontend | PASS — 7 |
| 3O.1/3O.2 frontend integration | PASS — 7, включая parent |
| 3N backend/frontend | PASS — 8 / 4 |
| 3M/3M.1 backend/panel | PASS — 20 / 1 |
| 3L | PASS — 2 |
| 3K frontend acceptance | PASS — 2 |
| 3J | PASS — 2 |
| 3I | PASS — 3 |
| 3G | PASS — 9 |
| 3F | PASS — 2 |
| 3E | PASS — 16 |
| 3D | PASS — 24 |
| Frontend lint | PASS — 0 errors, 3 прежних warnings |
| Production build, TEST flag=true | PASS — 137 modules |
| Backend syntax | PASS — 183 файла |
| Secret scan | PASS — 324 файла, findings=[] |
| git diff --check | PASS |

Syntax/secret scan выполнены через `node backend/scripts/sprint3mVerify.cjs`; diff — через `git -c core.safecrlf=false diff --check`. Secret scan проверяет локальные secret values и private-key blocks без печати значений; README.txt/docs исключены. Это ограниченная проверка, не доказательство отсутствия всех возможных секретов.

Итого 100 backend + 21 frontend reported tests. Старые tests не удалены и не ослаблены. Прежние warnings: load dependency в трёх admin tables, websocket port 24678 conflict в SSR suites.

Команды: `node backend/scripts/sprint3mRegression.cjs`; из backend `npm.cmd run test:sprint3o2`; из frontend `node --test --test-force-exit tests/rateAwareFiltering.test.mjs tests/searchQuality.test.mjs tests/catalogPlanner.test.mjs tests/catalogSearchUx.test.mjs tests/resultsAcceptance.test.mjs tests/accessCircuits.test.mjs`, `npm.cmd run lint`, build с процессным TEST display flag. Регрессии используют только local PostgreSQL с изолированными schemas и offline HTTPS preload.

## Изменённые файлы в 3O.2

- `backend/services/hotelbedsDisplayRates.js`: semantic map, generator, ceilings и safe error.
- `backend/package.json`: alias test:sprint3o2.
- `backend/tests/hotelbedsSearchQuality.test.js`: grouping/stress/identity/boundary tests.
- `frontend/src/components/ResultsFilters.jsx`: явное пояснение валюты бюджета.
- `frontend/tests/rateAwareFiltering.test.mjs`: stress signing count, expanded/compacted equivalence, rendered currency label.
- Этот отчёт.

## Safety и owner acceptance

Финальный audit observation invariant: production-код не изменён. Добавлен PostgreSQL regression в `backend/tests/hotelbedsAccess.test.js`: SearchService получает overflow fixture через настоящий client.request/performRequest и HTTP stub. До возврата response в normalization persisted Availability count уже увеличен на 1; после safe `TEST_CANDIDATE_LIMIT_EXCEEDED` повторное создание access service подтверждает тот же +1. Availability method=1, HTTP attempts=1, CheckRate=0, Content=0, signing=0, retry отсутствует. Таким образом observed app requests считает transport attempts, а не успешно нормализованные search results. Существующий finally также учитывает failed actual attempts; прежние 3M/3M.1 tests сохранены.

Повторный audit run: 3O/3O.1/3O.2 — 14 PASS, 3M/3M.1 — 21 PASS (включая новый regression); общий backend runner — 101 PASS. `git diff --check` — PASS. Предыдущая таблица отражает запуск до добавления audit test.

NO real Hotelbeds Availability/Content/Status/CheckRate/Booking/Cancellation/LIVE или payment calls. Flags, circuits, transport retries не изменены. NO git add/commit/push/deploy, Render env/Secret Files changes. README.txt/docs не затронуты.

Render acceptance не выполнялся. После отдельного решения владельца и deploy проверить одну TEST выдачу, alternate board/room, combined mismatch, reset и exact Card/Details. Локальные действия не должны увеличивать provider observations. Oversized fixtures проверять offline; не создавать большой реальный provider response ради проверки лимита. Observed requests != official Hotelbeds quota.
