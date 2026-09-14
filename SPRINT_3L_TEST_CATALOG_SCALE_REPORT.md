# Sprint 3L — TEST catalog scale readiness

CODE / OFFLINE: PASS. Render acceptance: NOT RUN.

## Batch rules

Admin показывает каждый configured scope: country/destination identity, локальный count / 20, READY/EMPTY, настроенные FROM/COUNT и предложенный следующий диапазон. Global history и summary сохранены. Никаких автоматических импортов.

Новая кнопка отправляет только `{scopeId, action:"next"}`. Backend выбирает scope из прежнего allowlist и повторно читает локальное число TEST отелей под существующим advisory lock. Клиентские from/to/count/page/country/destination/url и другие actions отклоняются.

| Локальный count | Следующий FROM–TO | COUNT |
|---|---|---|
| 0 | 1–10 | 10 |
| 1 | 2–11 | 10 |
| 10 | 11–20 | 10 |
| 19 | 20–20 | 1 |
| 20 или больше | IMPORT COMPLETE, кнопка отключена; сервер блокирует до network | 0 |

Формула: FROM=count+1, COUNT=min(10,20-count). Это предложение по текущему каталогу, не доказательство непрерывности provider pages. При дубликатах, пустой странице или изменившемся порядке Hotelbeds каталог может не вырасти. Импортер не ищет следующую страницу автоматически. Владельцу нужно остановиться и оценить результат; достижение 20 отелей не гарантируется.

Для совместимости POST без action сохраняет прежний server-configured FROM/COUNT. Но общий cap 20 действует и на этот путь. UI запускает именно next, независимо от старого configured COUNT; оба диапазона показаны отдельно.

## Limits / integrity

- Ровно один scope за ручной запуск.
- Next batch до 10 hotels; существующий configured batch до 20.
- Metadata: максимум два окна 1–100 и 101–200; второе только при отсутствии target в первом.
- Hotel Content: одна страница. Всего до трёх Content requests, retries=0, interval=1000 ms, timeout=12000 ms.
- Общий TEST catalog cap: 20 уникальных hotelCode на destination.
- Global cooldown 60 секунд, advisory lock 319030, transaction rollback и identity checks сохранены.

Перед upsert транзакция берёт SHARE ROW EXCLUSIVE lock таблицы provider_hotels и повторно проверяет объединение текущих TEST hotelCode с ответом. Более 20 отклоняется до записей. Это защищает и от роста каталога между начальным планом и финальной транзакцией. Lock действует только на финальную запись, не во время Content requests. Строки других scopes/LIVE не удаляются и не обновляются этой проверкой. Старые identity-conflict проверки остаются.

Public TEST destination search сохраняет hard limit 20, без hidden pagination. Repository ordering дополнен provider_hotel_id после stars/name для детерминированного порядка при равных значениях. Pricing/offer identity не менялись. Миграций нет.

## Tests

| Проверка | Результат |
|---|---|
| Новый 3L | PASS — 2 комплексных теста |
| 3J | PASS — 2 |
| 3I | PASS — 3, включая PostgreSQL additive/idempotent/identity rollback/LIVE isolation |
| 3G | PASS — 9, включая metadata bounds и search limit |
| 3F | PASS — 2 |
| 3E | PASS — 16 |
| 3D | PASS — 24 |
| 3K + frontend acceptance | PASS — 2 |
| Relevant frontend lint / TEST production build | PASS |
| Backend syntax | PASS — 5 файлов |
| git diff --check | PASS |
| Secret scan | PASS — 354 files, findings [] |

Новый 3L проверяет планы 0/1/10/19/20/21, next по locked count, ноль Content calls при complete, rollback при росте каталога перед финальной записью и повторные hotel IDs. Расширенный HTTP test 3I проверяет запрет count/action=all/нескольких scope IDs и принятие единственного scopeId+next. Provider responses — только offline stubs. SQL regression fixtures используют локальную rollback schema.

## Files

Изменены:

- backend/package.json
- backend/repositories/providerCatalogRepository.js
- backend/routes/adminOperations.js
- backend/services/hotelbedsTestContent.js
- backend/tests/hotelbedsMultiDestination.test.js
- frontend/src/components/admin/HotelbedsContentStatus.jsx

Созданы: backend/tests/hotelbedsScale.test.js; этот отчёт.

## Owner actions после отдельного deployment

1. Review изменений. Новых env variables и миграций нет. Сохранить allowlist и TEST read-only/booking/payment safety flags.
2. До восстановления quota/access не нажимать импорт. Проверить только локальный status: CEN 10/20 → 11–20; DXB/AYT/SSH 1/20 → 2–11; HKT 0/20 → 1–10, если текущая БД всё ещё соответствует указанным владельцем counts.
3. После отдельного решения об использовании quota выбрать ровно один scope. Проверить next range и нажать кнопку один раз. Не делать общий обход scopes.
4. Проверить результат, фактический catalog count и сохранение остальных scopes. При 403/ошибке/EMPTY/отсутствии прироста остановиться, не запускать повторения циклически. Причина quota/access этим кодом не установлена.
5. При успешном приросте следующий диапазон пересчитается из локального состояния; он не запустится автоматически. При 20 UI показывает IMPORT COMPLETE, дальнейший импорт блокируется.
6. Реальную Availability проверять отдельно по решению владельца; увеличение Content каталога не гарантирует тарифы. Booking/payment оставить отключёнными.

Hotelbeds Content/Availability/status/CheckRate/LIVE network: NONE. Booking/cancellation/payment: NONE. Git add/commit/push/deploy и Render env changes не выполнялись. README.txt/docs/ не затронуты. Render acceptance PASS не заявляется.
