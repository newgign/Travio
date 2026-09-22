# Database Continuity — owner runbook

Sprint 3Y. Все действия с Render выполняет владелец позже. Coding sprint не меняет plan, удалённую БД, DATABASE_URL, env, Secret Files или deployment.

По сообщению владельца, `asedeliya-staging-db` будет suspended **2026-10-11**, после grace period возможна потеря БД. Точный grace deadline и доступные варианты владелец проверяет в своём Render dashboard. Не ждать suspension для создания отдельной копии. Эта дата не добавлена в consumer UI или конфигурацию.

## 1. Решение владельца

| Вариант | Что подготовить | Что подтвердить после действия |
| --- | --- | --- |
| A. Upgrade existing DB | Независимый свежий dump, readable listing, local restore drill; текущие параметры и rollback window | Доступность, версия, DB/schema/migration state, данные, актуальный endpoint и правила Render |
| B. Move to new PostgreSQL | Write freeze, dump, target совместимой версии, необходимые extensions/roles/права, отдельные credentials и TLS | Restore, schema/row-count checks, ручное переключение backend, own-app acceptance |

Runbook не обещает автоматический перенос данных или неизменность endpoint при upgrade. Владелец проверяет предложенную Render операцию до подтверждения. Тарифы/покупки/удаление в scripts отсутствуют.

## 2. Safety baseline и граница инструментов

В работающем приложении сохранить NODE_ENV=production, Hotelbeds TEST, disabled booking/payment/sales/refunds и прежний productionGate. Restore выполняется из отдельной operator shell с NODE_ENV=test и APP_ENV=staging, только для проверенного нового test/staging target; runtime Render env не менять ради запуска CLI. Production/LIVE признаки в operator env или host/database target блокируют restore даже с remote acknowledgement. Не включать Content sync, hotel imports, provider probes, monitors, email delivery или платежи ради backup/acceptance. Freeze writes относится также к register/profile/favorites и background jobs: выключенные продажи сами по себе не замораживают все записи.

Новые scripts — только manual CLI, не подключены к startup/cron. Они не читают .env автоматически; используют уже подготовленный environment процесса. Не передавайте URL в аргументах CLI и не печатайте его. Secrets загрузите из защищённого окружения/secret manager, без вставки в shell history, отчёты или screenshots.

| Команда из project root | Назначение |
| --- | --- |
| `node backend/scripts/dbBackup.cjs` | Полный single-database custom dump |
| `node backend/scripts/dbBackupVerify.cjs <dump-path>` | Manifest + SHA-256 + custom header + `pg_restore --list` + expected objects, без DB connection |
| `node backend/scripts/dbInventory.cjs` | Source diagnostics, read-only |
| `node backend/scripts/dbInventory.cjs --target` | Target diagnostics через RESTORE_DATABASE_URL, read-only |
| `node backend/scripts/dbInventory.cjs --exact-counts` | Exact counts известных таблиц для DB <=100 MiB |
| `node backend/scripts/dbInventory.cjs --target --exact-counts` | Те же counts после restore |
| `node backend/scripts/dbRestore.cjs <dump-path> --apply` | Restore только в отдельный подтверждённый пустой target |
| `node backend/scripts/dbSchemaCheck.cjs` | Validate target через RESTORE_DATABASE_URL, read-only |

Также доступны npm aliases `db:dump`, `db:dump:verify`, `db:restore:empty`, `db:inventory`, `db:schema:check` через `npm.cmd --prefix backend run ...`. Для path arguments удобнее root node commands: npm меняет cwd на backend.

## 3. PostgreSQL clients и TLS

Проверить установленные binaries:

```powershell
pg_dump --version
pg_restore --version
# Альтернатива для существующего PG_BIN_DIR:
# & (Join-Path $env:PG_BIN_DIR 'pg_dump.exe') --version
# & (Join-Path $env:PG_BIN_DIR 'pg_restore.exe') --version
```

Интерактивный ввод URL в PowerShell без literal secret в history:

```powershell
function Set-PrivateDatabaseUrl {
  param([ValidateSet('DATABASE_URL','RESTORE_DATABASE_URL')][string]$Name)
  $secretInput = Read-Host $Name -AsSecureString
  $secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secretInput)
  try {
    [Environment]::SetEnvironmentVariable($Name, [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer), 'Process')
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
    $secretInput.Dispose()
  }
}
Set-PrivateDatabaseUrl DATABASE_URL
$env:APP_ENV = 'staging'
# Позже, только после создания отдельной test/staging DB:
# Set-PrivateDatabaseUrl RESTORE_DATABASE_URL
```

После работы закрыть operator shell или удалить process variables через `Remove-Item Env:DATABASE_URL, Env:RESTORE_DATABASE_URL -ErrorAction SilentlyContinue`. Не использовать echo/Get-ChildItem Env для диагностики. На Linux загружать эти же environment variables из защищённого secret manager; основные `node ...` команды одинаковы, shell interpolation URL не применяется.

Потребуются pg_dump и pg_restore, установленные владельцем. Можно оставить их в PATH или задать `PG_BIN_DIR` в текущей owner shell. Никакой автоматической установки нет. В repo Docker image — PostgreSQL 16; фактическая Render version неизвестна до owner inventory. Local 3Y drill прошёл на PostgreSQL server/client 18.4; это не подтверждение версии Render.

Для source scripts нужен существующий `DATABASE_URL`. Для restore — отдельный `RESTORE_DATABASE_URL`; fallback на source запрещён. Принимаются postgres/postgresql URL с явно заданными user/database, без query/hash/libpq overrides. Database name допускает буквы, цифры, `_` и `-`, начинается с буквы/`_`, длина <=63. При несовместимом имени/URL scripts откажут, а не изменят его молча.

Source TLS использует `DB_SSL_MODE` (`verify-full` по умолчанию) и при необходимости `DB_SSL_CA_PATH`. Target независимо использует `RESTORE_DB_SSL_MODE` и `RESTORE_DB_SSL_CA_PATH`. Для любого non-loopback host разрешён только verify-full. Для явно локальных fixtures допускается disable. Настройте доверенный CA для libpq: его trust-store может отличаться от Node. Ошибку сертификата нельзя обходить отключением проверки remote TLS.

Connection components передаются pg tools в отдельном child environment, password — PGPASSWORD, не argv. Не наследуются PGOPTIONS/PGSERVICE/PGHOSTADDR или Hotelbeds secrets. Это защищает командную строку и output, но не является защитой от локального администратора, читающего process environment. Используйте доверенную машину/учётную запись. Официальные правила переменных: [PostgreSQL libpq environment](https://www.postgresql.org/docs/18/libpq-envars.html).

Выбирайте pg_dump совместимого major: он не выгружает более новый server, чем поддерживает client. Восстановление в более старый PostgreSQL не считать гарантированным; сначала exact-version drill. Custom dump содержит schema/data и определения database objects, но не global roles/tablespaces всего cluster. [PostgreSQL pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html).

## 4. Создание и хранение backup — owner action, не выполнено на Render

С уже безопасно загруженным source environment, из project root:

```powershell
node backend/scripts/dbInventory.cjs --exact-counts
if ($LASTEXITCODE -ne 0) { throw 'Source inventory failed; stop' }
node backend/scripts/dbBackup.cjs
if ($LASTEXITCODE -ne 0) { throw 'Backup failed; stop' }
```

Если DB больше 100 MiB, exact-count режим откажет. Запустите обычный inventory, затем отдельно согласуйте bounded/read-only сравнение counts крупных таблиц. Не используйте approximateRows как доказательство отсутствия потери данных: это статистика, которая может быть устаревшей, особенно сразу после restore.

Default output: `backend/backups/postgres/asedeliya-YYYYMMDDTHHMMSSmmmZ.dump`, UTC. Папка уже исключена существующим `.gitignore`; новое правило не добавлено. `DB_DUMP_DIR` может указывать на защищённое внешнее хранилище; внутри repo разрешено только дерево backend/backups. Не выводится полный путь, только generated filename и размер. Запишите фактический location отдельно.

pg_dump выполняется с `-Fc --no-owner --no-acl --no-password --lock-wait-timeout=10000`, без schema/table/data-only exclusions. Stdout направлен прямо в file descriptor, а не в terminal. Exclusive `.partial` reservation и atomic non-replacing link не позволяют затереть старый dump. Ошибка оставляет `.partial` либо dump без валидного manifest; такой результат не объявляется verified. Старые backups не удаляются, upload/retention нет. Если filesystem не поддерживает hard links, операция завершится ошибкой; выберите подходящий локальный filesystem. POSIX mode 0600/0700 задаётся, Windows ACL владелец проверяет отдельно.

Успешный запуск автоматически проверяет custom header/list/expected objects и записывает рядом `<dump>.manifest.json`: format/version, UTC createdAt, sourceIdentitySha256, allowlisted appEnvironment, имя dump, размер, SHA-256 и numeric client version. Identity — hash нормализованного host/port/database без username/password; владелец хранит соответствие fingerprint и Render instance в своём защищённом inventory. `expectedRepositoryMigrations` описывает repo contract; `sourceMigrationLedger=not-read` явно не выдаёт его за прочитанный ledger source. Source ledger проверяется отдельным inventory.

`BACKUP_CREATED` означает только наличие непустого candidate; завершение команды exit 0 и `BACKUP_VERIFIED` означают checksum + readable list + manifest, не полный restore. `RESTORE_VERIFIED` зарезервирован для завершённого synthetic local drill с schema/counts/value comparisons. При копировании сохранять dump и manifest вместе, имена не менять, затем повторить verifier. Старые partial-3Y dumps без manifest новым verifier не принимаются; не подделывать metadata. SHA-256 не является подписью доверенного источника.

Пути с `..` и symlink/junction ancestors отклоняются. Для внешнего хранилища указывать прямой абсолютный путь. Защищённая directory не должна параллельно изменяться посторонними процессами.

Custom dump **не зашифрован этим script**. Он содержит password hashes, PII и внутренние snapshots, если они есть в source. Храните его вне git, шифруйте/копируйте в устойчивое защищённое место вручную. Копия на ephemeral disk backend не является достаточным планом continuity. Ничего автоматически не upload-ится.

Проверка фактического полученного файла:

```powershell
# Заменить только timestamp на имя, выданное dbBackup.cjs.
$dump = 'backend/backups/postgres/asedeliya-YYYYMMDDTHHMMSSmmmZ.dump'
node backend/scripts/dbBackupVerify.cjs $dump
if ($LASTEXITCODE -ne 0) { throw 'Archive listing verification failed; stop' }
Get-FileHash -Algorithm SHA256 -LiteralPath $dump
```

Hash и manifest хранить рядом с защищённой копией и сверять после переноса. `BACKUP_VERIFIED` подтверждает checksum/manifest/TOC/expected objects, **не** полный проход data blocks и **не** успешный restore. Следующий обязательный шаг — восстановить trusted dump в отдельной local/temp DB и проверить данные.

## 5. Restore guardrails и owner commands

Владелец предварительно создаёт **новую пустую** PostgreSQL DB. Script не создаёт/удаляет DB. Нельзя использовать работающую source или DB с restored tables. Не запускайте backend/workers против target до окончания checks.

Необходимы:

- `RESTORE_DATABASE_URL` — отдельный target secret, загрузить безопасным способом.
- `RESTORE_CONFIRM_DATABASE` — точное имя target, дополнительное подтверждение.
- `--apply` — явная операция.
- Для любого non-local host, включая internal Render hostname, дополнительно `RESTORE_ALLOW_REMOTE=I_ACKNOWLEDGE_NEW_EMPTY_TARGET`.
- Для local target — explicit `RESTORE_DB_SSL_MODE=disable`, если TLS не настроен; для remote — verify-full.

Source DATABASE_URL не изменяется для restore. Если source env задан и host/port/database совпадают, restore запрещён. Дополнительно target сравнивается с source fingerprint manifest даже без source env. Loopback aliases считаются одним host. Разные DNS aliases одного удалённого сервера автоматически распознать нельзя — владелец отдельно проверяет target identity. Guard не заменяет отдельную пустую DB и write freeze.

Пример после безопасной загрузки **локального target** URL:

```powershell
$env:RESTORE_CONFIRM_DATABASE = 'asedeliya_restore_drill'
$env:NODE_ENV = 'test' # только отдельная operator shell, не runtime Render env
$env:APP_ENV = 'staging'
$env:RESTORE_DB_SSL_MODE = 'disable'
node backend/scripts/dbRestore.cjs $dump --apply
if ($LASTEXITCODE -ne 0) { throw 'Restore failed; keep source intact' }
node backend/scripts/dbSchemaCheck.cjs
if ($LASTEXITCODE -ne 0) { throw 'Schema validation failed; do not switch backend' }
node backend/scripts/dbInventory.cjs --target --exact-counts
if ($LASTEXITCODE -ne 0) { throw 'Target inventory failed; stop' }
```

Для позже выбранного remote target владелец задаёт его secret/CA, точное имя в RESTORE_CONFIRM_DATABASE, verify-full и дополнительный acknowledgement в своей shell. Этот runbook не является выполненным разрешением/переключением Render.

До restore проверяются user tables/sequences/views/materialized views/foreign tables, functions и другие подключённые sessions в target. Любая занятость вызывает отказ. Это preflight, а не защита от владельца, параллельно создающего новые объекты: target должен оставаться изолированным весь restore window.

pg_restore: custom format, `--single-transaction --exit-on-error --no-owner --no-acl --no-tablespaces`. Нет `--clean`, `--create`, `--disable-triggers`, DROP DATABASE или TRUNCATE. On error — non-zero, raw stderr не выводится. Для исправления failure сначала исследуйте причину на безопасной local copy; source остаётся нетронутым. Ownership/ACL source не переносятся автоматически: target user получает objects, нужные роли/права владелец назначает отдельно.

Восстанавливайте только архив известного доверенного источника: dump содержит SQL definitions, которые pg_restore исполняет. Guard не является SQL sandbox. [PostgreSQL pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html).

## 6. Schema/migration checks после restore

Текущий source contract: 001–020, 22 application tables + `_migrations`, 23 PK, 16 FK, 4 сохранившихся обычных UNIQUE constraints, 72 explicit indexes (ещё 27 PK/UNIQUE backing indexes), 19 serial sequences. Migration inventory генерируется детерминированно из текущего repo, с учётом 020, заменяющего старые catalog unique constraints на environment identity indexes.

`dbSchemaCheck.cjs` проверяет table presence, PK/FK columns/references, UNIQUE columns, index presence/uniqueness/validity, serial association/default и sequence value не ниже MAX(id), exact migration names/неизвестные migrations. Он не меняет данные и не вызывает nextval/setval. Diagnostics показывают только DB name/version/schema/counts/size; не выводят records, URL, username, host, emails, hashes, tokens или raw DB errors. Exact counts работают в read-only repeatable-read transaction с statement timeout 10 s и size cap 100 MiB.

Инструменты рассчитаны на `public`, как existing JSON backup и обычный application SQL. Не разрешайте пользовательской schema перехватить unqualified tables. Если current_schema не public — остановитесь и проверьте search_path. Не переносите временные test schemas в рабочую staging DB.

Если `_migrations` отсутствует или state отличается, остановиться. Не считать схему «актуальной» только по имени таблиц. Используйте tool/repo revision, соответствующую source archive; verifier текущей версии требует текущие expected objects. Для старого архива сначала matching-version restore/drill, затем review реально pending migrations. Не подделывайте migration history и не запускайте все migrations автоматически для обхода проверки.

## 7. Startup audit и схема deploy

`render.yaml`: build — `npm --prefix backend ci --omit=dev`, start — `npm --prefix backend start`. Start запускает server.js, **не** migration runner. Автоматического destructive reset/seed нет. `backend/scripts/seedTours.js` пустой и не подключён к start. Optional backup/reliability/provider monitors сохраняют прежние gates; blueprint оставляет их выключенными. Проверьте actual owner settings отдельно, blueprint не доказывает deployed env.

`npm.cmd --prefix backend run migrate` — отдельная команда. Runner сортирует имена, использует `_migrations`, session advisory lock 319003, transaction на каждую ещё не применённую migration. 002/004/008/011 содержат backfills, 020 заменяет два catalog uniqueness constraints без удаления rows. Поэтому «idempotent» не означает «нужно повторять всё поверх restore».

Если checks показывают действительно pending migrations, владелец выполняет reviewed migration job against target в отдельном процессе с явно подготовленным target DATABASE_URL; source/backend runtime URL до cutover не меняются. Перед этим нужен backup и подтверждение revision. После — повторить schema/counts. Если pending нет — миграции не нужны.

`/health` делает SELECT 1 и возвращает 503 при недоступной DB без секретов. Успешный `/health` **не подтверждает наличие tables/migrations/данных**. Обязателен schema check до запуска backend traffic. После отдельно выполненного owner cutover: `Invoke-RestMethod -Uri 'https://YOUR-BACKEND-HOST/health'`; ожидать status=ok и database.ok=true. Заменить placeholder только на свой backend host. Эту команду агент не выполнял.

## 8. Scenario A — Upgrade existing Render DB

1. Проверить срок из owner notice, текущую версию/размер/использование и доступные действия в dashboard.
2. Создать независимый custom dump; проверить listing, hash и local restore. При необходимости согласовать write freeze для согласованного cutoff.
3. Владелец отдельно подтверждает выбранный upgrade plan и окно операции в Render. Агент этого не делает.
4. Проверить endpoint/TLS/settings после операции, DB/schema/migration inventory, counts, /health и own-app read checks.
5. Сохранить независимый dump и прежние настройки до завершения acceptance. Не считать downgrade/возврат тарифа автоматически доступным rollback; при проблеме подготовить новый DB target из проверенного dump по сценарию B.

## 9. Scenario B — Move to new PostgreSQL DB

1. **Freeze write window.** Владелец останавливает записи через backend/worker/cron traffic. Зафиксировать cutoff и исходный backend revision/config без secret values. Disabled payments не блокируют profile/favorite/register writes.
2. **Create pg_dump.** Source environment остаётся прежним. Сохранить exact-count inventory малого staging и generated file/size/time/hash. После dump держать source write-frozen до cutover либо запланировать ещё один финальный dump.
3. **Verify dump.** Custom listing + expected objects + checksum после копирования. Local restore drill обязателен, TOC-only не достаточен.
4. **Provision target DB.** Владелец выбирает совместимую PostgreSQL version, empty DB, TLS/CA, extensions/roles/locale/encoding/permissions. Source сохраняется.
5. **Restore.** Отдельные RESTORE_DATABASE_URL/confirm/remote acknowledgement, без runtime DATABASE_URL switch. Никаких подключённых backend instances к target.
6. **Schema checks.** dbSchemaCheck, migrations, PK/FK/unique/index/sequences; сравнить exact rows с frozen source. При DB >100 MiB отдельно согласовать read-only counts/checks. Не интерпретировать approximate rows как exact.
7. **Migrations only if required.** Matching revision + review pending, отдельный owner migration job, после него повторить checks. Никакого blanket replay.
8. **Change DATABASE_URL manually by owner.** Только после restore/checks, с прежними TEST/sales/payment gates и правильными TLS parameters. Это отдельное действие владельца в Render/secret manager.
9. **Deploy backend by owner.** Не включать auto imports/probes/платежи/рассылки.
10. **/health.** Проверить безопасный DB reachability и отдельно schema inventory.
11. **Own-app smoke.** Использовать существующую session/аккаунт; не создавать booking/payment. Запросы accounts/profile/favorites и persisted catalog должны читать target.
12. **Account/catalog/favorites/profile acceptance.** Сверить наличие выбранных владельцем записей и preferences в UI без публикации PII. Не запускать Hotelbeds search/resolver/import ради smoke. Проверять catalog через persisted DB-only API; full end-to-end availability — отдельный scope.
13. **Keep old DB.** Не удалять и не переиспользовать source до конца agreed retention/acceptance window и подтверждения отдельной backup copy. Учесть suspension deadline старого free DB; retention не продлевается самим runbook.
14. **Rollback plan.** Ниже. Только после приёмки владелец снимает write freeze и отдельно решает судьбу старой DB.

## 10. Rollback

До возобновления writes: остановить target backend, вернуть прежний DATABASE_URL/TLS/config и предыдущий backend revision вручную, deploy, /health + schema/own-app checks. Source должен оставаться доступным и неизменённым; не overwrite-ить его восстановлением. Если source suspended/недоступен, использовать сохранённый trusted dump для **новой** пустой DB.

После возобновления writes target и source могут разойтись. Сначала freeze обоих, сделать отдельный backup target, определить новые записи/изменения и согласовать reconciliation. Простое возвращение старого URL может потерять новые accounts/favorites/profile/application changes. Автоматического merge/rollback script нет. Ничего не удалять до отдельного решения владельца.

## 11. Existing backup/freshness — не путать механизмы

`backup:create/verify/restore` относятся к прежнему `travio-logical-backup` JSON (release 3A), optional AES-GCM encryption, column schema signature и rows из public. Прежний apply restore использует общий app pool и TRUNCATE RESTART IDENTITY CASCADE после ALLOW_DATABASE_RESTORE=true; **для переноса по этому runbook его не запускать**. Его код и контракты сохранены.

`maintenance_runs` хранит legacy `backup_create` success/completed_at/artifact/checksum. Inventory нового script выводит только success timestamp, если запись реально существует. Новый custom dump не создаёт эту DB запись и не выдаёт её за собственный backup metadata.

Sprint 2N freshness дополнительно проверяет наличие локального JSON файла, checksum/release и возраст modifiedAt. Это больше, чем голый timestamp, но всё равно не доказывает отдельный pg_dump, off-machine сохранность или полный restore. Не использовать зелёный indicator вместо независимой копии и drill.

## 12. Воспроизводимый local drill

Опциональный тест создаёт две **новые** local databases и оставляет их владельцу, без DROP DATABASE. Он читает local config из backend/.env, проверяет loopback host перед подключением, использует explicit generated source/target URL только во внутренних env objects. Не меняет .env или runtime DATABASE_URL. Требует CREATE DATABASE privileges.

```powershell
$env:PG_BIN_DIR = 'C:\Program Files\PostgreSQL\18\bin' # путь к уже установленным binaries
$env:DB_CONTINUITY_LOCAL_DRILL = 'CREATE_NEW_LOCAL_DATABASES'
$env:NODE_ENV = 'test'
$env:APP_ENV = 'staging'
node --require ./backend/tests/offlineNetwork.cjs backend/tests/databaseContinuity.local.cjs
if ($LASTEXITCODE -ne 0) { throw 'Local drill failed; do not claim restore readiness' }
```

Содержимое synthetic fixtures и dump не помещается в git. Результат сохраняется в игнорируемом `backend/backups/3y-drill-<suffix>.json`. Каждый запуск создаёт новую пару; не запускать многократно без необходимости. Удаление fixture DB — отдельное последующее решение владельца, здесь не автоматизировано.

Без opt-in CLI выводит SKIP и restoreVerified=false; отсутствующий client, недоступный local PostgreSQL или ошибка drill дают BLOCKED, exit 1. Ни один такой исход не является restore PASS. До CREATE DATABASE проверяются local host, restore guard и наличие clients. Сохранившийся artifact прежнего local drill не подтверждает повторный drill дополненной версии.

Обычный **network-free** unit suite не создаёт DB и не запускает PostgreSQL binaries:

```powershell
node --require ./backend/tests/offlineNetwork.cjs --test --test-concurrency=1 --test-force-exit backend/tests/databaseContinuity.test.cjs
```

## 13. Границы готовности

CODE/OFFLINE и LOCAL POSTGRES описаны в новом Sprint 3Y report. RENDER: NOT RUN. OWNER ACTION: выбор upgrade/migrate, реальный source dump, защищённое долговременное хранение, target provision/restore, ручной cutover/deploy/rollback и acceptance ещё предстоят. Наличие этих scripts не останавливает suspension и не означает, что данные Render уже сохранены.
