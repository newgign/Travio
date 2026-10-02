import { Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import ConsumerErrorBoundary from './ConsumerErrorBoundary';

export function RouteLoading() {
  return <main className="account-page"><section className="account-state">
    <h1>Загрузка страницы</h1><p role="status">Подождите, страница загружается…</p>
  </section></main>;
}

export default function RouteBoundary({ children }) {
  const { key, pathname, search } = useLocation();
  return <ConsumerErrorBoundary resetKey={`${key}:${pathname}:${search}`}>
    <Suspense fallback={<RouteLoading />}>{children}</Suspense>
  </ConsumerErrorBoundary>;
}
