const ROLE_PERMISSIONS = Object.freeze({
  admin: Object.freeze([
    "admin.operations.read",
    "admin.bookings.read",
    "admin.bookings.reconcile",
    "admin.refunds.read",
    "admin.notifications.read",
    "admin.notifications.retry",
    "admin.catalog.write",
    "admin.users.read",
    "admin.users.delete",
    "admin.system.read",
    "admin.system.selftest",
    "admin.system.incidents",
  ]),
  user: Object.freeze([
    "profile.read",
    "profile.write",
    "bookings.own.read",
    "bookings.own.create",
    "bookings.own.cancel",
    "travelers.own.manage",
  ]),
});

function normalizeRole(role) {
  const value = String(role || "user").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, value) ? value : "user";
}

function permissionsFor(role) {
  return [...ROLE_PERMISSIONS[normalizeRole(role)]];
}

function hasPermission(role, permission) {
  return permissionsFor(role).includes(String(permission || ""));
}

function describeRoles() {
  return Object.entries(ROLE_PERMISSIONS).map(([role, permissions]) => ({
    role,
    permissions: [...permissions],
  }));
}

module.exports = { ROLE_PERMISSIONS, normalizeRole, permissionsFor, hasPermission, describeRoles };
