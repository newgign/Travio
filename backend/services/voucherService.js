function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

function isoDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  if (!dateString || !Number.isFinite(Number(days))) return null;
  const date = new Date(`${dateString}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

function statusLabel(booking) {
  const providerStatus = String(booking.provider_status || "").toUpperCase();

  if (["CANCELLED", "CANCELED"].includes(providerStatus) || booking.status === "Отменена") {
    return "CANCELLED";
  }

  if (["CONFIRMED", "MODIFIED"].includes(providerStatus) || booking.status === "Подтверждена") {
    return "CONFIRMED";
  }

  if (["RATE_EXPIRED", "CONFIRMATION_FAILED"].includes(providerStatus)) {
    return "NOT_CONFIRMED";
  }

  if (providerStatus === "CONFIRMATION_UNKNOWN") {
    return "RECONCILIATION_REQUIRED";
  }

  return providerStatus || String(booking.status || "PENDING").toUpperCase();
}

function buildVoucherModel(booking, { generatedAt = new Date() } = {}) {
  const offer = safeObject(booking.offer_snapshot);
  const filters = safeObject(booking.search_filters);
  const travelers = safeArray(booking.travelers);

  const checkIn = firstNonEmpty(
    offer.checkIn,
    offer.check_in,
    offer.stay?.checkIn,
    filters.departureDate,
    filters.checkIn,
    filters.check_in
  ) || null;

  const nights = Number(
    firstNonEmpty(offer.nights, filters.nights, 0)
  ) || 0;

  const checkOut = firstNonEmpty(
    offer.checkOut,
    offer.check_out,
    offer.stay?.checkOut
  ) || addDays(checkIn, nights);

  const amount = Number(
    firstNonEmpty(booking.total_amount, booking.price, offer.price, 0)
  ) || 0;

  const quotedAmount = Number(
    firstNonEmpty(booking.quoted_amount, offer.price, amount)
  ) || amount;

  const provider = String(booking.provider || "legacy").toLowerCase();
  const isHotelbedsTest = provider === "hotelbeds";

  return {
    voucherCode: `TV-${String(booking.id).padStart(6, "0")}`,
    bookingId: Number(booking.id),
    travioReference: booking.provider_client_reference || `TRAVIO-${booking.id}`,
    provider,
    providerReference: booking.provider_booking_id || null,
    providerStatus: booking.provider_status || null,
    status: statusLabel(booking),
    isTest: isHotelbedsTest,
    testNotice: isHotelbedsTest
      ? "HOTELBEDS TEST - NOT VALID FOR TRAVEL OR HOTEL CHECK-IN"
      : null,
    hotel: firstNonEmpty(
      booking.hotel,
      offer.name,
      offer.title,
      "Travio booking"
    ),
    country: firstNonEmpty(booking.country, offer.country),
    city: firstNonEmpty(booking.city, offer.city),
    image: firstNonEmpty(booking.image, offer.image, safeArray(offer.images)[0]),
    boardCode: firstNonEmpty(
      offer.boardCode,
      offer.board_code,
      offer.board,
      ""
    ),
    roomName: firstNonEmpty(
      offer.roomName,
      offer.room_name,
      offer.roomCode,
      offer.room_code,
      offer.roomType,
      offer.room_type,
      ""
    ),
    rateType: firstNonEmpty(offer.rateType, offer.rate_type, ""),
    paymentType: firstNonEmpty(offer.paymentType, offer.payment_type, ""),
    checkIn: isoDate(checkIn) || checkIn,
    checkOut: isoDate(checkOut) || checkOut,
    nights,
    people: Number(booking.people) || travelers.length || 1,
    travelers,
    holder: {
      firstName: booking.first_name || travelers[0]?.firstName || "",
      lastName: booking.last_name || travelers[0]?.lastName || "",
      email: booking.email || "",
      phone: booking.phone || "",
    },
    amount,
    currency: booking.currency || offer.currency || "KZT",
    quotedAmount,
    quotedCurrency: booking.quoted_currency || booking.currency || offer.currency || "KZT",
    priceChanged: Math.abs(amount - quotedAmount) > 0.01,
    bookingDate: booking.booking_date || null,
    confirmedAt: booking.confirmed_at || null,
    cancelledAt: booking.provider_cancelled_at || null,
    comment: booking.comment || "",
    generatedAt: generatedAt.toISOString(),
  };
}

module.exports = {
  buildVoucherModel,
  statusLabel,
};
