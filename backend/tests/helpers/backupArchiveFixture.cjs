// Synthetic pg_restore text only, not a real archive or restore proof.
const db = require('../../scripts/lib/dbContinuity.cjs');
function fixture(count = 22) {
  const names = db.migrationInventory().migrations.slice(0, count);
  const inventory = db.migrationInventory(names), entries = [];
  for (const table of inventory.tables) for (const kind of ['TABLE','TABLE DATA']) entries.push(`${kind} public ${table} owner`);
  for (const { table, column } of inventory.serials) for (const kind of ['SEQUENCE','SEQUENCE SET']) entries.push(`${kind} public ${table}_${column}_seq owner`);
  for (const { table } of inventory.primary) entries.push(`CONSTRAINT public ${table} ${table}_pkey owner`);
  for (const { table,column,constraintName } of inventory.foreignKeys) entries.push(`FK CONSTRAINT public ${table} ${constraintName || `${table}_${column}_fkey`} owner`);
  for (const { table,columns } of inventory.unique) entries.push(`CONSTRAINT public ${table} ${table}_${columns.join('_')}_key owner`);
  for (const { name } of inventory.indexes) entries.push(`INDEX public ${name} owner`);
  const listing = entries.map((entry,i) => `${i+1}; 1259 100 ${entry}`).join('\n');
  const ledger = 'COPY public._migrations (id, name, applied_at) FROM stdin;\n' + names.map((name,i) => `${i+1}\t${name}\t2026-10-10 00:00:00`).join('\n') + '\n\\.\n';
  const schema = 'CREATE TABLE public.users (\n    id integer NOT NULL' + (count === 22
    ? ',\n    session_version integer DEFAULT 1 NOT NULL,\n    is_active boolean DEFAULT true NOT NULL,\n    CONSTRAINT users_session_version_check CHECK ((session_version >= 1))' : '') + '\n);\n';
  return { names, inventory, listing, ledger, schema };
}
function runFor(value = fixture()) {
  return (_binary, args) => ({ status: 0, stdout: args.includes('--list') ? value.listing
    : args.includes('--data-only') ? value.ledger : args.includes('--schema-only') ? value.schema : '' });
}
module.exports = { fixture, runFor };
