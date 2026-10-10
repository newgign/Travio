// Bounded parsers for pg_restore output. SQL is evidence text, never executable here.
const reject = code => { throw Object.assign(new Error(code), { code }); };
function assertHistory(names, known) {
  if (!Array.isArray(names) || !names.length || names.length > known.length
    || names.some((name, i) => name !== known[i])) reject('ARCHIVE_MIGRATION_HISTORY_INVALID');
  return names;
}
function readHistory(text, known, schema = 'public') {
  if (typeof text !== 'string' || text.length > 1024 * 1024) reject('ARCHIVE_MIGRATION_HISTORY_INVALID');
  const header = `COPY ${schema}._migrations (id, name, applied_at) FROM stdin;`;
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const start = lines.indexOf(header);
  if (start < 0 || lines.lastIndexOf(header) !== start) reject('ARCHIVE_MIGRATION_HISTORY_INVALID');
  const end = lines.indexOf('\\.', start + 1);
  if (end < 0) reject('ARCHIVE_MIGRATION_HISTORY_INVALID');
  const ids = new Set();
  const rows = lines.slice(start + 1, end).map(line => {
    const fields = line.split('\t');
    if (fields.length !== 3 || !/^[1-9]\d*$/.test(fields[0]) || !Number.isSafeInteger(Number(fields[0]))
      || ids.has(fields[0]) || !/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d{1,6})?$/.test(fields[2])
      || !Number.isFinite(Date.parse(fields[2]))) reject('ARCHIVE_MIGRATION_HISTORY_INVALID');
    ids.add(fields[0]); return { id: Number(fields[0]), name: fields[1] };
  }).sort((a,b) => a.id - b.id);
  return assertHistory(rows.map(row => row.name), known);
}
function checkSessionSchema(sql, names, schema = 'public') {
  const match = new RegExp(`CREATE TABLE ${schema}\\.users \\(\\n([\\s\\S]*?)\\n\\);`).exec(sql.replace(/\r\n/g, '\n'));
  if (!match) reject('ARCHIVE_OBJECTS_MISSING');
  const body = match[1];
  const version = /^\s+session_version\s+([^\n]+)$/m.exec(body);
  const active = /^\s+is_active\s+([^\n]+)$/m.exec(body);
  if (!names.includes('022_session_security_state.sql')) {
    if (version || active) reject('ARCHIVE_MIGRATION_SCHEMA_MISMATCH');
    return;
  }
  if (!version || !active || !/^integer DEFAULT 1 NOT NULL,?$/.test(version[1])
    || !/^boolean DEFAULT true NOT NULL,?$/.test(active[1])
    || !/CONSTRAINT users_session_version_check CHECK \(\(session_version >= 1\)\)/.test(body)) reject('ARCHIVE_SESSION_SCHEMA_INVALID');
}
module.exports = { assertHistory, readHistory, checkSessionSchema };
