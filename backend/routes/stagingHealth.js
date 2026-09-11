function healthHandler(pool) {
  return async (req, res) => {
    try {
      await pool.query({ text: 'SELECT 1', query_timeout: 3000 });
      return res.json({ status: 'ok', database: { ok: true } });
    } catch {
      return res.status(503).json({ status: 'unavailable', database: { ok: false } });
    }
  };
}
module.exports = { healthHandler };
