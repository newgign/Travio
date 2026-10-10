const minimize = require('./operationalMetadata');
const pick = (row,keys) => Object.fromEntries(keys.filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]]));
function action(row) {
  return { ...pick(row,['id','admin_user_id','booking_id','action_type','target_type','target_id','status','created_at','admin_name','admin_email']),metadata:minimize(row.metadata) };
}
const eventCodes = new Set(['SLOW_REQUEST','DATABASE_DOWN','DATABASE_RECOVERED','AUTO_BACKUP_OK','AUTO_BACKUP_FAILED',
  'INCIDENT_OPENED','INCIDENT_RESOLVED','INCIDENT_ACKNOWLEDGED','SELF_TEST_OK','SELF_TEST_ATTENTION']);
function eventMessage(code) {
  return typeof code === 'string' && (eventCodes.has(code) || /^HTTP_[1-5]\d{2}$/.test(code)) ? `System event: ${code}` : 'System event';
}
function event(row) {
  return {...pick(row,['id','level','category','code','request_id','user_id','route','method','status_code','duration_ms','created_at','user_name','user_email']),
    message:eventMessage(row.code),metadata:minimize(row.metadata)};
}
function incident(row) {
  const out = pick(row,['id','incident_key','source','severity','status','occurrence_count','first_detected_at','last_detected_at','acknowledged_at','acknowledged_by','acknowledged_by_name','resolved_at','created_at','updated_at']);
  const clean = require('./logger').sanitizeText;
  return {...out,title:clean(row.title).slice(0,255),summary:clean(row.summary),
    resolution:clean(row.resolution).slice(0,120),metadata:minimize(row.metadata)};
}
module.exports = { action, event, eventMessage, incident };
