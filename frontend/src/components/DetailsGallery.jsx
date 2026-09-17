import HotelImage from './HotelImage';

export default function DetailsGallery({ images, hotelName, activeImage, onSelect }) {
  const active = Math.min(activeImage, Math.max(0, images.length - 1));
  return <section className="details-gallery" aria-label={`Фотографии: ${hotelName}`}>
    <div className="details-gallery-main">
      <HotelImage key={images[active] || 'empty'} src={images[active]} alt={hotelName} />
      {images.length > 0 && <span className="details-gallery-counter" aria-live="polite">{active + 1} / {images.length}</span>}
    </div>
    {images.length > 1 && <div className="details-thumbnails" aria-label="Выбрать фотографию">
      {images.map((src, index) => <button key={src} type="button" aria-label={`Показать фото ${index + 1} из ${images.length}`} aria-pressed={active === index} onClick={() => onSelect(index)}>
        <HotelImage src={src} alt="" loading="lazy" />
      </button>)}
    </div>}
  </section>;
}