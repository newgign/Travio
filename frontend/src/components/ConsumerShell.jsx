import { useLocation } from 'react-router-dom';

function usesConsumerShell(path) {
  return !/^\/(admin|checkout|voucher)(\/|$)/.test(path) && !/^\/my-bookings\/.+/.test(path);
}

export default function ConsumerShell({ children }) {
  const { pathname } = useLocation();
  return usesConsumerShell(pathname) ? <div className="consumer-shell">{children}</div> : children;
}
