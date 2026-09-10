const searchService = require("../services/searchService");
const ApiResponse = require("../utils/apiResponse");

class SearchController {

    async search(req, res) {

        try {

            const result = await searchService.search(req.query);

            return res.json(
                ApiResponse.success(
                    result.data,
                    result.meta
                )
            );

        } catch (err) {

            console.error(err);

            return res.status(err.status || 500).json(
                ApiResponse.error(
                    err.message || "Ошибка поиска",
                    [],
                    err.code || null
                )
            );

        }

    }

}

module.exports = new SearchController();