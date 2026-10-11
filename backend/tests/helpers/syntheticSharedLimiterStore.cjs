// Test fixture only: logically independent adapters over one serialized local owner.
// No production import, provider registration or multi-process durability claim.
const { createMemoryStore } = require('../../services/limiterStore');
function createSyntheticSharedStore(options) {
  const owner = createMemoryStore(options);
  let queue = Promise.resolve();
  return Object.freeze({
    adapter: () => Object.freeze({ consume(key, input) {
      const result = queue.then(() => owner.consume(key, input));
      queue = result.then(() => undefined, () => undefined);
      return result;
    } }),
    describe: () => ({ ...owner.describe(), scope: 'synthetic-local-test' }),
  });
}
module.exports = { createSyntheticSharedStore };
