import authFetch from "./authFetch";

export function getNotificationStatus() {
  return authFetch("/notifications/status");
}

export function getNotifications(limit = 12) {
  return authFetch(`/notifications?limit=${encodeURIComponent(limit)}`);
}

export function sendTestNotification() {
  return authFetch("/notifications/test", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function retryNotification(id) {
  return authFetch(`/notifications/${id}/retry`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
