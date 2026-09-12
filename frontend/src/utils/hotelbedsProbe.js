export function canProbeTest(status) {
  return status?.environment === 'test' && status.stagingTestAllowed === true &&
    status.connection?.credentialsConfigured === true && status.connection?.mtlsReady === true &&
    status.bookingDisabled === true && status.paymentsDisabled === true && status.salesReady === false;
}

export function probeOptions(availability) {
  return { method: 'POST', body: JSON.stringify({ availability: availability === true, checkRate: false }) };
}
