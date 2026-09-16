import { FiSearch, FiCreditCard, FiSliders, FiFileText } from 'react-icons/fi';
import { site } from '../config/site';
import '../styles/Advantages.css';
const items=[
  [FiSearch,'Удобный поиск','Выбирайте направление, даты, ночи и состав гостей.'],
  [FiCreditCard,'Понятные цены','Сразу видите стоимость проживания за весь период.'],
  [FiSliders,'Гибкие фильтры','Сравнивайте категорию, питание, номер и бюджет.'],
  [FiFileText,'Все детали в одном месте','Просматривайте номер, питание, даты и условия выбранного варианта.'],
];
export default function Advantages() {
  return <section className="advantages"><h2>Почему выбирают {site.siteName}</h2><div className="advantages-grid">{items.map(([Icon,title,text])=><div className="adv-card" key={title}><div className="adv-icon"><Icon aria-hidden="true" focusable="false" /></div><h3>{title}</h3><p>{text}</p></div>)}</div></section>;
}
