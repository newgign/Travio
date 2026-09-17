import { Link } from 'react-router-dom';
import { destinationTitle } from '../utils/destinationTitle';
import { editSearchLink, searchSummary } from '../utils/resultsPresentation';
export default function ResultsHeader({params,destinations}) {
  const title = destinationTitle(params,destinations).replace('Найденные предложения','Найденные отели');
  return <header className="results-top"><div><h1>{title}</h1><p className="results-summary">{searchSummary(params)}</p><p className="results-accommodation-note">Проживание в отеле · перелёт не включён</p></div><Link className="results-edit" to={editSearchLink(params)}>Изменить поиск</Link></header>;
}
