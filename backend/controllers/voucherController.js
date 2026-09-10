const pool = require("../db");
const { buildVoucherModel } = require("../services/voucherService");
const { buildVoucherPdf } = require("../services/simplePdfService");
const bookingEventService = require("../services/bookingEventService");

async function loadVoucherBooking(bookingId, user) {
  const result = await pool.query(
    `
    SELECT
      b.*,
      COALESCE(
        NULLIF(b.offer_snapshot->>'name', ''),
        NULLIF(b.offer_snapshot->>'title', ''),
        t.hotel,
        t.title,
        'Travio booking #' || b.id
      ) AS hotel,
      COALESCE(NULLIF(b.offer_snapshot->>'country', ''), t.country, '') AS country,
      COALESCE(NULLIF(b.offer_snapshot->>'city', ''), t.city, '') AS city,
      COALESCE(NULLIF(b.offer_snapshot->>'image', ''), t.image, '') AS image,
      COALESCE(NULLIF(b.currency, ''), b.offer_snapshot->>'currency', 'KZT') AS currency
    FROM bookings b
    LEFT JOIN tours t ON b.tour_id = t.id
    WHERE b.id = $1
    LIMIT 1
    `,
    [bookingId]
  );

  const booking = result.rows[0] || null;
  if (!booking) {
    const error = new Error("Бронирование не найдено");
    error.status = 404;
    throw error;
  }

  if (user.role !== "admin" && Number(booking.user_id) !== Number(user.id)) {
    const error = new Error("Нет доступа к этому ваучеру");
    error.status = 403;
    throw error;
  }

  return booking;
}

async function markGenerated(booking) {
  const result = await pool.query(
    `UPDATE bookings SET voucher_generated_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING voucher_generated_at`,
    [booking.id]
  );

  await bookingEventService.safeRecordEvent({
    bookingId: booking.id,
    userId: booking.user_id,
    key: "voucher-generated",
    type: "voucher_generated",
    actorType: "customer",
    title: "Ваучер сформирован",
    description: "Travio сформировал актуальную версию ваучера бронирования.",
    status: booking.provider_status || booking.status,
    metadata: { voucherVersion: booking.voucher_version || 1 },
    occurredAt: result.rows[0]?.voucher_generated_at,
  });
}

async function getVoucher(req, res) {
  try {
    const booking = await loadVoucherBooking(req.params.id, req.user);
    const voucher = buildVoucherModel(booking);
    await markGenerated(booking);
    return res.json({ success: true, voucher });
  } catch (error) {
    console.error("GET VOUCHER ERROR:", error);
    return res.status(error.status || 500).json({
      message: error.status ? error.message : "Ошибка формирования ваучера",
    });
  }
}

async function downloadVoucherPdf(req, res) {
  try {
    const booking = await loadVoucherBooking(req.params.id, req.user);
    const voucher = buildVoucherModel(booking);
    const pdf = buildVoucherPdf(voucher);
    await markGenerated(booking);

    const filename = `travio-${voucher.voucherCode || booking.id}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(pdf.length));
    res.setHeader("Cache-Control", "private, no-store");
    return res.end(pdf);
  } catch (error) {
    console.error("DOWNLOAD VOUCHER PDF ERROR:", error);
    return res.status(error.status || 500).json({
      message: error.status ? error.message : "Ошибка создания PDF-ваучера",
    });
  }
}

module.exports = { getVoucher, downloadVoucherPdf };
