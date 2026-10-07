const express = require('express');
const auth = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const requirePermission = require('../middleware/requirePermission');
const { createService } = require('../services/adminReconciliationReadService');
function createRouter({ repository } = {}) {
  const router = express.Router(), service = createService(repository);
  router.use(auth, requireRole('admin'), requirePermission('admin.operations.read'));
  router.use((req, res, next) => {
    if (req.method !== 'GET') return res.set('Allow', 'GET').status(405).json({ code: 'RECONCILIATION_METHOD_NOT_ALLOWED' });
    next();
  });
  const respond = action => async (req, res) => {
    try { res.json(await action(req)); }
    catch (error) {
      const allowed = ['INVALID_RECONCILIATION_FILTER', 'RECONCILIATION_CASE_NOT_FOUND', 'RECONCILIATION_SOURCE_UNAVAILABLE'];
      const code = allowed.includes(error?.code) ? error.code : 'RECONCILIATION_SOURCE_UNAVAILABLE';
      res.status(code === 'INVALID_RECONCILIATION_FILTER' ? 400 : code === 'RECONCILIATION_CASE_NOT_FOUND' ? 404 : 503).json({ code });
    }
  };
  router.get('/', respond(req => service.list(req.query)));
  router.get('/:caseId', respond(req => service.detail(req.params.caseId, req.query)));
  router.use((req, res) => res.status(404).json({ code: 'RECONCILIATION_CASE_NOT_FOUND' }));
  return router;
}
module.exports = { createRouter };
