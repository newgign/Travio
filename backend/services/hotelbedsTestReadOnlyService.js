// TEST cannot select LIVE. Selection parameters are translated for the shared bounded runner.
const shared = require('./hotelbedsLiveReadOnlyService');
function parameters(env) {
  const result = { ...env };
  for (const field of ['HOTEL_CODES', 'CHECKIN', 'CHECKOUT', 'ADULTS', 'ROOM_CODE', 'BOARD_CODE']) {
    result[`HOTELBEDS_LIVE_PROBE_${field}`] = env[`HOTELBEDS_TEST_PROBE_${field}`] || '';
  }
  return result;
}
module.exports = {
  preflight: (env = process.env, validateTls) => shared.preflight(env, validateTls, 'test'),
  run: (options = {}) => shared.run({ ...options, env: parameters(options.env || process.env), expectedEnvironment: 'test' }),
  runAdminProbe: (options = {}) => shared.runAdminProbe({ ...options, env: parameters(options.env || process.env), expectedEnvironment: 'test' }),
  probeState: shared.probeState,
};
