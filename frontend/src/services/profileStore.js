import { getProfile, updateProfile, changePassword } from './profileService';
import { clearSession, updateSessionUser } from './session';
import { emptyPassword, passwordErrors, profileDraft, profileErrors, publicProfile } from '../utils/profilePresentation';

// Page-local draft state; the existing session remains the only shared user store.
export function createProfileStore({ token, readToken = () => localStorage.getItem('token'), api = { getProfile, updateProfile, changePassword }, publish = updateSessionUser } = {}) {
  let state = { status: token ? 'loading' : 'auth', user: null, draft: null, dirty: false, saving: false, errors: {}, message: '', saveError: '', password: emptyPassword(), passwordErrors: {}, passwordBusy: false, passwordMessage: '', passwordError: '' };
  let generation = 0, loading = null, saving = null, changing = null;
  const listeners = new Set();
  const emit = patch => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  const current = version => Boolean(token) && token === readToken() && version === generation;
  const auth = () => { clearSession(token); emit({ status: 'auth', user: null, draft: null, password: emptyPassword(), dirty: false, saving: false, passwordBusy: false }); };
  const failed = (error, patch) => { if (error.status === 401 || error.code === 'AUTH_REQUIRED') auth(); else emit(patch); };
  const handleFailure = (version, error, patch) => {
    if (version !== generation) return;
    if (current(version)) failed(error, patch);
    else if (!readToken()) emit({ status: 'auth', user: null, draft: null, password: emptyPassword(), dirty: false, saving: false, passwordBusy: false });
  };
  const store = {
    getSnapshot: () => state,
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    invalidate() { generation++; loading = saving = changing = null; state = { ...state, user: null, draft: null, password: emptyPassword(), status: token ? 'loading' : 'auth' }; },
    load() {
      if (loading) return loading;
      const version = generation;
      if (!current(version)) { auth(); return Promise.resolve(); }
      emit({ status: 'loading', user: null, draft: null });
      loading = Promise.resolve().then(() => current(version) ? api.getProfile() : null).then(data => {
        if (!current(version)) return;
        const user = publicProfile(data);
        publish(token, user);
        emit({ status: 'ready', user, draft: profileDraft(user), dirty: false });
      }).catch(error => handleFailure(version, error, { status: 'error' })).finally(() => { if (version === generation) loading = null; });
      return loading;
    },
    edit(key, value) {
      if (!state.draft || state.saving || !Object.hasOwn(state.draft, key)) return;
      const draft = { ...state.draft, [key]: value };
      emit({ draft, dirty: JSON.stringify(draft) !== JSON.stringify(profileDraft(state.user)), errors: {}, message: '', saveError: '' });
    },
    cancel() { if (state.user && !state.saving) emit({ draft: profileDraft(state.user), dirty: false, errors: {}, message: '', saveError: '' }); },
    save() {
      if (saving) return saving;
      const version = generation;
      if (!current(version)) { auth(); return Promise.resolve(); }
      if (!state.dirty) return Promise.resolve();
      const errors = profileErrors(state.draft);
      emit({ errors, message: '', saveError: '' });
      if (Object.keys(errors).length) return Promise.resolve();
      const payload = { ...state.draft };
      emit({ saving: true });
      saving = Promise.resolve().then(() => current(version) ? api.updateProfile(payload) : null).then(result => {
        if (!current(version)) return;
        const user = publicProfile(result?.user);
        publish(token, user);
        emit({ user, draft: profileDraft(user), dirty: false, message: 'Изменения сохранены' });
      }).catch(error => handleFailure(version, error, { saveError: 'Не удалось сохранить изменения' })).finally(() => { if (current(version)) emit({ saving: false }); if (version === generation) saving = null; });
      return saving;
    },
    editPassword(key, value) { if (!state.passwordBusy && Object.hasOwn(state.password, key)) emit({ password: { ...state.password, [key]: value }, passwordErrors: {}, passwordMessage: '', passwordError: '' }); },
    savePassword() {
      if (changing) return changing;
      const version = generation;
      if (!current(version)) { auth(); return Promise.resolve(); }
      const errors = passwordErrors(state.password);
      emit({ passwordErrors: errors, passwordError: '', passwordMessage: '' });
      if (Object.keys(errors).length) return Promise.resolve();
      const { currentPassword, newPassword } = state.password;
      emit({ passwordBusy: true });
      changing = Promise.resolve().then(() => current(version) ? api.changePassword({ currentPassword, newPassword }) : null).then(result => {
        if (!current(version)) return;
        if (!result || typeof result.message !== 'string') throw Error('INVALID_RESPONSE');
        emit({ password: emptyPassword(), passwordMessage: 'Пароль изменён' });
      }).catch(error => handleFailure(version, error, { passwordError: 'Не удалось изменить пароль. Проверьте текущий пароль и попробуйте ещё раз.', password: emptyPassword() })).finally(() => { if (current(version)) emit({ passwordBusy: false }); if (version === generation) changing = null; });
      return changing;
    },
  };
  return store;
}
