const express = require("express");
const catalogController = require("../controllers/catalogController");

const router = express.Router();

router.get('/test-options', async (req, res, next) => {
  try {
    const config = require('../config/providers').hotelbeds;
    if (config.environment !== 'test' || !config.stagingTestAllowed) return res.status(409).json({ code: 'TEST_CATALOG_DISABLED' });
    const rows = await require('../repositories/providerCatalogRepository').findDestinations({ provider: 'hotelbeds' });
    let scopes=[];
    try { scopes=require('../services/hotelbedsTestContent').scopes(); } catch { /* Invalid config supplies no public scopes. */ }
    res.json({ environment: 'test', countriesCount: new Set(rows.map(row=>row.country_code).filter(Boolean)).size, destinationsCount: rows.length,
      hotelsCount: rows.reduce((sum,row)=>sum+(Number(row.hotel_count)||0),0),
      destinations: require('../services/testCatalogReadiness')(rows,scopes) });
  } catch (error) { next(error); }
});

router.get("/status", catalogController.status.bind(catalogController));
router.get("/destinations", catalogController.destinations.bind(catalogController));
router.get("/hotels", catalogController.hotels.bind(catalogController));

module.exports = router;
