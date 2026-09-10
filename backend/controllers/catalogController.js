const providerCatalogRepository = require("../repositories/providerCatalogRepository");
const ApiResponse = require("../utils/apiResponse");

class CatalogController {
  async status(req, res, next) {
    try {
      const provider = req.query.provider || "hotelbeds";
      const counts = await providerCatalogRepository.getCounts(provider);
      return res.json(ApiResponse.success(counts));
    } catch (error) {
      next(error);
    }
  }

  async destinations(req, res, next) {
    try {
      const data = await providerCatalogRepository.findDestinations({
        provider: req.query.provider || "hotelbeds",
        country: req.query.country,
        countryCode: req.query.countryCode,
      });

      return res.json(ApiResponse.success(data, { total: data.length }));
    } catch (error) {
      next(error);
    }
  }

  async hotels(req, res, next) {
    try {
      const data = await providerCatalogRepository.findHotels({
        provider: req.query.provider || "hotelbeds",
        country: req.query.country,
        countryCode: req.query.countryCode,
        city: req.query.city,
        destinationCode: req.query.destinationCode,
        limit: req.query.limit || 100,
      });

      return res.json(ApiResponse.success(data, { total: data.length }));
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CatalogController();
