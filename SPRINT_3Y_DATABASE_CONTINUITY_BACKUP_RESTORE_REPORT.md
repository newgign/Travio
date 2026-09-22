# Sprint 3Y — Database Continuity / Backup & Restore Readiness

CODE / OFFLINE: PASS.
REAL RENDER BACKUP: NOT RUN.
LOCAL POSTGRES CURRENT-VERSION RESTORE DRILL: PASS — один успешный запуск 2026-09-22, подробности в разделе 21.
RENDER DATABASE MIGRATION: NOT RUN.
OWNER ACTION: verified external backup до suspension 2026-10-11; реальные Render операции не выполнены.

## 1. Initial git state

Первыми командами этого продолжения, строго последовательно, выполнены `git status --short`, `git diff --stat`, `git diff`. Modified: backend/package.json — 1 file, 7 insertions, 1 deletion (6 manual/test aliases). Уже лежали 10 новых файлов 3Y из списка раздела 13, включая этот partial report и runbook; helper находился в untracked backend/scripts/lib/. Прежние unrelated untracked: README.txt, docs/, SPRINT_3N_CATALOG_EXPANSION_PLANNER_REPORT.md. Source of truth — рабочее дерево. Ничего не откатывалось, не staging-илось и не коммитилось. Старые reports не редактировались.

### Recovered work before continuation

До продолжения уже реализованы: custom dump через spawnSync/shell:false, безопасный child env/TLS, unique UTC filename и exclusive partial/hard-link publish, standalone pg_restore listing verifier, separate-target/confirmation/remote acknowledgement/empty-target restore, migration-derived table inventory, read-only schema/count checks, 5 CLI wrappers, 6 package aliases, focused tests (11 включая parent), opt-in local drill и подробный runbook/report. Корректные части сохранены, дублирующих scripts/services не создано.

Прочитан существующий ignored artifact backend/backups/3y-drill-4f1df9f9b7.json: он сообщает LOCAL_POSTGRES_PASS для прежней реализации на server 180004, dump 92046 bytes и успешные schema/counts/synthetic comparisons. Это recovered evidence предыдущего запуска, а не новый execution. Разделы 10–11 и прежние результаты раздела 14 ниже сохранены как история до продолжения; они не удостоверяют обновлённые manifest/guards.

Недостающее на входе: рядом с custom dump не создавался manifest; backup не вычислял SHA-256 и не вызывал verifier перед success; restore не блокировал production/LIVE после remote acknowledgement; source comparison зависел только от наличия source URL в shell; paths нормализовались без явного отказа traversal/symlink. Эти пробелы закрыты в существующем helper.

### Work completed after continuation

Добавлены автоматические archive verification, streamed SHA-256, credential-free manifest с exclusive write/fsync, проверка manifest/checksum при standalone verify и restore, source fingerprint comparison, production/LIVE block, path traversal/symlink guard и focused regression cases. Local drill дополнен preflight до provisioning, честным SKIP/BLOCKED и статусом RESTORE_VERIFIED только после полного успешного synthetic drill. Обновлены существующие runbook и этот report; package aliases и CLI wrappers не переписывались. Точные новые проверки и ограничения — разделы 18–20.

## 2. Owner notice / scope

По переданному владельцем уведомлению, `asedeliya-staging-db` будет suspended 2026-10-11; после grace period возможно удаление данных. Дата и plan не проверялись через Render account, не добавлены в public UI или env. Grace deadline/upgrade/migration решение остаются у владельца. Реальные source data в этом sprint не выгружены: локальный fixture dump не является backup Render.

## 3. DB architecture inventory

- `backend/db.js`: pg Pool, существующая databaseConfig; приложение читает dotenv, новые owner CLI сами dotenv не загружают.
- Фактические migrations находятся в `database/migrations/`, не backend/migrations/. Root package.json и root .env.example отсутствуют; изучены backend/package.json и backend/.env.example. Новые env values туда не добавлялись.
- `backend/config/database.js`: DATABASE_URL либо DB_HOST/PORT/USER/PASSWORD/NAME fallback. Для URL по умолчанию verify-full; ssl rejectUnauthorized=true, optional DB_SSL_CA_PATH. SSL query params в URL отклоняются, чтобы не переопределить verified TLS.
- Repo `docker-compose.yml` задаёт postgres:16, порт host по умолчанию 5433. Render PostgreSQL version неизвестна. Фактический local drill server_version_num=180004, pg_dump/pg_restore=18.4, binaries найдены в установленном PostgreSQL каталоге, ничего не устанавливалось.
- `database/migrations`: 20 SQL files, 001–020, lexicographic ordering. Metadata существует: `_migrations(id SERIAL PRIMARY KEY, name UNIQUE, applied_at)`.
- Migration runner держит pg_advisory_lock(319003) на dedicated client, проверяет ledger, применяет каждую pending migration в BEGIN/COMMIT с записью имени; rollback on error, unlock/release/end в finally. Два parallel local re-runs прошли без повторного применения.
- Прочие locks: 319001 — Hotelbeds monitor; 319002 — catalog service; 319030 — TEST content sync. Они не вызывались 3Y tools. Advisory locks не являются сохраняемыми строками: при restore они не «переносятся», код снова берёт их при работе.
- App SQL и migrations преимущественно unqualified, зависят от search_path; legacy JSON backup жёстко предполагает public. Новые checks требуют current_schema=public и явно читают public objects. Existing full runner использует isolated temporary schemas через PGOPTIONS/search_path.
- PostgreSQL-specific: SERIAL/BIGSERIAL sequences, JSONB, timestamptz, expression/partial indexes, CHECK/FK constraints, ON CONFLICT, RETURNING, array/catalog functions, advisory locks. Не предполагается перенос на иной SQL engine.
- CREATE EXTENSION в migrations не обнаружен. Это не доказательство отсутствия вручную установленных extensions в Render: owner inventory/provision review обязателен. Cluster-wide roles/tablespaces и внешние secret/cert files не входят в single-database pg_dump.

### Tables, keys, indexes

23 таблицы с ledger: `_migrations`, `admin_actions`, `booking_events`, `bookings`, `checkout_sessions`, `favorites`, `hotelbeds_tracked_searches`, `hotels`, `maintenance_runs`, `notification_outbox`, `operational_incidents`, `payments`, `price_history`, `provider_content_dictionaries`, `provider_destinations`, `provider_hotels`, `provider_job_state`, `refund_requests`, `reliability_snapshots`, `system_events`, `tours`, `traveler_profiles`, `users`.

Текущий migration contract: 23 PK, 16 FK, 19 serial sequences, 4 обычных UNIQUE constraints после 020 и 72 explicit indexes. В local DB обнаружено 99 indexes с учётом 27 PK/UNIQUE backing indexes. Composite PK: provider_job_state(job,environment), provider_content_dictionaries(environment,kind,code); checkout_sessions.token и tracked fingerprint — natural PK.

Важные unique/index contracts: LOWER(users.email); favorites(user_id,provider,provider_hotel_id); booking_events(booking_id,event_key); payments.idempotency_key; refund idempotency и one-full-refund-per-payment; notification booking/event; active operational incident key; catalog environment identity. 020 сохраняет строки и заменяет старые catalog uniqueness constraints на indexes с content_environment. В migrations также есть CHECK для traveler type, incident severity/status, reliability state, price/history environment/positive price. Definitions сохраняются custom dump и сравнивались после local restore.

## 4. Data classification

| Таблицы / данные | Класс и причина |
| --- | --- |
| users, включая password hashes и profile preferences | IMPORTANT. Не восстанавливаются migrations или provider import |
| favorites, traveler_profiles | IMPORTANT. User selections/PII; historical saved values не равны текущим тарифам |
| bookings, checkout_sessions | IMPORTANT. Applications, travelers, immutable/operational offer snapshots и expired session state; expiry нельзя трактовать как permission потерять остальные данные |
| payments, refund_requests | IMPORTANT при наличии строк. Persisted accounting/application state не восстанавливается через запуск платежей |
| booking_events, notification_outbox | IMPORTANT. Audit, delivery/idempotency/retry state; повторная отправка email не является восстановлением истории |
| provider_hotels, provider_destinations, provider_content_dictionaries | SHOULD BACK UP. Static catalog теоретически можно снова импортировать при отдельно разрешённом доступе, но exact snapshot/дата/environment и доступность API не гарантированы |
| provider_job_state | IMPORTANT. Persisted import/planner/access/circuit/job state и counters/details; сброс не является безопасным способом «восстановить» состояние |
| hotelbeds_tracked_searches | SHOULD BACK UP. Derived operational selections/history; будущие просмотры не воспроизводят прежние timestamps/filters |
| price_history | SHOULD BACK UP. Historical observations/evidence невозможно вернуть новым current search |
| hotels, tours | SHOULD BACK UP. Legacy/local records могут быть authored/imported; migrations создают структуру, не их содержимое |
| admin_actions, system_events, maintenance_runs | SHOULD BACK UP. Audit/operations/backup history |
| operational_incidents, reliability_snapshots | SHOULD BACK UP. Historical incidents/acknowledgements/health evidence |
| _migrations | IMPORTANT. Ledger реально существует и должен сохраняться |

RECREATABLE: структура empty tables/indexes/constraints из matching migrations; процессные caches/runtime timers из кода. Imported static catalog лишь условно recreatable через будущий отдельно разрешённый import. Весь пользовательский/исторический/staging dataset не объявляется recreatable. Импортов/probes в 3Y нет.

## 5. Existing backup / Sprint 2N audit

Изучены backupDatabase.js, verifyBackup.js, restoreDatabase.js, runScheduledBackup.js, cleanupBackups.js, databaseBackupService.js, backupSchedulerService.js, reliabilityMonitorService.js и package scripts.

Legacy формат — `travio-logical-backup` JSON release 3A: public rows, column signature, SHA checksum, optional AES-256-GCM encryption. Create применяет retention и пишет maintenance_runs. Legacy restore apply требует ALLOW_DATABASE_RESTORE=true, использует app pool и TRUNCATE RESTART IDENTITY CASCADE; этот путь в 3Y не запускался и не изменён. Для нового PostgreSQL continuity runbook предназначены отдельные db:* scripts.

Freshness 2N смотрит локальный JSON file, parse/checksum/release и modifiedAt; maintenance_runs хранит success record. Это operational evidence, но не доказательство существования full custom dump, off-machine copy или успешного restore. Новый inventory выводит только recorded success timestamp (либо null) и явное пояснение этой границы. Custom dump script не пишет fictitious backup metadata в DB.

## 6. Backup design

`dbBackup.cjs` — manual main guard, без startup/cron wiring, без dotenv/autoload remote env. DATABASE_URL обязателен. Connection string не попадает в args/stdout/errors; URL разбирается на libpq child env. Query/hash overrides запрещены. PGOPTIONS/PGSERVICE/PGHOSTADDR и provider credentials не наследуются. PGPASSWORD существует только в child env; защита от локального OS administrator не заявляется.

`pg_dump -Fc --no-owner --no-acl --no-password --lock-wait-timeout=10000`, полный database schema+data, без table/schema exclusions. Definitions/indexes/constraints/sequence values входят в archive. Binary stdout направлен в exclusive file descriptor. UTC millisecond timestamp filename не содержит DB/user/host. `.partial` создаётся wx; archive verification precedes final non-overwriting hard link; удаляется только собственный завершённый partial. Failure оставляет partial либо dump без валидного manifest, exit !=0. Нет retention, удаления старых dump, upload, shell interpolation или raw stderr.

Default directory `backend/backups/postgres` уже покрыт `.gitignore` правилом backend/backups/. Правило не дублировалось. Внутри repo custom DB_DUMP_DIR разрешён только под backend/backups; внешнюю защищённую directory owner выбирает явно. POSIX permissions запрашиваются 0700/0600, Windows ACL и encryption at rest — owner action. Scripts не шифруют custom dump; он чувствительный и не должен попасть в git. Unsupported hard-link filesystem приводит к failure, а не overwrite.

Если pg_dump/pg_restore отсутствуют — safe message о ручной установке client tools/PG_BIN_DIR/PATH; автозагрузки нет. Child exit/error/timeout преобразуются в fixed safe code, не раскрывают connection string.

## 7. Archive verifier

`dbBackupVerify.cjs` принимает file, требует non-zero regular file, PGDMP header, успешный pg_restore --format=custom --list. Listing не выводится пользователю и выполняется без connection environment. Проверяется presence 23 tables+TABLE DATA, 19 sequence definitions+SEQUENCE SET, PK/FK/обычных uniques и 72 explicit indexes по текущей migration inventory.

Внутренний listing этап называется **archive-list-readable**. После продолжения публичный success — **BACKUP_VERIFIED**, только с валидным manifest, size/SHA-256 и listing, dataBlocksRestored=false. Это не complete data-block restore proof. Unknown/older schema dump текущий strict verifier может отклонить: нужен matching repo revision и reviewed migration plan. Никакого restore на Render для проверки listing нет.

## 8. Restore guardrails

Отдельный RESTORE_DATABASE_URL обязателен, fallback на DATABASE_URL отсутствует. Нужны --apply и RESTORE_CONFIRM_DATABASE с точным target DB name. Все non-loopback hosts, включая Render internal names/private IP, требуют `RESTORE_ALLOW_REMOTE=I_ACKNOWLEDGE_NEW_EMPTY_TARGET`; remote TLS только verify-full. Source/target same host+port+DB (с loopback aliases) запрещены. Remote DNS aliases автоматически не разрешаются — identity проверяет owner.

После продолжения target дополнительно сравнивается с sourceIdentitySha256 из manifest, даже если DATABASE_URL отсутствует. Production/LIVE substrings в target host/database, NODE_ENV/APP_ENV/ENVIRONMENT/RESTORE_ENVIRONMENT/HOTELBEDS_ENV/PAYMENTS_MODE и включённые sales/charges/refunds/live-booking flags блокируют restore без override. Работающий Render NODE_ENV=production не меняется: будущий test/staging restore выполняется из отдельной operator shell. Block эвристический: неизвестный opaque hostname не доказывает test назначение.

Перед restore: проверка archive и отсутствия user relations/sequences/views/functions/other sessions. Target должен оставаться изолированным весь window; preflight не делает concurrency race невозможным при постороннем owner DDL. pg_restore выполняется с single-transaction, exit-on-error, no-owner/no-acl/no-tablespaces. Нет clean/create/drop database/truncate/disable triggers. Ошибки дают non-zero; target/source не очищаются. Restore допускается только из trusted archive: arbitrary SQL от недоверенного source не sandbox-ится.

## 9. Schema validation / safe diagnostics

`dbSchemaCheck.cjs` работает только с RESTORE_DATABASE_URL, read-only. Проверяет expected tables, PK/unique columns, FK columns+target schema/table/column, index existence+validity+uniqueness, serial association/nextval default, last_value >= MAX(id) и called state при non-empty table, ledger presence/exact migration set. Не выполняет nextval/setval или migrations.

`dbInventory.cjs`: reachable, server_version_num, database/schema name, table count, migration count/latest/pending, size, approximate per-table rows и legacy backup timestamp. Не выводятся user/host/URL/records/errors/PII. Неизвестные migration/table names не раскрываются как произвольный текст; их наличие учитывается count. `--target` переключает только источник read-only diagnostics.

`--exact-counts` добавляет counts известных таблиц в read-only repeatable-read transaction, только при database size <=100 MiB; statement_timeout=10 s, query_timeout=15 s. Для больших DB — explicit failure, ordinary approximate inventory остаётся доступен. Отсутствие/устаревание statistics не выдаётся за exact counts. Успешная связь при последующей diagnostic validation error отмечается reachable=true, error остаётся safe.

Inventory parser ограничен syntax текущих migrations, не universal SQL parser. Unit tests фиксируют текущие размеры inventory. Schema validator не доказывает каждую произвольную index expression по имени: полный source/target definition compare сделан отдельно в local drill. Restore новых/нестандартных схем требует review tool inventory.

## 10. Recovered local drill evidence — before continuation

**Прежний report и сохранившийся local artifact сообщают PASS**, server/client 18.4. В этом продолжении drill не повторялся:

- Созданы новые source/target DB, host проверен как loopback до первого подключения.
- Существующий migration runner применил 001–020 на новом source; два independent parallel re-runs пропустили applied migrations без duplication.
- Только synthetic SQL fixtures: users/preferences, favorites, bookings, payments (pending, amount 0), refund draft, notification outbox, catalog hotel/destination и provider_job_state. Ни одного payment/provider API invocation.
- Реальный pg_dump создал `backend/backups/postgres/asedeliya-20260921T144115100Z.dump`, **92 046 bytes**.
- Реальный pg_restore --list подтвердил archive objects; реальный pg_restore восстановил в пустой local target.
- Schema check: 23 tables/PK, 16 FK, 72 explicit indexes, 19 serial defaults/sequence values, 20 migrations — PASS.
- Exact counts всех 23 таблиц source/target совпали. _migrations=20; по одной строке в users/favorites/bookings/payments/refund_requests/notification_outbox/provider_hotels/provider_destinations/provider_job_state; остальные таблицы пустые.
- Synthetic values выбранных 9 таблиц сравнивались in-memory, без вывода row contents.
- Сравнены 286 column definitions, constraints и 99 indexes. PostgreSQL переписывает varchar[]→text[] cast как per-element casts; нормализуется только эта конкретная эквивалентная форма. Иная разница definition не игнорируется.
- Повторный restore в непустой target отказан до pg_restore apply.
- Реальные CLI inventory source/target с --exact-counts, dbSchemaCheck и dbBackupVerify завершились exit 0. Это отдельная проверка wrappers/argument parsing, не только function mocks.

Успешная пара: `asedeliya_3y_source_4f1df9f9b7`, `asedeliya_3y_target_4f1df9f9b7`. Safe metadata: `backend/backups/3y-drill-4f1df9f9b7.json`, игнорируется git. В ходе двух прежних попыток созданы также пары suffix `2b5752f68d` и `8131ef358c`; они оставлены локально. Итого **6 новых fixture DB**, ничего не удалено. Первая target осталась пустой; вторая restore завершилась, но literal DDL comparison потребовал корректной normalization. Старые local app databases не очищались. Последующее удаление fixture DB — отдельное решение владельца.

## 11. Fixes found during implementation

Первый actual DB check обнаружил, что PostgreSQL name[] драйвер возвращает не так, как synthetic text[] array в unit fixture. Добавлен явный `a.attname::text` для catalog arrays. Затем literal definition comparison выявил эквивалентное преобразование PostgreSQL array cast при restore; local comparator нормализует ровно эту форму, не ослабляя проверку остальных definitions. Изменения относятся только к новым 3Y tools/tests; existing migrations/production framework не менялись.

Дополнительно предусмотрены safe directory guard и optional bounded exact counts. Реального destructive startup/migration defect, требующего переписывания app framework, не обнаружено.

## 12. App startup / migration readiness

Render blueprint build installs backend dependencies, start runs server.js; migration runner не запускается автоматически. Missing/unreachable DB приводит к /health 503 с безопасным JSON. SELECT 1 health может пройти при пустой schema — поэтому owner должен отдельно запускать schema/migration checks до cutover. Нет автоматического reset/demo seed; seedTours.js пустой и не включён в scripts/start.

001–020 в основном additive/idempotent; 002/004/008/011 содержат reviewed backfills, 020 меняет catalog constraints, поэтому не требуется и не предлагается blanket replay после restore. Ledger и advisory lock сохраняются. Optional jobs запускаются через прежние env gates, blueprint отключает автоматические backup/reliability/provider activities; реальный Render env здесь не проверялся и не менялся.

## 13. Exact changed files

1. `backend/package.json` — 6 новых manual/test aliases; старые scripts сохранены.
2. `backend/scripts/lib/dbContinuity.cjs` — shared safe command/URL/restore guards, inventory, diagnostics и schema checks.
3. `backend/scripts/dbBackup.cjs` — owner custom dump CLI.
4. `backend/scripts/dbBackupVerify.cjs` — no-DB archive listing verifier.
5. `backend/scripts/dbRestore.cjs` — separate confirmed empty target restore CLI.
6. `backend/scripts/dbInventory.cjs` — safe read-only source/target diagnostics.
7. `backend/scripts/dbSchemaCheck.cjs` — target schema validation CLI.
8. `backend/tests/databaseContinuity.test.cjs` — новый network-free focused suite.
9. `backend/tests/databaseContinuity.local.cjs` — opt-in real local drill, no DB deletion.
10. `DATABASE_CONTINUITY_RUNBOOK.md` — новый root runbook, owner commands и upgrade/move/rollback.
11. `SPRINT_3Y_DATABASE_CONTINUITY_BACKUP_RESTORE_REPORT.md` — этот отчёт.

.gitignore не изменён: default backup path уже исключён. Frontend/3X, migrations, DB runtime config, render.yaml, env/Secret Files, dependencies/lockfiles, legacy backups и старые tests/reports не изменены. Optional expiry UI не добавлен: scripts/runbook достаточны для scope.

## 14. Recovered tests/results — before continuation

| Проверка | Результат |
| --- | --- |
| 3Y network-free unit suite | PASS — 11/11 (parent + 10 subtests) |
| 3Y actual local dump/list/restore/schema/data drill | PASS, PostgreSQL 18.4; отдельный scope |
| Real local inventory/schema/verifier CLI | PASS — 4 commands, exit 0 |
| Полный frontend 3X → 3K | PASS — 112/112 |
| Existing full backend runner | PASS — 101/101, 12 suites |
| Legacy Sprint 2M / 2N checks | PASS — оба прежних runner |
| Frontend lint | PASS — 0 errors, 3 прежних admin hook warnings |
| Production build | PASS — 170 modules |
| Backend syntax / secret scan | Final scan results recorded below |
| git diff --check | Final audit recorded below |

Команды из root:

```powershell
node --require ./backend/tests/offlineNetwork.cjs --test --test-concurrency=1 --test-force-exit backend/tests/databaseContinuity.test.cjs
node backend/scripts/sprint3mRegression.cjs
node --require ./backend/tests/offlineNetwork.cjs backend/tests/sprint2m.test.js
node --require ./backend/tests/offlineNetwork.cjs backend/tests/sprint2n.test.js
node backend/scripts/sprint3mVerify.cjs
git -c core.safecrlf=false diff --check
```

Local drill opt-in command указан в runbook; он не входит в network-free unit suite. Использовались только существующие установленные binaries. Frontend command (из frontend):

```powershell
node --require ../backend/tests/offlineNetwork.cjs --test --test-concurrency=1 --test-force-exit tests/releaseCandidate.test.mjs tests/narrowProfile.test.mjs tests/narrowNavbar.test.mjs tests/globalUxPolish.test.mjs tests/helpUx.test.mjs tests/authUx.test.mjs tests/profileUx.test.mjs tests/accountUx.test.mjs tests/detailsUx.test.mjs tests/resultsAcceptance.test.mjs tests/homeUx.test.mjs tests/rateAwareFiltering.test.mjs tests/searchQuality.test.mjs tests/catalogPlanner.test.mjs tests/accessCircuits.test.mjs tests/catalogSearchUx.test.mjs
npm.cmd run lint
$env:VITE_HOTELBEDS_STAGING_TEST_ENABLED='true'
npm.cmd run build
```

Build flag — только в process environment команды. Build как 3X: JS 504.03 kB / gzip 140.93, CSS 111.36 kB / gzip 20.15, index.html 1.08 kB / gzip 0.57. Existing chunk >500 kB warning не подавлен.

## 15. Zero provider/payment and safety audit

3Y scripts/unit/local drill: Hotelbeds status=0, content=0, availability=0, checkrate=0, booking=0, cancellation=0; payment calls=0. Network-free unit suite блокирует HTTP/HTTPS/TCP/TLS/fetch и не создаёт DB. Local drill делает только loopback PostgreSQL operations с синтетическими fixture rows. SQL INSERT в payments/refund_requests проверяет перенос записей, не вызывает списаний/refunds. Existing regressions сохраняют прежние offline provider mocks; их mocked Availability calls не являются реальными запросами и не приписываются 3Y нулевому unit scope.

NO Render DB access/pg_dump/upgrade/env change/deploy. NO real Hotelbeds probes/imports/LIVE/booking/payment/refund operations. ProductionGate, TEST/LIVE, mTLS, quotas, sales/charges/refunds flags не менялись. Новые tools не подключены к startup. NO DROP DATABASE; no destructive remote SQL. Existing full runner очищает только свои временные local schemas, как до 3Y. Новые fixture databases сохранены, исходная local app DB не очищалась.

README.txt/docs/3N и старые reports не тронуты. NO git add/commit/push/deploy. Binary dumps/metadata находятся в игнорируемой backup directory; бизнес-данные Render не получались. Публичные PostgreSQL docs использованы только для сверки tool semantics; references приведены в runbook.

## 16. Exact owner commands / upgrade vs migration / rollback

Полный порядок и guard variables: **DATABASE_CONTINUITY_RUNBOOK.md**, разделы 3–10. Команды выполнять позже вручную, с source/target secrets, уже загруженными безопасным способом; здесь они против Render не выполнялись.

```powershell
# Source environment: existing DATABASE_URL; не выводить значение.
node backend/scripts/dbInventory.cjs --exact-counts
node backend/scripts/dbBackup.cjs
# Подставить generated filename; проверить каждый exit code перед следующим шагом.
$dump = 'backend/backups/postgres/asedeliya-YYYYMMDDTHHMMSSmmmZ.dump'
node backend/scripts/dbBackupVerify.cjs $dump
Get-FileHash -Algorithm SHA256 -LiteralPath $dump
# Отдельный заранее созданный empty target и отдельно загруженный RESTORE_DATABASE_URL.
# RESTORE_CONFIRM_DATABASE должен совпадать с фактическим target DB name.
node backend/scripts/dbRestore.cjs $dump --apply
node backend/scripts/dbSchemaCheck.cjs
node backend/scripts/dbInventory.cjs --target --exact-counts
```

При DB >100 MiB exact mode откажет: ordinary diagnostics + отдельно согласованное counts comparison. Для remote restore нужны explicit acknowledgement и verified TLS; для local drill — отдельный target/confirm. Нельзя использовать placeholder timestamp буквально. Scripts не provision-ят target и не меняют runtime DATABASE_URL.

A: independent dump+drill → owner upgrade decision → verify actual Render endpoint/TLS/schema/data/own-app state. Никакой гарантии automatic migration/downgrade не заявляется.

B: write freeze → dump → verify → provision → restore → schema/counts → migrations только если pending/reviewed → owner manual DATABASE_URL cutover → owner deploy → /health → own-app smoke → accounts/catalog/favorites/profile acceptance → сохранить старую DB и backup → отдельное окончательное решение.

Rollback до новых writes: остановить target traffic, вручную вернуть прежнюю source config/revision, deploy/health/schema/own-app checks. Не overwrite-ить source restore-ом. После новых writes: freeze, backup target, plan reconciliation; просто вернуть старый URL может потерять данные. Если source уже suspended — новая empty DB из защищённого dump, а не надежда на доступность free DB.

## 17. Limitations / owner action

На этапе code/offline продолжения restore drill ещё не запускался. Этот пробел закрыт отдельным current-version запуском в разделе 21. Исторические local assertions ниже относятся к recovered implementation.

Render acceptance NOT RUN. Real Render dump/restore/TLS compatibility/extensions/roles/permissions/plan/size и deadlines не проверены. Local 18.4 proof не означает compatibility с ещё неизвестной Render/target version. Synthetic fixture data ограничены перечисленными таблицами; остальная schema проверена пустой. Actual pg_restore rollback-on-corrupted-data отдельно не испытывался; command error propagation проверен unit mocks, refusal of occupied target — actual local.

pg_restore --list подтверждает TOC, не полную целостность данных. Encryption/off-machine retention/hash-copy checks выполняет owner. Single-database dump не включает cluster-wide roles/внешние certificates/secrets. Restore trusts source SQL; guard не sandbox. Source/target DNS alias equivalence и preflight/write races требуют owner isolation. Strict current migration inventory не универсальный schema diff tool. Secret scan ищет известные env secrets и private-key patterns, не заменяет полный security audit.

Сохранение **реальных данных Render ещё предстоит**. Дата suspension не меняется от наличия scripts. Владелец отдельно выбирает upgrade/перенос, создаёт source backup и target, выполняет cutover/deploy/acceptance. Новые root документы и рабочее дерево оставлены для review.

## 18. Manifest, verification and privacy — completed after continuation

Новый manifest `<generated-name>.dump.manifest.json` создаётся только после успешного custom header/TOC/expected-objects check. Поля: format=asedeliya-postgresql-custom, version=1, toolVersion=3Y.1, UTC createdAt, sourceIdentitySha256, allowlisted appEnvironment (иначе unspecified), dumpFilename, sizeBytes, sha256, numeric pg_dump clientVersion (иначе unknown), expectedRepositoryMigrations, sourceMigrationLedger=not-read, status=BACKUP_VERIFIED, verification=checksum-and-archive-list, dataBlocksRestored=false. Имена/пароли/URL/секреты/host не записываются; source identity — hash canonical host/port/database, одинаковый для localhost/127.0.0.1/::1. Owner хранит соответствие fingerprint своему source instance отдельно.

expectedRepositoryMigrations — именно repo expectation, не выдуманный результат SELECT source ledger. Фактический ledger читается существующим 3Y inventory; новых DB requests ради manifest нет. Schema/content полностью включаются в dump. Перечень 23 tables в разделе 3 сформирован из реальных migrations; traveller_profiles не выдумывается — фактическое имя traveler_profiles.

SHA-256 читается порциями по 1 MiB. Manifest имеет строгую схему, ограничен 64 KiB, не принимает произвольные дополнительные поля; проверяются UTC/filename correspondence, формат, версия, размер, hash и repo migrations. Standalone verifier и restore требуют пару dump+manifest. Старый recovered dump не снабжался задним числом новой metadata и не объявлялся verified новой версией. Backup и manifest не перезаписываются; fsync применяется к обоим. Interrupted publish может оставить artifact без валидного manifest — verifier откажет.

Состояния различаются: BACKUP_CREATED — только non-empty candidate; BACKUP_VERIFIED — manifest/checksum/list, не restore proof; RESTORE_VERIFIED — только после реального opt-in local synthetic drill и всех comparisons. Обычный restore CLI возвращает restored и требует schema check, не заявляет полный drill. SHA-256 не является authenticated signature; trusted archive/directory и отдельное защищённое хранение обязательны. TOC может читаться при повреждённых data blocks, поэтому нужен отдельный restore drill.

Path traversal (`..` по обоим разделителям), control characters и symlink/junction ancestors отклоняются. В repo output разрешён только под уже ignored backend/backups/. Windows/Linux используют Node fs и array args, shell:false/windowsHide; Linux execution в этом продолжении не выполнялся. Windows ACL, encryption, hard-link filesystem support и исключение параллельного изменения directory остаются operator responsibilities.

## 19. Tests executed after code/offline continuation / regressions (до финального drill раздела 21)

| Проверка текущей версии | Фактический результат |
| --- | --- |
| Focused 3Y offline | PASS — 18/18, parent + 17 subtests |
| Optional local drill без opt-in | SKIP, restoreVerified=false, exit 0; DB не создавалась |
| Existing backend sprint3mRegression | PASS — 101/101, 12 suites |
| Full frontend 3X → 3K, включая releaseCandidate | PASS — 112/112; 3X parent + 9 subtests |
| Frontend lint | PASS — 0 errors, 3 existing admin hook warnings |
| Frontend production build | PASS — 170 modules |
| Backend syntax scan | PASS — 191 files |
| Existing secret scan | PASS — 391 scanned, findings=[] |
| git diff --check | PASS |
| Real Render backup / current-version restore drill / migration | NOT RUN / NOT RUN / NOT RUN |

Выполненные команды: focused, backend runner, verifier и full frontend/lint/build commands из раздела 14; дополнительно `node --require ./backend/tests/offlineNetwork.cjs backend/tests/databaseContinuity.local.cjs` без opt-in (SKIP). Legacy 2M/2N runners в этом продолжении не повторялись: их результаты выше — recovered history, их код не менялся. Existing backend runner подключался только к local PostgreSQL, создавал и очищал собственные temporary schemas по прежнему contract. Network-free focused suite не подключается к PostgreSQL и mock-ит все child calls; HTTP/HTTPS/TCP/TLS/fetch=0, Hotelbeds/payment calls=0. Existing provider suites используют прежние mocks и offlineNetwork preload; реальные external requests не выполнялись.

Focused suite проверяет safe UTC filename/no-overwrite; source URL/TLS и child-env allowlist; отсутствующие pg_dump/pg_restore; dump/list failures и нулевой файл; manifest schema/credential absence; SHA-256, включая порчу без изменения размера; source=target по env и manifest; missing confirmation/remote ack; production/LIVE без override; отдельный test target; traversal/symlink; occupied target; transactional restore flags; read-only diagnostics/100 MiB limit; schema/PK/FK/index/sequence/migration failures. Stub PGDMP bytes и mock TOC не выдаются за настоящий PostgreSQL archive.

При доработке focused assertion для username ошибочно совпал с новым `--no-owner`; исправлено на проверку отдельного argv элемента owner и отсутствие URL/password. Итоговые 18/18 прошли после всех code edits. Старые tests и production app не подгонялись. Один patch runbook не применился из-за несовпавшего контекста; затем применён к фактическому тексту без потери recovered documentation.

Build: index.html 1.08 kB / gzip 0.57; JS 504.03 kB / gzip 140.93; CSS 111.36 kB / gzip 20.15. Как baseline 3X; existing >500 kB chunk warning сохранён. Build flag VITE_HOTELBEDS_STAGING_TEST_ENABLED=true задан только для процесса build. Dependencies, env files и frontend source не менялись.

## 20. Owner checklists, deadline and final safety audit

По уведомлению владельца Render suspension `asedeliya-staging-db`: **2026-10-11**. Подготовить и сохранить **verified external backup до suspension**. Дату удаления после grace period не предполагаем; account/plan/deadline через Render не проверялись и не менялись.

Manual backup checklist:

1. Установленные совместимые pg_dump/pg_restore, version check, защищённая operator machine и directory вне git.
2. Загрузить DATABASE_URL без history/argv/output, проверить source identity, verified TLS и read-only inventory/ledger.
3. Выполнить dbBackup.cjs; требовать exit 0 и BACKUP_VERIFIED. Записать source mapping, UTC, filename/hash.
4. Сохранить dump **и manifest** в устойчивом защищённом внешнем хранилище; повторить dbBackupVerify.cjs и hash после копирования. Не считать local ephemeral disk достаточной копией.
5. Отдельно подготовить пустую temporary/local DB и выполнить restore/schema/count drill. Readable list не равен RESTORE_VERIFIED.

Future restore/migration checklist:

1. Owner отдельно выбирает новую совместимую test/staging DB; source не удаляется. Freeze всех writes/background jobs, final backup и reviewed cutoff.
2. Отдельная non-production operator shell, явный RESTORE_DATABASE_URL, точное RESTORE_CONFIRM_DATABASE, --apply; remote acknowledgement и verify-full для новой Render DB. Никогда не подставлять source как target.
3. Trusted dump+manifest, empty isolated target; dbRestore → dbSchemaCheck → inventory/count comparison. При любой ошибке остановиться, source не очищать.
4. Matching repo revision и review действительно pending migrations; migration job получает target URL отдельно от runtime. `npm.cmd --prefix backend run migrate` — только после такого review, затем schema checks.
5. Только owner после acceptance вручную меняет runtime DATABASE_URL/TLS, выполняет deploy и /health + DB-only own-app smoke. TEST/sales/payment gates сохраняются; provider search/import не нужен для DB continuity.
6. Сохранить source и independent backup до приёмки. До новых writes rollback — возврат прежнего URL/config при доступном source; после writes — freeze/target backup/reconciliation, не слепой возврат. Никаких automatic retries, scheduler restore или UI controls.

Полные owner commands и secret-input пример: DATABASE_CONTINUITY_RUNBOOK.md. Прежняя local drill evidence не отменяет NOT RUN для дополненной версии. Limitations: DNS aliases, concurrent path/target changes, unknown extensions/roles, untrusted archive SQL, remote compatibility и encryption/retention требуют owner review; production-like detection консервативная эвристика, а не доказательство назначения БД. Secret scan ограничен known env values/private-key patterns.

Final changed/new set — **ровно 11 файлов**, перечисленных в разделе 13: 1 tracked modified (backend/package.json, recovered 7 insertions/1 deletion), 10 untracked 3Y files. При продолжении изменены только helper, оба 3Y tests, runbook и текущий report; 5 wrappers и package aliases сохранены с входа. Обычный git diff не включает untracked: их содержимое прочитано отдельно. Финальные git status --short, git diff --stat, git diff, git diff --check выполнены в этом порядке. Generated build/cache/regression logs и прежний drill artifact не являются source changes.

README.txt, docs/, SPRINT_3N_CATALOG_EXPANSION_PLANNER_REPORT.md и старые reports не изменялись. Нет git reset/checkout/restore/clean/add/commit/push, Render deploy/env/Secret Files/upgrade, создания или удаления Render DB, реальных Hotelbeds/payment/charge/refund calls. Ни один новый real backup/restore в этом продолжении не запускался. Рабочее дерево оставлено для owner review.

CODE / OFFLINE: PASS.
REAL RENDER BACKUP: NOT RUN.
RESTORE DRILL на предыдущем code/offline этапе: NOT RUN; финальная проверка — раздел 21.
RENDER DATABASE MIGRATION: NOT RUN.

## 21. Final current-version local restore verification — 2026-09-22

### Initial state and scope

Перед этой проверкой строго последовательно выполнены git status --short, git diff --stat, git diff. Состав working tree тот же: backend/package.json modified (7 insertions, 1 deletion), 10 новых 3Y files из раздела 13, прежние unrelated README.txt/docs/3N. Ничего не откатывалось. Реализация и tests не редактировались. Этот раздел заменяет прежний NOT RUN для current-version local drill; исторические результаты выше сохранены.

Read-only preflight проверил фактический local config без вывода URL/credentials: loopback=true, generated source/target наследуют этот loopback host. Точный opt-in существующего теста — CREATE_NEW_LOCAL_DATABASES. Найдены уже установленные pg_dump/pg_restore 18.4 в C:\Program Files\PostgreSQL\18\bin. Ничего не устанавливалось. Первая вспомогательная node -e preflight-команда не исполнила JS из-за PowerShell quoting; stdin-вариант затем успешно подтвердил loopback. Это не запуск drill, DB operations тогда не выполнялись.

### Single successful drill

Ровно один запуск existing backend/tests/databaseContinuity.local.cjs, exit 0:

```powershell
$env:PG_BIN_DIR='C:\Program Files\PostgreSQL\18\bin'
$env:DB_CONTINUITY_LOCAL_DRILL='CREATE_NEW_LOCAL_DATABASES'
$env:NODE_ENV='test'
$env:APP_ENV='staging'
node --require ./backend/tests/offlineNetwork.cjs backend/tests/databaseContinuity.local.cjs
```

Environment установлен только для operator process; .env и Render env не изменены. После успеха drill не повторялся. Встроенная проверка отказа restore в непустой target входит в этот один drill и не исполняет второй pg_restore apply.

| Evidence | Фактический результат |
| --- | --- |
| PostgreSQL server | 18.4, server_version_num=180004 |
| pg_dump / pg_restore clients | 18.4 / 18.4 |
| Созданные новые local DB | 2; обе сохранены |
| Source | asedeliya_3y_source_d3b1c25783 |
| Target | asedeliya_3y_target_d3b1c25783 |
| Dump | backend/backups/postgres/asedeliya-20260922T112927037Z.dump |
| UTC createdAt | 2026-09-22T11:29:27.037Z |
| Dump size | 92 039 bytes |
| Manifest created | YES, тот же dump path + .manifest.json |
| SHA-256 | ec544c0ff5e387f33b14bfd56dfc4220210f120d6e1b91ffef90944340f55b0e |
| sourceIdentitySha256 | Сверен с фактическим local source, PASS |
| BACKUP_VERIFIED | YES, manifest/hash/custom header/real pg_restore --list/expected objects |
| RESTORE_VERIFIED | YES, scope LOCAL_SYNTHETIC_ONLY |
| Schema validation | valid=true, missing=[]; 23 tables, 72 explicit indexes, 16 FK, 19 sequences |
| Migration ledger | 20 applied, pending=0, unknown=0 |
| Exact counts source/target | Совпали по всем 23 таблицам |
| Column/constraint/index definitions | Эквивалентны по существующему comparator |
| Synthetic values | Совпали по 9 fixture tables, значения не выводились |
| Runtime evidence | backend/backups/3y-drill-d3b1c25783.json, ignored |

001–020 применены к новому source; два встроенных parallel re-runs существующего migration runner пропустили applied migrations. _migrations=20; по 1 synthetic row в users, favorites, bookings, payments, refund_requests, notification_outbox, provider_hotels, provider_destinations, provider_job_state; остальные таблицы пусты. SQL fixture rows payments/refund_requests не вызывают платежных API. Provider/payment counters=0.

Drill вызвал те же production helper functions, которые используют dbBackup/dbBackupVerify/dbRestore/dbSchemaCheck wrappers, с настоящими pg_dump и pg_restore. После него отдельно выполнены четыре read-only CLI commands: dbBackupVerify.cjs для нового dump; dbSchemaCheck.cjs для нового target; dbInventory.cjs --exact-counts для source; dbInventory.cjs --target --exact-counts для target. Все exit 0. Child env содержал только подготовленные local URLs; перед dispatch ещё раз проверен loopback. CLI outputs сравнивались in-memory: exact counts совпали между собой и с artifact drill, source identity manifest совпала. Дополнительного dump/restore/provision не выполнялось.

### Post-drill regressions and exact edits

- Focused command: `node --require ./backend/tests/offlineNetwork.cjs --test --test-concurrency=1 --test-force-exit backend/tests/databaseContinuity.test.cjs` — PASS 18/18.
- `node backend/scripts/sprint3mRegression.cjs` — PASS 101/101, 12 suites; только временные local schemas и прежние offline stubs/preload.
- `node backend/scripts/sprint3mVerify.cjs` — PASS, 191 backend syntax files, 391 secret-scan files, findings=[].
- `git -c core.safecrlf=false diff --check` — PASS.

Code changes после drill: **нет**, реальных implementation bugs не обнаружено. Единственный source/document edit этого финального verification turn: **SPRINT_3Y_DATABASE_CONTINUITY_BACKUP_RESTORE_REPORT.md**. DATABASE_CONTINUITY_RUNBOOK.md не менялся: фактический запуск не выявил необходимости уточнения. Общий inherited Sprint 3Y changed/new set по-прежнему ровно 11 файлов из раздела 13; новых tracked/untracked source files не добавлено. Созданы только три ignored evidence artifacts: dump, manifest и drill JSON. Existing regression logs остаются runtime artifacts.

Ни старые, ни новые fixture databases не удалялись; DROP DATABASE не выполнялся. Existing regression runner очищал только свои временные schemas по прежнему contract. NO Render/remote DB/external provider/payment requests, NO .env changes, NO git add/commit/push/deploy. README.txt/docs/3N и старые reports сохранены.

CODE / OFFLINE: PASS.
LOCAL POSTGRES CURRENT-VERSION RESTORE DRILL: PASS.
REAL RENDER BACKUP: NOT RUN.
RENDER DATABASE MIGRATION: NOT RUN.
