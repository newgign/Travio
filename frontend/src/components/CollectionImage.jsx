import { useState } from 'react';
export default function CollectionImage({src,alt}) {
  const [failedSource,setFailedSource]=useState(null);
  const [loadedSource,setLoadedSource]=useState(null);
  const visible=Boolean(src) && failedSource!==src;
  return <div className={`collection-image ${visible && loadedSource!==src ? 'collection-pulse' : ''}`}>
    {visible ? <img src={src} alt={alt} loading="lazy" onLoad={()=>setLoadedSource(src)} onError={()=>setFailedSource(src)} />
      : <span className="collection-image-fallback">Фото недоступно</span>}
  </div>;
}
