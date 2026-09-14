# Sprint 3J — TEST catalog readiness

CODE / OFFLINE acceptance: PASS. Render acceptance: NOT RUN.

## Изменения и состояния

Локальный `/api/catalog/test-options` объединяет PostgreSQL destinations с безопасными country/destination codes серверного import allowlist. Новых запросов Content и миграций нет. Импортированные общие counts не увеличиваются за счёт отсутствующих в БД scopes.

- READY: hotelCount > 0, направление доступно для выбора и поиска.
- EMPTY: hotelCount = 0, направление видно, option отключён с подписью «отели пока не загружены». TH:HKT из allowlist виден даже без строки каталога. До появления локального имени показывается HKT, а не выдуманное Content name.
- Admin показывает состояние каждого разрешённого scope, количество отелей и environment=test. Выбранный scope, общий summary и global import history сохранены. Последняя глобальная ошибка не превращает EMPTY в FAILED. Отдельная история по scope не заявляется: существующая глобальная запись её надёжно не предоставляет.

Backend возвращает TEST_CATALOG_EMPTY до provider call как для отсутствующего в каталоге разрешённого scope, так и для существующего направления без отелей. Results показывает «Каталог направления пока не загружен». При успешной Availability без результатов показывает «На выбранные даты доступных тарифов не найдено».

Query сохраняет прежние параметры и поддерживает countryCode/checkIn/adults. Ответ старого поиска не перезаписывает состояние после смены URL. Offline проверяется восстановление URL для nights 1/3/7 и обратной последовательности; настоящий браузерный F5/back/forward на Render не выполнялся.

## Проверки

| Проверка | Результат |
|---|---|
| Sprint 3J | PASS, 2 комплексных теста |
| Sprint 3I | PASS, 3 |
| Sprint 3G | PASS, 9 |
| Sprint 3F | PASS, 2 |
| Sprint 3E | PASS, 16 |
| Sprint 3D | PASS, 24 |
| Frontend acceptance | PASS, 1 расширенный тест |
| Relevant frontend lint | PASS |
| Frontend build с TEST flag | PASS |
| Backend syntax | PASS, 5 JS files |
| git diff --check | PASS |
| Secret scan, включая новые JS/JSX и dist | PASS, 347 files, findings [] |

3J проверяет оба варианта пустого HKT, ноль provider calls, выбор только локальных CEN hotelCodes, country isolation и отдельный diagnostic 3424. Frontend проверяет disabled EMPTY/selectable READY, country filtering, query reconstruction и разные сообщения пустых состояний. Существующие 3I filter/sort/identity regressions сохранены.

## Safety

Реальных Hotelbeds Content/Availability/status/CheckRate/LIVE requests не выполнялось. Booking/cancellation/payment не выполнялись. Provider responses в regressions — offline fixtures. Нулевой каталог вызывает ноль Hotelbeds network calls; это проверено stubs, запрещающими вызов методов клиента.

Content importer и его лимиты, pricing, signed offers, mTLS, credentials, productionGate и booking/payment guards не изменены. Git add/commit/push/deploy и Render env changes не выполнялись. README.txt и docs/ остались нетронутыми untracked файлами/каталогом.

## Файлы

Изменены: backend/package.json; backend/routes/adminOperations.js; backend/routes/catalog.js; backend/services/hotelbedsTestDestination.js; frontend/src/components/SearchBar.jsx; frontend/src/components/admin/HotelbedsContentStatus.jsx; frontend/src/pages/Results.jsx; frontend/src/services/tourService.js; frontend/src/utils/destinationTitle.js; frontend/tests/resultsAcceptance.test.mjs.

Созданы: backend/services/testCatalogReadiness.js; backend/tests/hotelbedsCatalogReadiness.test.js; frontend/src/components/DestinationOptions.jsx; frontend/src/utils/catalogUx.js; этот отчёт.

## Owner acceptance после отдельного deployment

1. Сохранить существующие TEST flags, server scope allowlist и отключённые booking/payment. Новых env variables и миграций нет.
2. Проверить Home: CEN/DXB/AYT/SSH READY по фактическим DB counts, TH:HKT EMPTY и недоступен для выбора. Dropdown вызывает только локальный catalog endpoint.
3. Проверить admin: общий импортированный каталог остаётся 4 countries / 4 destinations / 13 hotels, если владелец не менял данные; HKT отдельно EMPTY независимо от global failure.
4. Открыть Results с TH/HKT и корректными будущими датами: сообщение о незагруженном каталоге, без Hotelbeds запроса. Проверить F5/back/forward, country/destination, даты и guests на готовых URL.
5. Любую проверку реальной Availability готового направления выполнить только отдельным осознанным действием владельца с учётом quota. Пустые тарифы должны отличаться от пустого каталога; diagnostic 3424 остаётся отдельным режимом. Повторный импорт HKT этим спринтом не запускается и причина 403 не диагностируется.
