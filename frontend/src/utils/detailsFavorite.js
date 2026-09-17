// Keep the existing favorite service and the exact selected object. No offer resolution.
export async function toggleDetailsFavorite(offer, { hasSession, toggleFavorite, navigate }) {
  if (!hasSession) { navigate('/login'); return; }
  try { await toggleFavorite(offer); }
  catch (error) {
    if (error.message === 'AUTH_REQUIRED') navigate('/login');
    else throw error;
  }
}
