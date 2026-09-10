function transliterate(value) {
  const map = {
    А:"A",Б:"B",В:"V",Г:"G",Д:"D",Е:"E",Ё:"E",Ж:"Zh",З:"Z",И:"I",Й:"Y",К:"K",Л:"L",М:"M",Н:"N",О:"O",П:"P",Р:"R",С:"S",Т:"T",У:"U",Ф:"F",Х:"Kh",Ц:"Ts",Ч:"Ch",Ш:"Sh",Щ:"Sch",Ъ:"",Ы:"Y",Ь:"",Э:"E",Ю:"Yu",Я:"Ya",
    а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya",
    Ә:"A",ә:"a",Ғ:"G",ғ:"g",Қ:"Q",қ:"q",Ң:"N",ң:"n",Ө:"O",ө:"o",Ұ:"U",ұ:"u",Ү:"U",ү:"u",Һ:"H",һ:"h",І:"I",і:"i"
  };
  return String(value ?? "").split("").map((ch) => map[ch] ?? (ch.charCodeAt(0) <= 255 ? ch : "?")).join("");
}

function esc(value) {
  return transliterate(value).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function money(amount, currency) {
  return `${Number(amount || 0).toFixed(2)} ${currency || "KZT"}`;
}

function dateLabel(value) {
  if (!value) return "-";
  const raw = String(value).slice(0, 10);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : raw;
}

function wrap(value, max = 78) {
  const words = transliterate(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (!line) line = word;
    else if (`${line} ${word}`.length <= max) line += ` ${word}`;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function buildPdf(objects) {
  const header = "%PDF-1.4\n%Asedeliya\n";
  let body = "";
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(header + body, "binary"));
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(header + body, "binary");
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(header + body + xref + trailer, "binary");
}

function buildVoucherPdf(voucher) {
  const ops = [];
  const t = (text, x, y, size = 10, bold = false) => {
    ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${esc(text)}) Tj ET`);
  };
  const line = (x1, y1, x2, y2) => ops.push(`${x1} ${y1} m ${x2} ${y2} l S`);
  const box = (x, y, w, h, gray = 0.96) => ops.push(`${gray} g ${x} ${y} ${w} ${h} re f 0 g`);

  box(36, 782, 523, 34, voucher.isTest ? 0.92 : 0.95);
  t(voucher.isTest ? "HOTELBEDS TEST - NOT VALID FOR CHECK-IN" : "ASEDELIYA ACCOMMODATION VOUCHER", 52, 795, 12, true);
  t("Asedeliya", 40, 750, 26, true);
  t(`Voucher: ${voucher.voucherCode}`, 395, 754, 11, true);
  t(`Status: ${voucher.status}`, 40, 723, 11, true);
  t(`Asedeliya reference: ${voucher.travioReference}`, 40, 704, 10);
  t(`Provider reference: ${voucher.providerReference || "-"}`, 300, 704, 10);
  line(40, 691, 555, 691);

  t("HOTEL", 40, 668, 9, true);
  wrap(voucher.hotel, 54).slice(0, 2).forEach((v, i) => t(v, 40, 646 - i * 16, 15, true));
  t([voucher.city, voucher.country].filter(Boolean).join(", ") || "-", 40, 610, 10);

  box(40, 530, 515, 62, 0.97);
  t(`Check-in: ${dateLabel(voucher.checkIn)}`, 52, 570, 10, true);
  t(`Check-out: ${dateLabel(voucher.checkOut)}`, 215, 570, 10, true);
  t(`Nights: ${voucher.nights || "-"}`, 420, 570, 10, true);
  t(`Guests: ${voucher.people || 1}`, 52, 544, 10);
  t(`Board: ${voucher.boardCode || "-"}`, 215, 544, 10);
  t(`Room: ${voucher.roomName || voucher.rateType || "-"}`, 330, 544, 9);

  t("TRAVELERS", 40, 502, 10, true);
  line(40, 492, 555, 492);
  const travelers = Array.isArray(voucher.travelers) ? voucher.travelers : [];
  let y = 472;
  if (travelers.length) {
    travelers.slice(0, 8).forEach((traveler, index) => {
      const type = traveler.type === "CH" ? "Child" : "Adult";
      t(`${index + 1}. ${type} - ${traveler.firstName || ""} ${traveler.lastName || ""} - ${dateLabel(traveler.birthDate)}`, 45, y, 9);
      y -= 18;
    });
  } else {
    t(`1. Adult - ${voucher.holder.firstName || ""} ${voucher.holder.lastName || ""}`, 45, y, 9);
    y -= 18;
  }

  y -= 8;
  t("BOOKING HOLDER", 40, y, 10, true); y -= 20;
  t(`${voucher.holder.firstName || ""} ${voucher.holder.lastName || ""}`, 45, y, 9); y -= 16;
  t(voucher.holder.phone || "-", 45, y, 9); y -= 16;
  t(voucher.holder.email || "-", 45, y, 9);

  t("TOTAL", 390, 430, 10, true);
  t(money(voucher.amount, voucher.currency), 390, 405, 19, true);
  if (voucher.priceChanged) t(`Quoted: ${money(voucher.quotedAmount, voucher.quotedCurrency)}`, 390, 386, 9);

  if (voucher.isTest) {
    box(40, 150, 515, 76, 0.94);
    t("TEST NOTICE", 52, 204, 10, true);
    wrap("This Hotelbeds TEST booking is for Asedeliya development only. It is not a real hotel reservation, payment receipt or right to check in.", 80)
      .slice(0, 3).forEach((v, i) => t(v, 52, 186 - i * 14, 8));
  }

  line(40, 130, 555, 130);
  t(`Generated: ${new Date(voucher.generatedAt).toISOString()}`, 40, 112, 8);
  t(`Provider status: ${voucher.providerStatus || "-"}`, 360, 112, 8, true);
  t("Asedeliya - accommodation booking document", 40, 50, 8);

  const stream = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${Buffer.byteLength(stream, "binary")} >>\nstream\n${stream}\nendstream`,
  ];
  return buildPdf(objects);
}

module.exports = { buildVoucherPdf, transliterate };
