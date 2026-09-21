import { useLocation } from 'react-router-dom';
import ConsumerErrorBoundary from './ConsumerErrorBoundary';
import ConsumerMetadata from './ConsumerMetadata';

function usesConsumerShell(path) {
  return !/^\/(admin|checkout|voucher)(\/|$)/.test(path) && !/^\/my-bookings\/.+/.test(path);
}

export default function ConsumerShell({ children }) {
  const { pathname, search, key } = useLocation();
  return usesConsumerShell(pathname) ? <div className="consumer-shell">
    <ConsumerErrorBoundary resetKey={`${key}:${pathname}:${search}`}>
      {/* Data-dependent pages own their title, including loading/error fallbacks. */}
      {!/^\/(?:results\/?$|tour\/[^/]+(?:\/[^/]+)?\/?$)/.test(pathname) && <ConsumerMetadata pathname={pathname} />}{children}
    </ConsumerErrorBoundary>
  </div> : children;
}
