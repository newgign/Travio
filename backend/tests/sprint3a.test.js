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
  assert.ok(results.includes("SPRINT 3A · PRODUCT EXPERIENCE"));
  assert.ok(results.includes("mobile-filter-button"));
  assert.ok(results.includes("results-context"));
  assert.ok(results.includes("result-skeleton"));
  assert.ok(filters.includes('name="rating"'));
  assert.ok(filters.includes('name="beachLine"'));
  assert.ok(filters.includes('name="roomType"'));
  assert.ok(card.includes("tour-card-test-badge"));
  assert.ok(card.includes("roomName"));
  assert.ok(card.includes("recheckRequired"));
}

function testHotelExperience() {
  const details = frontend("pages/TourDetails.jsx");
  const css = frontend("styles/TourDetails.css");
  assert.ok(details.includes("tour-gallery-grid"));
  assert.ok(details.includes("cancellationPolicies"));
  assert.ok(details.includes("mobile-booking-bar"));
  assert.ok(details.includes("RateConditions"));
  assert.ok(css.includes("tour-thumbnails"));
  assert.ok(css.includes("tour-facts-grid"));
}

function testCustomerWorkspace() {
  const bookings = frontend("pages/MyBookings.jsx");
  const navbar = frontend("components/Navbar.jsx");
  const checkout = frontend("pages/Checkout.jsx");
  assert.ok(bookings.includes("booking-summary"));
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
