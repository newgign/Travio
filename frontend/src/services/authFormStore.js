import API_URL from './api';
import { beginAuthAttempt, establishSession, subscribeSession } from './session';
import { authError, authPayload, authReturnPath, authSuccess, authValidation, emptyAuthForm } from '../utils/authPresentation';

// Temporary form state only. Shared authenticated user stays in session.js.
export function createAuthFormStore({ mode, returnTo, onSuccess }) {
  let state = { form: emptyAuthForm(mode), errors: {}, error: '', pending: false };
  const listeners = new Set();
  let generation = 0, inFlight = null, controller = null, committing = false;
  let upgradeToken = null;
  const emit = patch => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  const clearPasswords = () => ({ ...state.form, password: '', ...(mode === 'register' ? { confirmPassword: '' } : {}) });
  const invalidate = () => { generation++; upgradeToken = null; controller?.abort(); controller = null; inFlight = null; emit({ form: emptyAuthForm(mode), pending: false, errors: {}, error: '', upgrade: false, message: '' }); };
  const store = {
    getSnapshot: () => state,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    connect() {
      // Includes storage events from other tabs and logout with no prior token.
      const unsubscribe = subscribeSession(() => { if (!committing) invalidate(); });
      return () => { unsubscribe(); invalidate(); };
    },
    invalidate,
    cancelUpgrade: invalidate,
    submitUpgrade() {
      if (inFlight) return inFlight;
      if (!upgradeToken) return Promise.resolve();
      const password = state.form.password, confirm = state.form.confirmPassword;
      if (password.length < 8 || new TextEncoder().encode(password).length > 72 || password !== confirm) {
        emit({ error: 'Введите совпадающие пароли: не менее 8 символов, не более 72 байт UTF-8.' }); return Promise.resolve();
      }
      const version = ++generation, capability = upgradeToken;
      controller = new AbortController();
      const signal = controller.signal;
      emit({ pending: true, error: '' });
      inFlight = Promise.resolve().then(async () => {
        if (version !== generation) return;
        try {
          const response = await fetch(`${API_URL}/auth/legacy-password-update`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passwordUpdateToken: capability, newPassword: password }), signal, redirect: 'error' });
          if (version !== generation) return;
          if (response.status === 401) { invalidate(); emit({ error: 'Срок обновления истёк. Войдите снова.' }); return; }
          if (!response.ok) throw Error('UPGRADE_UNAVAILABLE');
          const data = await response.json();
          if (version !== generation) return;
          if (data.code !== 'PASSWORD_UPDATED' || data.reauthenticationRequired !== true) throw Error('UPGRADE_UNAVAILABLE');
          invalidate(); emit({ message: 'Пароль обновлён. Войдите снова.' });
        } catch { if (version === generation) emit({ pending: false, error: 'Не удалось обновить пароль. Попробуйте ещё раз.', form: { ...state.form, password: '', confirmPassword: '' } }); }
        finally { if (version === generation) { inFlight = null; controller = null; emit({ pending: false }); } }
      });
      return inFlight;
    },
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
          const response = await fetch(`${API_URL}/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal, redirect: 'error' });
          if (!response.ok) {
            let code;
            if (mode === 'login' && response.status === 409) {
              try {
                const data = await response.json();
                if (data.code === 'PASSWORD_UPDATE_REQUIRED') {
                  code = 'PASSWORD_UPDATE_REQUIRED';
                  if (current() && typeof data.passwordUpdateToken === 'string' && data.passwordUpdateToken.length <= 4096 && data.passwordUpdateToken) {
                    upgradeToken = data.passwordUpdateToken;
                    emit({ upgrade: true, form: { password: '', confirmPassword: '' }, error: '' }); return;
                  }
                }
              } catch { /* Fixed presentation only. */ }
            }
            throw Object.assign(Error('AUTH_REQUEST_FAILED'), { status: response.status, code });
          }
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
          if (current() && error.name !== 'AbortError') emit({ error: authError(mode, error.status, error.code), form: clearPasswords() });
        } finally {
          if (version === generation) { inFlight = null; controller = null; emit({ pending: false, form: clearPasswords() }); }
        }
      })();
      return inFlight;
    },
  };
  return store;
}
