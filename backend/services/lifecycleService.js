let shuttingDown = false;
let signal = null;
let startedAt = null;

function beginShutdown(nextSignal = "unknown") {
  if (!shuttingDown) {
    shuttingDown = true;
    signal = String(nextSignal || "unknown");
    startedAt = new Date().toISOString();
  }
  return state();
}

function state() {
  return {
    shuttingDown,
    signal,
    startedAt,
  };
}

module.exports = { beginShutdown, state };
