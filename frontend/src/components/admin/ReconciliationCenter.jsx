import { useEffect, useState, useSyncExternalStore } from 'react';
import useSession from '../../hooks/useSession';
import { adminAccess, createReconciliationStore } from '../../services/reconciliationStore';
import { labels, consistencyLabel, filterCases } from '../../utils/reconciliationPresentation';

export function ReconciliationView({ state, actions }) {
  if (state.status === 'denied') return <p role="alert">Доступ разрешён только администратору.</p>;
  if (state.status === 'loading') return <p role="status">Загрузка сведений сверки…</p>;
  if (state.status === 'error') return <p role="alert">Не удалось загрузить сведения сверки.</p>;
  const rows = filterCases(state.items, state.filters);
  const detail = state.detail;
  const open = async id => { await actions.open(id); document.getElementById('reconciliation-detail-title')?.focus(); };
  const close = () => { const id = state.selectedId; actions.close(); document.getElementById(`reconciliation-case-${id}`)?.focus(); };
  return <section className="reconciliation-center" aria-labelledby="reconciliation-title">
    <h2 id="reconciliation-title">Сверка платежей</h2>
    <p>Раздел только для просмотра. Рекомендуемые действия не выполняются здесь.</p>
    {state.status === 'unavailable' ? <p role="status">Источник данных сверки пока не подключён.</p> : <>
      <div className="reconciliation-filters">
        {['priority', 'category', 'status', 'manualReviewRequired', 'compensationRequired'].map(key => <label key={key}>
          {{ priority: 'Приоритет', category: 'Категория', status: 'Статус', manualReviewRequired: 'Ручная проверка', compensationRequired: 'Проверка компенсации' }[key]}
          <select value={state.filters[key] || ''} onChange={event => actions.filter(key, event.target.value)}>
            <option value="">Все</option>
            {labels[key] ? Object.entries(labels[key]).map(([value, text]) => <option key={value} value={value}>{text}</option>) : <><option value="true">Требуется</option><option value="false">Не требуется</option></>}
          </select>
        </label>)}
      </div>
      {!rows.length ? <p role="status">{state.items.length ? 'Нет случаев по выбранным фильтрам.' : 'Нет случаев для проверки.'}</p> : <div className="reconciliation-table-wrap">
        <table><caption>Случаи для проверки</caption><thead><tr>{['Случай', 'Приоритет', 'Категория', 'Статус', 'Платёж', 'Бронирование', 'Рекомендуемое действие'].map(text => <th scope="col" key={text}>{text}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.caseFamilyId}>
            <td><button id={`reconciliation-case-${row.caseId}`} type="button" onClick={() => open(row.caseId)} aria-label={`Открыть случай ${row.caseId}`}>Открыть {row.caseId.slice(0, 8)}</button></td>
            <td><span className={`reconciliation-priority priority-${row.priority.toLowerCase()}`}>{labels.priority[row.priority]}</span></td>
            {['category', 'status', 'paymentState', 'bookingState', 'recommendedNextAction'].map(key => <td key={key}>{labels[key][row[key]]}</td>)}
          </tr>)}</tbody>
        </table>
      </div>}
    </>}
    {state.detailStatus !== 'idle' && <section className="reconciliation-detail" aria-labelledby="reconciliation-detail-title">
      <h3 id="reconciliation-detail-title" tabIndex={-1}>Сведения о случае</h3>
      <button type="button" onClick={close}>Закрыть сведения</button>
      {state.detailStatus === 'loading' && <p role="status">Загрузка случая…</p>}
      {state.detailStatus === 'notFound' && <p role="status">Случай не найден.</p>}
      {state.detailStatus === 'error' && <p role="alert">Не удалось загрузить случай.</p>}
      {detail && <>
        <dl><dt>Идентификатор случая</dt><dd>{detail.caseId}</dd>
          {['priority', 'category', 'status', 'reasonCode', 'paymentState', 'bookingState', 'recommendedNextAction'].map(key => <div key={key}><dt>{{ priority: 'Приоритет', category: 'Категория', status: 'Статус', reasonCode: 'Причина', paymentState: 'Платёж', bookingState: 'Бронирование', recommendedNextAction: 'Рекомендуемое действие' }[key]}</dt><dd>{labels[key][detail[key]]}</dd></div>)}
          <dt>Проверка суммы</dt><dd>{consistencyLabel(detail.amountMatch)}</dd><dt>Проверка валюты</dt><dd>{consistencyLabel(detail.currencyMatch)}</dd>
          {['manualReviewRequired', 'reconciliationRequired', 'compensationRequired'].map(key => <div key={key}><dt>{{ manualReviewRequired: 'Ручная проверка', reconciliationRequired: 'Сверка', compensationRequired: 'Проверка компенсации' }[key]}</dt><dd>{detail[key] ? 'Требуется' : 'Не требуется'}</dd></div>)}
        </dl>
        <h4>Наблюдения</h4><p>Порядок отображения не означает порядок событий у провайдера.</p>
        {!detail.timeline.length ? <p>Нет дополнительных наблюдений.</p> : <ol>{detail.timeline.map((entry, index) => <li key={index}>
          <p>{entry.eventType ? labels.eventType[entry.eventType] : 'Наблюдение без уведомления'}</p>
          <p>Внутреннее состояние: {labels.paymentState[entry.internalPaymentState]}. Наблюдаемое состояние: {labels.paymentState[entry.observedPaymentState]}.</p>
          <p>Бронирование: {labels.bookingState[entry.bookingState]}. Причина: {labels.reasonCode[entry.reasonCode]}.</p>
          <p>Сумма: {consistencyLabel(entry.amountMatch)}. Валюта: {consistencyLabel(entry.currencyMatch)}.</p>
          <p>Рекомендуемое действие: {labels.recommendedNextAction[entry.recommendedNextAction]}.</p>
        </li>)}</ol>}
      </>}
    </section>}
  </section>;
}
export default function ReconciliationCenter() {
  const session = useSession();
  const [store] = useState(() => createReconciliationStore());
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { const disconnect = store.connect(); void store.load(); return disconnect; }, [store]);
  if (!adminAccess(session)) return <p role="alert">Доступ разрешён только администратору.</p>;
  return <ReconciliationView state={state} actions={store} />;
}
