const hotelCatalogService = require("../services/hotelCatalogService");

exports.getHotels = async (req, res) => {

    try {

        const hotels = await hotelCatalogService.getAll(100, 0);

        res.json(hotels);

    } catch (error) {

        require("../utils/logger").error("hotelController failed", { error: error });

        res.status(500).json({
            message: "Server Error"
        });

    }

};