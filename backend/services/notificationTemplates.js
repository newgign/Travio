function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(amount, currency) {
  const numeric = Number(amount) || 0;
  return `${numeric.toFixed(2)} ${escapeHtml(currency || "KZT")}`;
}

function bookingEmailContent(booking, eventType) {
  const hotel = booking.hotel || booking.offer_snapshot?.name || "Travio";
  const isCancelled = eventType === "booking_cancelled";
  const title = isCancelled
    ? `Travio: бронирование отменено - ${hotel}`
    : `Travio: бронирование подтверждено - ${hotel}`;

  const statusText = isCancelled ? "ОТМЕНЕНО" : "ПОДТВЕРЖДЕНО";
  const providerReference = booking.provider_booking_id
    ? `<p><strong>Hotelbeds reference:</strong> ${escapeHtml(booking.provider_booking_id)}</p>`
    : "";

  const testNotice = booking.provider === "hotelbeds"
    ? `<div style="padding:12px;background:#fff3cd;border-radius:8px;margin:16px 0">
         <strong>TEST:</strong> это тестовая среда Hotelbeds. Документ не является реальным гостиничным подтверждением.
       </div>`
    : "";

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#0f172a">
      <h1 style="color:#2563eb">Travio</h1>
      <h2>${escapeHtml(statusText)}</h2>
      ${testNotice}
      <p><strong>Отель:</strong> ${escapeHtml(hotel)}</p>
      <p><strong>Travio reference:</strong> ${escapeHtml(booking.provider_client_reference || `TRAVIO-${booking.id}`)}</p>
      ${providerReference}
      <p><strong>Стоимость:</strong> ${money(booking.total_amount, booking.currency)}</p>
      <p>Управлять бронированием можно в разделе «Мои бронирования».</p>
    </div>
  `;

  const text = [
    "Travio",
    statusText,
    booking.provider === "hotelbeds" ? "TEST Hotelbeds - не для реального заселения." : "",
    `Отель: ${hotel}`,
    `Travio reference: ${booking.provider_client_reference || `TRAVIO-${booking.id}`}`,
    booking.provider_booking_id ? `Hotelbeds reference: ${booking.provider_booking_id}` : "",
    `Стоимость: ${Number(booking.total_amount || 0).toFixed(2)} ${booking.currency || "KZT"}`,
  ].filter(Boolean).join("\n");

  return { subject: title, html, text };
}

module.exports = {
  bookingEmailContent,
  escapeHtml,
};
