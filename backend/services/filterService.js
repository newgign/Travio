class FilterService {

    apply(hotels, filters = {}) {

        let results = [...hotels];

        // =====================================
        // Страна
        // =====================================

        if (filters.country) {

            results = results.filter(
                hotel =>
                    hotel.country?.toLowerCase() ===
                    filters.country.toLowerCase()
            );

        }

        // =====================================
        // Город
        // =====================================

        if (filters.city) {

            results = results.filter(
                hotel =>
                    hotel.city?.toLowerCase() ===
                    filters.city.toLowerCase()
            );

        }

        // =====================================
        // Цена
        // =====================================

        if (filters.minPrice) {

            results = results.filter(
                hotel =>
                    Number(hotel.price) >= Number(filters.minPrice)
            );

        }

        if (filters.maxPrice) {

            results = results.filter(
                hotel =>
                    Number(hotel.price) <= Number(filters.maxPrice)
            );

        }

        // =====================================
        // Звезды
        // =====================================

        if (filters.stars) {

            results = results.filter(
                hotel =>
                    Number(hotel.stars) >= Number(filters.stars)
            );

        }

        // =====================================
        // Рейтинг
        // =====================================

        if (filters.rating) {

            results = results.filter(
                hotel =>
                    Number(hotel.rating) >= Number(filters.rating)
            );

        }

        // =====================================
        // Минимум отзывов
        // =====================================

        if (filters.minReviews) {

            results = results.filter(
                hotel =>
                    Number(hotel.reviewsCount || 0) >=
                    Number(filters.minReviews)
            );

        }

        // =====================================
        // Питание
        // =====================================

        if (filters.food) {

            results = results.filter(
                hotel =>
                    Array.isArray(hotel.foods) &&
                    hotel.foods.includes(filters.food)
            );

        }

        // =====================================
        // Тип пляжа
        // =====================================

        if (filters.beachType) {

            results = results.filter(
                hotel =>
                    hotel.beachType === filters.beachType
            );

        }

        // =====================================
        // Линия пляжа
        // =====================================

        if (filters.beachLine) {

            results = results.filter(
                hotel =>
                    Number(hotel.beachLine) ===
                    Number(filters.beachLine)
            );

        }

        // =====================================
        // Тип номера
        // =====================================

        if (filters.roomType) {

            results = results.filter(
                hotel =>
                    Array.isArray(hotel.roomTypes) &&
                    hotel.roomTypes.some(
                        room =>
                            room.toLowerCase() ===
                            filters.roomType.toLowerCase()
                    )
            );

        }

        // =====================================
        // Туроператор
        // =====================================

        if (filters.operator) {

            results = results.filter(
                hotel =>
                    Array.isArray(hotel.operators) &&
                    hotel.operators.includes(
                        Number(filters.operator)
                    )
            );

        }

        // =====================================
        // Авиакомпания
        // =====================================

        if (filters.airline) {

            results = results.filter(
                hotel =>
                    Array.isArray(hotel.airlines) &&
                    hotel.airlines.includes(
                        Number(filters.airline)
                    )
            );

        }

        // =====================================
        // Удобства
        // =====================================

        const amenities = [
            "wifi",
            "pool",
            "spa",
            "gym",
            "kidsClub",
            "aquapark",
            "privateBeach",
            "restaurant",
            "bar",
            "animation",
            "transfer",
            "parking"
        ];

        for (const amenity of amenities) {

            if (
                filters[amenity] === true ||
                filters[amenity] === "true"
            ) {

                results = results.filter(
                    hotel =>
                        Array.isArray(hotel.amenities) &&
                        hotel.amenities.includes(amenity)
                );

            }

        }

        return results;

    }

}

module.exports = new FilterService();