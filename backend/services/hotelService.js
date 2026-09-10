const hotelRepository = require("../repositories/hotelRepository");
const offerService = require("./offerService");

class HotelService {

    async getById(id, filters = {}) {

        const hotel = await hotelRepository.findById(id);

        if (!hotel) {
            return null;
        }

        return offerService.generateOffer(hotel, filters);

    }

    async getSimilar(id, filters = {}, limit = 6) {

        const hotels = await hotelRepository.findSimilar(id, limit);

        return hotels.map(hotel =>
            offerService.generateOffer(hotel, filters)
        );

    }

    async getFeatured(filters = {}, limit = 10) {

        const hotels = await hotelRepository.getFeatured(limit);

        return hotels.map(hotel =>
            offerService.generateOffer(hotel, filters)
        );

    }

    async getByCountry(country, filters = {}) {

        const hotels = await hotelRepository.findByCountry(country);

        return hotels.map(hotel =>
            offerService.generateOffer(hotel, filters)
        );

    }

    async getByCity(city, filters = {}) {

        const hotels = await hotelRepository.findByCity(city);

        return hotels.map(hotel =>
            offerService.generateOffer(hotel, filters)
        );

    }

}

module.exports = new HotelService();