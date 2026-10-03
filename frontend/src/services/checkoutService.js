import API_URL from "./api";

export async function getCheckout(data) {
  const response = await fetch(
    `${API_URL}/checkout/review`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }
  );

  const text = await response.text();
  let result;

  try {
    result = text ? JSON.parse(text) : null;
  } catch {
    result = text || null;
  }

  if (!response.ok) {
    const error = new Error(
      'Не удалось проверить стоимость. Повторите попытку.'
    );
    error.status = response.status;
    error.code = result?.code || result?.error?.code || null;
    error.checkRateStatus = result?.checkRateStatus === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'RETRYABLE_ERROR';
    throw error;
  }

  return result;
}
