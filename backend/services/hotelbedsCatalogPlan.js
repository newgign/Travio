const content = require('./hotelbedsTestContent');
async function inspect({env=process.env,db=require('../db'),access=require('./hotelbedsTestAccess')}={}) {
  const configured = content.scopes(env);
  const config = require('../config/hotelbeds').buildConfig(env);
  if (config.environment !== 'test') throw Object.assign(new Error('TEST planner only'),{code:'CATALOG_PLAN_UNAVAILABLE'});
  const observed = await access.inspect();
  const circuit = observed.circuits.content;
  const job = (await db.query("SELECT last_run FROM provider_job_state WHERE job='test_content_import' AND environment='test'")).rows[0];
  const cooldown = content.cooldownStatus(job?.last_run);
  const configuredReady = !require('./hotelbedsLiveReadOnlyService').preflight(env,undefined,'test',false).blockers.length;
  const scopes = [];
  for (const scope of configured) {
    const count = await content.localHotelCount(db,scope.destinationCode);
    const batch = content.batchPlan(count);
    const destination = (await db.query("SELECT name FROM provider_destinations WHERE provider='hotelbeds' AND content_environment='test' AND code=$1 AND country_code=$2",[scope.destinationCode,scope.countryCode])).rows[0];
    const unavailableReason = batch.complete ? 'COMPLETE' : !configuredReady ? 'CONTENT_CONFIGURATION_BLOCKED'
      : circuit.state !== 'READY' ? circuit.state : circuit.inFlight ? 'CONTENT_BUSY' : cooldown.state === 'WAIT' ? 'COOLDOWN_WAIT' : null;
    scopes.push({scopeId:scope.id,countryCode:scope.countryCode,destinationCode:scope.destinationCode,
      label:destination?.name || scope.destinationCode,hotelCount:count,cap:batch.maximum,
      remaining:Math.max(0,batch.maximum-count),state:batch.complete?'COMPLETE':count?'READY':'EMPTY',
      nextFrom:batch.next?.from ?? null,nextTo:batch.next?.to ?? null,nextCount:batch.next?.count || 0,
      complete:batch.complete,overCap:count>batch.maximum,manualImportAvailable:!unavailableReason,unavailableReason});
  }
  scopes.sort((a,b)=>a.hotelCount-b.hotelCount || (a.scopeId<b.scopeId?-1:a.scopeId>b.scopeId?1:0));
  return {environment:'test',scopes,contentAccessState:circuit.state,contentInFlight:circuit.inFlight,
    cooldown,maxRequestsPerImport:content.limits.requests,
    observed:{today:observed.today,last24h:observed.last24h,breakdown:observed.breakdown},
    totals:{hotels:scopes.reduce((n,s)=>n+s.hotelCount,0),remaining:scopes.reduce((n,s)=>n+s.remaining,0),scopes:scopes.length},
    priorityReason:'меньше локально загруженных отелей'};
}
module.exports = {inspect};
