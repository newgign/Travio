import authFetch from "./authFetch";

export function getProfile() {
  return authFetch("/auth/profile");
}

export function updateProfile(data) {
  return authFetch("/auth/profile", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function changePassword(data) {
  return authFetch("/auth/password", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function getTravelerProfiles() {
  return authFetch("/travelers");
}

export function createTravelerProfile(data) {
  return authFetch("/travelers", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateTravelerProfile(id, data) {
  return authFetch(`/travelers/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteTravelerProfile(id) {
  return authFetch(`/travelers/${id}`, {
    method: "DELETE",
  });
}
