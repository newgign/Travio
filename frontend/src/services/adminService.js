import authFetch from "./authFetch";

function queryString(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "" || value === "all") return;
    search.set(key, String(value));
  });
  const value = search.toString();
  return value ? `?${value}` : "";
}

export function getAdminOverview() {
  return authFetch("/admin/overview");
}

export function getAdminReadiness() {
  return authFetch("/admin/readiness");
}

export function getAdminActions(limit = 30) {
  return authFetch(`/admin/actions${queryString({ limit })}`);
}

export function getAdminBookings(params = {}) {
  return authFetch(`/admin/bookings${queryString(params)}`);
}

export function getAdminRefunds(params = {}) {
  return authFetch(`/admin/refunds${queryString(params)}`);
}

export function getAdminNotifications(params = {}) {
  return authFetch(`/admin/notifications${queryString(params)}`);
}

export function retryAdminNotification(id) {
  return authFetch(`/admin/notifications/${id}/retry`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function syncProviderBooking(id) {
  return authFetch(`/bookings/${id}/provider/sync`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function updateAdminBookingStatus(id, status) {
  return authFetch(`/bookings/${id}`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}

export function getAdminSystemStatus() {
  return authFetch("/admin/system/status");
}

export function getAdminSystemMetrics() {
  return authFetch("/admin/system/metrics");
}

export function getAdminSystemEvents(params = {}) {
  return authFetch(`/admin/system/events${queryString(params)}`);
}

export function getAdminPermissions() {
  return authFetch("/admin/system/permissions");
}

export function runAdminSystemSelfTest() {
  return authFetch("/admin/system/self-test", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function getAdminReliability() {
  return authFetch("/admin/system/reliability");
}

export function runAdminReliabilityCheck() {
  return authFetch("/admin/system/reliability/check", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function acknowledgeAdminIncident(id) {
  return authFetch(`/admin/system/incidents/${id}/acknowledge`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
