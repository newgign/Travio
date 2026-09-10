import authFetch from "./authFetch";

export async function getPayment(id) {
  return authFetch(`/payments/${id}`);
}

export async function payBooking(id, method) {
  return authFetch(`/payments/${id}/pay`, {
    method: "PUT",
    body: JSON.stringify({ method }),
  });
}

export async function getPaymentReadiness() {
  return authFetch("/payments/readiness");
}

export async function createPaymentIntent(id) {
  return authFetch(`/payments/${id}/intent`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}


export async function requestSandboxRefund(id, reason = "") {
  return authFetch(`/payments/${id}/refund/request`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function completeSandboxRefund(id) {
  return authFetch(`/payments/${id}/refund/complete-sandbox`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
