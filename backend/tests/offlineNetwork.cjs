// Preload only for offline regressions. Never used by application runtime.
require('https').request = () => { throw new Error('OFFLINE_TEST_REAL_HTTPS_FORBIDDEN'); };
require('https').get = () => { throw new Error('OFFLINE_TEST_REAL_HTTPS_FORBIDDEN'); };
