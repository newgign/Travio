const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const logger = require('../utils/logger');
const context = new AsyncLocalStorage();
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const reasons = new Set(['RATE_UNAVAILABLE', 'RATE_IDENTITY_MISMATCH', 'RATE_NOT_BOOKABLE', 'UNSUPPORTED_RATE',
  'PROVIDER_AUTH_ERROR', 'PROVIDER_RATE_LIMITED', 'PROVIDER_SERVER_ERROR', 'PROVIDER_TIMEOUT', 'NETWORK_ERROR',
  'PROVIDER_REJECTED_REQUEST', 'UNKNOWN_PROVIDER_ERROR', 'MALFORMED_PROVIDER_RESPONSE', 'SELECTION_INVALID', 'INTERNAL_ERROR']);
const stages = new Set(['REQUEST_RECEIVED', 'TRUSTED_OFFER_DECODED', 'PROVIDER_REQUEST_PREPARED', 'PROVIDER_RESPONSE_RECEIVED',
  'PROVIDER_REQUEST_SHARED', 'NORMALIZED_OUTCOME']);
const integer = (value, minimum = 0) => ['number', 'string'].includes(typeof value) && String(value).trim() !== ''
  && Number.isSafeInteger(Number(value)) && Number(value) >= minimum;
function childAges(value, count) {
  if (Number(count) === 0) return [];
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return list.length === Number(count) && list.every(age => integer(age) && Number(age) <= 17) ? list.map(Number) : null;
}
function fingerprint(value) {
  return typeof value === 'string' && value.length ? crypto.createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 16) : null;
}
function metadata(offer = {}) {
  const code = value => typeof value === 'string' && /^[A-Z0-9_.-]{1,40}$/.test(value) ? value : null;
  const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  const occupancy = offer.occupancy || {};
  return { environment: 'test', hotelId: /^\d{1,20}$/.test(String(offer.providerHotelId || '')) ? String(offer.providerHotelId) : null,
    rateKeyPresent: typeof offer.rateKey === 'string' && offer.rateKey.length > 0,
    rateKeyFingerprint: fingerprint(offer.rateKey), rateKeyLength: typeof offer.rateKey === 'string' ? Buffer.byteLength(offer.rateKey, 'utf8') : 0,
    room: code(offer.roomCode), board: code(offer.boardCode), currency: /^[A-Z]{3}$/.test(offer.currency || '') ? offer.currency : null,
    amount: integer(offer.price) || (typeof offer.price === 'number' && Number.isFinite(offer.price) && offer.price > 0) ? Number(offer.price) : null,
    occupancy: { rooms: integer(occupancy.rooms, 1) ? Number(occupancy.rooms) : null,
      adults: integer(occupancy.adults, 1) ? Number(occupancy.adults) : null, children: integer(occupancy.children) ? Number(occupancy.children) : null,
      childAges: childAges(offer.childrenAges, occupancy.children) }, checkIn: date(offer.checkIn), checkOut: date(offer.checkOut) };
}
function reason(error = {}) {
  if (reasons.has(error.diagnosticReason)) return error.diagnosticReason;
  const status = Number(error.providerHttpStatus || error.response?.status);
  if ([401, 403].includes(status) || error.code === 'AUTH_ERROR') return 'PROVIDER_AUTH_ERROR';
  if (status === 429 || error.code === 'RATE_LIMIT') return 'PROVIDER_RATE_LIMITED';
  if (['TIMEOUT', 'ECONNABORTED', 'ETIMEDOUT'].includes(error.code)) return 'PROVIDER_TIMEOUT';
  if (['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ERR_NETWORK'].includes(error.code)) return 'NETWORK_ERROR';
  if (status >= 500 || error.code === 'PROVIDER_UNAVAILABLE') return 'PROVIDER_SERVER_ERROR';
  if (status >= 400 || error.code === 'CHECKRATE_PROVIDER_REJECTED') return 'PROVIDER_REJECTED_REQUEST';
  if (['RATE_NOT_AVAILABLE', 'HOTELBEDS_RECHECK_UNAVAILABLE'].includes(error.code)) return 'RATE_UNAVAILABLE';
  if (error.code === 'HOTELBEDS_RATE_NOT_BOOKABLE') return 'RATE_NOT_BOOKABLE';
  if (error.code === 'HOTELBEDS_AT_HOTEL_UNSUPPORTED') return 'UNSUPPORTED_RATE';
  if (error.code === 'OFFER_TOKEN_SECRET_MISSING') return 'INTERNAL_ERROR';
  if (/^OFFER_(TOKEN|HOTEL|PROVIDER|ENVIRONMENT)_/.test(error.code || '')) return 'SELECTION_INVALID';
  return 'INTERNAL_ERROR';
}
function emit(stage, details = {}) {
  const state = context.getStore();
  if (!state || !stages.has(stage)) return;
  if (stage !== 'NORMALIZED_OUTCOME') state.stage = stage;
  const status = Number(details.httpStatus);
  if (Number.isInteger(status) && status >= 100 && status <= 599) state.httpStatus = status;
  const outcome = ['CONFIRMED', 'PRICE_CHANGED', 'UNAVAILABLE', 'RETRYABLE_ERROR'].includes(details.outcome) ? details.outcome : undefined;
  logger.info('checkRateDiagnostic', { requestId: state.requestId, ...state.metadata, stage,
    ...(stage === 'NORMALIZED_OUTCOME' ? { completedAt: state.stage } : {}),
    httpStatus: state.httpStatus || null, httpCategory: state.httpStatus ? `${Math.floor(state.httpStatus / 100)}xx` : 'NOT_OBSERVED',
    ...(reasons.has(details.reason) ? { reason: details.reason } : {}), ...(outcome ? { outcome } : {}),
    ...(/^[a-f0-9]{16}$/.test(details.returnedRateKeyFingerprint || '') ? { returnedRateKeyFingerprint: details.returnedRateKeyFingerprint } : {}),
    ...(uuid(details.sharedRequestId) ? { sharedRequestId: details.sharedRequestId } : {}) });
}
module.exports = {
  fingerprint, metadata, childAges, reason, emit,
  run(requestId, action) { return context.run({ requestId: uuid(requestId) ? requestId : crypto.randomUUID(), metadata: metadata(), stage: 'REQUEST_RECEIVED' }, action); },
  requestId: () => context.getStore()?.requestId || null,
  trustedOffer(offer) { const state = context.getStore(); if (state) { state.metadata = metadata(offer); emit('TRUSTED_OFFER_DECODED'); } },
  prepared(rateKey) { const state = context.getStore(); if (state) { state.metadata = { ...state.metadata,
    rateKeyPresent: typeof rateKey === 'string' && rateKey.length > 0, rateKeyFingerprint: fingerprint(rateKey), rateKeyLength: typeof rateKey === 'string' ? Buffer.byteLength(rateKey, 'utf8') : 0 }; emit('PROVIDER_REQUEST_PREPARED'); } },
};
