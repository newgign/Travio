import { useState } from 'react';

export default function HotelImage({ src, alt, ...props }) {
  const [failedSource, setFailedSource] = useState(null);
  if (!src || failedSource === src) return <div role="img" aria-label="Фото недоступно" style={{width:'100%',height:'100%',minHeight:80,display:'grid',placeItems:'center',background:'#eef1f4',color:'#64748b'}}>Фото недоступно</div>;
  return <img {...props} src={src} alt={alt} onError={() => setFailedSource(src)} />;
}
