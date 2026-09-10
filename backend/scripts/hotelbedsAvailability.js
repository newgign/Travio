require("dotenv").config();

const hotelbeds = require("../sources/hotelbeds");

function futureDate(daysFromNow) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

async function main() {
  const hotelCodes = process.env.HOTELBEDS_TEST_HOTEL_CODES || "3424,168";
  const departureDate = process.env.HOTELBEDS_TEST_CHECKIN || futureDate(30);

  try {
    const hotels = await hotelbeds.searchHotels({
      departureDate,
      nights: Number(process.env.HOTELBEDS_TEST_NIGHTS || 1),
      people: Number(process.env.HOTELBEDS_TEST_ADULTS || 2),
      children: 0,
      hotelCodes,
    });

    console.log(`✓ Hotelbeds availability request выполнен: ${hotels.length} отелей`);

    for (const hotel of hotels.slice(0, 5)) {
      console.log(
        `${hotel.providerHotelId} | ${hotel.name} | ${hotel.price} ${hotel.currency} | ${hotel.boardCode || "-"} | ${hotel.rateType}`
      );
    }

    if (hotels.length === 0) {
      console.log(
        "Ответ корректный, но доступных тарифов для тестовых кодов/дат нет. Поменяйте HOTELBEDS_TEST_HOTEL_CODES или дату."
      );
    }
  } catch (error) {
    console.error("✗ Hotelbeds availability failed");
    console.error(error.message);
    process.exitCode = 1;
  }
}

main();
