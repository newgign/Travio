// Internal operational diagnostics only; never a business-record serializer.
const numeric = new Set(['incidentId','eventId','count','requests','serverErrors','serverErrorRatePct','ageHours','failed','stuck','recentErrors','tableCount','consecutiveFailures','slowThresholdMs','latencyMs','durationMs']);
const boolean = new Set(['encrypted','compatible','enabled','transportReady','evaluating','safeModeHealthy','productionReady']);
const labels = new Set(['release','reason','component','state','source','severity','resolution','incidentKey','backupRelease','contentAccess','bookingReadAccess','overallState','role','deliveryStatus','transition','key','status','previousStatus']);
const containers = new Set(['data','transitions','failedChecks']);
const values = new Set(['3A','2N','system','api','database','backup','email','hotelbeds','health','runtime','payments','booking','provider',
  'scheduler','interval','startup','cli','auto_recovered','condition_recovered','healthy','degraded','unhealthy',
  'critical','warning','open','acknowledged','resolved','user','admin','sent','failed','disabled','queued','skipped',
  'missing','forbidden','success','attention','blocked','READY','UNKNOWN_BLOCKED','AUTH_BLOCKED','NOT_READY','PASS','FAIL',
  'Новая','Подтверждена','Отменена','jwt','cors','security_headers','rate_limit','graceful_shutdown','structured_logging',
  'api_metrics','health_monitor','backup_scheduler','email_outbox','hotelbeds_transport','tolerance','mock','none','console','resend']);
function label(key,item) {
  if (typeof item !== 'string') return false;
  if (['incidentKey','key'].includes(key)) return /^reliability:(?:api|database|backup|email|hotelbeds)$/.test(item);
  return values.has(item);
}
function minimize(value, depth = 0, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || depth > 3 || seen.has(value)) return {};
  seen.add(value);
  const out = {};
  for (const [key,item] of Object.entries(value).slice(0,40)) {
    if (numeric.has(key) && typeof item === 'number' && Number.isFinite(item)) out[key] = item;
    else if (boolean.has(key) && typeof item === 'boolean') out[key] = item;
    else if (labels.has(key) && label(key,item)) out[key] = item;
    else if (containers.has(key) && item && typeof item === 'object') {
      out[key] = Array.isArray(item) ? item.slice(0,30).map(entry => typeof entry === 'string'
        ? (label(key,entry) ? entry : '[redacted]') : minimize(entry,depth+1,seen)) : minimize(item,depth+1,seen);
    }
  }
  return out;
}
module.exports = minimize;
