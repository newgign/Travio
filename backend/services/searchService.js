const providerManager = require("../providers/providerManager");
const filterService = require("./filterService");
const offerService = require("./offerService");
const offerTokenService = require("./offerTokenService");
const cache = require("./memoryCache");
const logger = require("../utils/logger");
const priceHistory = require("./priceHistoryService");

class SearchService {

    async search(filters = {}) {

        const started = Date.now();
        if (filters.publicOnly === "true" &&
            ((filters.provider || require("../config/providers").activeProvider) !== "hotelbeds" || (priceHistory.priceEnvironment() !== "live" && !require("../config/providers").hotelbeds.stagingTestAllowed))) {
            const error = new Error("Поиск предложений временно недоступен.");
            error.status = 503;
            throw error;
        }

        // =====================================
        // Cache
        // =====================================

        const provider = providerManager.getProvider(filters.provider || undefined);
        const cacheKey = JSON.stringify({ environment: priceHistory.priceEnvironment(), provider: provider.name, filters });

        if (cache.has(cacheKey) && (provider.name !== "hotelbeds" || !require("../integrations/hotelbeds/client").readiness().lastErrorCategory)) {

            logger.info(`CACHE HIT | ${cacheKey}`);

            return cache.get(cacheKey);

        }

        try {

            // =====================================
            // Provider
            // =====================================



            // =====================================
            // Получаем каталог
            // =====================================

            const hotels = await provider.searchHotels(filters);

            // =====================================
            // Фильтрация
            // =====================================

            const filteredHotels = filterService.apply(
                hotels,
                filters
            );

            // =====================================
            // Формирование предложений
            // =====================================

            const offers = filteredHotels.map(hotel => {
                const offer = offerService.generateOffer(
                    hotel,
                    filters
                );

                return {
                    ...offer,
                    offerToken: offerTokenService.sign(offer),
                };
            });

            // Store only actual provider observations, never cache hits or mock quotes.
            try {
                await priceHistory.record(offers);
                for (const offer of offers.slice(0, 3)) await require("./hotelbedsMonitorService").track(offer);
            } catch {
                logger.warn("Price history unavailable; search continues without recording discounts");
            }

            // =====================================
            // Сортировка
            // =====================================

            this.sortResults(
                offers,
                filters.sort
            );

            // =====================================
            // Пагинация
            // =====================================

            const page = Math.max(
                parseInt(filters.page) || 1,
                1
            );

            const limit = Math.min(
                Math.max(parseInt(filters.limit) || 20, 1),
                100
            );

            const total = offers.length;

            const pages = Math.max(
                Math.ceil(total / limit),
                1
            );

            const start = (page - 1) * limit;

            const data = offers.slice(
                start,
                start + limit
            );

            const executionTime =
                Date.now() - started;

            const response = {

                data,

                meta: {

                    page,

                    limit,

                    total,

                    pages,

                    provider: provider.name || filters.provider || provider.constructor.name,

                    executionTime

                }

            };

            // =====================================
            // Cache
            // =====================================

            cache.set(cacheKey, response);

            logger.info(
                `SEARCH | ${provider.constructor.name} | ${total} offers | ${executionTime} ms`
            );

            return response;

        } catch (error) {

            logger.error(error.stack || error.message);

            throw error;

        }

    }

    sortResults(results, sort = "default") {

        switch (sort) {

            case "priceAsc":

                results.sort(
                    (a, b) => a.price - b.price
                );

                break;

            case "priceDesc":

                results.sort(
                    (a, b) => b.price - a.price
                );

                break;

            case "rating":

                results.sort(
                    (a, b) => b.rating - a.rating
                );

                break;

            case "stars":

                results.sort(
                    (a, b) => b.stars - a.stars
                );

                break;

            case "reviews":

                results.sort(
                    (a, b) =>
                        (b.reviewsCount || 0) -
                        (a.reviewsCount || 0)
                );

                break;

            default:

                results.sort((a, b) => {

                    if (b.rating !== a.rating) {
                        return b.rating - a.rating;
                    }

                    return a.price - b.price;

                });

        }

    }

}

module.exports = new SearchService();
