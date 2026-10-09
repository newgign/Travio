// No network adapters or runtime wiring in this sprint. A future adapter must be separately approved.
const { toLogProjection } = require('./operationalSignals');
function createDisabledTransport() {
  return Object.freeze({ async publish(signal) {
    toLogProjection(signal);
    return Object.freeze({ deliveryState: 'DISABLED', providerCalled: false });
  } });
}
// Secondary delivery result only: never accepts or rewrites a business outcome.
async function publishSafely(signal, transport = disabledTransport) {
  try {
    const projection = toLogProjection(signal);
    const result = await transport.publish(projection);
    if (result?.deliveryState === 'DISABLED' && result.providerCalled === false) return { deliveryState: 'DISABLED', providerCalled: false };
    return { deliveryState: 'FAILED', providerCalled: null, code: 'ALERT_TRANSPORT_RESULT_INVALID' };
  } catch { return { deliveryState: 'FAILED', providerCalled: null, code: 'ALERT_DELIVERY_FAILED' }; }
}
const disabledTransport = createDisabledTransport();
module.exports = { disabledTransport, createDisabledTransport, publishSafely };
