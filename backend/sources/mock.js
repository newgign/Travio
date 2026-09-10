const hotelRepository = require("../repositories/hotelRepository");

class MockProvider {

    async getHotelById(id) {

        const hotel = await hotelRepository.findById(id);

        return hotel
            ? this.normalizeHotel(hotel)
            : null;

    }

    async searchHotels(filters = {}) {

        const hotels = await hotelRepository.findAll();

        return hotels.map(hotel => this.normalizeHotel(hotel));

    }

    normalizeHotel(hotel) {

        const amenities = Array.isArray(hotel.amenities)
            ? hotel.amenities
            : [];

        return {

            // =========================
            // Provider
            // =========================

            provider: "mock",
            providerHotelId: hotel.id,

            // =========================
            // Основная информация
            // =========================

            id: hotel.id,
            name: hotel.name,
            title: hotel.name,
            brand: hotel.brand || null,

            // =========================
            // География
            // =========================

            country: hotel.country,
            city: hotel.city,
            airport: hotel.airport || null,

            latitude: Number(hotel.latitude) || null,
            longitude: Number(hotel.longitude) || null,

            // =========================
            // Категория
            // =========================

            stars: Number(hotel.stars || 0),
            rating: Number(hotel.rating || 0),
            reviewsCount: Number(hotel.reviews || 0),

            // =========================
            // Цена
            // =========================

            price: Number(hotel.basePrice || hotel.price || 0),
            basePrice: Number(hotel.basePrice || hotel.price || 0),
            currency: hotel.currency || "KZT",

            // =========================
            // Медиа
            // =========================

            image: hotel.images?.[0] || null,
            images: Array.isArray(hotel.images)
                ? hotel.images
                : [],

            // =========================
            // Пляж
            // =========================

            beachLine: Number(hotel.beachLine || 0),
            beachType: hotel.beachType || null,

            // =========================
            // Питание
            // =========================

            foods: Array.isArray(hotel.foods)
                ? hotel.foods
                : [],

            // =========================
            // Типы номеров
            // =========================

            roomTypes: Array.isArray(hotel.roomTypes)
                ? hotel.roomTypes
                : [],

            // =========================
            // Удобства
            // =========================

            amenities,

            wifi: amenities.includes("wifi"),
            pool: amenities.includes("pool"),
            spa: amenities.includes("spa"),
            gym: amenities.includes("gym"),
            kidsClub: amenities.includes("kidsClub"),
            aquapark: amenities.includes("aquapark"),
            transfer: amenities.includes("transfer"),
            parking: amenities.includes("parking"),
            privateBeach: amenities.includes("privateBeach"),
            animation: amenities.includes("animation"),
            restaurant: amenities.includes("restaurant"),
            bar: amenities.includes("bar"),

            // =========================
            // Туроператоры
            // =========================

            operators: Array.isArray(hotel.operators)
                ? hotel.operators
                : [],

            // =========================
            // Авиакомпании
            // =========================

            airlines: Array.isArray(hotel.airlines)
                ? hotel.airlines
                : [],

            // =========================
            // Дополнительная информация
            // =========================

            description: hotel.description || "",
            address: hotel.address || "",
            website: hotel.website || "",
            phone: hotel.phone || "",
            email: hotel.email || ""

        };

    }

}

module.exports = new MockProvider();