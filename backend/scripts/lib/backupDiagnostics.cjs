// Never classify a failure by copying Error.message, command arguments or subprocess output.
const stages = new Set(['create','verify','restore','cleanup','scheduled']);
function failure(stage) {
  const safeStage = stages.has(stage) ? stage : 'backup';
  return { stage: safeStage, code: `BACKUP_${safeStage.toUpperCase()}_FAILED` };
}
function summary(value = {}) {
  const out = {};
  for (const key of ['encrypted','restored','success']) if (typeof value[key] === 'boolean') out[key] = value[key];
  for (const key of ['tableCount','tables','before','deleted','remaining','retention','maxAgeDays'])
    if (Number.isSafeInteger(value[key]) && value[key] >= 0) out[key] = value[key];
  if (['apply','dry-run'].includes(value.mode)) out.mode = value.mode;
  // Only generated archive names, never arbitrary user-supplied basenames or absolute paths.
  const filename = String(value.file || value.name || '').split(/[\\/]/).pop();
  if (/^travio-\d{8}T\d{6}Z-[a-f0-9]{8}\.backup\.json$/.test(filename)) out.file = filename;
  if (/^[a-f0-9]{64}$/.test(value.checksum || '')) out.checksum = value.checksum.slice(0,16);
  if (typeof value.createdAt === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value.createdAt) && Number.isFinite(Date.parse(value.createdAt))) out.createdAt = value.createdAt;
  if (['2N','3A'].includes(value.release)) out.release = value.release;
  return out;
}
module.exports = { failure, summary };
