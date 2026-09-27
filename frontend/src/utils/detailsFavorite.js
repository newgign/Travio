// Keep the existing favorite service and the exact selected object. No offer resolution.
export async function toggleDetailsFavorite(offer, { hasSession, toggleFavorite, navigate, pending }) {
  if(pending?.current)return;
  if (!hasSession) { navigate('/login'); return; }
  if(pending)pending.current=true;
  try { await toggleFavorite(offer); }
  catch (error) {
    if (error?.status === 401 || error?.code === 'AUTH_REQUIRED' || error?.message === 'AUTH_REQUIRED') navigate('/login');
    else throw error;
  }
  finally {if(pending)pending.current=false;}
}
