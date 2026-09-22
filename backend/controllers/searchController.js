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

            require("../utils/logger").error("searchController failed", { error: err });

            return res.status(err.status || 500).json(
                ApiResponse.error(
                    require("../utils/apiResponse").publicMessage(err, "Ошибка поиска"),
                    [],
                    require("../utils/apiResponse").publicCode(err)
                )
            );

        }

    }

}

module.exports = new SearchController();