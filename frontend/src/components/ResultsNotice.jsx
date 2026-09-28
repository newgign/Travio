import { Link } from 'react-router-dom';
import { editSearchLink } from '../utils/resultsPresentation';
import { searchFailureMessage, staleResultsMessage } from '../utils/searchExperience';
import { catalogEmptyMessage } from '../utils/catalogUx';

export default function ResultsNotice({state,stale=false,catalogEmpty=false,params,onRetry,onReset}) {
  if (!['ERROR', 'FILTER_EMPTY', 'PROVIDER_EMPTY'].includes(state)) return null;
  const error=state==='ERROR', filtered=state==='FILTER_EMPTY';
  const title=error?(stale?'Результаты устарели':'Не удалось выполнить поиск'):filtered?'По заданным фильтрам ничего не найдено':catalogEmpty?catalogEmptyMessage:'По вашему запросу отели не найдены';
  return <div className="no-results" role={error?'alert':'status'} data-result-notice={state}>
    <h2>{title}</h2>
    <p>{error?(stale?staleResultsMessage:searchFailureMessage):filtered?'Попробуйте изменить или сбросить фильтры.':'Попробуйте другие даты или направление.'}</p>
    {error && <button type="button" disabled={typeof onRetry !== 'function'} onClick={onRetry}>{stale?'Обновить результаты':'Попробовать ещё раз'}</button>}
    {filtered && <button type="button" disabled={typeof onReset !== 'function'} onClick={onReset}>Сбросить фильтры</button>}
    <Link className="results-edit" to={editSearchLink(params)}>Изменить поиск</Link>
  </div>;
}
