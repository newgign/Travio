const permissionService = require("../services/permissionService");

module.exports = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Требуется авторизация" });
    }

    if (!permissionService.hasPermission(req.user.role, permission)) {
      return res.status(403).json({
        code: "PERMISSION_DENIED",
        message: "Недостаточно прав для этой операции",
        permission,
      });
    }

    return next();
  };
};
