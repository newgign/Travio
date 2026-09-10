require("dotenv").config();

const pool = require("../db");
const hotelbedsBookingService = require("../services/hotelbedsBookingService");

async function reconcileBooking(booking) {
  const result = await hotelbedsBookingService.reconcile(booking);

  if (!result.found) {
    await pool.query(
      `
      UPDATE bookings
      SET provider_status = 'RATE_EXPIRED',
          provider_reconciled_at = NOW(),
          provider_last_error = $1::jsonb,
          updated_at = NOW()
      WHERE id = $2 AND provider_booking_id IS NULL
      `,
      [
        JSON.stringify({
          at: new Date().toISOString(),
          code: "HOTELBEDS_RATE_EXPIRED",
          message: "No Hotelbeds booking found for provider_client_reference during reconciliation.",
        }),
        booking.id,
      ]
    );

    return { id: booking.id, result: "NO_MATCH → RATE_EXPIRED" };
  }

  const total = result.total || Number(booking.total_amount) || Number(booking.quoted_amount) || 0;
  const currency = result.currency || booking.currency || booking.quoted_currency || "EUR";
  const localStatus = ["CONFIRMED", "MODIFIED"].includes(result.status)
    ? "Подтверждена"
    : ["CANCELLED", "CANCELED"].includes(result.status)
      ? "Отменена"
      : booking.status || "Новая";

  await pool.query(
    `
    UPDATE bookings
    SET provider_booking_id = $1,
        provider_status = $2::varchar(50),
        provider_response = $3::jsonb,
        total_amount = $4,
        currency = $5,
        status = $6,
        provider_synced_at = NOW(),
        provider_reconciled_at = NOW(),
        provider_last_error = NULL,
        confirmed_at = CASE
          WHEN $2::varchar(50) IN ('CONFIRMED', 'MODIFIED') AND confirmed_at IS NULL THEN NOW()
          ELSE confirmed_at
        END,
        updated_at = NOW()
    WHERE id = $7
    `,
    [
      result.reference,
      result.status,
      JSON.stringify(result.raw || {}),
      total,
      currency,
      localStatus,
      booking.id,
    ]
  );

  return { id: booking.id, result: `${result.status} / ${result.reference}` };
}

async function main() {
  hotelbedsBookingService.assertBookingAllowed();

  const rows = await pool.query(
    `
    SELECT *
    FROM bookings
    WHERE provider = 'hotelbeds'
      AND provider_booking_id IS NULL
      AND provider_client_reference IS NOT NULL
      AND provider_status IN ('confirmation_unknown', 'confirmation_failed')
    ORDER BY id ASC
    `
  );

  if (rows.rows.length === 0) {
    console.log("✓ No uncertain Hotelbeds bookings to reconcile");
    return;
  }

  console.log(`Reconciling ${rows.rows.length} Hotelbeds booking(s)...`);

  for (const booking of rows.rows) {
    try {
      const outcome = await reconcileBooking(booking);
      console.log(`✓ booking ${outcome.id}: ${outcome.result}`);
    } catch (error) {
      console.error(`✗ booking ${booking.id}: ${error.message}`);
    }
  }
}

main()
  .catch((error) => {
    console.error("RECONCILIATION ERROR:", error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch {}
  });
