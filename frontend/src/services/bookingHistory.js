import { createAccountListStore } from './accountListStore';
import { getMyBookings, getBookingDetails } from './bookingService';
import { readSession, sessionSnapshot, subscribeSession } from './session';

const storedUserId = () => readSession(sessionSnapshot()).user?.id;
const sessionKey = (token, userId) => token && /^[1-9]\d*$/.test(String(userId)) ? JSON.stringify([token, String(userId)]) : null;

export function createBookingHistory({ token, userId, readToken = () => localStorage.getItem('token'), readUserId = storedUserId, api = { getMyBookings, getBookingDetails } }) {
  const options = { ownerToken: sessionKey(token, userId), readToken: () => sessionKey(readToken(), readUserId()) };
  const list = createAccountListStore({ ...options, loadData: async () => {
    const rows = await api.getMyBookings();
    if (!Array.isArray(rows) || rows.some(row => !row || !/^[1-9]\d{0,9}$/.test(String(row.id)))) throw Error('INVALID_BOOKINGS');
    return rows;
  } });
  const details = new Map();
  let group = 'all';
  return {
    list,
    ensureListLoaded() {
      // Ready includes a confirmed empty response. Only explicit retry reloads errors.
      return ['loading', 'guest'].includes(list.getSnapshot().status) ? list.load() : Promise.resolve();
    },
    getGroup: () => group,
    setGroup: value => { group = ['all','active','cancelled','other'].includes(value) ? value : 'all'; },
    details(id) {
      if (!details.has(id)) details.set(id, createAccountListStore({ ...options, loadData: async () => {
        if (!/^[1-9]\d{0,9}$/.test(String(id))) return [{ notFound: true }];
        try {
          const result = await api.getBookingDetails(id);
          if (!result?.success || String(result.booking?.id) !== String(id)) throw Error('INVALID_BOOKING');
          return [result];
        } catch (error) {
          if ([403,404].includes(error.status)) return [{ notFound: true }];
          throw error;
        }
      } }));
      return details.get(id);
    },
    invalidate() { list.invalidate(); for (const store of details.values()) store.invalidate(); details.clear(); group = 'all'; },
  };
}
let owner = null, history = null, connected = false;
export function bookingHistory(token, userId = storedUserId()) {
  if (!connected) {
    subscribeSession(() => {
      if (sessionKey(localStorage.getItem('token'), storedUserId()) !== owner) { history?.invalidate(); history = null; owner = null; }
    });
    connected = true;
  }
  const key = sessionKey(token, userId);
  if (!history || owner !== key) { history?.invalidate(); owner = key; history = createBookingHistory({ token, userId }); }
  return history;
}

// Same mount/cancel path in the page and offline lifecycle tests (including StrictMode).
export function scheduleBookingHistoryLoad(history) {
  const timer = setTimeout(() => { void history.ensureListLoaded(); }, 0);
  return () => clearTimeout(timer);
}
