require("dotenv").config();

const hotelbedsClient = require("../integrations/hotelbeds/client");
const hotelbedsBookingService = require("../services/hotelbedsBookingService");

function futureDate(daysFromNow) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getRates(hotel) {
  const result = [];

  for (const room of hotel?.rooms || []) {
    for (const rate of room.rates || []) {
      result.push({ room, rate });
    }
  }

  return result;
}

async function main() {
  hotelbedsBookingService.assertBookingAllowed();

  const adults = Math.max(Number(process.env.HOTELBEDS_TEST_ADULTS) || 2, 1);
  const nights = Math.max(Number(process.env.HOTELBEDS_TEST_NIGHTS) || 1, 1);
  const checkIn = process.env.HOTELBEDS_TEST_CHECKIN || futureDate(30);
  const autoCancel = process.env.HOTELBEDS_TEST_AUTO_CANCEL !== "false";
  const hotelCodes = String(process.env.HOTELBEDS_TEST_HOTEL_CODES || "3424,168")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);

  const availability = await hotelbedsClient.availability({
    stay: {
      checkIn,
      checkOut: addDays(checkIn, nights),
    },
    occupancies: [
      {
        rooms: 1,
        adults,
        children: 0,
      },
    ],
    hotels: {
      hotel: hotelCodes,
    },
  });

  const hotels = availability?.hotels?.hotels || [];
  const hotel = hotels.find((item) => getRates(item).length > 0);

  if (!hotel) {
    throw new Error("Hotelbeds TEST не вернул доступного тарифа для smoke-test.");
  }

  let selected = getRates(hotel)[0];
  let rateKey = selected.rate.rateKey;
  let rateType = String(selected.rate.rateType || "BOOKABLE").toUpperCase();

  console.log(
    `✓ Availability: hotel=${hotel.code}, rateType=${rateType}, currency=${hotel.currency || "-"}`
  );

  if (rateType === "RECHECK") {
    const checked = await hotelbedsClient.checkRates(rateKey);
    const checkedHotel = checked?.hotel || checked?.hotels?.hotels?.[0];
    const checkedRates = getRates(checkedHotel);

    if (checkedRates.length === 0) {
      throw new Error("CheckRate не вернул доступного тарифа.");
    }

    selected =
      checkedRates.find((item) => String(item.rate.rateKey) === String(rateKey)) ||
      checkedRates[0];

    rateKey = selected.rate.rateKey;
    rateType = String(selected.rate.rateType || "").toUpperCase();

    console.log(`✓ CheckRate: rateType=${rateType}`);
  }

  if (rateType !== "BOOKABLE") {
    throw new Error(`После проверки тариф не BOOKABLE: ${rateType || "UNKNOWN"}`);
  }

  const clientReference = `TRAVIO-${String(Date.now()).slice(-12)}`.slice(0, 20);
  const paxes = Array.from({ length: adults }, (_, index) => ({
    roomId: 1,
    type: "AD",
    name: index === 0 ? "Booking" : `Adult${index + 1}`,
    surname: "Test",
  }));

  const response = await hotelbedsClient.createBooking({
    holder: {
      name: "Booking",
      surname: "Test",
    },
    rooms: [
      {
        rateKey,
        paxes,
      },
    ],
    clientReference,
    remark: "Travio Sprint 2E automated TEST booking smoke-test",
    tolerance: 2,
  });

  const confirmation = hotelbedsBookingService.parseBookingResponse(response);

  console.log(`✓ Booking confirmed: ${confirmation.reference} (${confirmation.status})`);

  const detail = await hotelbedsBookingService.sync(confirmation.reference);
  console.log(`✓ Booking detail: ${detail.reference} (${detail.status})`);

  const simulation = await hotelbedsBookingService.simulateCancellation(
    confirmation.reference
  );
  console.log(
    `✓ Cancellation simulation: fee=${simulation.cancellationFee ?? "not-separated"} ${simulation.currency || ""}`
  );

  if (autoCancel) {
    const cancelled = await hotelbedsBookingService.cancel(confirmation.reference);
    console.log(`✓ TEST booking cancelled: ${cancelled.status}`);
  } else {
    console.log("! HOTELBEDS_TEST_AUTO_CANCEL=false — TEST booking left confirmed.");
  }

  console.log("✓ TEST environment: no real hotel reservation or card charge is created.");
}

main().catch((error) => {
  console.error("✗ Hotelbeds booking smoke-test failed");
  console.error(error.message);
  process.exit(1);
});
