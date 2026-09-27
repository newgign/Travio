import { createAccountListStore } from './accountListStore';
import { getMyBookings, getBookingDetails } from './bookingService';
import { subscribeSession } from './session';

export function createBookingHistory({ token, readToken = () => localStorage.getItem('token'), api = { getMyBookings, getBookingDetails } }) {
  const options = { ownerToken: token, readToken };
  const list = createAccountListStore({ ...options, loadData: async () => {
    const rows = await api.getMyBookings();
    if (!Array.isArray(rows) || rows.some(row => !row || !/^[1-9]\d{0,9}$/.test(String(row.id)))) throw Error('INVALID_BOOKINGS');
    return rows;
  } });
  const details = new Map();
  let group = 'all';
  return {
    list,
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
export function bookingHistory(token) {
  if (!connected) {
    subscribeSession(() => {
      if (localStorage.getItem('token') !== owner) { history?.invalidate(); history = null; owner = null; }
    });
    connected = true;
  }
  if (!history || owner !== token) { history?.invalidate(); owner = token; history = createBookingHistory({ token }); }
  return history;
}
