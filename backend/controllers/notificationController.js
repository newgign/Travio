const notificationService = require("../services/notificationService");

async function status(req, res) {
  return res.json({ success: true, channel: notificationService.channelStatus() });
}

async function list(req, res) {
  try {
    const items = await notificationService.listForUser(req.user.id, req.query.limit);
    return res.json({ success: true, items });
  } catch (error) {
    return res.status(500).json({ message: "Ошибка загрузки уведомлений" });
  }
}

async function sendTest(req, res) {
  try {
    const result = await notificationService.queueTestNotification(req.user.id);
    return res.status(201).json({ success: true, result, channel: notificationService.channelStatus() });
  } catch (error) {
    return res.status(500).json({ message: require("../utils/apiResponse").publicMessage(error, "Ошибка тестового уведомления") });
  }
}

async function retry(req, res) {
  try {
    const result = await notificationService.retryForUser(
      req.params.id,
      req.user.id,
      req.user.role === "admin"
    );
    if (result.status === "forbidden") return res.status(403).json({ message: "Нет доступа" });
    return res.json({ success: true, result });
  } catch (error) {
    return res.status(500).json({ message: require("../utils/apiResponse").publicMessage(error, "Ошибка повторной отправки") });
  }
}

module.exports = { status, list, sendTest, retry };
