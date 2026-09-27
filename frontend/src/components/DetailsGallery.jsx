import HotelImage from './HotelImage';

export default function DetailsGallery({ images=[], hotelName, activeImage=0, onSelect }) {
  const active = Math.max(0,Math.min(Number.isInteger(activeImage)?activeImage:0, Math.max(0, images.length - 1)));
  function keyboard(event,index) {
    const target={ArrowRight:(index+1)%images.length,ArrowLeft:(index+images.length-1)%images.length,Home:0,End:images.length-1}[event.key];
    if(target===undefined)return;
    event.preventDefault();onSelect(target);
    event.currentTarget.parentElement.querySelectorAll('button')[target]?.focus();
  }
  return <section className="details-gallery" aria-label={`Фотографии: ${hotelName}`}>
    <div className="details-gallery-main">
      <HotelImage key={images[active] || 'empty'} src={images[active]} alt={hotelName} loading="eager" decoding="async" />
      {images.length > 0 && <span className="details-gallery-counter" aria-live="polite">{active + 1} / {images.length}</span>}
    </div>
    {images.length > 1 && <div className="details-thumbnails" aria-label="Выбрать фотографию">
      {images.map((src, index) => <button key={src} type="button" aria-label={`Показать фото ${index + 1} из ${images.length}`} aria-pressed={active === index} onClick={() => onSelect(index)} onKeyDown={event=>keyboard(event,index)}>
        <HotelImage src={src} alt="" loading="lazy" />
      </button>)}
    </div>}
  </section>;
}
