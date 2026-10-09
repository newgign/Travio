function healthHandler() {
  // Process liveness only. Dependency availability belongs to /api/health/ready.
  return (req, res) => res.json({ status: 'ok' });
}
module.exports = { healthHandler };
