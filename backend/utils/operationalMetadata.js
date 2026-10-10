// Internal operational diagnostics only; never a business-record serializer.
const numeric = new Set(['incidentId','eventId','count','requests','serverErrors','serverErrorRatePct','ageHours','failed','stuck','recentErrors','tableCount','consecutiveFailures','slowThresholdMs','latencyMs','durationMs']);
const boolean = new Set(['encrypted','compatible','enabled','transportReady','evaluating','safeModeHealthy','productionReady']);
const labels = new Set(['release','reason','component','state','source','severity','resolution','incidentKey','backupRelease','contentAccess','bookingReadAccess','overallState','role','deliveryStatus','transition','key','status','previousStatus']);
const containers = new Set(['data','transitions','failedChecks']);
function minimize(value, depth = 0, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || depth > 3 || seen.has(value)) return {};
  seen.add(value);
  const out = {};
  for (const [key,item] of Object.entries(value).slice(0,40)) {
    if (numeric.has(key) && typeof item === 'number' && Number.isFinite(item)) out[key] = item;
    else if (boolean.has(key) && typeof item === 'boolean') out[key] = item;
    else if (labels.has(key) && typeof item === 'string' && (/^[A-Za-z0-9_.:-]{1,80}$/.test(item)
      || ['status','previousStatus'].includes(key) && ['Новая','Подтверждена','Отменена'].includes(item))) out[key] = item;
    else if (containers.has(key) && item && typeof item === 'object') {
      out[key] = Array.isArray(item) ? item.slice(0,30).map(entry => typeof entry === 'string'
        ? (/^[A-Za-z0-9_.:-]{1,80}$/.test(entry) ? entry : '[redacted]') : minimize(entry,depth+1,seen)) : minimize(item,depth+1,seen);
    }
  }
  return out;
}
module.exports = minimize;
