import authFetch from "./authFetch";
import API_URL from "./api";

export async function createBooking(data) {
  return authFetch("/bookings", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getMyBookings() {
  return authFetch("/bookings/me");
}

export async function updateBookingStatus(id, status) {
  return authFetch(`/bookings/${id}`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}

export async function deleteBooking(id) {
  return authFetch(`/bookings/${id}`, {
    method: "DELETE",
  });
}

export async function confirmProviderBooking(id) {
  return authFetch(`/bookings/${id}/provider/confirm`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function syncProviderBooking(id) {
  return authFetch(`/bookings/${id}/provider/sync`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function simulateProviderCancellation(id) {
  return authFetch(`/bookings/${id}/provider/cancel/simulate`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function cancelProviderBooking(id, { expectedFee = null } = {}) {
  return authFetch(`/bookings/${id}/provider/cancel`, {
    method: "POST",
    body: JSON.stringify({
      confirmCancellation: true,
      expectedFee,
    }),
  });
}


export async function getBookingVoucher(id) {
  return authFetch(`/bookings/${id}/voucher`);
}

export async function downloadBookingVoucherPdf(id) {
  const token = localStorage.getItem("token");
  const response = await fetch(`${API_URL}/bookings/${id}/voucher.pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    let message = `Ошибка сервера (${response.status})`;
    try {
      const data = await response.json();
      message = data?.message || message;
    } catch (parseError) {
      void parseError;
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return { blob, filename: match?.[1] || `travio-voucher-${id}.pdf` };
}

export async function getBookingDetails(id) {
  return authFetch(`/bookings/${id}/details`);
}
