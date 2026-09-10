const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const pool = require("../db");
const maintenanceRunService = require("./maintenanceRunService");

const FORMAT = "travio-logical-backup";
const VERSION = 1;

function intEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function backupDir() {
  return path.resolve(process.cwd(), process.env.DB_BACKUP_DIR || "./backups");
}

function encryptionSecret() {
  return String(process.env.DB_BACKUP_ENCRYPTION_KEY || "").trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function nearestExistingParent(target) {
  let current = target;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return current;
}

function directoryStatus() {
  const dir = backupDir();
  const parent = nearestExistingParent(dir);
  let writable = false;
  try {
    fs.accessSync(parent, fs.constants.W_OK);
    writable = true;
  } catch {
    writable = false;
  }
  return {
    directory: dir,
    exists: fs.existsSync(dir),
    writable,
    retention: intEnv("DB_BACKUP_RETENTION", 10),
    encryptionConfigured: Boolean(encryptionSecret()),
    requireEncryption: String(process.env.DB_BACKUP_REQUIRE_ENCRYPTION || "false").toLowerCase() === "true",
  };
}

async function listTables(client) {
  const result = await client.query(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);
  return result.rows.map((row) => row.tablename);
}

async function schemaSignature(client) {
  const result = await client.query(`
    SELECT table_name, column_name, data_type, is_nullable, ordinal_position
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);
  return sha256(JSON.stringify(result.rows));
}

async function snapshotDatabase() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const tables = await listTables(client);
    const payload = {
      format: FORMAT,
      version: VERSION,
      release: "3A",
      createdAt: new Date().toISOString(),
      database: process.env.DB_NAME || null,
      schemaSignature: await schemaSignature(client),
      tables: {},
    };

    for (const table of tables) {
      const safeTable = `"${String(table).replace(/"/g, '""')}"`;
      const result = await client.query(`SELECT * FROM ${safeTable}`);
      payload.tables[table] = result.rows;
    }

    await client.query("COMMIT");
    return payload;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

function encryptPayload(plaintext, secret) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(secret, salt, 32);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    algorithm: "aes-256-gcm+scrypt",
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function decryptPayload(envelope, secret) {
  if (!secret) throw new Error("DB_BACKUP_ENCRYPTION_KEY required to open encrypted backup");
  const salt = Buffer.from(envelope.salt, "base64");
  const iv = Buffer.from(envelope.iv, "base64");
  const tag = Buffer.from(envelope.tag, "base64");
  const ciphertext = Buffer.from(envelope.ciphertext, "base64");
  const key = crypto.scryptSync(secret, salt, 32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function serializePayload(payload) {
  const plaintext = JSON.stringify(payload);
  const checksum = sha256(plaintext);
  const secret = encryptionSecret();
  const requireEncryption = String(process.env.DB_BACKUP_REQUIRE_ENCRYPTION || "false").toLowerCase() === "true";
  if (requireEncryption && !secret) throw new Error("Backup encryption is required but DB_BACKUP_ENCRYPTION_KEY is empty");

  if (secret) {
    return JSON.stringify({
      format: FORMAT,
      version: VERSION,
      encrypted: true,
      checksum,
      ...encryptPayload(plaintext, secret),
    }, null, 2);
  }

  return JSON.stringify({
    format: FORMAT,
    version: VERSION,
    encrypted: false,
    checksum,
    payload,
  }, null, 2);
}

function parseBackupFile(filePath) {
  const absolute = path.resolve(filePath);
  const envelope = JSON.parse(fs.readFileSync(absolute, "utf8"));
  if (envelope.format !== FORMAT || Number(envelope.version) !== VERSION) {
    throw new Error("Unsupported Travio backup format");
  }

  const plaintext = envelope.encrypted
    ? decryptPayload(envelope, encryptionSecret())
    : JSON.stringify(envelope.payload);
  const checksum = sha256(plaintext);
  if (checksum !== envelope.checksum) throw new Error("Backup checksum mismatch");

  const payload = envelope.encrypted ? JSON.parse(plaintext) : envelope.payload;
  if (!payload || payload.format !== FORMAT || !payload.tables || typeof payload.tables !== "object") {
    throw new Error("Backup payload is incomplete");
  }

  return { absolute, envelope, payload, checksum };
}

function backupFilename(checksum) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `travio-${stamp}-${checksum.slice(0, 8)}.backup.json`;
}

function backupFiles(dir = backupDir()) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^travio-.*\.backup\.json$/i.test(name))
    .map((name) => {
      const filePath = path.join(dir, name);
      const stat = fs.statSync(filePath);
      return { name, path: filePath, stat };
    })
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
}

function cleanupRetention(dir = backupDir()) {
  const keep = intEnv("DB_BACKUP_RETENTION", 10);
  const maxAgeDaysRaw = Number(process.env.DB_BACKUP_MAX_AGE_DAYS || 0);
  const maxAgeDays = Number.isFinite(maxAgeDaysRaw) && maxAgeDaysRaw > 0 ? Math.floor(maxAgeDaysRaw) : 0;
  const cutoff = maxAgeDays ? Date.now() - maxAgeDays * 24 * 60 * 60 * 1000 : null;
  const files = backupFiles(dir);
  const remove = new Map();

  files.slice(keep).forEach((item) => remove.set(item.path, { ...item, reason: "retention_count" }));
  if (cutoff) {
    files.forEach((item) => {
      if (item.stat.mtimeMs < cutoff) remove.set(item.path, { ...item, reason: "max_age" });
    });
  }

  const deleted = [];
  for (const item of remove.values()) {
    try {
      fs.unlinkSync(item.path);
      deleted.push({ name: item.name, reason: item.reason });
    } catch {}
  }

  return {
    directory: dir,
    retention: keep,
    maxAgeDays,
    before: files.length,
    deleted: deleted.length,
    remaining: Math.max(0, files.length - deleted.length),
  };
}

function inventory({ limit = 20 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const status = directoryStatus();
  const files = backupFiles(status.directory).slice(0, safeLimit).map((item) => ({
    name: item.name,
    sizeBytes: item.stat.size,
    modifiedAt: item.stat.mtime.toISOString(),
  }));
  return {
    ...status,
    count: backupFiles(status.directory).length,
    latest: files[0] || null,
    files,
  };
}

function applyRetention(dir) {
  return cleanupRetention(dir);
}

async function createBackup() {
  const status = directoryStatus();
  if (!status.writable) throw new Error(`Backup directory parent is not writable: ${status.directory}`);
  fs.mkdirSync(status.directory, { recursive: true });

  const payload = await snapshotDatabase();
  const serialized = serializePayload(payload);
  const checksum = JSON.parse(serialized).checksum;
  const name = backupFilename(checksum);
  const target = path.join(status.directory, name);
  const temporary = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, serialized, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, target);
  try { fs.chmodSync(target, 0o600); } catch {}
  applyRetention(status.directory);
  await maintenanceRunService.safeRecord({
    operation: "backup_create",
    status: "success",
    artifactName: name,
    checksum,
    metadata: { encrypted: Boolean(encryptionSecret()), tableCount: Object.keys(payload.tables).length },
  });

  return {
    file: target,
    name,
    checksum,
    encrypted: Boolean(encryptionSecret()),
    tableCount: Object.keys(payload.tables).length,
    createdAt: payload.createdAt,
  };
}

async function dependencyOrder(client, tables) {
  const set = new Set(tables);
  const result = await client.query(`
    SELECT child.relname AS child, parent.relname AS parent
    FROM pg_constraint c
    JOIN pg_class child ON child.oid = c.conrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_class parent ON parent.oid = c.confrelid
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
    WHERE c.contype = 'f'
      AND child_ns.nspname = 'public'
      AND parent_ns.nspname = 'public'
  `);
  const deps = new Map(tables.map((table) => [table, new Set()]));
  for (const row of result.rows) {
    if (set.has(row.child) && set.has(row.parent) && row.child !== row.parent) deps.get(row.child).add(row.parent);
  }

  const order = [];
  const remaining = new Set(tables);
  while (remaining.size) {
    const ready = [...remaining].filter((table) => [...deps.get(table)].every((dep) => !remaining.has(dep)));
    if (!ready.length) return [...tables].sort();
    ready.sort();
    for (const table of ready) {
      order.push(table);
      remaining.delete(table);
    }
  }
  return order;
}

async function restoreBackup(filePath, { apply = false } = {}) {
  const parsed = parseBackupFile(filePath);
  const summary = {
    file: parsed.absolute,
    checksum: parsed.checksum,
    encrypted: Boolean(parsed.envelope.encrypted),
    createdAt: parsed.payload.createdAt,
    tableCount: Object.keys(parsed.payload.tables).length,
    mode: apply ? "apply" : "dry-run",
  };
  if (!apply) return summary;

  if (String(process.env.ALLOW_DATABASE_RESTORE || "false").toLowerCase() !== "true") {
    throw new Error("Restore blocked. Set ALLOW_DATABASE_RESTORE=true and rerun with --apply only during a controlled maintenance window.");
  }

  const client = await pool.connect();
  try {
    const currentSignature = await schemaSignature(client);
    if (currentSignature !== parsed.payload.schemaSignature) {
      throw new Error("Schema signature mismatch. Apply the matching Travio migrations before restore.");
    }

    const tables = Object.keys(parsed.payload.tables);
    const existing = new Set(await listTables(client));
    const missing = tables.filter((table) => !existing.has(table));
    if (missing.length) throw new Error(`Restore schema is missing tables: ${missing.join(", ")}`);

    const order = await dependencyOrder(client, tables);
    await client.query("BEGIN");
    const quotedTables = tables.map((table) => `"${table.replace(/"/g, '""')}"`).join(", ");
    if (quotedTables) await client.query(`TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE`);

    for (const table of order) {
      const rows = parsed.payload.tables[table] || [];
      if (!rows.length) continue;
      const quoted = `"${table.replace(/"/g, '""')}"`;
      await client.query(
        `INSERT INTO ${quoted} SELECT * FROM json_populate_recordset(NULL::${quoted}, $1::json)`,
        [JSON.stringify(rows)]
      );
    }

    const sequences = await client.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema='public' AND column_default LIKE 'nextval(%'
    `);
    for (const row of sequences.rows) {
      if (!tables.includes(row.table_name)) continue;
      const table = `"${row.table_name.replace(/"/g, '""')}"`;
      const column = `"${row.column_name.replace(/"/g, '""')}"`;
      await client.query(`
        SELECT setval(
          pg_get_serial_sequence($1, $2),
          COALESCE((SELECT MAX(${column}) FROM ${table}), 1),
          EXISTS(SELECT 1 FROM ${table})
        )
      `, [row.table_name, row.column_name]);
    }

    await client.query("COMMIT");
    await maintenanceRunService.safeRecord({
      operation: "backup_restore",
      status: "success",
      artifactName: path.basename(parsed.absolute),
      checksum: parsed.checksum,
      metadata: { tableCount: summary.tableCount, encrypted: summary.encrypted },
    });
    return { ...summary, restored: true };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  FORMAT,
  VERSION,
  backupDir,
  directoryStatus,
  createBackup,
  parseBackupFile,
  restoreBackup,
  cleanupRetention,
  inventory,
};
