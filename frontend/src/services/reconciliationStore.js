import { validatedSessionSnapshot, subscribeValidatedSession } from './session';
import { readReconciliationList, readReconciliationDetail } from './reconciliationService';
import { safeList, safeDetail } from '../utils/reconciliationPresentation';
export const adminAccess = session => session?.status === 'authenticated' && Boolean(session.token) && session.user?.role === 'admin';
export function createReconciliationStore({ readSession = validatedSessionSnapshot, subscribeSession = subscribeValidatedSession, loadList = readReconciliationList, loadDetail = readReconciliationDetail } = {}) {
  let state = { status: 'loading', source: null, items: [], detail: null, detailStatus: 'idle', selectedId: null, filters: {} };
  let generation = 0, detailGeneration = 0;
  const listeners = new Set();
  const emit = patch => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  const identity = () => { const s = readSession(); return adminAccess(s) ? `${s.user.id}:${s.token}` : null; };
  const owner = identity();
  const allowed = () => owner !== null && identity() === owner;
  const denied = () => { generation++; detailGeneration++; emit({ status: 'denied', items: [], detail: null, detailStatus: 'idle', selectedId: null }); };
  const errorStatus = error => [401, 403].includes(error?.status) ? 'denied' : error?.status === 404 ? 'notFound' : 'error';
  const store = {
    getSnapshot: () => state,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    connect() { const disconnect = subscribeSession(() => { if (!allowed()) denied(); }); return () => { disconnect(); generation++; detailGeneration++; }; },
    async load() {
      if (!allowed()) { denied(); return; }
      const version = ++generation; detailGeneration++;
      emit({ status: 'loading', items: [], detail: null, detailStatus: 'idle', selectedId: null });
      try {
        const response = await loadList();
        if (version !== generation) return;
        if (!allowed()) { denied(); return; }
        const data = safeList(response);
        emit({ ...data, status: data.source === 'unavailable' ? 'unavailable' : data.items.length ? 'ready' : 'empty' });
      } catch (error) {
        if (version !== generation) return;
        if (!allowed() || errorStatus(error) === 'denied') denied();
        else emit({ status: 'error', items: [], detail: null });
      }
    },
    async open(caseId) {
      if (!allowed()) { denied(); return; }
      if (!state.items.some(row => row.caseId === caseId)) return;
      const version = ++detailGeneration;
      emit({ detailStatus: 'loading', detail: null, selectedId: caseId });
      try {
        const response = await loadDetail(caseId);
        if (version !== detailGeneration) return;
        if (!allowed()) { denied(); return; }
        emit({ detail: safeDetail(response, caseId), detailStatus: 'ready' });
      } catch (error) {
        if (version !== detailGeneration) return;
        if (!allowed() || errorStatus(error) === 'denied') denied();
        else emit({ detailStatus: errorStatus(error), detail: null });
      }
    },
    close() { detailGeneration++; emit({ detail: null, detailStatus: 'idle', selectedId: null }); },
    filter(key, value) { if (!allowed()) { denied(); return; } if (['priority', 'category', 'status', 'manualReviewRequired', 'compensationRequired'].includes(key)) emit({ filters: { ...state.filters, [key]: value } }); },
  };
  return store;
}
