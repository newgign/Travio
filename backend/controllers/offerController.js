const offerResolverService = require("../services/offerResolverService");
const offerTokenService = require("../services/offerTokenService");
const ApiResponse = require("../utils/apiResponse");

class OfferController {
  async getOffer(req, res, next) {
    try {
      const offer = await offerResolverService.resolve({
        providerName: req.params.provider,
        hotelId: req.params.hotelId,
        filters: req.query,
      });

      return res.json(
        ApiResponse.success({
          ...offer,
          offerToken: offerTokenService.sign(offer),
        }, {
          recheckedAt: new Date().toISOString(),
        })
      );
    } catch (error) {
      next(error);
    }
  }

  async recheck(req, res, next) {
    try {
      const {
        provider = "mock",
        hotelId,
        filters = {},
      } = req.body || {};

      const offer = await offerResolverService.resolve({
        providerName: provider,
        hotelId,
        filters,
      });

      return res.json(
        ApiResponse.success({
          ...offer,
          offerToken: offerTokenService.sign(offer),
        }, {
          recheckedAt: new Date().toISOString(),
        })
      );
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new OfferController();
