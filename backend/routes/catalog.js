const express = require("express");
const catalogController = require("../controllers/catalogController");

const router = express.Router();

router.get('/test-options', async (req, res, next) => {
  try {
    const config = require('../config/providers').hotelbeds;
    if (config.environment !== 'test' || !config.stagingTestAllowed) return res.status(409).json({ code: 'TEST_CATALOG_DISABLED' });
    const rows = await require('../repositories/providerCatalogRepository').findDestinations({ provider: 'hotelbeds' });
    res.json({ environment: 'test', destinations: rows.map(row => ({ code: row.code, name: row.name, countryCode: row.country_code, countryName: row.country_name })) });
  } catch (error) { next(error); }
});

router.get("/status", catalogController.status.bind(catalogController));
router.get("/destinations", catalogController.destinations.bind(catalogController));
router.get("/hotels", catalogController.hotels.bind(catalogController));

module.exports = router;
