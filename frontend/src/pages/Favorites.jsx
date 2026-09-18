import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import SavedHotelCard from '../components/SavedHotelCard';
import { AccountAuth, AccountEmpty, AccountError, AccountLoading } from '../components/AccountStates';
import { useFavorites } from '../context/FavoritesContext';
import { favoriteKey } from '../services/savedAccountData';
import { hotelCount } from '../utils/resultsPresentation';
import '../styles/AccountPages.css';
import '../styles/Favorites.css';

export function FavoritesView({ favorites, status, pending = [], onRetry, onRemove }) {
  return <main className="account-page favorites-page"><header className="account-header"><h1>Избранное</h1><p>Сохранённые отели для будущих поездок</p>
    {status === 'ready' && favorites.length > 0 && <p className="account-count">Сохранено {hotelCount(favorites.length)}</p>}</header>
    {status === 'guest' || status === 'auth' ? <AccountAuth /> : status === 'loading' ? <AccountLoading label="Загружаем избранное" /> : status === 'error' ? <AccountError title="Не удалось загрузить избранное" onRetry={onRetry} /> :
      favorites.length === 0 ? <AccountEmpty favorites /> : <div className="favorites-grid">{favorites.map(item => <SavedHotelCard key={favoriteKey(item)} item={item} pending={pending.includes(favoriteKey(item))} onRemove={onRemove} />)}</div>}
  </main>;
}
export default function Favorites() {
  const state = useFavorites();
  return <><Navbar /><FavoritesView favorites={state.favorites} status={state.favoritesStatus} pending={state.pendingFavorites} onRetry={state.loadFavorites} onRemove={state.removeFavorite} /><Footer /></>;
}