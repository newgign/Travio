import { useEffect } from 'react';
import { consumerTitle } from '../utils/consumerTitle';

export default function ConsumerMetadata({ pathname, params, destinations, hotelName }) {
  const title = consumerTitle(pathname, { params, destinations, hotelName });
  useEffect(() => { document.title = title; }, [title]);
  return null;
}
