import { useState } from "react";
import fallback from "../assets/images/hero.png";
export default function CollectionImage({ src, alt }) {
  const [loaded, setLoaded] = useState(false);
  return <div className={`collection-image ${!loaded ? "collection-pulse" : ""}`}>
    <img src={src || fallback} alt={alt} loading="lazy" onLoad={() => setLoaded(true)}
      onError={(event) => { if (event.currentTarget.getAttribute("src") !== fallback) event.currentTarget.src = fallback; setLoaded(true); }} />
  </div>;
}
