class PriceEngine {

    calculate(hotel, filters = {}) {
        if (hotel.realPrice !== undefined) {
    return hotel.realPrice;
}

        const basePrice = Number(hotel.price || 0);

        const nights = Number(filters.nights || 7);

        const adults = Number(filters.people || 2);

        const children = Number(filters.children || 0);

        const month = filters.departureDate
            ? new Date(filters.departureDate).getMonth() + 1
            : null;

        let coefficient = 1;

        // Сезонность
        if ([6,7,8].includes(month))
            coefficient += 0.30;

        if ([12,1].includes(month))
            coefficient += 0.20;

        // Количество ночей
        coefficient *= nights / 7;

        // Взрослые
        coefficient *= adults / 2;

        // Дети
        coefficient += children * 0.10;

        return Math.round(basePrice * coefficient);

    }

}

module.exports = new PriceEngine();