require("dotenv").config();

const db = require("../db");
const hotelbedsClient = require("../integrations/hotelbeds/client");

function toDateString(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const d = new Date(`${dateString}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function extractBookingArray(response) {
  if (Array.isArray(response?.bookings)) return response.bookings;
  if (Array.isArray(response?.bookings?.bookings)) return response.bookings.bookings;
  if (Array.isArray(response?.bookings?.booking)) return response.bookings.booking;
  if (response?.bookings?.booking && typeof response.bookings.booking === "object") {
    return [response.bookings.booking];
  }
  if (Array.isArray(response?.booking)) return response.booking;
  if (response?.booking && typeof response.booking === "object") return [response.booking];
  return [];
}

async function main() {
  const result = await db.query(`
    SELECT
      id,
      booking_date,
      provider_client_reference,
      provider_status,
      provider_booking_id,
      total_amount,
      currency,
      offer_snapshot->>'paymentType' AS payment_type,
      offer_snapshot->>'rateType' AS rate_type,
      offer_snapshot->>'boardCode' AS board_code,
      offer_snapshot->>'providerHotelId' AS provider_hotel_id,
      offer_snapshot->>'name' AS hotel_name
    FROM bookings
    WHERE provider = 'hotelbeds'
    ORDER BY id DESC
    LIMIT 1
  `);

  const booking = result.rows[0];

  if (!booking) {
    console.log("No Hotelbeds bookings found in local database.");
    return;
  }

  console.log("\nLOCAL BOOKING");
  console.table([{
    id: booking.id,
    clientReference: booking.provider_client_reference,
    providerStatus: booking.provider_status,
    providerBookingId: booking.provider_booking_id || "",
    total: booking.total_amount,
    currency: booking.currency,
    paymentType: booking.payment_type || "",
    rateType: booking.rate_type || "",
    boardCode: booking.board_code || "",
    hotelId: booking.provider_hotel_id || "",
    hotel: booking.hotel_name || "",
  }]);

  if (booking.provider_booking_id) {
    console.log("\nA Hotelbeds reference is already stored locally.");
    console.log("HB reference:", booking.provider_booking_id);
    return;
  }

  if (!booking.provider_client_reference) {
    console.log("\nNo clientReference is stored, so provider reconciliation cannot be performed.");
    return;
  }

  const created = toDateString(booking.booking_date) || toDateString(new Date());
  const start = addDays(created, -1);
  const end = addDays(created, 1);

  console.log("\nHOTELBEDS RECONCILIATION");
  console.log(`Searching Booking List by clientReference=${booking.provider_client_reference}`);
  console.log(`Creation date window: ${start} .. ${end}`);

  try {
    const response = await hotelbedsClient.request({
      channel: "booking",
      method: "GET",
      url: "/hotel-api/1.0/bookings",
      params: {
        start,
        end,
        filterType: "CREATION",
        status: "ALL",
        from: 1,
        to: 25,
        clientReference: booking.provider_client_reference,
        extend: true,
      },
    });

    const bookings = extractBookingArray(response);
    const matching = bookings.filter(
      (item) =>
        String(item?.clientReference || "") ===
        String(booking.provider_client_reference)
    );

    if (matching.length === 0) {
      console.log("\nRESULT: NO_MATCH");
      console.log("Hotelbeds Booking List returned no booking with this clientReference.");
      console.log("Do NOT resend yet; inspect the provider error / rate before a new attempt.");
      return;
    }

    console.log("\nRESULT: MATCH_FOUND");
    console.table(
      matching.map((item) => ({
        reference: item.reference || "",
        status: item.status || "",
        clientReference: item.clientReference || "",
        creationDate: item.creationDate || "",
        currency: item.currency || "",
        total: item.total ?? item.totalNet ?? "",
      }))
    );

    console.log("\nA booking exists in Hotelbeds. Do NOT press the booking button again.");
  } catch (error) {
    console.log("\nRESULT: RECONCILIATION_ERROR");
    console.log("status:", error.status || "");
    console.log("code:", error.code || "");
    console.log("message:", error.message || "");
    if (error.providerBody) {
      console.log("providerBody:", JSON.stringify(error.providerBody, null, 2));
    }
  }
}

main()
  .catch((error) => {
    console.error("\nDIAGNOSTIC_FAILED");
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await db.end();
    } catch {}
  });
