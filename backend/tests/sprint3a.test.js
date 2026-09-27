const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const frontend = (rel) => fs.readFileSync(path.join(ROOT, "frontend", "src", rel), "utf8");
const backend = (rel) => fs.readFileSync(path.join(ROOT, "backend", rel), "utf8");

function testProductResults() {
  const results = frontend("pages/Results.jsx");
  const filters = frontend("components/ResultsFilters.jsx");
  const card = frontend("components/TourCard.jsx");
  // 3Q/5A replaced sprint/debug copy with consumer search context components.
  const header = frontend("components/ResultsHeader.jsx");
  const toolbar = frontend("components/ResultsToolbar.jsx");
  assert.ok(results.includes('<ResultsHeader params={searchParams} destinations={destinations} />'));
  assert.ok(header.includes('<h1>{title}</h1>'));
  assert.ok(header.includes('searchSummary(params)'));
  assert.ok(header.includes('Изменить поиск</Link>'));
  assert.ok(results.includes('<ResultsToolbar'));
  assert.ok(toolbar.includes('className="mobile-filter-button" aria-expanded={open} aria-controls="results-filter-panel" onClick={onOpen}'));
  assert.ok(results.includes("result-skeleton"));
  assert.ok(filters.includes('name="rating"'));
  assert.ok(filters.includes('name="beachLine"'));
  assert.ok(filters.includes('name="roomType"'));
  assert.ok(card.includes("tour-card-test-badge"));
  assert.ok(card.includes("roomName"));
  assert.ok(card.includes('disabled={testBookingDisabled}'));
  assert.ok(card.includes('selectedOffer: tour, resultsOrigin: resultsOrigin(location)'));
}

function testHotelExperience() {
  const details = frontend("pages/TourDetails.jsx");
  const css = frontend("styles/TourDetails.css");
  // 3R removed the fixed booking bar and isolated gallery/offer styles.
  const gallery = frontend("components/DetailsGallery.jsx");
  assert.ok(details.includes('<DetailsGallery images={images} hotelName={hotelName}'));
  assert.ok(gallery.includes('className="details-thumbnails"'));
  assert.ok(gallery.includes('aria-pressed={active === index}'));
  assert.ok(details.includes('Подробные условия тарифа будут доступны после повторной проверки'));
  assert.ok(details.includes('className="details-booking" disabled>Бронирование отключено'));
  assert.ok(details.includes('Оплата недоступна.'));
  assert.doesNotMatch(details, /mobile-booking-bar|goCheckout/);
  assert.ok(css.includes('.details-thumbnails'));
  assert.ok(css.includes('.details-offer-facts'));
}

function testCustomerWorkspace() {
  const bookings = frontend("pages/MyBookings.jsx");
  const navbar = frontend("components/Navbar.jsx");
  const checkout = frontend("pages/Checkout.jsx");
  assert.ok(bookings.includes('<h1>Мои бронирования</h1>'));
  assert.ok(bookings.includes('<PersistedBookingCard key={booking.id} booking={booking} />'));
  assert.ok(navbar.includes("nav-toggle"));
  assert.ok(navbar.includes("mobile-nav-account"));
  assert.ok(checkout.includes("checkout-trust-row"));
}

function testReleaseAndSafety() {
  const server = backend("server.js");
  const gate = backend("services/productionGateService.js");
  const reliability = backend("services/reliabilityMonitorService.js");
  assert.ok(server.includes("Sprint 3A"));
  assert.ok(gate.includes("real charges") || gate.includes("реальных"));
  assert.ok(reliability.includes('["2N", "3A"].includes(latestBackupCache.release)'));
}

try {
  testProductResults();
  testHotelExperience();
  testCustomerWorkspace();
  testReleaseAndSafety();
  console.log("Sprint 3A product-experience tests passed");
} catch (error) {
  console.error(error);
  process.exit(1);
}
