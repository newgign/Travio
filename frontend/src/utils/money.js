export function formatMoney(value, currency = "KZT") {
  if(value===null || value===undefined || String(value).trim()==='' || !Number.isFinite(Number(value)))return 'Цена недоступна';
  const amount = Number(value);
  const code = String(currency || "KZT").toUpperCase();

  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: code,
      ...(code==='KZT'?{minimumFractionDigits:0,maximumFractionDigits:0}:{}),
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("ru-RU")} ${code}`;
  }
}
