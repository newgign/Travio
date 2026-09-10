const logger = require("../utils/logger");

function providerName() {
  return String(process.env.EMAIL_PROVIDER || "console").trim().toLowerCase() || "console";
}

function status() {
  const provider = providerName();
  const enabled = String(process.env.EMAIL_ENABLED || "false").toLowerCase() === "true";
  const configured =
    provider === "console"
      ? true
      : provider === "resend"
        ? Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
        : false;

  return {
    enabled,
    provider,
    configured,
    mode: !enabled ? "disabled" : provider === "console" ? "console" : "live",
    externalDelivery: enabled && provider !== "console" && configured,
  };
}

async function sendViaResend({ recipient, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    const error = new Error("RESEND_API_KEY/EMAIL_FROM are not configured");
    error.code = "EMAIL_CONFIGURATION_MISSING";
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [recipient], subject, html, text }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || `Email provider error ${response.status}`);
    return { provider: "resend", messageId: data?.id || null };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendViaConsole({ recipient, subject, text }) {
  const messageId = `console-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  logger.info(`EMAIL CONSOLE | to=${recipient} | subject=${subject} | ${String(text || "").replaceAll("\n", " | ")}`);
  return { provider: "console", messageId };
}

async function send(content) {
  const state = status();
  if (!state.enabled) {
    const error = new Error("EMAIL_ENABLED=false");
    error.code = "EMAIL_DISABLED";
    throw error;
  }
  if (!state.configured) {
    const error = new Error(`EMAIL_PROVIDER=${state.provider} is not configured`);
    error.code = "EMAIL_CONFIGURATION_MISSING";
    throw error;
  }
  if (state.provider === "console") return sendViaConsole(content);
  if (state.provider === "resend") return sendViaResend(content);
  throw new Error(`Unsupported EMAIL_PROVIDER=${state.provider}`);
}

module.exports = { providerName, status, send };
