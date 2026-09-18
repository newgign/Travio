import API_URL from './api';
import { beginAuthAttempt, establishSession, subscribeSession } from './session';
import { authError, authPayload, authReturnPath, authSuccess, authValidation, emptyAuthForm } from '../utils/authPresentation';

// Temporary form state only. Shared authenticated user stays in session.js.
export function createAuthFormStore({ mode, returnTo, onSuccess }) {
  let state = { form: emptyAuthForm(mode), errors: {}, error: '', pending: false };
  const listeners = new Set();
  let generation = 0, inFlight = null, controller = null, committing = false;
  const emit = patch => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  const clearPasswords = () => ({ ...state.form, password: '', ...(mode === 'register' ? { confirmPassword: '' } : {}) });
  const invalidate = () => { generation++; controller?.abort(); controller = null; inFlight = null; emit({ form: emptyAuthForm(mode), pending: false, errors: {}, error: '' }); };
  const store = {
    getSnapshot: () => state,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    connect() {
      // Includes storage events from other tabs and logout with no prior token.
      const unsubscribe = subscribeSession(() => { if (!committing) invalidate(); });
      return () => { unsubscribe(); invalidate(); };
    },
    invalidate,
    edit(key, value) { if (!state.pending && Object.hasOwn(state.form, key)) emit({ form: { ...state.form, [key]: value }, errors: { ...state.errors, [key]: undefined }, error: '' }); },
    submit() {
      if (inFlight) return inFlight;
      const errors = authValidation(mode, state.form);
      emit({ errors, error: '' });
      if (Object.keys(errors).length) return Promise.resolve();
      const isSessionCurrent = beginAuthAttempt();
      const version = ++generation;
      const current = () => version === generation && isSessionCurrent();
      const payload = authPayload(mode, state.form);
      controller = new AbortController();
      const signal = controller.signal;
      emit({ pending: true });
      inFlight = (async () => {
        try {
          // Yield before dispatch so immediate unmount/logout can prevent POST.
          await Promise.resolve();
          if (!current()) return;
          const response = await fetch(`${API_URL}/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal });
          if (!response.ok) throw Object.assign(Error('AUTH_REQUEST_FAILED'), { status: response.status });
          const data = await response.json();
          if (!current()) return;
          const user = authSuccess(mode, data);
          emit({ form: clearPasswords() });
          if (mode === 'login') {
            committing = true;
            try {
              if (establishSession(data.token, user, current)) onSuccess(authReturnPath(returnTo, user.role), { replace: true });
            } finally { committing = false; }
          } else onSuccess('/login', { replace: true, state: { registered: true, returnTo: authReturnPath(returnTo, 'admin') } });
        } catch (error) {
          if (current() && error.name !== 'AbortError') emit({ error: authError(mode, error.status), form: clearPasswords() });
        } finally {
          if (version === generation) { inFlight = null; controller = null; emit({ pending: false, form: clearPasswords() }); }
        }
      })();
      return inFlight;
    },
  };
  return store;
}
