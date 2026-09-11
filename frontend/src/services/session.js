export function sessionSnapshot() {
  return JSON.stringify([localStorage.getItem("token"), localStorage.getItem("user")]);
}

export function subscribeSession(callback) {
  window.addEventListener("storage", callback);
  window.addEventListener("pageshow", callback);
  window.addEventListener("travio-auth-changed", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("pageshow", callback);
    window.removeEventListener("travio-auth-changed", callback);
  };
}

export function readSession(snapshot) {
  try {
    const [token, rawUser] = JSON.parse(snapshot);
    return { token, user: rawUser ? JSON.parse(rawUser) : null };
  } catch {
    return { token: null, user: null };
  }
}

export function clearSession(token) {
  // A late response from an old session must not log out a newer login.
  if (localStorage.getItem("token") !== token) return;
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.dispatchEvent(new Event("travio-auth-changed"));
}
