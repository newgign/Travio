import { site } from '../config/site';
export default function ContactDetails() {
  return <address className="contact-details">
    {site.supportPhone && <a aria-label={`Позвонить: ${site.supportPhone}`} href={`tel:${site.supportPhone.replace(/[^+\d]/g, '')}`}>{site.supportPhone}</a>}
    {site.supportEmail && <a aria-label={`Написать: ${site.supportEmail}`} href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>}
    {site.city && <p>{site.city}</p>}
  </address>;
}
