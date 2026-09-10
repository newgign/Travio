const hotels = require("../data/hotels");

class HotelRepository {

    async findAll() {

        return [...hotels];

    }

    async findById(id) {

        return hotels.find(
            hotel => Number(hotel.id) === Number(id)
        ) || null;

    }

    async findByCountry(country) {

        return hotels.filter(
            hotel =>
                hotel.country?.toLowerCase() ===
                country.toLowerCase()
        );

    }

    async findByCity(city) {

        return hotels.filter(
            hotel =>
                hotel.city?.toLowerCase() ===
                city.toLowerCase()
        );

    }

    async findByBrand(brand) {

        return hotels.filter(
            hotel =>
                hotel.brand?.toLowerCase() ===
                brand.toLowerCase()
        );

    }

    async findSimilar(id, limit = 6) {

        const hotel = await this.findById(id);

        if (!hotel) {
            return [];
        }

        return hotels

            .filter(h =>

                h.id !== hotel.id &&

                h.country === hotel.country &&

                Math.abs(h.stars - hotel.stars) <= 1

            )

            .slice(0, limit);

    }

    async getFeatured(limit = 10) {

        return [...hotels]

            .sort((a, b) => {

                if (b.rating !== a.rating) {
                    return b.rating - a.rating;
                }

                return (b.reviews || 0) - (a.reviews || 0);

            })

            .slice(0, limit);

    }

    async count() {

        return hotels.length;

    }

}

module.exports = new HotelRepository();