const { getCountryName } = require("../config/providerCountries");

class HotelbedsContentMapper {
  text(value) {
    if (typeof value === "string") {
      return value.trim();
    }

    if (!value || typeof value !== "object") {
      return "";
    }

    return String(
      value.content ??
      value.description?.content ??
      value.description ??
      value.name?.content ??
      value.name ??
      ""
    ).trim();
  }

  mapDestination(raw = {}) {
    const countryCode = String(raw.countryCode || "").toUpperCase();
    const zones = Array.isArray(raw.zones) ? raw.zones : [];
    const groupZones = Array.isArray(raw.groupZones) ? raw.groupZones : [];

    const name =
      this.text(raw.name) ||
      this.text(raw.description) ||
      this.text(raw.content) ||
      String(raw.code || "");

    return {
      provider: "hotelbeds",
      code: String(raw.code || ""),
      countryCode,
      countryName: getCountryName(countryCode),
      name,
      zones,
      groupZones,
      rawData: raw,
    };
  }

  mapHotel(raw = {}) {
    const countryCode = String(raw.countryCode || "").toUpperCase();
    const images = this.mapImages(raw.images);
    const phones = Array.isArray(raw.phones) ? raw.phones : [];

    const phone =
      phones.find((item) => item?.phoneType === "PHONEHOTEL")?.phoneNumber ||
      phones[0]?.phoneNumber ||
      "";

    return {
      provider: "hotelbeds",
      providerHotelId: String(raw.code || ""),
      countryCode,
      countryName: getCountryName(countryCode),
      destinationCode: raw.destinationCode ? String(raw.destinationCode) : null,
      zoneCode: this.toNumberOrNull(raw.zoneCode),
      city: this.text(raw.city),
      name: this.text(raw.name) || `Hotelbeds #${raw.code}`,
      categoryCode: raw.categoryCode || null,
      stars: this.parseStars(raw.categoryCode, raw.categoryGroupCode),
      latitude: this.toNumberOrNull(raw.coordinates?.latitude),
      longitude: this.toNumberOrNull(raw.coordinates?.longitude),
      address: this.text(raw.address),
      postalCode: raw.postalCode || null,
      description: this.text(raw.description),
      website: raw.web || "",
      email: raw.email || "",
      phone,
      imageUrl: images[0] || null,
      images,
      facilities: Array.isArray(raw.facilities) ? raw.facilities : [],
      rooms: Array.isArray(raw.rooms) ? raw.rooms : [],
      boardCodes: Array.isArray(raw.boardCodes) ? raw.boardCodes : [],
      rawData: raw,
    };
  }

  mapImages(images) {
    if (!Array.isArray(images)) {
      return [];
    }

    return [...images]
      .filter((item) => item?.path)
      .sort((a, b) => {
        const av = Number(a.visualOrder ?? a.order ?? 9999);
        const bv = Number(b.visualOrder ?? b.order ?? 9999);
        return av - bv;
      })
      .map((item) => `https://photos.hotelbeds.com/giata/bigger/${String(item.path).replace(/^\/+/, "")}`)
      .filter((value, index, array) => array.indexOf(value) === index)
      .slice(0, 12);
  }

  parseStars(categoryCode, categoryGroupCode) {
    const text = `${categoryCode || ""} ${categoryGroupCode || ""}`;
    const match = text.match(/([1-5])/);
    return match ? Number(match[1]) : 0;
  }

  toNumberOrNull(value) {
    if (value == null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
}

module.exports = new HotelbedsContentMapper();
