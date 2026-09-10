export function formatMoney(value, currency = "KZT") {
  const amount = Number(value) || 0;
  const code = String(currency || "KZT").toUpperCase();

  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: code,
      minimumFractionDigits: code === "KZT" ? 0 : 2,
      maximumFractionDigits: code === "KZT" ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("ru-RU")} ${code}`;
  }
}
