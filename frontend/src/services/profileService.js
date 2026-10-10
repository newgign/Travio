import { profilePayload, travelerPayload, publicTraveler } from '../utils/profilePresentation';
import authFetch from "./authFetch";

export function getProfile() {
  return authFetch("/auth/profile");
}

export function updateProfile(data) {
  return authFetch("/auth/profile", {
    method: "PUT",
    body: JSON.stringify(profilePayload(data)),
  });
}

export function changePassword(data) {
  return authFetch("/auth/password", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function getTravelerProfiles() {
  return authFetch("/travelers").then(rows => { if (!Array.isArray(rows)) throw Error('INVALID_TRAVELERS'); return rows.map(publicTraveler); });
}

export function createTravelerProfile(data) {
  return authFetch("/travelers", {
    method: "POST",
    body: JSON.stringify(travelerPayload(data)),
  }).then(publicTraveler);
}

export function updateTravelerProfile(id, data) {
  return authFetch(`/travelers/${id}`, {
    method: "PUT",
    body: JSON.stringify(travelerPayload(data)),
  }).then(publicTraveler);
}

export function deleteTravelerProfile(id) {
  return authFetch(`/travelers/${id}`, {
    method: "DELETE",
  });
}
